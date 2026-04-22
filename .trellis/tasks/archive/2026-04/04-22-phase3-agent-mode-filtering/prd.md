# [Phase 3 · 04] Agent System — Mode Filtering and Default-Agent Constraints

> **Priority**：P0
> **Status**：planning
> **Parent**：`04-22-phase3-agent-system`

## 1. Goal

把 `primary / subagent / all` 的可见性与消费规则中央化，让 runtime、config、UI 都基于同一套判定结果工作，并把 `default_agent` 约束接进配置校验链路。

## 2. Scope

### In

- 主 Agent 候选池仅展示 `primary | all`
- SubAgent 候选池仅展示 `subagent | all`
- `default_agent` 仅允许引用 `primary | all`
- 过滤 helper / selector contract 抽到共享层
- 配置校验错误语义清晰，能说明 agent id 与 mode 不匹配
- 对应单元测试与集成测试

### Out

- 不处理 schema 字段解析
- 不处理旧内置兼容映射
- 不处理用户 agent 文件 CRUD
- 不处理 UI 具体页面样式与交互细节

## 3. Technical Approach

- 过滤规则必须由共享 helper 导出，不允许 UI 与 runtime 自写 `if/else`
- `default_agent` 校验优先接在 config schema / resolver 邻近位置，避免 UI 先保存、runtime 再炸
- 如现有 `dispatch-agent` 参数枚举依赖 registry 类型名，应同步引入 mode-aware 候选池 API

## 4. Acceptance Criteria

- `mode` 过滤逻辑只有一处事实源
- 主 Agent、SubAgent、`default_agent` 三条链路都消费同一套规则
- 非法 `default_agent` 会得到明确、可测试的错误提示
- 相关测试能覆盖 builtin 与 user agent 两类来源

## 5. Related Files

- `cli/src/tools/agent/definition-registry.ts`
- `cli/src/tools/agent/dispatch-agent.ts`
- `cli/src/config/toml/schema.ts`
- `cli/src/config/resolver.ts`
- 未来新增的 mode filter / selector helper 模块

## 6. Reference Specs

- [`.trellis/spec/backend/agent-schema-v1.md`](../../../.trellis/spec/backend/agent-schema-v1.md)
- [`.trellis/spec/backend/error-handling.md`](../../../.trellis/spec/backend/error-handling.md)
- [`.trellis/spec/guides/cross-layer-thinking-guide.md`](../../../.trellis/spec/guides/cross-layer-thinking-guide.md)

