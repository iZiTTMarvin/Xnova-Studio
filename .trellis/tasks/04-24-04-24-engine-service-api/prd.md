# 把旧 commands 背后能力收敛为 engine service API

## Goal

不迁移旧 `cli/src/commands/**` 命令壳，而是把其背后的真实业务能力收敛为面向 `apps/studio` 的 engine service API。

## Scope

- 设计并实现：
  - `runtime.setModel`
  - `runtime.compactContext`
  - `runtime.getContextSnapshot`
  - `sessionService`
  - `memoryService`
  - `mcpService`
  - `skillsService`
  - `usageService`
  - `pluginService`
  - `maintenanceService`

## Source of Truth

- `cli/src/commands/**`
- `cli/src/ui/App.tsx` 中各 `case '...'`
- `cli/src/ui/useChat.ts`
- `cli/src/core/cleanup-service.ts`
- `cli/src/core/bootstrap.ts`

## Copy-First Migration Rule

- 命令文件本身不复制
- 若旧业务能力已在非 UI 文件中存在，例如 `cleanup-service.ts`、`session-store.ts`、`memory manager`，优先复制这些真实业务文件
- 不把 `CommandAction` union 作为新 engine service 合同继续沿用

## Requirements

- service API 必须覆盖旧 CLI 核心命令所承载的业务能力
- `apps/studio` 后续只能依赖 service API，不再依赖旧 command action 分发
- API 粒度要面向业务，而不是面向 CLI 语法

## Acceptance Criteria

- [ ] engine service API 有明确类型合同
- [ ] 对照旧 CLI 的核心命令行为形成一一映射
- [ ] `apps/studio` 可通过 service 完成旧命令对应的核心业务动作

## Dependencies

- `04-24-runtime-package-extract`
- `04-24-core-kernel-extract`
- `04-24-foundation-domain-packages`
- `04-24-capability-domain-packages`

## Testing Strategy

- 为每个 service API 建立单元测试
- 建立旧命令行为到新 service API 的对照回归测试

