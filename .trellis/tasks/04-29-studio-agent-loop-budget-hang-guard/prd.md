# 子任务: Agent Loop 轮次预算与卡死保护

## Goal

为 Studio 真实运行中出现的“模型请求与工具结果反复循环”增加硬保护、软收束和可诊断日志。这个任务要解决的不是 warmup 慢，而是 warmup 已经命中 fast path 后，AgentLoop 在工具执行后继续发起过多轮 `after_tool_result` 模型请求，导致一次用户提交持续数分钟甚至十几分钟，最后只能靠用户手动取消。

## 背景说明

- **AgentLoop**：项目里负责“调用模型 -> 执行工具 -> 把工具结果喂回模型 -> 再调用模型”的核心循环。
- **模型请求轮次**：每一次向 provider 发起聊天流式请求都算一轮。首次请求是 `initial`，工具结果之后的请求是 `after_tool_result`。
- **轮次预算**：给一次用户提交设置合理的最大模型请求次数、工具轮次数、无进展轮次数或耗时上限，避免 agent 长时间自转。
- **卡死保护**：当模型持续调用工具但没有产生新答案、没有明确完成、或者重复探索时，系统要先提醒模型收束；仍不收束时安全停止并告诉用户原因。

## What I Already Know

- 2026-04-29 真实日志证明 warmup fast path 已经生效：
  - `snapshot 命中，走 fast path`
  - `runtime_bootstrap_fast_path`
  - `runtime submit start -> model request started: 16ms`
- 同一日志中的真正长尾来自模型/工具循环：
  - `after_tool_result: 29x, total 729.8s, avg 25.2s`
  - `total rounds: 30`
  - `total: 786.9s`
  - 最终状态是用户取消：`status: 'cancelled'`
- `packages/core/src/agent-loop.ts` 当前默认 `DEFAULT_MAX_TURNS = 100`，对 Studio 交互式提交太宽。
- 当前已有 `RepetitionDetector`，但它只拦截“连续相同工具 + 完全相同参数”的循环；对交替读文件、bash、grep、工具参数略变、或长期探索型循环帮助有限。
- `packages/runtime/src/create-runtime.ts` 已能记录每轮 `model_request_started`，Studio timing 已能聚合 `after_tool_result`，但还没有把“轮次预算即将耗尽 / 已耗尽 / 无进展”作为一等事件展示给用户。
- Kiro 的提示词强化能减少一部分错误工具选择，但它仍是软约束，不能替代 AgentLoop 层的硬预算。

## Scope

- `packages/core/src/agent-loop.ts`
- `packages/core/src/repetition-detector.ts` 或新增 loop guard helper
- `packages/runtime/src/create-runtime.ts`
- `packages/runtime/src/types.ts`
- `apps/studio/src/shared/studio-bridge-contract.ts`
- `apps/studio/src/main/studio-submit-timing.ts`
- `apps/studio/src/renderer/stores/runtime-store.ts`
- 如需可见提示，涉及 `ConversationTimeline` / system block 渲染相关测试
- 相关测试

## Requirements

- AgentLoop 必须有交互式提交的默认预算，不能继续让主 Agent 默认跑到 100 轮：
  - 总模型请求轮数有硬上限。
  - `after_tool_result` 轮数有单独上限。
  - 预算必须可通过 `AgentConfig.maxTurns` 或后续配置覆盖，不能硬编码到所有场景不可调。
- 预算到达前必须先做一次“软收束”：
  - 在 history 中追加明确的收束指令，要求模型停止无必要工具调用，基于已有结果总结当前状态。
  - 发出可观测事件，让 Studio timing 和 UI 能知道 agent 已接近预算。
- 软收束后如果模型仍继续调用工具，必须硬停止：
  - yield `done` 时携带明确原因，例如 `budget_exceeded` 或 `stalled`。
  - Runtime 需要把停止原因转成用户可见 warning 或 system block，而不是静默完成。
  - Studio UI 上不能表现成普通成功；应显示“已达到安全轮次上限，已停止继续调用工具”之类的说明。
- 增加“无进展”检测，不能只看完全相同工具参数：
  - 连续多轮只有工具调用、没有新的可见文本或有效结果时，应计为低进展。
  - 工具连续失败、空结果、重复读取相同文件族、反复 bash 探索，应进入告警或停止路径。
  - 不要求第一版做复杂语义判断，但必须保留清晰的数据结构，后续能扩展。
- timing summary 必须更容易诊断这类问题：
  - 输出总轮数、`after_tool_result` 轮数、触发预算/无进展的原因。
  - 输出最后几轮工具名和耗时摘要，仍然不得记录 API key、完整 prompt、完整文件内容或工具参数全文。
- 与取消逻辑兼容：
  - 用户点击停止时仍走 `run_cancelled`。
  - 预算停止不应伪装成用户取消。
  - `run_cancelled` 后 pending/running 工具卡片应保持 Kiro 修复后的“已取消”行为。
- 与 warmup 无耦合：
  - 不修改 snapshot fast path 逻辑。
  - 不把 provider 首包慢误判为 AgentLoop 卡死。

## Acceptance Criteria

- [x] 真实或模拟的 30 轮 `after_tool_result` 循环不会继续跑到 700 秒级；达到预算后会先收束，仍不收束则停止。
- [x] Studio timing 能明确显示停止原因是轮次预算/无进展，而不是只显示 `cancelled` 或泛化超时。
- [x] 用户界面能看到安全停止原因，且不会留下 pending/running spinner。
- [x] 正常的 1-5 轮工具调用流程不受影响。
- [x] 子 Agent / background run 如有不同预算，必须通过配置区分，不能误伤后台任务。
- [x] 所有新增日志、timing、UI 摘要都脱敏。

## Suggested Implementation Plan

1. 在 `AgentLoop` 增加 `LoopBudgetState` 或独立 `AgentLoopGuard`：
   - 记录总模型请求轮数、工具轮数、`after_tool_result` 轮数、连续低进展轮数、最近工具摘要。
   - 将当前 `DEFAULT_MAX_TURNS = 100` 拆成更明确的主 Agent 默认预算和可覆盖配置。
2. 增加软收束机制：
   - 接近预算时向 history 注入一条用户侧收束消息。
   - yield 一个新的 guard/warning 事件，runtime 转发为 Studio `warning` 或新 lifecycle 事件。
3. 增加硬停止机制：
   - 超过预算后停止后续工具执行和模型请求。
   - `done.reason` 扩展为 `budget_exceeded` / `stalled`，runtime 写入 `RuntimeTurnResult.stopReason`。
4. 补齐 Studio 可见性：
   - main timing summary 聚合 loop guard 信息。
   - renderer store 显示安全停止原因，避免用户以为 app 卡死。
5. 针对真实日志补测试：
   - 模拟 provider 连续 30 轮返回工具调用。
   - 模拟软收束后模型仍调用工具。
   - 模拟软收束后模型停止工具并输出总结。

## Tests Required

- `agent-loop` 相关测试：
  - 超过 `after_tool_result` 预算时触发软收束。
  - 软收束后一轮仍调用工具时触发硬停止。
  - 软收束后模型输出文本且不再调用工具时正常完成。
  - `maxTurns` 显式配置仍可覆盖默认值。
  - 现有 `RepetitionDetector` 连续相同工具拦截仍生效。
- `packages/runtime` 测试：
  - AgentLoop guard 事件会转发为 runtime warning/timing。
  - `done.reason = budget_exceeded/stalled` 会进入 `RuntimeTurnResult.stopReason`。
- `apps/studio` 测试：
  - timing summary 包含轮次预算/无进展停止原因。
  - renderer 收到预算停止 warning 后显示可读状态。
  - 用户 cancel 与预算停止两个路径不会互相覆盖。

## Out of Scope

- 不解决 provider 首包慢；MiniMax 首包 5 秒属于 provider 侧延迟。
- 不重做 warmup/snapshot fast path；当前日志已证明 warmup 命中。
- 不在本任务里完整修复 Windows shell 工具策略；该方向由 `04-28-studio-windows-tool-policy` 继续处理。
- 不要求第一版做复杂语义级“是否真正完成任务”判断。
- 不把所有长任务都强行缩短；预算必须支持显式覆盖。

## Technical Notes

- 真实问题日志关键片段：
  - `warmup_fast_path_hit`
  - `runtime_bootstrap_fast_path`
  - `after_tool_result: 29x, total 729.8s, avg 25.2s`
  - `modelRequestRounds: 30`
  - `status: 'cancelled'`
- 当前相关文件：
  - `packages/core/src/agent-loop.ts`
  - `packages/core/src/repetition-detector.ts`
  - `packages/runtime/src/create-runtime.ts`
  - `apps/studio/src/main/studio-submit-timing.ts`
  - `apps/studio/src/renderer/stores/runtime-store.ts`
- 实现前必须阅读：
  - `.trellis/spec/backend/runtime-warmup-and-event-observability.md`
  - `.trellis/spec/backend/runtime-boundary.md`
  - `.trellis/spec/frontend/agent-process-visibility.md`
