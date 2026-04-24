# 抽离 packages/runtime 并复制旧 runtime 基线

## Goal

把旧 `cli/src/runtime/**` 整体迁入 `packages/runtime/src/**`，先保住 runtime 合同与行为，再逐步切断对旧 `cli` 目录的语义依赖。

## Scope

- 迁移 runtime 合同、事件、bridge、inspect、factory 入口
- 修正 import 指向新的 packages 结构
- 保持旧 runtime 的 API 面与行为尽量不变

## Source of Truth

- `cli/src/runtime/create-runtime.ts`
- `cli/src/runtime/types.ts`
- `cli/src/runtime/bridge.ts`
- `cli/src/runtime/events.ts`
- `cli/src/runtime/inspect.ts`
- `cli/src/runtime/__tests__/**`

## Copy-First Migration Rule

- 第一阶段直接复制上述文件到 `packages/runtime/src/`
- 除路径修正与最小必要解耦外，不主动改行为
- 任何行为变化都必须由测试或显式 PRD 要求驱动

## Requirements

- `packages/runtime` 不再位于 `cli/` 目录语义下
- 对外保留 `createRuntime()`、`RuntimeInstance`、`RuntimeEvent` 等现有合同
- 不引入 renderer / Electron UI 依赖

## Acceptance Criteria

- [ ] `packages/runtime/src/**` 存在并可独立被 `apps/studio` 引用
- [ ] 旧 runtime 测试迁移后仍通过或完成等价重建
- [ ] `packages/runtime` 不再 import `cli/src/runtime/**`

## Dependencies

- `04-24-packages-apps-bootstrap`

## Testing Strategy

- runtime 单元/集成测试迁移
- `apps/studio` 能通过 package import 使用 runtime

