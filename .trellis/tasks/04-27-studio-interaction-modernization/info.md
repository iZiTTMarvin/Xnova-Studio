# Studio 交互现代化改造 - Task 分解说明

## 任务结构

- 父 task：`04-27-studio-interaction-modernization`
- 子 task：
  - `04-27-studio-interaction-phase0-stopgap`
  - `04-27-studio-interaction-phase1-batcher`
  - `04-27-studio-interaction-phase2-state-store`
  - `04-27-studio-interaction-phase3-virtualization`
  - `04-27-studio-interaction-phase4-ux-upgrade`
  - `04-27-studio-interaction-phase5-scroll-polish`

## 执行顺序

1. Phase 0
2. Phase 1
3. Phase 2
4. Phase 3
5. Phase 4
6. Phase 5

## 阶段依赖

- Phase 0 为所有后续阶段提供最小可接受的渲染稳定性基线。
- Phase 1 和 Phase 2 共同收敛“事件量过大 + 状态分发过粗”两类核心问题。
- Phase 3 依赖 Phase 2 提供可维护的 store 结构。
- Phase 4 与 Phase 5 建立在前 3 个阶段已基本稳定的时间线架构上。

## 风险提示

- `useStudioBridge.ts` 是本次改造的高风险核心文件，Phase 0 与 Phase 2 都会修改它，必须严格控制每个阶段的目标边界。
- `apps/studio/src/shared/studio-bridge-contract.ts` 与 `apps/studio/src/main/studio-runtime-service.ts` 的跨层契约改动，需要同步验证 renderer 订阅层是否兼容。
- 任何从 OpenCowork 借鉴的实现，都必须先核对 Xnova 当前 event type、workspace 绑定、runtime watchdog 与权限流。
