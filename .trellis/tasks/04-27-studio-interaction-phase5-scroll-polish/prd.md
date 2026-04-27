# Phase 5 自动滚动与收尾打磨

## Goal

在前四个阶段完成后，补齐时间线的自动滚动策略、回到底部交互、顶部历史加载和整体联调收尾，让 Studio 在真实长会话使用中具备稳定、顺手的消息跟随体验。

## Requirements

- 建立清晰的自动滚动模式，至少区分“跟随流式输出”和“用户主动上滚暂停”。
- 提供明确的“回到底部”交互。
- 与虚拟化列表配合完成顶部历史加载或同等体验。
- 对前四个阶段的交互拼接做统一回归，避免局部升级后整体体验断裂。

## Acceptance Criteria

- [ ] 流式输出时默认跟随底部。
- [ ] 用户主动上滚后，自动滚动会暂停，且可显式恢复。
- [ ] 时间线在顶部加载历史或切换会话时没有明显跳动与错位。
- [ ] 最终联调的 typecheck / test / build 通过。

## Definition of Done

- 时间线收尾体验达到可用标准。
- 完成跨阶段联调验证。
- 为父 task 的最终 check / update-spec / finish 做好准备。

## Technical Approach

- 以 `react-virtuoso` 提供的滚动能力为基础实现三态或等价策略。
- 把滚动控制逻辑限制在时间线及相关 hook/store 中，不扩散到页面其他组件。
- 将“整体联调”视为本阶段目标的一部分，而不是上线前临时补救。

## Out of Scope

- 与聊天时间线无关的新功能
- 超出本次文档范围的额外设计重做

## Technical Notes

- Xnova 目标文件：
  - `apps/studio/src/renderer/components/ConversationTimeline.tsx`
  - `apps/studio/src/renderer/stores/runtime-store.ts`
- OpenCowork 参考：
  - `src/renderer/src/components/chat/MessageList.tsx`
