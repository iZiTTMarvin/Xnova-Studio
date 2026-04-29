# 子任务: Tool Intent 与 Args Delta 生命周期事件

## Goal

把工具调用从“只有开始和结束”升级为完整生命周期：模型刚决定调用工具时出壳，参数生成时增量更新，参数完整后进入 ready，实际执行时 running，结束后 done/error。目标是让用户看到 agent 正在准备调用什么工具，以及关键参数是什么。

## Dependencies

- 依赖 `04-28-studio-bootstrap-timing-observability`，确保事件观测可诊断。
- 建议在 `04-28-studio-tool-running-min-visible` 后实施，避免 UI 同时改动过大。

## Scope

- `packages/core/src/types.ts`
- `packages/providers/src/providers/openai-compat.ts`
- `packages/providers/src/providers/anthropic.ts`
- `packages/core/src/agent-loop.ts`
- `packages/runtime/src/create-runtime.ts`
- `apps/studio/src/shared/studio-bridge-contract.ts`
- `apps/studio/src/renderer/stores/runtime-store.ts`
- `apps/studio/src/renderer/components/ToolActionRow.tsx`
- `apps/studio/src/renderer/utils/tool-event-summary.ts`
- 相关测试

## Requirements

- Provider 层新增或兼容事件：
  - `tool_call_delta` 或等价 chunk，用于表达工具名和参数增量。
  - OpenAI-compatible provider 从流式 tool calls header / argument delta 中提取。
  - Anthropic provider 从 content block tool use start/delta 中提取。
  - 不支持的 provider 降级为最终 `tool_call`。
- Core `AgentLoop` 新增事件：
  - `tool_intent`
  - `tool_args_delta`
  - `tool_ready`
  - 保留现有 `tool_start/tool_done`。
- Runtime 转发到 Studio：
  - `tool_intent`
  - `tool_args_delta`
  - `tool_ready`
  - `tool_start`
  - `tool_end`
- Renderer store 状态机：
  - pending 工具壳可由 `tool_intent` 创建。
  - 参数 delta 合并到同一 tool block 的安全摘要。
  - `tool_ready` 保证参数完整。
  - `tool_start` 切 running。
  - `tool_end` 切 done/error。
- UI 安全：
  - `write_file.content` 只显示长度、行数或“内容已隐藏”。
  - shell command 可显示截断摘要。
  - 不在 timing summary 写 args 全文。

## Acceptance Criteria

- [ ] 支持流式工具的 provider 上，工具名出现后 UI 能在工具执行前显示 pending 壳。
- [ ] 参数路径/命令摘要可随 delta 更新。
- [ ] 不支持 delta 的 provider 仍能从 `tool_start` 正常展示。
- [ ] 事件顺序稳定：`tool_intent -> tool_args_delta* -> tool_ready -> tool_start -> tool_end`。
- [ ] 大文件内容不被渲染或写入 timing/log。

## Tests Required

- Provider tests：
  - OpenAI-compatible 分块 tool call。
  - Anthropic tool use content block。
  - 不支持 delta 时降级路径。
- `agent-loop` tests：
  - 生命周期事件顺序。
  - 工具 ready 后再执行。
- Runtime tests：
  - 新事件转发到 Studio event。
- Renderer tests：
  - pending/running/done 状态机。
  - args delta 合并和敏感内容摘要。

## Out of Scope

- 不实现 OpenCowork 的完整 transcript 静态分析。
- 不重写所有工具卡片 UI。
- 不修改持久化 schema，除非后续确认 live/persisted 回放需要。

## Technical Notes

- 命名可以沿用 Xnova 风格，不必照搬 OpenCowork 的 `tool_use_streaming_start`。
- 重点是事件语义稳定，UI 只是消费结果。
