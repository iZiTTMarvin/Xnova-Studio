# 抽离基础领域包 config/providers/persistence/platform/observability

## Goal

把运行时依赖的基础领域能力从旧 CLI 中抽离到独立 packages，作为后续所有 runtime/core/service 的稳定底座。

## Scope

- `packages/config`
- `packages/providers`
- `packages/persistence`
- `packages/platform`
- `packages/observability`

## Source of Truth

- `cli/src/config/**`
- `cli/src/providers/**`
- `cli/src/persistence/**`
- `cli/src/platform/**`
- `cli/src/observability/**`

## Copy-First Migration Rule

- 以目录为单位优先复制
- 对于已稳定的 schema / resolver / provider adapter / session store，先保原实现
- 只有在 package 依赖整理和 import 改写时做最小修改

## Requirements

- 不丢失现有 provider/config/session/usage 语义
- `packages/persistence` 同时保留 JSONL 与 SQLite 两类事实源
- `packages/observability` 保持 session logger / token meter 行为一致

## Acceptance Criteria

- [ ] 上述 5 个领域包可被 `packages/core/runtime` 直接消费
- [ ] 与旧 CLI 相同的 provider/config/session 读取能力可复现
- [ ] native 依赖边界仍满足 Electron main 打包要求

## Dependencies

- `04-24-packages-apps-bootstrap`
- `04-24-runtime-package-extract`
- `04-24-core-kernel-extract`

## Testing Strategy

- config/provider/persistence/observability 相关旧测试迁移或等价重建
- `apps/studio` 构建态验证 native 依赖边界

