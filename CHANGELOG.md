## 2026-04-27
- **Studio Codex-like 界面重构**：重做主壳首页、侧边栏、会话排版与底部悬浮输入体验
  - 侧边栏改为固定的低装饰项目工作台形态；项目区按 workspace 抽屉管理会话，全局 `+` 仍只负责添加新项目
  - 项目抽屉内新增“在当前项目中开始新对话”入口，清空当前会话选择后复用该项目创建新会话
  - 首页围绕中央 composer 和项目上下文条展开，弱化旧 dashboard / 大卡片视觉
  - 会话页把 composer 固定悬浮在底部，并将项目、分支、Agent、模型、Context、SubAgent 上下文移到输入框附近
  - 时间线滚动区固定为 `ConversationTimeline` 本身，并新增“回到底部”入口：流式输出默认跟随底部，用户上滚后可显式恢复跟随
  - 修复点击会话刷新快照时，侧边栏项目/聊天块短暂闪成 loading 文案的问题
  - 修复悬浮 composer 遮住最后一段对话后无法继续下滑的问题，最后一条消息现在可以滚到输入框上方完整显示
  - 新增 `DESIGN.md` 和 Trellis research，固化本轮 Codex App 参考布局与后续 UI 决策边界
- **Studio 交互现代化 Phase 3**：接入时间线虚拟化、窗口化历史与输出体量防线
  - `apps/studio` 引入 `react-virtuoso`，`ConversationTimeline` 改为动态高度虚拟列表；默认只展示最近 240 条持久化消息，并支持按 80 条批量加载更早历史
  - `liveConversation.blocks` 现在有 200 条窗口上限；超出后会插入“更早的实时输出已折叠”状态标记，避免无提示地在边界处截断
  - 工具 `resultSummary / resultFull` 在进入 renderer 状态层前统一截断，历史 `shellSnapshot.activeSession` 也会在 hydration 时做同样裁剪，防止长工具输出撑爆时间线和内存
  - 补齐 remount 回归：thinking 计时改为基于 `startedAt` 可重建，工具组/工具行的展开状态由时间线父层持有，虚拟列表回收后再进入视口不会丢用户展开意图
  - 验证：`pnpm --filter xnova-studio typecheck`、`pnpm --filter xnova-studio test`、`pnpm --filter xnova-studio build` 全部通过
  - 任务详情见 `.trellis/tasks/04-27-studio-interaction-phase3-virtualization/`
- **Studio 交互现代化 Phase 2**：引入 renderer store 分层，收口 `useStudioBridge` 的状态事实源
  - `apps/studio` 新增 `runtime-store / session-store / settings-store`，用 `zustand + immer` 承接运行态、项目/会话态与工作偏好态
  - `useStudioBridge` 不再通过本地 `useState` 持有主状态，改为作为 bridge 层读写 store，并保留原有 hook 对外 contract 以兼容页面与测试
  - 补上 store 单例在重新挂载/测试切换时的重置逻辑，避免旧 runStatus、旧 project/session 选择污染新会话
  - 验证：`pnpm --filter xnova-studio typecheck`、`pnpm --filter xnova-studio test`、`pnpm --filter xnova-studio build` 全部通过
  - 任务详情见 `.trellis/tasks/04-27-studio-interaction-phase2-state-store/`
- **Studio 交互现代化 Phase 1**：在 main 侧引入 runtime event 批量缓冲
  - 新增 `apps/studio/src/main/adaptive-event-batcher.ts`，按 `runId` 聚合 `text_delta / thinking`，前台 33ms、后台 150ms flush，并在控制/终端事件到来前先刷出已缓冲文本
  - `studio-runtime-service` 的 runtime 事件出口接入 batcher，`run_started / tool_start / tool_end / permission.* / model_request_* / terminal` 继续立即透传，只把高频文本类事件限流到 renderer
  - 补充 `adaptive-event-batcher.test.ts` 与 `studio-runtime-service.test.ts` 回归测试，锁住“相邻 delta 合并但顺序不乱”“控制事件前先 flush”“cancel 后不丢已见文本”等主链路契约
  - 验证：`pnpm --filter xnova-studio typecheck`、`pnpm --filter xnova-studio test`、`pnpm --filter xnova-studio build` 全部通过
  - 任务详情见 `.trellis/tasks/04-27-studio-interaction-phase1-batcher/`
- **Studio 交互现代化 Phase 0**：为高频流式输出补齐 renderer 止血层
  - `useStudioBridge` 为 `text_delta / thinking` 引入 RAF 批量缓冲，保持块顺序不变的前提下把同帧片段合并后再落地
  - `ConversationTimeline` 将历史用户/assistant 消息提炼为 memo 化消息视图，避免 live blocks 每次增长都重跑整段历史 renderRows
  - `ToolActionRow` 与 `ReasoningRow` 增加 `React.memo`；高频 delta 不再更新 `lastRuntimeEvent`，减少无意义页面级对象 churn
  - 新增手动 RAF 回归测试，覆盖“同帧多个 text_delta 先缓冲、下一帧再合并展示”的行为；`pnpm --filter xnova-studio typecheck`、`pnpm --filter xnova-studio test`、`pnpm --filter xnova-studio build` 全部通过
  - 任务详情见 `.trellis/tasks/04-27-studio-interaction-phase0-stopgap/`
- **Studio 权限与启动修复**：修复 Electron dev 解析失败与项目内写入误拒绝
  - 根 `.npmrc` 增加 Electron 精确 hoist；新增 `host.bindWorkspace` 让项目选择同步 main 侧 Workspace
  - `request.projectPath` 作为 runtime workspaceRoot 与权限判定基准，权限拒绝 reason 透传到 AgentLoop 工具结果
  - `TokenMeter` 改为惰性实例化，避免导入 runtime/core 时提前打开 SQLite 造成全量测试 DB 锁
  - 任务详情已记录至 `.trellis/tasks/04-27-studio-electron-permission-fixes/`
- **Studio 稳定性批量修复**：覆盖 P0 真死锁 / 真泄漏与 P1-P3 多项 UX、性能、可访问性问题
  - **P0 修复**：`createRuntime.submit` 复用时不再静默吞咽并发 submit，返回 `error` + 补发 `error`/`turn_end` 事件；`studio-runtime-service.submit` 新增主进程串行化门禁拒绝并发提交
  - **P0 修复**：`StudioRuntimeManager` 实施 LRU 淘汰（默认保留 3 个 idle 实例），切换 `(workspace, agent, sessionId)` 时旧实例被真正 `dispose()`，不再永久驻留
  - **P1 修复**：renderer 引入 `isActiveButNotCancelling`，`cancelling` 状态不再被晚到的 text/tool/permission 事件翻回 running，Stop 反馈不再闪烁
  - **P1 修复**：`submitPrompt` 引入 epoch 守卫，`refreshStateAsync` 在 await 中 epoch 变化时直接放弃 setState，避免覆盖新会话选择
  - **P1 修复**：`finalizedRunIdsRef` 实施 LRU 上限（默认 64），`addFinalizedRunIdToLruSet` 抽离为可单测的纯函数
  - **P1 改进**：`timing_mark` 事件透传到 renderer，按 `runtime_bootstrap_start / tool_registry_ready / history_hydration_start / context_build_start` 翻译为中文步骤文案，弥补 bootstrap 阶段 UI 反馈空白
  - **P1 改进**：`ConversationTimeline` 新增"Xnova 正在思考"占位（`model_request_started` → `model_first_chunk` 之间），结合 `currentRunStep` 显示当前阶段
  - **P2 改进**：`getGitBranch` 加 60s TTL 缓存，避免 shell.getSnapshot 每次起 git 子进程；新增 `clearGitBranchCache` 测试钩子
  - **P2 改进**：Markdown 渲染补齐 `# heading` / `[text](url)` / `> blockquote` / `~~strike~~` / `| table |`，链接仅允许 http(s) 白名单，零依赖、零 XSS
  - **P2 改进**：工具并行执行 ≥2 个 running 时合并为批次组，title 显示"正在并行执行 N 个操作（M/N 已完成）"
  - **P2 改进**：Workspace 失效 banner 加"重新选择 Workspace"快速恢复按钮，避免用户必须找顶部入口
  - **P3 修复**：`studio-ipc.ts` runtime.error 分支缩进破损修正；`ProjectTreePanel` 子代理 toggle 的 aria-label 不再误用第 0 个 subagent id，改为基于会话标题
  - 验证：`pnpm typecheck` 全包通过；`pnpm --filter @xnova/runtime test`（29 测试）、`pnpm --filter @xnova/persistence test`（14 测试）、`pnpm --filter xnova-studio test`（236 测试）全部通过；`pnpm --filter xnova-studio build` 通过
  - 任务详情已归档至 `.trellis/tasks/04-27-studio-stability-batch-fixes/`

## 2026-04-26
- **Studio Submit 非敏感性能打点**：新增 submit 全链路耗时诊断
  - Renderer / IPC / main runtime / shared runtime / provider stream 记录非敏感阶段时间，dev 或 `XNOVA_TIMING_DEBUG=1` 时输出 summary
  - summary 只包含阶段耗时与低敏字段，并补充 API Key / Authorization 不泄露测试
- **Studio 事件链路诊断测试**：补充 tool visibility / AgentLoop 时序 instrumentation
  - 新增 `AgentLoop` 时序测试，锁定 `tool_start` 早于 `write_file` 执行、`tool_end` 晚于文件写入完成、第二轮模型请求发生在工具结束之后
  - 新增 `useStudioBridge + ConversationTimeline` 端到端可见性测试，区分“存在 running 时间窗会显示进行中”和“tool_start/tool_end 同步到达时最终只剩 done”
- **Studio 模型首包守卫**：为每轮模型请求补齐独立 first-chunk guard
  - `studio-runtime-service` 基于 `model_request_started / model_first_chunk / model_request_finished / model_request_failed` 维护每轮独立首包计时，默认 45 秒无首响应即 abort 当前 run
  - 用户 Stop、模型首包到达、模型请求结束或失败时都会清理 timer，避免 cancel 后再被 timeout 误判成 failed
  - 补齐 second-turn model request、late first chunk、cancel 清理与 renderer 恢复输入的回归测试
- **Studio Run 终态与模型阶段可视化修复**：收口 late runtime event、thinking 生命周期与模型请求阶段状态
  - `useStudioBridge / studio-runtime-service / ConversationTimeline` 改为按 `runId` 保持 terminal state 单调，`run_cancelled` 后 late `turn_end/session_end` 不再覆盖 UI
  - thinking block 新增可选生命周期字段并在 `text/tool/status/system/cancel/terminal` 前统一 finalize，Stop 后不再继续显示“思考中...”或持续计时
  - `llm_start / llm_first_chunk / llm_done / llm_error` 已桥接为 `model_request_*` Studio runtime event，并补齐 renderer / runtime 回归测试
- **Studio Timeline 展示层重构**：为 blocks-first 会话新增 renderRows 中间层，收敛工具与 reasoning 的展示语义
  - 新增 `tool-classification / conversation-render-rows / ToolActivityGroupRow / ToolActionRow / ReasoningRow`，assistant 时间线不再直接平铺 raw blocks
  - 连续探索型工具合并为 activity summary，动作型与失败工具单独展示；`durationMs` 缺失或小于 50ms 不再刷出满屏 `0.0s`
  - 修复只有最后一个 live thinking 才持续计时的问题，并补齐 renderRows、activity group、timeline 的前端回归测试
- **Studio 会话持久化重构**：废弃旧 session message 结构，切换为 blocks-first 会话模型
  - `SessionStore / SessionLogger / createRuntime / shell inspector / Timeline` 全链路改为 `blocks` 作为唯一消息事实源，移除 synthetic `role=system` 工具消息
  - 新增 `conversationSchemaVersion = 2`，旧 session 不再迁移，列表直接忽略；开发期新增 `pnpm --filter xnova-studio reset:sessions`
  - 补齐 persistence/runtime/skills/observability/studio 回归测试，并通过 `pnpm --filter xnova-studio test`、`pnpm typecheck`、`pnpm --filter xnova-studio build`
- **Studio ConversationTimeline 顺序修复**：修复实时工具调用脱离 assistant 回答的问题
  - `liveConversation` 改为 ordered blocks，保留 `text_delta / tool_start / tool_end / text_delta` 到达顺序
  - persisted assistant message 带 `toolEvents` 时继续显示正文，并把工具调用归入 assistant turn
  - 补齐 hook 与 Timeline 回归测试，继续防止 `write_file.content` 和大 read 结果默认泄漏
- **Studio Run 后台工具停止与可视化**：修复 Agent 仍在后台调用工具但界面难以判断进展的问题
  - Stop / app quit / 窗口关闭会中断 active run，`AgentLoop` 收到停止后不再启动后续危险工具
  - 工具调用改为 read/write/edit/bash/git 摘要展示，默认不展开 `write_file.content` 与大结果
  - composer 运行中显示当前步骤、Stop、最后进展时间，并补齐工具摘要与关闭清理回归测试
- **Studio Run 停止与终态兜底**：修复有可见输出但 submit 不返回导致输入区永久锁死的问题
  - 新增 `runtime.cancel` 契约、`run_cancelled` 事件与 Stop 入口，用户可主动中断当前 Agent run
  - main 将 `turn_end/session_end` 收敛为 Studio run 终态，并让 cancel/watchdog 主动 abort、释放 active run
  - 补齐“有输出但 submit 不 resolve”、cancel、低层终态映射与 90 秒无进展提示测试
- **Studio Agent Run 生命周期收口**：补齐 Electron 编码 Agent 主链路的结构化运行状态
  - 新增 `run_started / run_completed / run_failed` 事件与 renderer `runStatus`，发送门禁从 submit IPC 状态扩展为完整 run 状态
  - submit 成功后延后清理 liveConversation，避免刷新失败导致流式内容丢失；submit 失败不再额外广播重复 `runtime.error`
  - 补齐 shared contract、main lifecycle 与 renderer 状态回归测试
- **Studio submit 超时修复**：修复正常对话被 60 秒固定总时长 watchdog 误杀的问题
  - `studio-runtime-service` 改为按“连续无新进展”续期 watchdog，并在首个 runtime 进展后切换到更长静默窗口，避免长思考模型被 60 秒误杀
  - `useStudioBridge` 新增系统错误去重，避免同一条 `runtime submit` 失败消息在界面中重复显示
  - 回归测试补齐 `studio-runtime-service-guard` 与 `use-studio-bridge-submit`，并通过 `pnpm --filter xnova-studio test` 与根级 `pnpm typecheck`
- **Studio 首轮对话可见性修复**：修复新项目首轮发送后仍停留在空白入口页的问题
  - `StudioHomePage` 在首轮 submit 尚未持久化 session 时也会直接显示 `ConversationTimeline`，并立即切到项目会话语义
  - 新增 `renderer-shell` 回归测试，锁住“消息已发出但 session 尚未落盘”时的对话可见性
  - 任务详情已归档至 `.trellis/tasks/archive/2026-04/04-26-runtime-submit-timeout-retry-fix/`

## 2026-04-25
- **Studio 对话交互 UX 优化**：参考 Claude Code App / Codex CLI 范式，全面升级消息流交互体验
  - ThinkingBlock：可折叠思考块 + CSS spinner + 秒数计时 + 实时流式内容展示 + 完成后自动折叠
  - ToolCallRow：紧凑工具调用行 `Read src/index.ts` 风格 + 呼吸灯脉冲 + spinner → 完成变粗体加深色
  - ContextRing：上下文用量改为 SVG 环形进度圈 + hover tooltip 显示 token 详情（已用/窗口/占比）
  - 新增零依赖 Markdown 渲染器（bold/code/list）+ 打字机光标闪烁动画
  - 打通 `context_update` 事件管道（runtime → useStudioBridge → ContextBar）

- **Studio 用户交互实现**：打通 AskUserQuestion 的 main/preload/renderer 交互闭环
  - 新增 `studio:user-input:request/respond` 契约、preload 校验、main 等待队列与 60 秒超时取消
  - 新增 `UserQuestionDialog` 并在主壳挂载，支持 `text` / `select` / `multiselect` 三种题型
  - 任务详情见 `.trellis/tasks/archive/2026-04/04-25-imp-002-user-question/`

- **Studio 权限系统重构**：将危险工具权限从硬编码拒绝改为 Renderer 弹窗决策
  - 新增 `studio:permission:request/respond` 契约、preload 校验、main 等待队列、30 秒超时与本次会话记住
  - 新增 `PermissionDialog` 并在主壳挂载，bash/git/kill_shell 可由用户确认执行
  - 任务详情见 `.trellis/tasks/archive/2026-04/04-25-imp-001-permission-system/`

- **全面代码审查与改进计划**：完成全项目架构审查、OpenCowork 对比分析，产出分阶段改进计划
  - 产出 `IMPROVEMENT-PLAN.md`：18 项改进清单，按 P0/P1/P2/P3 四级优先级排序
  - 产出 `CODEX-PROMPT.md`：给 Codex 的完整 Trellis 工作流提示词，逐步拆解执行改进项
  - 核心诊断: 引擎层设计成熟但体验层残缺（权限弹窗、用户交互、Markdown 渲染缺失）

- **Runtime 历史同步修复**：修复 Studio 第二轮消息触发 provider `messages must not be empty` 的主链路缺陷
  - `createRuntime()` 在收到显式 history 时先同步 `ContextManager`，不再让首轮恢复态和后续轮次的上下文事实源分叉
  - 无显式 history 的 submit 现在会先补写当前用户消息，再进入 `AgentLoop`，避免复用 runtime 时把空消息数组发给 provider
  - 新增 runtime 集成回归测试，覆盖“首轮恢复历史后继续追问”的场景

- **Runtime 主链路修复**：修复 Studio 发送消息卡在 bootstrap 并最终 OOM 的问题
  - 文件索引在 glob 阶段跳过重型目录并禁止跟随符号链接，避免扫描 `node_modules/dist/build`
  - Studio runtime 将真实 workspace cwd 透传到 `bootstrapAll`、`AgentLoop` 与工具上下文
  - 任务详情见 `.trellis/tasks/04-25-rescue-studio-runtime-ux/`

- **Studio 关键体验修复**：补齐设置与会话主工作面的基础可用性反馈
  - 模型设置支持空列表添加并禁用无效添加，设置弹窗视觉层级更清晰
  - 会话页稳定显示恢复状态、Memory 降级建议、子 Agent 停止反馈，并避免聊天滚动在降级 DOM 中崩溃
  - 任务详情见 `.trellis/tasks/04-25-rescue-studio-runtime-ux/`

## 2026-04-24
- **工作区清理迁移**：正式移除根 `cli/` 与根 `studio/` 的工作区入口，统一主线为 `packages/* + apps/studio`
  - `pnpm-workspace.yaml` 移除根 `cli`，根 `cli/package.json` 与根 `studio/package.json` 改为下线占位清单，不再暴露 `dev / build / test / pack` 入口
  - `README.md`、`PROJECT-ARCHITECTURE.md`、`docs/release/xnova-studio-v1-trial.md`、`.trellis/spec/**` 统一改写为 `apps/studio` 唯一宿主叙事，并标明根 `cli/`、根 `studio/` 仅为待手动删除的历史快照
  - 同步新增工作区清理回归测试，锁住 `workspace`、发布文档与 legacy 壳下线约束

- **Studio Runtime Manager / CLI 冻结收口**：完成 main 长生命周期 runtime manager、renderer contract 收口与 CLI 对照归档
  - `apps/studio/src/main` 新增 `studio-runtime-manager`，按 `workspace / session / agent` 复用 runtime / engine service，`studio-runtime-inspector` 优先返回 live runtime snapshot，切回缓存会话时补历史恢复
  - `apps/studio/src/renderer` 移除 legacy `submitPrompt` / `shell.setCurrentPrimaryAgent` fallback，统一只走 shared bridge contract；`cli/README.md` 标记为冻结参考，并新增 CLI 能力对照矩阵
  - 根级 `pnpm typecheck`、`pnpm test`、`pnpm build` 已通过；任务详情已归档至 `.trellis/tasks/archive/2026-04/04-24-04-24-studio-runtime-pivot/`，矩阵文档见 `.trellis/tasks/archive/2026-04/04-24-04-24-cli-parity-verification-and-freeze/parity-matrix.md`

- **Studio Runtime 边界收口**：清零 `runtime/main` 对 `cli/src` 的核心直连并补齐宿主会话生命周期
  - `packages/runtime` 改为通过 package alias 消费 `config/core/mcp/memory/persistence/providers/skills/observability/plugin`，并把 `cleanup-service / event-bus / image-store / message-utils / hooks / file-index` 补齐到 `packages/core`
  - `apps/studio` 的 main 层、`electron.vite`、`vitest`、`tsconfig` 全面改接 `packages/*`；`runtime.submit` 新增 `sessionId` 契约，主进程改为复用会话级 runtime，并为权限请求加入显式策略与审计事件
  - 补齐 `plugin` 真实测试、runtime/studio 边界回归测试，并重新通过根工作区 `typecheck / test / build`；任务详情已归档至 `.trellis/tasks/04-24-04-24-studio-runtime-pivot/`

- **Engine Service API 收敛**：将旧 CLI 命令能力收敛为面向 `apps/studio` 的 runtime service API
  - 新增 `packages/runtime/src/engine-service-api.ts` 与配套类型导出，统一提供 `runtime/session/memory/mcp/skills/usage/plugin/maintenance` 服务合同，并落地旧命令能力映射
  - `apps/studio/src/main/**` 最小接入 `createEngineServiceApi()`，通过 service API 复用 memory/mcp/skills/runtime.setModel 的核心业务能力，避免迁移命令壳
  - 新增 runtime 与 studio adapter 回归测试并完成相关 `test/typecheck/build` 验证；任务详情已归档至 `.trellis/tasks/04-24-04-24-engine-service-api/`

- **基础领域包迁移**：抽离 config/providers/persistence/platform/observability 为可独立消费的 packages
  - 新增 `packages/config`、`packages/providers`、`packages/persistence`、`packages/platform`、`packages/observability` 的源码、`package.json`、`tsconfig.json` 与最小测试/构建配置，按 copy-first 复用 CLI 基础能力
  - `packages/core` / `packages/runtime` 的基础域路径映射与关键导入切换到 `packages/*`，移除 runtime 对 `cli/src/config|providers|persistence|platform|observability` 的直接依赖
  - 迁移并补齐基础域回归测试（先失败后通过）与相关包 `typecheck/test/build` 验证；任务详情见 `.trellis/tasks/04-24-04-24-foundation-domain-packages/`

- **能力领域包迁移**：抽离 tools/memory/mcp/skills/plugin 为可独立消费的 packages
  - 新增 `packages/tools`、`packages/memory`、`packages/mcp`、`packages/skills`、`packages/plugin` 的源码、`package.json`、`tsconfig.json` 与最小测试/构建配置，按 copy-first 复用 CLI 能力实现
  - `packages/core` / `packages/runtime` 的能力域路径映射与关键导入切换到 `packages/*`，移除 runtime 对 `cli/src/tools|memory|mcp|skills|plugin` 的直接依赖
  - 补齐迁移回归测试（先失败后通过）与相关包 `typecheck/test/build` 验证；任务详情已归档至 `.trellis/tasks/04-24-04-24-capability-domain-packages/`

- **Runtime/Core P0 闭环修复**：改正运行时包改线、硬门禁与主宿主语义
  - `packages/runtime` 改为直接依赖 `@xnova/core`，`apps/studio` 的 runtime service / inspector 与相关测试改接 `@xnova/runtime`
  - 根工作区脚本不再使用 `--if-present` 软门禁，新增 `@xnova/core`、`@xnova/runtime` 的显式 `typecheck/test/build` 链路
  - 冻结旧 `studio/` 目录并将脚本转发到 `apps/studio/`；同步修正 `packages/core` 的静默吞错日志与 workspace 依赖告警

- **Runtime 包迁移**：按 copy-first 将旧 `cli/src/runtime/**` 基线迁入 `packages/runtime/src/**`
  - 复制 `create-runtime`、`types`、`events`、`bridge`、`inspect`、`tool-registry` 与 `index`，仅做最小 import 路径修正
  - 迁移并恢复 runtime 测试基线：`packages/runtime/src/__tests__` 共 14 条用例通过（含先失败后通过的 TDD 验证）
  - 新增 `packages/runtime/package.json`、`tsconfig.json`、`vitest.config.ts` 最小包配置；任务详情已归档至 `.trellis/tasks/04-24-04-24-runtime-package-extract/`

- **工作区骨架**：建立 `packages/ + apps/` 基线并迁移 Studio 宿主承载目录
  - 新增根 `package.json`、`pnpm-workspace.yaml`、`tsconfig.base.json` 与 `tsconfig.json`，提供 workspace 与 TS 路径别名基线
  - 按 copy-first 将 `studio/` 复制到 `apps/studio/`，并最小修正 `electron.vite.config.ts` / `tsconfig.json` 中的 `cli` 相对路径
  - 新增 `apps/cli`、`packages/runtime`、`packages/core` 占位结构，不包含业务迁移实现；任务详情已归档至 `.trellis/tasks/04-24-04-24-packages-apps-bootstrap/`

- **Studio Runtime Submit 修复**：补齐桌面宿主提交首轮消息的 history 契约
  - `apps/studio/src/main/studio-runtime-service.ts` 提交 shared runtime 时显式携带当前用户消息 `history` 与 `loggedUserContent`，修复 Provider 侧 `messages must not be empty`
  - 更新 `apps/studio/tests/studio-runtime-service.test.ts`、`apps/studio/tests/studio-runtime-service-guard.test.ts`，锁住桌面宿主 submit 入参契约
  - 回写 `.trellis/spec/backend/runtime-boundary.md`，明确 host 直调 `runtime.submit` 时不得省略当前 user turn history；任务详情已归档至 `.trellis/tasks/04-24-studio-main-flow-repair/`

- **Studio Runtime 打包修复**：修正 Electron main 对 `libsql` native 依赖的打包边界
  - `apps/studio/electron.vite.config.ts` 将 `libsql` 与 `@libsql/*` 设为 main bundle external，避免运行时落入 Rollup 的动态 require 陷阱
  - `apps/studio/package.json`、`apps/studio/pnpm-lock.yaml` 显式补齐 `libsql` 运行时依赖与 `pnpm.onlyBuiltDependencies`，确保 Studio 自身携带 native 绑定
  - 新增 `apps/studio/tests/native-runtime-packaging.test.ts` 锁住 native 打包边界；任务详情已归档至 `.trellis/tasks/04-24-studio-main-flow-repair/`

- **Studio 主链路修复**：补齐会话聊天视图、runtime 门禁与会话级模型选择
  - `apps/studio/src/renderer/**` 新增真实会话聊天流与会话级 Provider / Model 选择器，项目会话页可继续输入，不再只显示摘要卡片
  - `apps/studio/src/main/**`、`apps/studio/src/preload/**`、`apps/studio/src/shared/**` 打通 `providerId / sessionId / activeSession` 契约，并让未绑定 Workspace 时真正阻止提交
  - 顶部 `XForge` 点击改为明确提示“暂未开放”，同步补齐 `studio` 主链路回归测试；任务详情已归档至 `.trellis/tasks/04-24-studio-main-flow-repair/`

- **运行时内核抽离**：按 copy-first 将核心编排层迁入 `packages/core`
  - 新建 `packages/core/src`，复制 `agent-loop`、`bootstrap`、`context-manager`、`context-tracker`、`parallel-executor`、`args-summarizer` 及直接依赖 `types/repetition-detector/debug`
  - 新增 `packages/core/src/index.ts`、`packages/core/package.json`、`packages/core/tsconfig.json` 与迁移测试 `packages/core/src/__tests__/core-kernel-extract.test.mjs`
  - 保留 `bootstrap` 对旧 `cli/src` 领域包的临时依赖映射（providers/tools/memory/mcp/config 等），等待后续 package 子任务接管

## 2026-04-23
- **Studio Settings Dialog**：重做设置为 Cherry 风格悬浮窗并打通模型服务可编辑流
  - 新增/重写 `StudioSettingsDialog` 三栏结构：左侧模块导航、模型服务平台列表、平台配置详情；`open=false` 返回 `null`，根节点固定 `role="dialog"`
  - 模型服务模块支持添加平台（仅 `openai compatible` / `anthropic compatible`）、编辑平台名/API Key/API 地址/模型列表，并可执行测试连接与保存（复用 `settingsApi`）
  - 默认模型与全局记忆模块改为可操作面板，包含默认模型保存与 Memory 重建入口；同步补齐 `provider/memory/settings-tools` 对话框测试

- **Studio Runtime Bridge**：打通 `runtime.submit` 最小可用链路
  - `studio` 新增 `runtime.submit` 合同、preload 校验与 main IPC handler，并新增 `studio-runtime-service` 复用 `cli/src/runtime/create-runtime.ts` 执行单轮提交与事件回传
  - `useStudioBridge` 新增 `submitPrompt(text)` 与 `isSubmitting`，提交成功后刷新 `shellSnapshot`/recent projects/project sessions，确保项目区可见新会话
  - `studio-shell-inspector` 增加标题回退：当 summary 缺失首条消息时，从首个 user 消息提取前 10 字作为会话标题；同时在 CLI `sessionLogger` 增加 `setCwd()` 以保证会话归属到当前项目

- **Studio Shell · 项目入口壳层重构**：主壳从占位页升级为可操作项目入口
  - `apps/studio/src/renderer/pages/StudioHomePage.tsx` 将“新对话”改为项目级可编辑/可提交入口，并新增可筛选可跳转的搜索页、可切换主 Agent 的 Agents 页
  - `apps/studio/src/renderer/components/ProjectShellSidebar.tsx` 移除一级“聊天/设置”按钮，保留“新对话”首项，并将“设置”迁至左下角 utility 入口
  - 新增 `StudioSettingsDialog` 与壳层局部样式文件，且补齐 `renderer-shell/sidebar-information-architecture/project-session-trees` 回归测试

- **Studio Shell · Codex Layout 收口**：新对话页、模式入口与设置状态按最新视觉/语义要求重新对齐
  - `apps/studio/src/renderer/**` 将左侧首项调整为“新对话”，并把空白主工作面改成更接近 Codex App 的项目层布局，保留玻璃感、阴影与大圆角
  - `Standard / XForge` 仅在主工作页显示；设置/工具等非编码页不再重复出现模式切换
  - 修正 `runtime not-ready` 被误判为 `disabled` 的状态映射，移除设置页“宿主桥接不可用”的误报，并补齐动态项目标题与回归测试

- **Studio Shell**：`Xnova Studio` 主壳交互与文档契约重新对齐
  - `ContextBar` 恢复完整 placeholder 文案，并补齐可点击的项目 / Agent / 模型 / SubAgent 管理入口
  - 空白聊天页、顶部模式切换、SubAgent 树与主流程反馈同步收口，补上子代理详情视图与部分结果展示
  - `studio` 侧 `vitest`、`typecheck`、`build` 全部通过，锁住当前 project-aware 主壳行为

- **Design System · Xnova Studio**：补齐桌面主壳的前端视觉系统与预览基线
  - 新增 `DESIGN.md`，锁定 `Xnova Studio` 的整体气质、字体、配色、布局、动效和 project-aware 主壳规则
  - 新增 `docs/xnova-studio-design-preview.html`，用静态预览页展示空白聊天页、Tools / Settings 状态页和 Agents / 会话层级的目标观感
  - 新增 `CLAUDE.md` 设计协作约束，确保后续 UI 实现与评审都先对齐设计系统

- **Phase 7 · Polish and Release**：桌面主壳完成恢复、错误态、边缘反馈、性能收口与发布准备
  - `apps/studio/src/renderer/**`、`apps/studio/src/main/**` 与 `cli/src/**` 打通最近项目/会话/Mode/Agent/Model 恢复、结构化错误合同、memory / subagent 主流程反馈，以及大会话恢复的轻量摘要与性能采样
  - `apps/studio/package.json`、`apps/studio/electron-builder.yml`、`README.md`、`docs/release/xnova-studio-v1-trial.md` 补齐 Windows 打包脚本、目录产物链路、版本信息与试用说明
  - 完成当时的 legacy CLI 验证、`pnpm --dir apps/studio test/typecheck/build`、`pnpm --dir apps/studio pack:dir` 与 Electron smoke；`pack:win` 两次卡在外部 NSIS 二进制下载超时，已记录为当前残余风险

- **Phase 7 · Residual Risk Cleanup**：补齐 Memory degraded 反馈与持久化安全 barrel 边界
  - `apps/studio/src/renderer/**` 新增 Memory 状态映射与建议动作，让 `degraded / bm25 / disabled` 在主工作流和设置页都以中文状态呈现，而不是直接暴露原始状态码
  - `cli/src/persistence/index.ts` 收口为 session JSONL 安全 barrel；`closeDb` 调用点改成 leaf import，并补 `index-boundary` 回归测试锁住 `db.ts` 不再经由 barrel 透出
  - 重新验证当时的 legacy CLI 链路、`pnpm --dir apps/studio test/typecheck/build/pack:dir` 与 Electron smoke，确认修复未破坏 Phase 7 主链路

- **Phase 6 · Settings and Tools**：桌面主壳完成 Providers、Memory、MCP、Skills / Plugins 的 Phase 6 整合
  - `apps/studio/src/renderer/**` 新增 Settings / Tools 页面骨架、Provider 表单、Memory 状态卡片、MCP 状态卡片和 Skills / Plugins 状态卡片，统一走 preload bridge，不回退到旧 Web 壳
  - `cli/` 新增 Provider / Memory / MCP / Skills / Plugins 纯服务，打通 TOML、概览、管理入口与状态判定，并让旧 dashboard API 复用同一条服务逻辑
  - 补齐 CLI / Studio 的 Phase 6 回归测试、typecheck、build 与真实 Electron smoke；任务详情已归档至 `.trellis/tasks/04-23-phase6-settings-and-tools-verification/`

## 2026-04-22
- **Phase 5 · Project-aware Shell**：桌面主壳从 Phase 4 最小状态页升级为 project-aware 入口
  - 冷启动默认进入空白聊天页或恢复最近工作会话，`Overview` 退出默认首页职责，并补齐路径失效/会话损坏降级反馈
  - `apps/studio/src/renderer/**` 落定一级导航、项目/聊天双 block、最近项目与会话树、子代理折叠树、scratchpad 分离、上下文条与顶部唯一 `Standard / XForge` 切换
  - 新增 `shell.getSnapshot` 桥接与 `studio-shell-inspector`，并修复真实 Electron smoke 下 `persistence/index -> libsql` 动态依赖导致的 main process 崩溃

## 2026-04-22
- **Phase 4 · Electron Host 修复收口**：收回 preload 越界逻辑并修复真实 Electron 加载阻塞
  - `runtime.inspect` 改为 `renderer -> preload -> main IPC -> cli/src/runtime/inspect` 链路，preload 不再直接打包 `ConfigManager` 与文件系统逻辑
  - 主窗口本地产物改用 `loadFile`，开发态 URL 增加重试，smoke 改为等待窗口加载 Promise，真实 `build/dev smoke` 均不再报 `ERR_FAILED (-2)`
  - renderer 增加桥接延迟探测与配置告警展示，清理 `studio` 的旧 `exclude` 残留并同步 Phase 4 任务状态
  - 任务详情已归档至 `.trellis/tasks/04-22-phase4-electron-host/`

## 2026-04-22
- **Phase 4 · Electron Verification**：补齐 Phase 4 的自动化验收与 smoke harness
  - 新增 `apps/studio/src/main/smoke.ts` 与对应测试，用环境变量驱动 `getState -> openWorkspace -> runtime.inspect` 的最小 smoke 链路
  - 完成验证回归：`pnpm --dir apps/studio test / typecheck / build`，以及当时的 legacy CLI bootstrap / runtime inspect / typecheck 验证
  - 任务详情已归档至 `.trellis/tasks/04-22-phase4-electron-verification/`

- **Phase 4 · Renderer Minimal Shell**：落定最小 renderer 页面与四态可见反馈
  - 新增 `renderer` 的 `hooks/pages` 最小结构，页面真实展示 `disabled / empty / loading / error` 状态，并可触发“打开 Workspace”与最小 runtime inspect
  - 新增 `renderer-shell.test.tsx`，锁定 bridge 缺失、Workspace 空态、打开目录、runtime inspect 成功反馈
  - 任务详情已归档至 `.trellis/tasks/04-22-phase4-renderer-minimal-shell/`

- **Phase 4 · Preload IPC Bridge**：建立唯一宿主入口与最小 runtime inspect 桥接
  - 新增 `studio-* bridge` 契约与 preload/main 双侧实现，固定 `host state / open workspace / runtime inspect / 事件订阅` 的 API 与 channel 语义
  - `preload` 通过参数校验和订阅清理收口 renderer 入口；`main` 只保留 host IPC，`runtime` 最小请求复用 `cli/src/runtime/inspect.ts`
  - 新增 `studio` 侧 IPC / validators / preload bridge 测试与 `cli/src/runtime/__tests__/inspect-runtime.test.ts`
  - 任务详情已归档至 `.trellis/tasks/04-22-phase4-preload-ipc-bridge/`

- **Phase 4 · Main Process Workspace**：收口 Electron 主进程宿主职责与 workspace 目录选择能力
  - 新增 `logger / lifecycle / window / workspace` 模块，主进程仅承载窗口、生命周期、目录选择与基础错误输出
  - 新增 `studio` 主进程测试，覆盖窗口复用与销毁、`whenReady` / `window-all-closed` / `activate`，以及取消选择、空路径、无效路径、异常路径
  - 完成 `pnpm --dir apps/studio test`、`pnpm --dir apps/studio typecheck`、`pnpm --dir apps/studio build`
  - 任务详情已归档至 `.trellis/tasks/04-22-phase4-main-process-workspace/`

## 2026-04-22
- **Phase 4 · Studio Bootstrap**：建立 Electron 独立宿主骨架与最小可验证基线
  - 新建 `studio/` 独立工程，落定 `main / preload / renderer` 入口、`electron-vite` 构建配置与 `dev / build / typecheck / test` 脚本
  - 新增 `cli/tests/studio-bootstrap.test.ts` 与 `apps/studio/tests/app-shell.test.ts`，锁定骨架文件存在性、边界约束与最小窗口装配辅助逻辑
  - 完成最小验证：`pnpm test -- tests/studio-bootstrap.test.ts`、`pnpm --dir apps/studio test`、`pnpm --dir apps/studio typecheck`、`pnpm --dir apps/studio build`
  - 任务详情已归档至 `.trellis/tasks/04-22-phase4-studio-bootstrap/`

- **Phase 3 · Agent System 返工收口**：补齐继承链与校验细节，消除最后一批 Phase 3 契约风险
  - `catalog.ts` 改为按依赖顺序解析 user agent 继承，避免受文件排序影响，并确保 `user > builtin` 覆盖场景下 `inherits` 不会错误退回内置版本
  - `parser.ts` 补上 `inherits` 的 agent id 格式校验；新增 `catalog.test.ts` 与 `agent-schema-v1.test.ts` 回归用例锁住继承顺序与非法引用格式
  - 在当时的 legacy CLI 工作树下重新验证：`pnpm vitest run`（199 passed / 3 todo）、`pnpm typecheck`、`cli/web pnpm build:check` 全部通过
  - 任务详情已归档至 `.trellis/tasks/04-22-phase3-agent-verification/`

- **Phase 3 · Agent System 完整交付**：Agent 体系升级到 v1 设计要求，保持旧内置 agent 兼容可用
  - **schema-v1 + parser**：新增 `schema-v1.ts`（v1 TypeScript 类型）和 `parser.ts`（TOML frontmatter 解析器/校验器），支持 `id / name / summary / mode / inherits / when_to_use / tool_policy / model_preference / extra` 全字段校验，错误定位到字段名与文件路径
  - **compat-loader**：新增 `compat-loader.ts`，双向转换 `AgentDefinition` ↔ `LoadedAgentDefinitionV1`；旧内置 `general / explore / plan` 通过兼容层保持可用，不破坏 dispatch_agent 主链路
  - **mode-filter**：新增 `mode-filter.ts`（唯一事实源），统一 `canBePrimary / canBeSubagent / filterForPrimarySelector / filterForSubagentPool / validateDefaultAgent`，UI 与 runtime 复用同一套规则
  - **类型收敛**：`AgentSource` 从 `'built-in' | 'custom' | 'plugin'` 升级为 `'builtin' | 'user'`；内置 agent 增加 `mode: 'all'` 和 `summary` 字段；`UserAgentDefinition` 替换 `CustomAgentDefinition`
  - **registry 扩展**：`AgentDefinitionRegistry` 新增 `getForPrimarySelector / getForSubagentPool / getAllAsV1` 方法，`buildTypeDescriptions` 改为只输出 SubAgent 候选池
  - **user-agent-store**：新增 `user-agent-store.ts`（CRUD 服务）和 `agent-templates.ts`（6 种内置模板），支持从模板/空白创建、保存前 schema 校验、重复 id 检测
  - **服务端 API**：新增 `agents-api.ts`（7 个路由：list/get/create/update/delete/templates/validate），挂载到 `/api/agents`
  - **独立 Agents 管理页面**：新增 `AgentsPage.tsx`（完整 CRUD 管理界面，主 Agent / SubAgent 候选池过滤视图，从模板/空白创建弹窗，内联编辑器）；Sidebar 新增 Agents 导航项；App.tsx 新增 `/agents` 路由；icons 新增 `IconAgent / IconPlus / IconEdit / IconTrash / IconX / IconBuiltin`
  - **测试**：新增 `agent-schema-v1.test.ts`（24）、`mode-filter.test.ts`（18）、`user-agent-store.test.ts`（16）；`dispatch-agent.baseline.test.ts` 对齐 v1 source 枚举；`agent-schema-v1.todo.test.ts` 转正（3 todo）
  - `pnpm vitest run` 179 passed / 3 todo；`pnpm typecheck` 0 error
  - 红线守住：UI 不展示 project-level agent；`default_agent` 只允许引用 `primary | all`；mode 过滤逻辑单一事实源
  - 任务详情已归档至 `.trellis/tasks/04-22-phase3-agent-system/`

## 2026-04-23
- **Phase 2 阶段级收口**：fix-A / fix-B / fix-C 全部落地，父任务 `04-21-phase2-config-migration` 与收口任务 `04-22-phase2-config-verification` 状态回到 `completed`
  - **fix-A（P0）**：TOML-first 初始化 + resolved config 贯穿主链路
    - `CCodeConfig` 扩展 `agent` / `modes` / `features` camelCase 字段；`field-mapping.ts` 补 user 层 `[agent]` / `[modes]` / `[features]` 双向映射
    - `resolver.ts` 按 spec §3 合并 `project > user > builtin`（标量/对象按 key merge、数组整组覆盖），新增 `loadEffectiveRuntimeConfig(cwd)` 主链路统一入口
    - 主链路接入：`pipe-runner` / `useChat` / `App.tsx` / `bootstrap.ts` / `dispatch-agent.ts`
    - `initializer.ts` 重写为 TOML-first：接受 `{ userDir, projectDir }` 注入；通过 `ConfigManager` 承担主配置落地；不再写 `config.json`；损坏 TOML / JSON 绝不备份不重置不覆盖
    - `ConfigManager.#loadFromLegacyJson` 去除"缺字段回写 JSON"分支（legacy JSON 变为只读迁移源）；`#writeJson` 死代码清理
  - **fix-B（P0）**：`field-mapping.test.ts` 从 7 扩展到 17 用例，新增 user 层 `[agent]` / `[modes]` / `[features]` 单向 + round-trip 锁死防回潮
  - **fix-C（P3）**：`SettingsPage.tsx:426` / `providers/registry.ts` 2 处错误文案 / `bootstrap.ts` memory warning / `useChat.ts` 注释统一指向 `~/.xnovacode/config.toml`
  - 新增测试：`initializer.toml-first.test.ts`（5）/ `resolver.effective-merge.test.ts`（6）/ `main-chain.resolved-config.test.ts`（3）
  - 当时的 legacy CLI `typecheck` 为 0 error；`vitest run` → 121 passed / 5 skipped（较原 97 passed 新增 24 条阶段级测试）
  - 红线守住：initializer 不存在任何 "备份+重写" silent reset；损坏 TOML / JSON 保留原文件；project.toml 损坏走 `warnings` 通道
  - 任务详情已归档至 `.trellis/tasks/04-21-phase2-config-migration/`、`.trellis/tasks/04-22-phase2-config-verification/`；交付确认见 `docs/implement/phase2-config-migration.md`（2026-04-23 版）

## 2026-04-22
- **Phase 2 状态回退**：复盘发现子任务级 DoD 并未等同于阶段级完成标准，父任务 `04-21-phase2-config-migration` 与收口任务 `04-22-phase2-config-verification` 状态从 `completed` 退回 `in_progress`
  - 问题 1（P1）：`cli/src/config/resolver.ts:141-144` 把 `effective` 固定为 user 层，`project.toml` 的 `agent`/`features`/`modes` 只透传到 `projectExtras`；`createRuntime` / `pipe-runner` / `useChat` 均未消费 `projectExtras`；与 `docs/implement/phase2-config-migration.md:99` "project.toml 可以影响运行时默认值" 不一致
  - 问题 2（P1）：CLI 真实启动入口仍走 `cli/src/core/initializer.ts`——缺失时创建 `config.json`，损坏时**备份后重写默认 JSON**（line 150-159），违背 spec "TOML 主路径 / 迁移失败保留原 JSON" 契约
  - 问题 3（P1）：`UserConfigToml` 声明了 `[agent]` / `[modes]` / `[features]` section（`cli/src/config/toml/types.ts:62`），但 `cli/src/config/toml/field-mapping.ts:111-172` 完全未映射；手写到 `config.toml` 的这些字段在任意 `save()` 后会被静默抹除
  - 问题 4（P3）：`cli/web/src/pages/SettingsPage.tsx:426` 仍告知用户"写入 ~/.xnovacode/config.json"，与 TOML-only writeback 事实矛盾
  - 同步回退：`docs/implement/phase2-config-migration.md` 交付确认表改写为 ❌ / ⚠ 对照表，列出 fix-A / fix-B / fix-C 待办
  - 五个子任务（A~E）保持 `completed`，模块粒度 DoD 满足，但不自动等同于阶段 DoD
- **Phase 2 收口**：Config Migration 阶段五个子任务全部完成，父任务 `04-21-phase2-config-migration` 状态置为 completed
  - 关键模块：`cli/src/config/toml/*`、`legacy-migration.ts`、`resolver.ts`、`settings-contract.ts`
  - API：`ConfigManager.getPaths` / `getLastWarnings`；`/api/settings`、`/api/settings/save` 返回 `{ config, source, warnings }`
  - 测试：`pnpm vitest run` 97 passed / 5 skipped（Phase 3 占位）；`pnpm typecheck` 0 error
  - 红线守住：损坏 TOML 不被覆盖；JSON 解析失败不生成默认 TOML；所有降级走显式 warning 通道
- **Phase 2 · E**：Config Migration 阶段最终收口（task `04-22-phase2-config-verification`）
  - 新增 `cli/src/config/__tests__/config-migration.integration.test.ts`（4 用例，覆盖旧用户 apiKey 不丢 / 设置页写回 round-trip / resolver 端到端）
  - 替换 `config-toml-migration.todo.test.ts`：占位 skip → 指引性真实断言（防止回潮）
  - 回写 `.trellis/spec/backend/config-toml-migration.md` 类型引用约定为"Phase 2 已落定"并补代码路径
  - 在 `docs/implement/phase2-config-migration.md` 勾选全部子任务 checklist，补充交付确认表
  - `pnpm typecheck` 绿跑；`pnpm vitest run` 97 passed / 5 skipped（Phase 3 占位仍保留）
- **Phase 2 · D**：设置页读写链路收口到 TOML（task `04-22-phase2-settings-writeback`）
  - 新增 `cli/src/config/settings-contract.ts`：`buildSettingsReadResponse` / `buildSettingsSaveResponse` 两个纯函数承载 API 响应契约
  - 改造 `cli/src/server/dashboard/api.ts`：`/api/settings` / `/api/settings/save` 返回 `{ config, source, warnings }`；保存失败显式抛 `{ success:false, error }`，绝不吞错
  - SettingsPage `ProvidersTab` 顶部新增「配置来源」条 + 「加载警告」条；legacy JSON 提示保存只写 TOML；保存失败错误可见（Toast + banner）
  - 新增 `settings-contract.test.ts`（5 用例）；`pnpm typecheck` 绿跑；`pnpm vitest run` 92 passed / 11 skipped
- **Phase 2 · C**：引入 `.xnovacode/project.toml` 与统一 resolver（task `04-22-phase2-project-resolver`）
  - 新增 `cli/src/config/resolver.ts`：`loadResolvedConfig(cwd, { configManager? }) → ResolvedConfigResult`
  - 契约：`source`（userToml / projectToml / legacyJson）、`projectExtras`（agent/features/modes 原样透传）、`warnings`（ConfigManager + project.toml 损坏/字段错误）
  - 合并规则遵循 spec §3：project.toml Phase 2 字段集只涉及 agent/features/modes，不落入 effective；由后续 runtime Task 消费 projectExtras
  - `ConfigManager` 新增 `getPaths()`，暴露 `baseDir / tomlPath / jsonPath`
  - 新增 `resolver.test.ts`（9 用例，覆盖优先级、merge、损坏/类型错误 warning、source 路径）
  - `pnpm typecheck` 绿跑；`pnpm vitest run` 87 passed / 11 skipped
- **Phase 2 · B**：实现 legacy JSON → TOML 安全迁移与双读（task `04-22-phase2-legacy-migration`）
  - 新增 `cli/src/config/toml/field-mapping.ts`：snake_case ↔ camelCase 双向映射（round-trip 无损），迁移不借机做字段重命名
  - 新增 `cli/src/config/legacy-migration.ts`：`migrateLegacyJsonToToml(baseDir) → MigrationResult`，TOML 已存在 / JSON 无法解析 / 写入失败三类路径全部显式 fallback，绝不覆盖原文件
  - 改造 `ConfigManager`：优先读 TOML（parse+validate+映射），回退 JSON，两者都无则写默认 TOML；新增 `getLastWarnings()` 暴露降级痕迹，损坏 TOML 绝不静默重置
  - 新增测试 `field-mapping.test.ts`（7 用例）/ `legacy-migration.test.ts`（4 用例）/ `config-manager.toml.test.ts`（4 用例）；更新基线测试首次初始化目标为 TOML
  - `pnpm typecheck` 绿跑；`pnpm vitest run` 78 passed / 11 skipped
- **Phase 2 · A**：落定 TOML schema / parser / serializer / validator 契约（task `04-22-phase2-toml-schema`）
  - 新增 `cli/src/config/toml/` 子模块：`errors.ts` / `types.ts` / `parser.ts` / `serializer.ts` / `schema.ts` / `index.ts`
  - 显式错误：`TomlParseError`（带 line/column）与 `TomlValidationError`（带 path），禁止 silent fallback
  - 覆盖 `UserConfigToml` / `ProjectConfigToml` schema 及 round-trip；新增 `toml-schema.test.ts`（21 用例全绿）
  - `pnpm typecheck` 绿跑；`pnpm vitest run` 63 passed / 11 skipped

## 2026-04-21
- **修复**：收口 shared runtime 主链路，修复 Gate A review finding
  - `useChat` 与 `core/pipe-runner` 改为通过 `createRuntime()` 驱动执行，不再直接 new `AgentLoop`
  - 新增 `host/cli/launcher.ts`，`cli/bin/ccli.ts` 进一步瘦身为参数解析后委托 host launcher
  - 新增 runtime / pipe runner / launcher 回归测试，`pnpm typecheck` 与 `pnpm vitest run` 绿跑
- **架构**：CLI Host 收敛 + Runtime Contract 文档化（task `04-21-cli-host-extraction`）
  - 新建 `cli/src/host/cli/`：`repl.ts` / `pipe-mode.ts` / `lifecycle.ts` / `index.ts`
  - 重写 `cli/bin/ccli.ts` 为薄入口（~270 行），委托给 `host/cli/`；runtime/ 验证无 ink/electron/ui 依赖
  - 产出 `docs/architecture/xnova-runtime-boundary.md`；回写 `spec/backend/runtime-boundary.md` 当前事实与代码参考
  - 新增 `host/cli/__tests__/lifecycle.baseline.test.ts`（7 个用例）；全套 37 passed / 11 skipped
  - 任务详情已归档至 `.trellis/tasks/04-21-cli-host-extraction/`
- **架构**：抽出 shared runtime 边界（task `04-21-runtime-boundary`）
  - 新建 `cli/src/runtime/`：`types.ts` / `tool-registry.ts` / `events.ts` / `bridge.ts` / `create-runtime.ts` / `index.ts`
  - 落定 spec 中 6 个占位类型（`ResolvedConfig` / `RuntimeEvent` / `PermissionRequest` / `PermissionResolution` / `UserQuestionRequest` / `UserQuestionResult` / `RuntimeSubmitInput` / `RuntimeSnapshot`）
  - 实现 `createRuntime()` 工厂 + `NoopBridge` / `CallbackBridge`；runtime/ 无 ink/electron/ui 依赖
  - 新增 `runtime/__tests__/create-runtime.test.ts`（11 个用例）；全套 30 passed / 11 skipped
  - 回写 `spec/backend/runtime-boundary.md` 类型引用约定为已落定
- **测试**：建立 Phase 1 测试基线（task `04-21-test-baseline`）
  - 修复 `mcp-api.ts` / `plugins-api.ts` 两处旧变量名残留（`ccodeMcpPath` → `xnovaMcpPath`，`ccodePluginsDir` → `xnovaPluginsDir`），`pnpm typecheck` 恢复绿跑
  - 扩展 `vitest.config.ts` include 模式，覆盖 `src/**/__tests__/**/*.test.ts`
  - 新增三条基线测试（19 个用例全绿）：`config-manager.baseline.test.ts` / `dispatch-agent.baseline.test.ts` / `session-store.baseline.test.ts`
  - 新增两个迁移占位文件（11 个 skip）：`config-toml-migration.todo.test.ts`（Phase 2）/ `agent-schema-v1.todo.test.ts`（Phase 3）
  - `cli/package.json` 新增 `test:baseline` 别名；`spec/backend/quality-guidelines.md` 与 `spec/frontend/quality-guidelines.md` 更新测试命令说明


- **任务**：拆出 Phase 1 Runtime Foundation 的三个 Trellis task 骨架
  - 通过 `.trellis/scripts/task.py create` 新建 `04-21-test-baseline` / `04-21-runtime-boundary` / `04-21-cli-host-extraction`（均 `planning` · P0）
  - 为每个 task 落地 `prd.md` 骨架：含 Problem / Goal / Scope / Dependencies / Subtasks / Related Files / Acceptance Criteria / Risks / Testing Strategy / DoD 段
  - 通过 `init-context backend` + `add-context` 把 `workflow.md`、`backend/index.md` 及 `runtime-boundary.md` / `config-toml-migration.md` / `agent-schema-v1.md` / `directory-structure.md` / `error-handling.md` / `quality-guidelines.md` / `logging-guidelines.md` 等专项 spec 按需挂到各 task 的 `implement.jsonl`
  - `task.py validate` 三个 task 的 jsonl 全部通过；`task.py list` 显示三者为当前 active
  - 依赖链在 prd 内以 Blocks / Blocked-by 明示，不使用 `add-subtask`，保留平级 sibling 结构
- **规范**：补齐 Xnova Studio v1 专项 spec 并完成索引闭环
  - 新增 `.trellis/spec/frontend/project-shell-v1.md`，固化默认入口、左侧信息架构、上下文条、Mode 切换、SubAgent UX 硬约束
  - `.trellis/spec/frontend/index.md` 接入 project-shell-v1 到指南索引、Pre-Development Checklist 与专项 Spec 触发器
  - `.trellis/spec/backend/agent-schema-v1.md` 为 `agent.max_parallel_subagents` 默认值加 spec 层占位注解，避免实现期提前锁死未经产品确认的硬编码
  - `.trellis/spec/backend/runtime-boundary.md` 补"类型引用约定"段，说明 `ResolvedConfig` 等骨架占位类型的定义归属；追加"相关 spec"段交叉引用 `directory-structure.md` 的 v1 禁止目录变更条款
  - `.trellis/spec/backend/config-toml-migration.md` 补"类型引用约定"段，明确 `ProviderConfigToml` / `CCodeConfigLike` / `MigrationResult` 等骨架类型必须由 Phase 2 对应 prd 收敛
- **文档**：补充 `Xnova Studio v1` 实现计划与交叉审批基线
  - 新增 `docs/plans/xnova-studio-v1-implementation-plan.md`，明确里程碑、任务拆解、迁移策略与测试映射
  - 建立仓库根 `CHANGELOG.md`，开始记录后续非微小变更
  - 任务详情已归档至 [docs/plans/xnova-studio-v1-implementation-plan.md]
- **文档**：拆分 `Xnova Studio v1` 分阶段实现任务
  - 新增 `docs/implement/README.md` 与 7 份 phase 子文档，按开发顺序拆解任务、依赖、测试与验收标准
  - 将原始开发文档进一步结构化，方便交叉审批与分模块推进开发
  - 任务详情已归档至 [docs/implement/README.md]
- **修复**：修正 Trellis 任务上下文生成时的无效检查路径
  - 为 `.trellis/scripts/common/task_context.py` 增加回退逻辑，避免生成不存在的 `check` 指引文件路径
  - 新增 `.trellis/scripts/tests/test_task_context.py` 回归测试，校验 `get_check_context()` 仅引用仓库内真实存在的文件
  - 重新生成并通过校验 `.trellis/tasks/00-bootstrap-guidelines` 的上下文文件
- **文档**：建立 Trellis 第一版 backend/frontend 基础规范
  - 基于现有 `cli/` 代码骨架与 `docs/` 中的 v1 需求文档，补齐 `.trellis/spec/backend/*` 与 `.trellis/spec/frontend/*`
  - 新增 `.trellis/scripts/tests/test_spec_bootstrap.py`，校验 spec 索引具备必需章节且不再保留占位模板
  - 任务详情已归档至 [.trellis/tasks/00-bootstrap-guidelines/research/spec-baseline.md]
- **文档**：补强启动前置项约束并归档 bootstrap 任务
  - 将 `00-bootstrap-guidelines` 任务状态收口并归档到 `.trellis/tasks/archive/2026-04/00-bootstrap-guidelines`
  - 在 backend 目录规范中明确 `runtime + host/cli + studio` 的渐进式拆分策略，禁止 Phase 1 直接做 `apps/packages` 重型搬家
  - 新增最小测试基线检查记录，确认当前 `pnpm typecheck` / `pnpm test` / `pnpm build:check` 受限于未安装依赖
- **文档**：补齐启动前 3 份专项 spec 并完善 Git 初始化忽略规则
  - 新增 runtime boundary、config TOML migration、agent schema v1 三份 backend 专项 spec，并接入 backend index
  - 扩展 spec 验收测试，要求 backend index 显式纳入 3 份专项 spec
  - 重写仓库根 `.gitignore`，覆盖依赖、构建产物、本地运行态与 Trellis 本地工作区
