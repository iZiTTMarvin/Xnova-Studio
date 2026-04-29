# 子任务: 工具 Running 最小可见时间

## Goal

解决短耗时动作类工具 `tool_start -> tool_end` 太快导致用户看不到 running 态的问题。这个任务只改展示层，不延迟真实 store 状态，不改持久化 schema。

## What I Already Know

- `runtime-store.ts` 已在 `tool_start` 插入 running tool block，并在 `tool_end` 更新为 done/error。
- `ToolActionRow.tsx` 当前直接读取 `tool.status` 展示 spinner/check/error。
- `ToolActivityGroupRow.tsx` 的 720ms 是工具组折叠延迟，不是单工具 running 最小可见时间。

## Scope

- `apps/studio/src/renderer/components/ToolActionRow.tsx`
- `apps/studio/src/renderer/utils/tool-classification.ts` 或新增同类 helper
- `apps/studio/src/renderer/utils/conversation-render-rows.ts` 如需补分类
- 组件测试

## Requirements

- 新增动作类工具识别：
  - `write_file`
  - `edit_file`
  - `bash`
  - `git`
  - `todo_write`
  - `dispatch_agent`
  - 后续可扩展。
- `ToolActionRow` 内展示层维护 `displayStatus`：
  - 真实 `tool.status` 进入 running 时记录开始时间。
  - 如果真实状态在 600ms 内变 done/error，视觉上保留 running 到 600ms。
  - 超过 600ms 后立即展示真实 done/error。
- cancel、error、unmount 必须清理 timer。
- 不修改 store 内真实状态，不延迟持久化数据。
- 不展示工具参数全文，继续使用摘要。

## Acceptance Criteria

- [ ] 100ms 完成的 `write_file` 在 UI 中至少显示 600ms running。
- [ ] 失败工具也能先显示 running，再切 error。
- [ ] cancel/unmount 后没有残留 spinner 或 timer。
- [ ] 探索类工具分组逻辑不被破坏。
- [ ] 不影响 `tool_end` 真实数据进入 store。

## Tests Required

- `ToolActionRow.test.tsx`：
  - fake timers 覆盖 fast running -> done。
  - fast running -> error。
  - unmount 清理 timer。
  - 非动作类工具不启用 min-visible。
- `conversation-render-rows.test.ts` 如分类变更需要补断言。

## Out of Scope

- 不新增 `tool_intent`。
- 不新增 `tool_args_delta`。
- 不改 provider/core/runtime 事件协议。

## Technical Notes

- 这是短期体验补强，解决“事件有了但用户看不到”的问题。
- 真实事件粒度仍要在 `04-28-studio-tool-lifecycle-intent-args-delta` 中补齐。
