# Phase 6 · Provider Config and TOML

> **阶段**：Phase 6 Settings and Tools · 子任务 B
> **优先级**：P0
> **状态**：planning
> **来源**：[`docs/implement/phase6-settings-and-tools.md`](../../../docs/implement/phase6-settings-and-tools.md) §A Providers、[`docs/implement/phase2-config-migration.md`](../../../docs/implement/phase2-config-migration.md)、[`.trellis/spec/backend/config-toml-migration.md`](../../../.trellis/spec/backend/config-toml-migration.md)、[`.trellis/spec/frontend/state-management.md`](../../../.trellis/spec/frontend/state-management.md)

---

## 1. 问题

Providers 是 Phase 6 最核心的配置入口，但当前配置主线已经迁移到 TOML，旧 Web 设置页仍带着 JSON 时代的写法。若不先把 Provider 读写和 `project > user > builtin` 优先级打通，Settings 页会继续呈现出“能编辑但不可信”的状态。

## 2. 目标

实现 Provider 的桌面配置主线：

- 读取 resolved config
- 支持默认 provider / model
- 支持新增 / 编辑 / 删除 provider
- 支持 test connection
- 所有写回走 TOML 主链路
- 外部输入先校验再收窄，不能用 `any`

## 3. 范围

### 包含

- Provider 配置表单与状态卡片
- 默认 provider / model 选择
- provider CRUD
- 测试连通性
- TOML 读写与优先级合并
- 错误提示与回退策略

### 不包含

- Memory / MCP / Skills 的具体页面实现
- 发布或打包相关功能
- 任何静默覆盖用户配置的行为

## 4. 依赖

- **Blocked-by**：Phase 2 Config Migration、Phase 4 Electron Host、Phase 5 Project-aware Shell、`04-23-phase6-settings-shell-integration`
- **Blocks**：`04-23-phase6-memory-overview-and-rebuild`、`04-23-phase6-settings-and-tools-verification`

## 5. 子任务

- [ ] 收敛 Provider 配置的数据契约
- [ ] 读取 `config.toml` / `project.toml` 的 resolved config
- [ ] 实现默认 provider / model 的显示与保存
- [ ] 支持新增 / 编辑 / 删除 provider
- [ ] 支持 test connection，并给出明确错误
- [ ] 补齐 TOML / merge / 回退测试

## 6. 相关文件

- `cli/src/config/config-manager.ts`
- `cli/src/config/resolver.ts`
- `cli/src/config/settings-contract.ts`
- `cli/src/config/toml/index.ts`
- `cli/src/config/toml/parser.ts`
- `cli/src/config/toml/serializer.ts`
- `cli/src/config/toml/field-mapping.ts`
- `cli/src/config/__tests__/resolver.effective-merge.test.ts`
- `cli/src/config/__tests__/config-manager.toml.test.ts`
- `cli/src/config/__tests__/main-chain.resolved-config.test.ts`
- `cli/web/src/pages/SettingsPage.tsx`
- `studio/src/shared/studio-bridge-contract.ts`
- `studio/src/main/studio-ipc.ts`
- `studio/src/preload/studio-bridge-api.ts`

## 7. 验收标准

- [ ] 默认 provider / model 能从 resolved config 正确回显
- [ ] 新增、编辑、删除 provider 后能正确写回 TOML
- [ ] test connection 成功 / 失败都有明确反馈
- [ ] `project > user > builtin` 优先级有测试覆盖
- [ ] 配置错误不会静默吞掉或重置为默认值

## 8. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 继续沿旧 JSON 路径写配置 | 所有写回只允许 TOML，JSON 只做迁移兼容 |
| 配置优先级写散到 UI 里 | 统一消费 resolver 输出，不在页面层重写优先级 |
| 测试连通性只做成功路径 | 必须覆盖失败、缺字段、损坏配置和 fallback |

## 9. 测试策略

- 单元测试：
  - TOML 解析 / 序列化 / 映射
  - `project > user > builtin` 合并
  - 默认 provider / model 回显
- 集成测试：
  - 保存后读取
  - test connection 成功 / 失败
  - 损坏配置的回退与报错
- 手工验证：
  - 在桌面 Settings 中编辑 provider
  - 连通性测试可见且可解释

## 10. 完成定义

1. Provider 的配置主链路已经切到 TOML
2. 默认值、增删改查、连通性测试全部可用
3. 旧 JSON 不再是写入目标
