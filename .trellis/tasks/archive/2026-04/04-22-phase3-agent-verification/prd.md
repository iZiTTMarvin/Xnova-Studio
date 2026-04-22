# [Phase 3 · 07] Agent System — Integration Verification and Regression Gate

> **Priority**：P0
> **Status**：planning
> **Parent**：`04-22-phase3-agent-system`

## 1. Goal

把 Phase 3 各子任务的交付物收口成可验收的阶段成果，确认内置兼容、用户 agent、mode 过滤与 UI 消费链路全部达标。

## 2. Scope

### In

- 补齐并运行 Phase 3 需要的单元测试与集成测试
- 验证旧内置 agent 不失效
- 验证用户 agent 创建后可被主 Agent / SubAgent 正确消费
- 验证 UI 只看到 `builtin + user`
- 验证 `default_agent` 非法值报错
- 形成阶段级验收清单

### Out

- 不新增功能
- 不做新一轮 schema 设计
- 不把 project-level agent 重新纳入测试目标

## 3. Technical Approach

- 以“阶段级回归门禁”而不是“单任务自测通过”作为完成标准
- 除测试外，至少做一次从创建用户 agent 到被 selector / runtime 消费的端到端验证
- 若在验证阶段暴露契约缺口，应回退对应子任务修正后再重新收口

## 4. Acceptance Criteria

- 所有 Phase 3 关键测试通过
- 旧内置 agent 与新用户 agent 都通过回归
- `mode` 过滤、`default_agent`、UI 可见性三者一致
- Phase 3 完成标准可逐项打勾

## 5. Related Files

- `cli/src/tools/agent/__tests__/agent-schema-v1.todo.test.ts`
- `cli/src/tools/agent/__tests__/dispatch-agent.baseline.test.ts`
- 未来新增的 agent loader / CRUD / UI 测试文件
- `docs/implement/phase3-agent-system.md`

## 6. Reference Specs

- [`.trellis/spec/backend/quality-guidelines.md`](../../../.trellis/spec/backend/quality-guidelines.md)
- [`.trellis/spec/frontend/quality-guidelines.md`](../../../.trellis/spec/frontend/quality-guidelines.md)
- [`.trellis/spec/guides/cross-layer-thinking-guide.md`](../../../.trellis/spec/guides/cross-layer-thinking-guide.md)

