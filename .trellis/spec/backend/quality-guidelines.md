# 后端质量规范

> 本文件定义当前仓库 backend 相关改动的最低质量门槛。这里的“后端”包含运行时、配置、持久化、Provider、Tool、MCP、Memory、Bridge Server。

## 当前检查命令

在 `cli/` 目录下执行：

```bash
pnpm typecheck
pnpm test
```

补充说明：

- 当前 `pnpm lint` 与 `pnpm typecheck` 都是 `tsc --noEmit`
- 目前测试覆盖仍然稀薄，因此**新增非微小功能时必须先补失败测试**

## TDD 基线

以下改动必须遵守“先失败测试，再实现，再验证”：

- config 迁移
- Agent schema / mode / inherits / tool policy
- session restore / project restore
- Memory 向量存储与降级逻辑
- runtime bootstrap / bridge / IPC / event 协议
- 数据库 migration

即使暂时只是在 bootstrap 阶段写规范，也要尽快把关键 spec 验收脚本补上，而不是只靠人工记忆。

## 提交前检查

### 类型与测试

- `cli/tsconfig.json` 为严格模式，必须保持通过
- 相关测试必须跑过
- 若当前目录无测试文件，新增高风险逻辑时要先创建测试

### 契约稳定性

- 新增/修改命令、工具、事件 payload、数据库字段、配置键时：
  - 明确输入输出
  - 明确兼容策略
  - 明确失败行为
- 不能靠“前端大概会这么传”“未来再统一”来跳过契约定义

### 复用与边界

- 改一个常量、配置键、schema 时，要搜索同类定义并同步处理
- 不要为临时需求复制一套近似逻辑到别的目录
- 优先抽到已有层：
  - 配置进 `config/`
  - 持久化进 `persistence/`
  - 运行时编排进 `core/` 或未来 `runtime/`

## 必补测试建议

| 改动类型 | 最少测试 |
|---|---|
| 配置读取/合并 | 单元测试 + 损坏配置回退测试 |
| migration | 升级测试 + 回归测试 |
| Agent/Tool 契约 | 参数校验测试 + 错误路径测试 |
| Memory | 降级测试 + rebuild 测试 |
| Bridge / Event | 事件 payload 测试 + 状态同步测试 |

## 当前代码中的正向样例

- 启动编排集中化：`cli/src/core/bootstrap.ts`
- Provider 缓存与构造边界：`cli/src/providers/registry.ts`
- 数据库版本控制：`cli/src/persistence/db.ts`
- 会话日志结构化落盘：`cli/src/observability/session-logger.ts`

## 当前高风险区

根据需求文档与现状，以下区域最容易出回归：

- `config.json -> config.toml` 迁移
- `shared runtime` 拆分
- Agent schema 升级
- 项目级默认值恢复
- SubAgent 并行与状态同步

这些区域的改动如果没有测试和 spec，一律视为不完整。

## 反模式

- 没有失败测试就直接做结构迁移。
- 只跑 happy path，不测损坏配置、缺字段、降级路径。
- 用 `any`、宽泛对象或字符串拼接逃避契约定义。
- 发现可复用逻辑却继续复制粘贴。
