# [Phase 3 · 03] Agent System — Compatibility Loader and Source Convergence

> **Priority**：P0
> **Status**：planning
> **Parent**：`04-22-phase3-agent-system`

## 1. Goal

在不破坏 `general / explore / plan` 现有可用性的前提下，建立旧定义到 v1 schema 的兼容层，并把来源语义统一收敛为 `builtin + user`。

## 2. Scope

### In

- 旧内置 agent 定义映射到 v1 结构
- loader / registry 只暴露 `builtin + user`
- `user > builtin` 覆盖规则
- 显式处理 project-level agent：
  - 运行时如需保留兼容钩子，必须隐藏在产品层之外
  - UI 与公开候选池中不可见
- 基于兼容层保持 `dispatch_agent` 主路径稳定

### Out

- 不实现 `mode` 候选池过滤
- 不实现 `default_agent` 配置校验
- 不实现用户 agent 的创建/编辑/删除
- 不实现管理界面

## 3. Technical Approach

- 用 adapter / loader 统一输出 v1 `LoadedAgentDefinition`
- `built-in.ts` 不再只产出“旧式对象”，而应能被兼容层转换或直接产出 v1 兼容对象
- `definition-registry.ts` 的来源枚举、排序与描述文本都要同步收敛
- 以 `dispatch-agent.baseline.test.ts` 作为兼容回归锚点

## 4. Acceptance Criteria

- 旧内置 agent 不失效，主链路测试继续通过
- registry / loader 对外只呈现 `builtin + user`
- 同 id 的用户 agent 能覆盖 builtin agent
- 注释、类型和实际行为一致，不再继续暗示 project-level product capability
- 兼容层后的对象可被后续 mode 过滤和 UI 直接消费

## 5. Related Files

- `cli/src/tools/agent/built-in.ts`
- `cli/src/tools/agent/definition-registry.ts`
- `cli/src/tools/agent/types.ts`
- `cli/src/tools/agent/__tests__/dispatch-agent.baseline.test.ts`
- 未来新增的 loader / adapter 模块

## 6. Reference Specs

- [`.trellis/spec/backend/agent-schema-v1.md`](../../../.trellis/spec/backend/agent-schema-v1.md)
- [`.trellis/spec/backend/runtime-boundary.md`](../../../.trellis/spec/backend/runtime-boundary.md)
- [`.trellis/spec/guides/code-reuse-thinking-guide.md`](../../../.trellis/spec/guides/code-reuse-thinking-guide.md)

