# Phase 2 状态管理重构

## Goal

拆解 `useStudioBridge.ts` 的巨石式状态与副作用，把运行时状态、会话状态和设置状态收敛到多 store 架构中，建立按需订阅和明确的状态边界，为后续虚拟化和交互增强打下稳定基础。

## Requirements

- 引入 `zustand + immer`。
- 新建至少以下 store：
  - `runtime-store.ts`
  - `session-store.ts`
  - `settings-store.ts`
- `useStudioBridge.ts` 退化为 bridge / 事件订阅 / 分发层，不再持有大部分 UI 事实源。
- 组件消费状态时要走 selector，避免无关 UI 因单一字段变化一起刷新。
- 保持 `Project Shell v1` 里约定的 submit 门禁、workspace 绑定、会话恢复、模型选择等语义不被破坏。

## Acceptance Criteria

- [ ] `useStudioBridge.ts` 的职责明显收缩。
- [ ] store 之间边界明确，组件按需订阅状态切片。
- [ ] `ConversationTimeline`、`StudioHomePage` 等主链路仍满足既有 contract。
- [ ] 相关测试、typecheck、必要构建验证通过。

## Definition of Done

- 新 store 已落地并被主链路消费。
- 至少有一类验证能证明无关组件不再因 runtime delta 频繁重渲染。
- 不在本阶段引入时间线虚拟化或完整 UX 升级。

## Technical Approach

- 先迁出 `runStatus / currentRunId / liveConversation / contextState` 等高频运行时状态。
- 再迁出项目 / 会话选择、shell snapshot、模型选择等较低频状态。
- 保持 shared contract 不轻易扩张，优先重构 renderer 内部状态结构。

## Out of Scope

- 虚拟化与自动滚动
- markdown / tool card / subagent 最终形态

## Technical Notes

- Xnova 目标文件：
  - `apps/studio/src/renderer/hooks/useStudioBridge.ts`
  - `apps/studio/src/renderer/pages/StudioHomePage.tsx`
  - `apps/studio/src/renderer/components/ConversationTimeline.tsx`
  - `apps/studio/src/renderer/components/SessionModelPicker.tsx`
- OpenCowork 参考：
  - `src/renderer/src/stores/chat-store.ts`
  - `src/renderer/src/stores/agent-store.ts`
  - `src/renderer/src/stores/ui-store.ts`
