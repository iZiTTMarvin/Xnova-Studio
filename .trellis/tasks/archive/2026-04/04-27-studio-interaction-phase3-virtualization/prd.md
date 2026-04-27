# Phase 3 消息虚拟化与内存窗口

## Goal

针对长会话和工具密集场景，给时间线引入虚拟化渲染、live blocks 窗口上限和工具输出截断，避免消息树无限增长导致的滚动卡顿和 OOM 风险。

## Requirements

- 引入适合动态高度消息列表的虚拟化方案，优先 `react-virtuoso`。
- `ConversationTimeline` 只渲染可视区域及合理缓冲区。
- `liveConversation.blocks` 需要有上限策略，避免无限膨胀。
- 工具输出需要有可诊断但受控的字符截断策略。
- 与已完成的 store 架构兼容，不重新把渲染逻辑塞回单文件。

## Acceptance Criteria

- [ ] 长会话场景下时间线不会一次性渲染全部消息。
- [ ] live blocks 与工具输出存在明确内存防线。
- [ ] 长消息 / 工具密集场景的渲染表现优于当前基线。
- [ ] 相关测试、typecheck 通过。

## Definition of Done

- 虚拟化已接入主时间线。
- 关键窗口上限和输出截断被测试覆盖或有稳定断言。
- 不在本阶段处理最终自动滚动状态机。

## Technical Approach

- 采用 `react-virtuoso` 处理动态高度消息项。
- 在 runtime store 或相关 render utils 中收敛 live block 上限与工具输出截断。
- 把“滚动跟随策略”先保持最小兼容，完整交互留到 Phase 5。

## Out of Scope

- thinking/tool/subagent 的最终视觉打磨
- 自动滚动三态与浮动按钮的完整实现

## Technical Notes

- Xnova 目标文件：
  - `apps/studio/src/renderer/components/ConversationTimeline.tsx`
  - `apps/studio/src/renderer/stores/runtime-store.ts`
- OpenCowork 参考：
  - `src/renderer/src/components/chat/MessageList.tsx`
  - `src/renderer/src/stores/agent-store.ts`
