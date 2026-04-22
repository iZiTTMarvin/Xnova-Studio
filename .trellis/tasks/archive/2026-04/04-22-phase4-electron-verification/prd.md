# [Phase 4 · 06] Electron Verification — IPC Validation, Lifecycle Checks and Smoke Acceptance

> **Phase**：Phase 4 Electron Host · 子任务 E
> **Priority**：P1
> **Status**：planning
> **Source**：[`docs/implement/phase4-electron-host.md`](../../../docs/implement/phase4-electron-host.md) §测试要求、§完成标准

---

## 1. Problem

Phase 4 横跨 `main / preload / renderer / runtime` 四层，如果没有专门的验证任务，最容易出现“代码都写了，但真实启动链路没跑通”的假阳性结果。

## 2. Goal

集中验证 Phase 4 的最小宿主闭环，覆盖：

- IPC 参数校验
- workspace 选择结果处理
- 窗口生命周期基础逻辑
- 手工 smoke：启动、打开 workspace、renderer 收到状态、最小请求

## 3. Scope

### In

- 为 Phase 4 补单元 / 轻集成测试
- 跑完整类型检查与构建验证
- 设计并执行手工 smoke checklist
- 输出验收结果和残余风险

### Out

- 不扩写新功能
- 不进入 Phase 5/6 的产品能力

## 4. Dependencies

- **Blocked-by**：前四个子任务全部完成
- **Blocks**：Phase 4 验收关闭、后续 Phase 5 实施

## 5. Subtasks

- [ ] 补 IPC 参数校验测试
- [ ] 补 workspace 结果处理测试
- [ ] 补窗口生命周期基础逻辑测试
- [ ] 跑 `typecheck` / 构建 / 必要测试
- [ ] 执行手工 smoke 并记录结果

## 6. Related Files

- `studio/src/**/__tests__/*`
- `studio/package.json`
- 可能新增的 smoke 记录文档
- `docs/implement/phase4-electron-host.md`

## 7. Acceptance Criteria

- [ ] IPC 方法参数校验覆盖成功/失败路径
- [ ] workspace 选择结果处理覆盖成功/取消路径
- [ ] 窗口生命周期基础逻辑有测试或等价验证
- [ ] 应用可启动
- [ ] 可选择本地 workspace
- [ ] renderer 能收到基本状态
- [ ] 最终汇报明确残余风险；若没有，明确写“无已知阻塞风险”

## 8. Risks & Mitigations

| 风险 | 缓解 |
|---|---|
| 只有单测，没有真实 smoke | 验收标准强制包含手工 smoke |
| 只测 happy path | 把取消、非法参数、窗口关闭都写进测试项 |
| 报告只写“通过”，不说明风险 | 最终报告模板要求显式列 residual risk |

## 9. Testing Strategy

- 单元 / 轻集成：
  - IPC 校验
  - workspace 结果处理
  - 生命周期逻辑
- 构建验证：
  - `studio` 类型检查
  - `studio` 构建
- 手工 smoke：
  - 启动
  - 选择 workspace
  - renderer 收到状态
  - 发起最小请求

## 10. Definition of Done

1. Phase 4 的完成标准被真实验证，而不是口头声明
2. 结果可直接作为下一阶段的进入条件
3. 验收结论和残余风险可审查、可复现
