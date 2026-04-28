# 架构: Studio 首次响应 Warmup 与 Agent 过程可见性

## Goal

基于 `docs/audits/studio-first-response-warmup-and-tool-visibility-audit.md` 与 OpenCowork 调研，完成一套完整、可分阶段落地的 Studio 运行时预热与 agent 过程可见性架构。目标不是做临时补丁，而是先建立最终架构边界，再拆分为可审查、可验证的子任务逐步交付。

## 术语解释

- **runtime**：后台真正干活的运行时，负责调用模型、执行工具、管理上下文和会话。
- **bootstrap**：runtime 开始工作前的本地准备，例如加载 Skills、Hooks、文件索引、Memory、Git 上下文、系统提示词。
- **warmup**：用户打开项目后，后台提前做 runtime 准备，避免用户发送消息时干等。
- **snapshot**：准备完成后保存的一份内存结果包，包含是否已完成 bootstrap、系统提示词、工具定义、配置指纹等。
- **fast path**：snapshot 有效时，发送消息走快路，跳过重复准备。
- **slow path**：snapshot 不存在、失效或 warmup 失败时，发送消息走完整旧流程，保证功能不坏。
- **失效规则**：当项目、配置、Skills、Hooks、MCP、Memory、Git、Agent 等变化时，让旧 snapshot 不能继续被使用。
- **tool intent**：模型刚决定要调用某个工具时发出的事件，UI 可以先显示“准备调用工具”。
- **args delta**：工具参数还在生成时的增量事件，UI 可以逐步显示安全摘要。
- **过程可见性**：用户能看到“正在准备运行时 / 正在请求模型 / 思考中 / 准备调用工具 / 工具执行中 / 工具完成或失败”等阶段。

## What I Already Know

- 审计文档定位出首次响应慢的主要可控段是 submit 路径上的 `runtime bootstrap`。
- 当前 `bootstrapAll(cwd)` 内部已经有子阶段 timings，但没有逐项作为 `timing_mark` 透传给 Studio。
- 当前 `openWorkspace / bindWorkspace` 只更新 host state，没有 runtime warmup。
- 当前工具事件已有 `tool_start/tool_end`，但没有 tool intent、args delta、tool ready 等更细生命周期。
- 当前 `ToolActionRow` 直接使用真实 status，快速工具可能让 running 态不可见。
- OpenCowork 值得学习的是统一事件协议、工具生命周期拆分、实时渲染与历史回放分层，而不是直接搬大组件。

## Architecture Principles

- 先设计最终状态机和 contract，再分批填充能力。
- warmup 不调用 LLM、不创建 AgentLoop、不消耗 token。
- snapshot 只保存在 main/runtime 内存，不把 system prompt、API key、完整工具参数通过 IPC 发给 renderer。
- fast path 必须有 slow path 兜底；任何预热失败都不能让 submit 不可用。
- renderer 负责展示，不负责本地文件、工具执行、provider secrets 或 runtime internals。
- 工具过程的可见性优先通过事件协议和展示层实现，不篡改持久化 block 的真实状态。

## Child Tasks

1. `04-28-studio-bootstrap-timing-observability`
   - 建立 submit timing 与 bootstrap 子阶段观测。
2. `04-28-studio-runtime-warmup-snapshot-skeleton`
   - 建立 `RuntimeWarmupManager` 与 `PreparedRuntimeSnapshot` 骨架。
3. `04-28-studio-snapshot-fast-path-invalidation`
   - 完整接入 system prompt、tool definitions、agent/provider metadata 与失效规则。
4. `04-28-studio-warmup-ui-bridge-contract`
   - 暴露 warmup 状态到 renderer，显示可解释但不阻塞的 UI 状态。
5. `04-28-studio-tool-running-min-visible`
   - 让动作类工具 running 态最小可见。
6. `04-28-studio-tool-lifecycle-intent-args-delta`
   - 打通 tool intent、args delta、tool ready 等生命周期事件。
7. `04-28-studio-windows-tool-policy`
   - 降低 Windows shell 工具误用和失败黑盒。

## Acceptance Criteria

- [ ] 父任务下所有子任务都已创建并写好 PRD。
- [ ] backend/frontend spec 已补充 runtime warmup、事件观测、agent 过程可见性约束。
- [ ] 子任务之间的依赖清晰，前序任务不会阻断后续完整 snapshot fast path。
- [ ] 每个子任务都有测试建议和验收标准。
- [ ] 所有术语第一次出现都有中文解释或中文职责说明。

## Definition of Done

- 所有子任务通过 Trellis 关联到本父任务。
- 父任务 PRD 明确完整架构、分阶段顺序、边界和风险。
- 后续进入实现时，必须先读：
  - `.trellis/spec/backend/runtime-warmup-and-event-observability.md`
  - `.trellis/spec/frontend/agent-process-visibility.md`
  - `.trellis/spec/backend/runtime-boundary.md`
  - `.trellis/spec/frontend/project-shell-v1.md`

## Out of Scope

- 本父任务本身不直接改生产代码。
- 不在 warmup 中调用真实模型。
- 不直接照搬 OpenCowork 的 OpenAI Responses 专属 websocket/cache 字段。
- 不一次性重写 ConversationTimeline 或 AssistantMessage 架构。

## Technical Notes

- Audit 文档：`docs/audits/studio-first-response-warmup-and-tool-visibility-audit.md`
- Xnova 核心链路：
  - `packages/core/src/bootstrap.ts`
  - `packages/core/src/agent-loop.ts`
  - `packages/runtime/src/create-runtime.ts`
  - `apps/studio/src/main/studio-runtime-service.ts`
  - `apps/studio/src/main/studio-submit-timing.ts`
  - `apps/studio/src/renderer/stores/runtime-store.ts`
  - `apps/studio/src/renderer/components/ToolActionRow.tsx`
- 新增 spec：
  - `.trellis/spec/backend/runtime-warmup-and-event-observability.md`
  - `.trellis/spec/frontend/agent-process-visibility.md`
