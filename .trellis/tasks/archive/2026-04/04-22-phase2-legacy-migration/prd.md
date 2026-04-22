# [Phase 2 · 03] Config Migration — Legacy JSON Migration and Fallback

> **Priority**：P0
> **Status**：planning
> **Parent**：`04-21-phase2-config-migration`

## 1. Goal

在不丢用户数据的前提下，把旧 `config.json` 平滑迁到 `config.toml`，同时保证损坏配置、迁移失败、写入失败都不会触发 silent reset。

## 2. Scope

### In

- 实现双读：
  - 优先 `config.toml`
  - 回退 `config.json`
- 实现安全迁移：
  - 从 JSON 生成 TOML
  - 迁移失败保留原 JSON
  - 输出明确错误与 fallback
- 设计迁移完成标记策略
- 先写失败测试覆盖迁移链路

### Out

- 不定义新 schema
- 不实现 project config merge
- 不改 SettingsPage UI

## 3. Acceptance Criteria

- `config.toml` 存在时不会被 `config.json` 覆盖
- 只有旧 JSON 时可以安全迁移
- 任一失败路径都保留原文件并给出明确反馈
- 测试覆盖成功与失败迁移路径

## 4. Related Files

- `cli/src/config/config-manager.ts`
- `cli/src/core/initializer.ts`
- `.trellis/spec/backend/error-handling.md`
- `.trellis/spec/backend/config-toml-migration.md`
