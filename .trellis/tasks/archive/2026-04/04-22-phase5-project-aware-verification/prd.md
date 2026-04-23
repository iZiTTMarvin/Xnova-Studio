# [Phase 5 · 07] Project-aware Verification — Startup, Tree Sync, Context Bar, Mode and Critical-path Acceptance

> **Phase**：Phase 5 Project-aware Shell · 子任务 F
> **Priority**：P1
> **Status**：planning
> **Source**：[`docs/implement/phase5-project-aware-shell.md`](../../../docs/implement/phase5-project-aware-shell.md) §测试要求、§完成标准

---

## 1. Problem

Phase 5 跨越 `startup route / sidebar / tree / context bar / mode` 多条主叙事链路，只靠局部单测很容易出现“每块都像完成了，但整体验收仍然漂移”的假阳性。

## 2. Goal

集中验证 Phase 5 的 project-aware 主壳，覆盖：

- 冷启动默认入口
- 最近项目 / 最近会话恢复
- 项目树 / 会话树 / 子代理树同步
- 上下文条字段规则
- 顶部模式切换与恢复
- Electron 内手工 critical path

## 3. Scope

### In

- Phase 5 单元 / 集成测试补齐
- 关键 E2E / smoke 脚本
- typecheck / build / 相关测试执行
- 手工 critical path checklist
- 最终验收结论与 residual risk

### Out

- 新功能扩 scope
- Phase 6 / 7 能力提前实现

## 4. Dependencies

- **Blocked-by**：前五个 Phase 5 子任务全部完成
- **Blocks**：Phase 5 验收关闭、Phase 6 实施

## 5. Subtasks

- [ ] 补启动路由测试
- [ ] 补项目树 / 会话树 / 子代理树同步测试
- [ ] 补上下文条与 mode 恢复测试
- [ ] 跑 `typecheck` / `build` / 相关测试
- [ ] 执行 Electron 手工 critical path
- [ ] 输出验收结论与 residual risk

## 6. Related Files

- `studio/tests/**/*`
- `studio/src/renderer/**/*`
- `docs/implement/phase5-project-aware-shell.md`

## 7. Acceptance Criteria

- [ ] 冷启动路由决策被验证
- [ ] 最近项目 / 最近会话恢复被验证
- [ ] 项目树 / 会话树 / 子代理树同步被验证
- [ ] 上下文条字段规则被验证
- [ ] mode 切换与恢复被验证
- [ ] Electron 手工 critical path 通过
- [ ] 最终报告明确 residual risk；若没有，明确写“无已知阻塞风险”

## 8. Risks & Mitigations

| 风险 | 缓解 |
|---|---|
| 只有组件测试，没有整体主叙事验证 | 必须做冷启动和已有项目两条 critical path |
| 只测 happy path | 把路径失效、损坏会话、runtime 未就绪、SubAgent 停止不同步都列入检查 |
| 最终报告只写“通过” | 强制输出完成标准对照与 residual risk |

## 9. Testing Strategy

- 单元：
  - route / mode / context resolver
- 集成：
  - shell 恢复、tree sync、上下文条、mode 切换
- E2E / 手工：
  - 新建项目链路
  - 打开已有项目链路

## 10. Definition of Done

1. Phase 5 完成标准被真实验证
2. 结果能直接作为 Phase 6 进入条件
3. 验收结论和风险可复现、可审查
