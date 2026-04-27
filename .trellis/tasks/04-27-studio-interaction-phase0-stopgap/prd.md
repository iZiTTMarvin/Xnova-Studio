# Phase 0 止血：流式缓冲与历史消息隔离

## Goal

在不改动主进程事件模型和整体状态架构的前提下，先把 renderer 侧最致命的高频重渲染问题压住，让 Studio 在连续 `text_delta / thinking` 输出时不再因为每个 token 都直接 `setState` 而拖垮时间线。

## Requirements

- 在 `apps/studio/src/renderer/hooks/useStudioBridge.ts` 中为 `text_delta` 与 `thinking` 引入 RAF 级批量缓冲。
- 累积中的 delta 必须在合适时机 flush：
  - 下一帧渲染时
  - 收到终端事件前
  - hook 清理 / run 结束时
- `ConversationTimeline` 的历史消息区域需要有渲染隔离，避免 live blocks 每次变化都带着整段历史重新 render。
- `ToolActionRow` 与 `ReasoningRow` 至少要有基础 `React.memo` 防抖。
- 不得破坏现有 `liveConversation`、pending user text、warning / error 呈现逻辑。

## Acceptance Criteria

- [ ] `useStudioBridge` 对高频文本与 thinking 事件不再逐条直接落 `setLiveConversation`。
- [ ] 历史消息在 live output 连续增长时不再跟随每帧重渲染。
- [ ] `ToolActionRow` 与 `ReasoningRow` 的重复渲染被显著压缩。
- [ ] 相关测试通过，且 `xnova-studio` typecheck 通过。

## Definition of Done

- 完成 renderer 侧最小止血改造。
- 补充至少一类能证明缓冲/渲染隔离生效的回归验证。
- 不引入 main 侧 batcher、zustand store 或新的 markdown 依赖。

## Technical Approach

- 使用 `useRef` 持有 pending text/thinking 缓冲。
- 通过 `requestAnimationFrame` 合并同一帧内的多条 delta。
- 在时间线组件侧把历史消息项提炼为可 memo 的独立渲染单元。
- 只处理当前 Phase 0 所需的最小范围，避免提前进入 store 重构。

## Out of Scope

- 主进程 `AdaptiveEventBatcher`
- `zustand/immer` 状态重构
- 虚拟化、自动滚动、markdown 替换

## Technical Notes

- Xnova 目标文件：
  - `apps/studio/src/renderer/hooks/useStudioBridge.ts`
  - `apps/studio/src/renderer/components/ConversationTimeline.tsx`
  - `apps/studio/src/renderer/components/ToolActionRow.tsx`
  - `apps/studio/src/renderer/components/ReasoningRow.tsx`
- OpenCowork 参考：
  - `src/main/ipc/adaptive-event-batcher.ts`
  - `src/renderer/src/components/chat/MessageList.tsx`
  - `src/renderer/src/components/chat/MessageItem.tsx`
