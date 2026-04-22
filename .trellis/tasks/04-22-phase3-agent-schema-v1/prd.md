# [Phase 3 · 02] Agent System — Schema and Validation Contracts

> **Priority**：P0
> **Status**：planning
> **Parent**：`04-22-phase3-agent-system`

## 1. Goal

先把 v1 agent frontmatter schema、字段校验规则与错误语义锁定下来，作为后续兼容层、过滤逻辑和用户 agent 管理的唯一契约源。

## 2. Scope

### In

- 定义并落地字段：
  - `id`
  - `name`
  - `summary`
  - `mode`
  - `inherits`
  - `when_to_use`
  - `tool_policy`
  - `model_preference`
  - `extra`
- 明确字段合法性与默认值语义
- 明确 parser / validator 的输入输出结构
- 将 `agent-schema-v1.todo.test.ts` 转为真实失败测试，再实现
- 统一错误消息格式，确保能定位字段名与文件路径

### Out

- 不处理旧内置 agent 的兼容读取
- 不处理 `builtin + user` 来源收敛
- 不处理 `mode` 的候选池消费逻辑
- 不处理用户 agent CRUD / UI

## 3. Technical Approach

- 优先新增独立 parser / validator 模块，而不是把全部逻辑挤进 `types.ts`
- 可以复用现有 skill parser / memory frontmatter 的轻量解析思路，但不能直接复制不适配的 YAML 语义
- `mode` 默认值统一为 `all`
- `tool_policy.mode` 只允许 `include | exclude`
- `inherits` 在 schema 层验证“类型合法”，具体引用解析放到兼容/registry task

## 4. Acceptance Criteria

- v1 frontmatter 类型与运行时载荷结构已定义清楚
- 缺失 `id`、非法 `mode`、非法 `tool_policy`、非法 `tools` 都会被拒绝
- `summary` / `when_to_use` 等 UI 与调度必需字段被纳入必填校验
- 测试覆盖 parse / validate 主路径与错误路径
- 后续子任务无需再讨论字段语义，只消费这里的契约

## 5. Related Files

- `cli/src/tools/agent/types.ts`
- `cli/src/tools/agent/__tests__/agent-schema-v1.todo.test.ts`
- 未来新增的 parser / validator 模块
- `.trellis/spec/backend/agent-schema-v1.md`

## 6. Reference Specs

- [`.trellis/spec/backend/agent-schema-v1.md`](../../../.trellis/spec/backend/agent-schema-v1.md)
- [`.trellis/spec/backend/error-handling.md`](../../../.trellis/spec/backend/error-handling.md)
- [`.trellis/spec/backend/quality-guidelines.md`](../../../.trellis/spec/backend/quality-guidelines.md)

