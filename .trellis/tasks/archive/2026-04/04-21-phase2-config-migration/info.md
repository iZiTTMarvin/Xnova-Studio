# Phase 2 Config Migration - 技术基线

## 1. 文档结论摘要

从 `docs` 核心文档与 `docs/implement/phase2-config-migration.md` 可以收敛出本阶段的稳定约束：

- v1 的统一主配置格式是 TOML，不再以 JSON 作为主格式。
- 配置优先级固定为 `project > user > builtin`。
- `project.toml` 只承载项目默认策略，不演变成第二份用户级配置。
- 本阶段重点是“安全迁移”，不是“尽快切格式”。
- 设置页必须和运行时消费同一套配置语义，避免读写分叉。

## 2. Cross-Layer Data Flow

本阶段至少跨 4 层：

```text
磁盘文件
  -> config resolver
  -> runtime initializer
  -> web settings read/write
  -> 用户可见反馈
```

### 边界职责

- `config/`
  - 负责 TOML / JSON 解析、迁移、字段校验、merge
- `core/initializer`
  - 负责在启动时消费 resolved config，并决定错误是阻断还是降级
- `web SettingsPage`
  - 负责展示、编辑、保存、提示错误
  - 不负责定义配置优先级与 merge 规则
- `tests`
  - 负责锁定迁移安全性、写回一致性和错误路径

## 3. 当前关键文件

- `cli/src/config/config-manager.ts`
  - 当前用户级配置主入口
- `cli/src/core/initializer.ts`
  - 启动期配置消费入口
- `cli/web/src/pages/SettingsPage.tsx`
  - 配置展示与写回页面

## 4. 本阶段必须避免的错误

- `config.toml` 损坏后静默回写默认值
- SettingsPage 使用一套字段，runtime 使用另一套字段
- `project.toml` 被扩展成任意配置大杂烩
- 为了兼容旧版本而长期保留 JSON/TOML 双写
