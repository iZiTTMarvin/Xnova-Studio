# [Phase 2 · 04] Config Migration — Project Config Resolver

> **Priority**：P0
> **Status**：planning
> **Parent**：`04-21-phase2-config-migration`

## 1. Goal

引入 `.xnovacode/project.toml` 并实现 `project > user > builtin` 的统一配置解析，让项目级默认值可以稳定影响运行时。

## 2. Scope

### In

- 新增 `.xnovacode/project.toml` 读取逻辑
- 实现 `project > user > builtin` 合并
- 明确字段级 merge 规则：
  - 标量覆盖
  - 对象按 key merge
  - 数组整组覆盖
- 为缺失、损坏、类型错误的 project config 写失败测试

### Out

- 不做 agent schema 迁移
- 不处理桌面 project-aware UI
- 不改 SettingsPage 的交互层

## 3. Acceptance Criteria

- `project.toml` 能稳定影响运行时默认值
- merge 规则可测试、可解释、可复现
- `project.toml` 损坏或字段错误时不会模糊忽略
- resolved config 可以被后续 UI 任务直接消费

## 4. Related Files

- `cli/src/config/config-manager.ts`
- `cli/src/core/initializer.ts`
- `docs/implement/phase2-config-migration.md`
