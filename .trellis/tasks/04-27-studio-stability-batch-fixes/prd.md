# Studio 稳定性批量修复

## 背景

Copilot 在 04-26 对 Xnova Studio 主链路做了一次审查，但报告里有判断错位与遗漏。本次任务先纠正它的"P0 死锁 + OOM"误报，再补齐它真正漏掉的 13 项问题，按 **P0 → P1 → P2 → P3** 的顺序原子化修复，确保每一类问题都有：

1. 最小化的根因修复（不引入新复杂度）
2. 防止回归的测试或断言
3. 跨组件一致性（不留半截）

## 目标

- 收敛主链路里的"静默失败"路径与"内存只增不减"路径，确保 Studio 在长会话 / 多项目切换 / 频繁 submit 时表现稳定
- 修齐 Stop / 思考态 / 启动反馈 / Markdown 等用户感知层的盲区
- 不破坏既有契约（StudioBridge contract、persistence schema、runtime emit 顺序）

## 非目标

- 不接外部 Agent Adapter（TODOS.md 明确 deferred）
- 不引入第三方 markdown 渲染依赖（保留零依赖原则）
- 不重构 runtime adapter 层（架构问题留待后续）

## 优先级与具体修复项

### 🔴 P0（真死锁 / 真泄漏）

#### P0-1：`createRuntime.submit()` 复用时静默吞咽
- **位置**：`packages/runtime/src/create-runtime.ts:231-234`
- **现状**：`isRunning=true` 时直接返回 `emptyTurnResult`，不发 `turn_end`、`error/aborted` 全为 falsy
- **后果**：上层 `studio-runtime-service.ts:1308` 走"成功"分支 → emit `run_completed`，UI 看不到任何输出，旧 run 的事件可能被新 run 覆盖
- **修法**：
  1. runtime 层短路时返回 `error: 'runtime busy: previous turn still running'` + `stopReason: 'rejected'`
  2. studio-runtime-service `submit` 入口加 `currentRun !== null` 主进程串行化门禁，命中时直接拒绝并返回 `ok: false`
- **验证**：新增 runtime 复用回归测试 + studio-runtime-service 串行化测试

#### P0-2：`runtimeManager.releaseRuntime()` 名不符实
- **位置**：`apps/studio/src/main/studio-runtime-manager.ts:163-166`
- **现状**：只清 `eventSink / submitActivity`，`RuntimeInstance` 留在 `runtimeEntries` Map 永不释放
- **后果**：每切换 `(workspace, agent, sessionId)` 都新建实例，旧实例持有 AbortController、provider session 引用、engineServiceApi 缓存 —— 真正的内存泄漏
- **修法**：
  1. 实施 LRU（默认上限 3 个 inactive 实例），淘汰时调用 `instance.dispose()` 并 `runtimeEntries.delete(key)`
  2. `commitSession` 切 sessionId 时也参与 LRU 淘汰
  3. 新增公开方法 `getEntryCount()` 给测试使用
- **验证**：新增切换 N 次后的实例数上限断言

### 🟡 P1（影响交互的 Bug + Copilot 真实痛点）

#### P1-3：`'cancelling'` 状态被活跃事件冲刷
- **位置**：`apps/studio/src/renderer/hooks/useStudioBridge.ts:306-315, 870-913`
- **现状**：`isActiveRunStatus('cancelling') === true`，所以 `text_delta / model_first_chunk / context_update` 触发的 `setRunStatus((current) => isActiveRunStatus(current) || current === 'idle' ? 'running' : current)` 会把 cancelling 翻回 running
- **修法**：把活跃事件分支里的 reducer 改为"只在 starting/running/tool_calling/waiting_* 时回到 running"，cancelling 不参与
- **验证**：新增"点 Stop 后到达 text_delta，runStatus 仍保持 cancelling"测试

#### P1-4：`refreshStateAsync` 与下一轮 submit 写竞争
- **位置**：`apps/studio/src/renderer/hooks/useStudioBridge.ts:1536-1604`
- **现状**：fire-and-forget，A 轮的 setState 可能覆盖 B 轮已切换的 selectedSessionId
- **修法**：每次 submit 前递增 `submitEpochRef`，`refreshStateAsync` 在 setState 前比对 epoch，过期则放弃写
- **验证**：新增"submit A 完成后 refresh 还在跑时切到 B 会话，B 的选择不会被冲掉"测试

#### P1-5：`finalizedRunIdsRef` Set 永不收敛
- **位置**：`apps/studio/src/renderer/hooks/useStudioBridge.ts:449`
- **修法**：实现轻量 LRU（上限 64）
- **验证**：新增超出上限后旧 ID 被淘汰、最近 ID 仍生效的测试

#### P1-6：Bootstrap 阶段无 UI 反馈（Copilot 提的，确实存在）
- **位置**：`packages/runtime/src/create-runtime.ts:271-285`、`apps/studio/src/main/studio-runtime-service.ts` 事件桥接、`apps/studio/src/renderer/hooks/useStudioBridge.ts` `currentRunStep`
- **现状**：`run_started` 之后到第一个 `model_request_started` 之间用户只看到"正在启动运行"
- **修法**：把 `bootstrapAll()` 已经发出的 `timing_mark` 事件桥接为 `runtime_bootstrap_progress`，渲染层把 stage 翻译为中文步骤文案（"加载配置 / 索引文件 / 初始化插件 / 准备工具"）
- **验证**：新增 timing_mark → currentRunStep 的更新断言

#### P1-7：思考态可视化缺失（Copilot 提的）
- **位置**：`apps/studio/src/renderer/components/ConversationTimeline.tsx`、`useStudioBridge.ts` 的 model_request_started 处理
- **现状**：`model_request_started` 到 `model_first_chunk` 之间无视觉指示
- **修法**：在 currentRunStep 文案中加入"模型正在思考"，并在 ConversationTimeline 顶部当 `isRunActive && 没有 live blocks` 时显示一个简洁的 thinking 占位（spinner + 文案）
- **验证**：新增 first chunk 之前显示思考占位，到达后消失的测试

### 🟢 P2（性能 / 体验）

#### P2-8：`StudioShellInspector.inspect` 全盘扫盘
- **位置**：`apps/studio/src/main/studio-shell-inspector.ts:355-403`、`packages/persistence/src/persistence/session-utils.ts` `getGitBranch`
- **修法**：
  1. `getGitBranch` 加 60s TTL 缓存（按 projectPath + git HEAD mtime 失效）
  2. `selectStartupSession` 校验路径不再 `loadMessages`，改为读 session 文件 size > 0 即可
  3. `inspectSession` 已有缓存，保持不变

#### P2-9：Markdown 渲染补功能
- **位置**：`apps/studio/src/renderer/utils/markdown-renderer.tsx`
- **修法**：在零依赖前提下补 `# heading`（h1-h3）、`[text](url)`（仅 http/https 白名单 + `target="_blank" rel="noreferrer noopener"`）、`> blockquote`、`~~strike~~`、简易 `| col |` 表格
- **验证**：新增渲染快照测试

#### P2-10：工具并行执行批次提示
- **位置**：`apps/studio/src/renderer/utils/conversation-render-rows.ts`、`ToolActivityGroupRow.tsx`
- **修法**：把现有 exploration 分组扩展为"任意连续工具如果有 ≥2 个 running，显示 `N / M 工具进行中`"，对非 exploration 也分组（但不合并 detail 行）
- **验证**：新增"3 个 write_file 并发时分组显示 3 项"测试

#### P2-11：Workspace 失效快速恢复
- **位置**：`apps/studio/src/renderer/pages/StudioHomePage.tsx`、`apps/studio/src/main/studio-shell-inspector.ts:141-145`
- **修法**：当 issues 含 `workspace-missing` 时，在顶部 banner 加"重新选择 Workspace"按钮，复用现有 `selectWorkspace()`

### 🟦 P3（代码质量）

#### P3-12：`studio-ipc.ts:589-602` 缩进破损 → Prettier 化
#### P3-13：`ProjectTreePanel.tsx:65` aria-label 误用第 0 个 subagent 的 id

## 测试与验证

每完成一个修复项 → 跑对应单测 → 全部修完后跑：

```pwsh
pnpm typecheck
pnpm --filter xnova-studio test
pnpm --filter @xnova/runtime test
pnpm --filter @xnova/persistence test
pnpm --filter xnova-studio build
```

## 风险与回退

- **runtime busy 主进程串行化**：可能影响"用户在主进程响应慢的时候连点两次"的旧行为。Mitigation：renderer 已有 `isActiveRunStatus` 门禁，主进程串行化只是兜底。
- **runtime LRU 淘汰**：可能导致旧 session 切回时重新 bootstrap。Mitigation：上限 3 已经覆盖 99% 场景；按"最近使用"淘汰，不会动正在用的实例。
- **getGitBranch TTL**：用户切分支后最多 60s 才看到新分支。可接受。

## 完成标准

| 条件 | 必需 |
|---|:-:|
| 全部 13 个修复项落地 | ✅ |
| 每项至少一个回归测试通过 | ✅ |
| `pnpm typecheck` 通过 | ✅ |
| `pnpm --filter xnova-studio test` 通过 | ✅ |
| `pnpm --filter xnova-studio build` 通过 | ✅ |
| CHANGELOG.md 写入条目 | ✅ |
| 任务归档至 `.trellis/tasks/archive/2026-04/` | ✅ |
