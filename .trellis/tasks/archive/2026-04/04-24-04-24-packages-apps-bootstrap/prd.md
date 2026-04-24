# Packages/Apps 工作区骨架与构建基线

## Goal

建立 `packages/ + apps/` 的新工作区骨架，让后续迁移有稳定物理落点，并保证 `apps/studio` 能成为新的主宿主入口。

## Scope

- 新建根级 `packages/`、`apps/` 目录
- 建立 workspace 配置、tsconfig 分层、路径别名与构建脚本基线
- 把当前 `studio/` 平滑迁入 `apps/studio/` 的承载结构

## Source of Truth

- `studio/package.json`
- `studio/tsconfig.json`
- `studio/electron.vite.config.ts`
- 根目录现有 `README.md`、`CHANGELOG.md`

## Copy-First Migration Rule

- 优先直接复制当前 `studio/` 工程到 `apps/studio/`，再做路径与配置修正
- 不先重写 Electron 宿主构建链

## Requirements

- `apps/studio` 成为后续唯一主宿主落点
- 预留 `apps/cli` 空位，但不要求本阶段可运行
- 为 `packages/*` 提供统一的 import/tsconfig 基线

## Acceptance Criteria

- [ ] 仓库出现 `packages/` 与 `apps/` 目录
- [ ] `apps/studio` 有完整构建配置
- [ ] 根工作区可以解析 `packages/*` 与 `apps/studio`
- [ ] 迁移后 `apps/studio` 的 `typecheck/test/build` 仍可作为主验收基线

## Dependencies

- 无，作为其他子任务前置

## Testing Strategy

- `apps/studio` typecheck
- `apps/studio` test
- `apps/studio` build

