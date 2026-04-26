# 救援 Studio runtime 主链路与关键用户体验

## Goal

让 Xnova Studio 从“能配置模型但无法完成对话”的半成品状态恢复为可验证的最小可上线工作台：优先打通 runtime submit 主链路，阻断 60 秒无响应与 Electron 主进程 OOM，再修复影响用户完成基础编码对话的关键界面问题。

## What I already know

- 用户已能配置 API 模型并通过连接测试，说明设置页 provider 配置至少可以被读取并用于测试请求。
- 真正对话时日志停在 `runtimeInstance.submit 开始` 和 `[create-runtime] submit start`，60 秒后 host 超时并调用 `abort()`。
- 日志里没有出现 provider stream 阶段日志，说明卡点大概率位于 runtime submit 进入 provider 调用前后，需从 `studio-runtime-service -> create-runtime -> provider adapter -> core AgentLoop` 全链路确认。
- Electron 主进程最终 V8 OOM，说明当前主链路存在未释放的大对象、无限等待后的状态堆积，或 runtime/session/context 复用边界错误。
- 当前工作区已有未提交改动：`apps/studio/src/main/studio-runtime-service.ts`、`packages/runtime/src/create-runtime.ts`、`packages/providers/src/providers/openai-compat.ts`、`AGENTS.md`。
- 本任务横跨 backend runtime 边界与 frontend project shell，需要遵守 `.trellis/spec/backend/runtime-boundary.md` 与 `.trellis/spec/frontend/project-shell-v1.md`。

## Requirements

- 首轮 submit 必须明确携带 `history`、`loggedUserContent`、`provider`、`model`、`workspace/session/agent` 上下文。
- provider stream 调用必须有可观测日志，且不得泄露 API Key、Authorization 或完整用户隐私内容。
- runtime submit 卡死时必须返回用户可见错误，并保证不会继续堆积不可回收状态。
- renderer 未就绪状态必须真正禁用发送，不能只显示提示。
- 会话时间线必须能呈现持久化消息、live assistant 文本、warning/error。
- 设置与聊天的模型选择状态必须一致，不能出现“测试连接成功但 submit 用了另一套 provider/model”的漂移。

## Acceptance Criteria

- [x] 单元或集成测试覆盖 submit 请求向 runtime/provider 透传 `providerId/modelId/history`。
- [x] 回归测试覆盖 `bootstrapAll(input.cwd)`、`AgentLoop` config.cwd 透传，以及 submit 超时时调用 `abort()` 并返回明确错误。
- [x] `pnpm --filter xnova-studio typecheck` 通过。
- [x] 受影响 package 测试通过，并完成根级 `pnpm test`。
- [x] 受控验证 Studio dev 启动 25 秒内完成 main/preload/renderer 构建与窗口创建，未复现 OOM。
- [x] `CHANGELOG.md` 记录本次非微小变更。

## Verification

- `pnpm test`：通过。
- `pnpm typecheck`：通过。
- `pnpm build`：通过；仅保留 Vite 动态导入分块 warning。
- `pnpm --filter xnova-studio dev` 受控烟测：完成 Electron 主进程启动、主窗口创建与 shell/runtime inspect；测试进程已清理。
- `D:/visual_ProgrammingSoftware/毕设and简历Projects/GPT` 文件索引扫描验证：修复后的 glob 规则扫描 20 个有效文件，耗时 14ms。

## Definition of Done

- Tests added/updated for touched runtime/renderer contracts.
- Lint/typecheck/test commands run with clear results.
- User-visible error and loading states are verifiable.
- Runtime boundary remains in `packages/* + apps/studio`，不回退到 legacy `cli/`。
- New lessons that affect future work are documented in Trellis/spec or task notes when needed.

## Out of Scope

- 不在本任务中一次性重做完整设计系统。
- 不把旧 `废弃/cli` 命令文件原样搬回主线。
- 不引入新的 provider SDK 或大规模架构替换，除非证明确属根因。

## Technical Notes

- Active task: `.trellis/tasks/04-25-rescue-studio-runtime-ux`
- Key specs read:
  - `.trellis/spec/backend/index.md`
  - `.trellis/spec/backend/directory-structure.md`
  - `.trellis/spec/backend/runtime-boundary.md`
  - `.trellis/spec/backend/error-handling.md`
  - `.trellis/spec/backend/logging-guidelines.md`
  - `.trellis/spec/backend/quality-guidelines.md`
  - `.trellis/spec/frontend/index.md`
  - `.trellis/spec/frontend/project-shell-v1.md`
  - `.trellis/spec/guides/index.md`
  - `.trellis/spec/guides/cross-layer-thinking-guide.md`
  - `.trellis/spec/guides/code-reuse-thinking-guide.md`
