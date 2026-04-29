# 子任务: Warmup 状态 UI 与 Bridge Contract

## Goal

把 runtime warmup 状态通过 shared contract 安全暴露到 renderer，并在 Studio UI 中显示“正在准备运行时 / 已就绪 / 配置变化重做 / 失败将提交时重试”等可解释状态。这个状态只解释后台准备，不替代 workspace/runtime-ready 门禁。

## Dependencies

- 依赖 `04-28-studio-runtime-warmup-snapshot-skeleton` 提供 main 侧状态。

## Scope

- `apps/studio/src/shared/studio-bridge-contract.ts`
- `apps/studio/src/preload/**`
- `apps/studio/src/main/studio-ipc.ts`
- `apps/studio/src/renderer/hooks/useStudioBridge.ts`
- `apps/studio/src/renderer/stores/runtime-store.ts`
- `apps/studio/src/renderer/pages/StudioHomePage.tsx`
- 相关组件和测试

## Requirements

- 新增 shared contract：
  - `RuntimeWarmupStatus`
  - `RuntimeWarmupStatusChangedEvent`
  - channel: `studio:runtime:warmup-status-changed` 或等价命名。
- preload 校验：
  - status 枚举合法。
  - cwd/cacheKey 只作为内部标识，不展示敏感细节。
  - error 只允许字符串摘要。
- renderer store 保存 warmup view state。
- UI 文案：
  - `warming`：正在准备运行时...
  - `ready`：运行时已就绪
  - `stale`：运行时配置变化，正在重新准备...
  - `failed`：运行时准备失败，将在提交时重试
- warmup 状态不得禁用 composer；composer 是否可用仍由 workspace 和 runtime inspect ready 决定。
- workspace 切换后清理旧 warmup 状态，不能显示上一个项目的状态。

## Acceptance Criteria

- [ ] open/bind workspace 后 renderer 能收到 `warming`。
- [ ] warmup 完成后显示 `ready`。
- [ ] warmup failed 后显示失败文案，但仍允许 submit 走 slow path。
- [ ] workspace 切换后旧状态消失。
- [ ] UI 不展示 system prompt、API 配置或敏感路径细节。

## Tests Required

- `studio-preload-bridge.test.ts`：warmup event 校验。
- `studio-ipc.test.ts`：main 广播 warmup status。
- `useStudioBridge` 测试：订阅、清理、workspace 切换。
- `StudioHomePage` 或 renderer shell 测试：文案显示与 composer 门禁互不混淆。

## Out of Scope

- 不实现 warmup 本身。
- 不实现 snapshot fast path。
- 不改工具事件协议。

## Technical Notes

- 这是体验层任务，目标是减少“用户以为卡死”的感觉。
- warmup 状态是辅助提示，不是运行时正确性的唯一依据。
