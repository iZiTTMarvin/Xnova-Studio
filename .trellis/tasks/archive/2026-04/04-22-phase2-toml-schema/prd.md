# [Phase 2 · 02] Config Migration — TOML Schema and Contracts

> **Priority**：P0
> **Status**：planning
> **Parent**：`04-21-phase2-config-migration`

## 1. Goal

先把 `config.toml` 与 `project.toml` 的字段契约锁定下来，并为后续迁移、merge、设置页写回提供统一 schema 基线。

## 2. Scope

### In

- 定义 `config.toml` 顶层 section：
  - `providers`
  - `memory`
  - `agent`
  - `modes`
  - `features`
- 定义 `project.toml` 最小字段集：
  - `agent.default`
  - `agent.max_parallel_subagents`
  - `features.enabled`
  - `modes.allowed`
  - `modes.recommended`
- 明确 TOML parser / serializer / validator 的输入输出契约
- 先写失败测试，锁定非法字段、缺失字段和类型错误路径

### Out

- 不实现 legacy JSON 迁移逻辑
- 不实现 project/user/builtin merge
- 不改 SettingsPage

## 3. Acceptance Criteria

- `config.toml` / `project.toml` schema 已文档化并落到代码类型
- 不借迁移偷偷改现有 provider / memory 语义
- 非法字段与类型错误有明确错误路径
- 后续任务可直接复用这里的 schema 契约

## 4. Related Files

- `cli/src/config/config-manager.ts`
- `docs/implement/phase2-config-migration.md`
- `.trellis/spec/backend/config-toml-migration.md`
