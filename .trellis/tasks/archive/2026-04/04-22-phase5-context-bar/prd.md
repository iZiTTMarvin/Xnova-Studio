# [Phase 5 · 05] Context Bar — Work Context, Field Ordering and Visible Empty States

> **Phase**：Phase 5 Project-aware Shell · 子任务 D
> **Priority**：P1
> **Status**：planning
> **Source**：[`docs/implement/phase5-project-aware-shell.md`](../../../docs/implement/phase5-project-aware-shell.md) §任务清单 D、[`.trellis/spec/frontend/project-shell-v1.md`](../../../.trellis/spec/frontend/project-shell-v1.md)

---

## 1. Problem

没有上下文条，用户在输入前无法一眼知道当前项目、分支、Agent、模型、context 使用量和正在运行的 SubAgent 数量，project-aware 主壳的核心感知会明显不足。

## 2. Goal

实现输入框附近的工作上下文条，并保证：

- 字段顺序固定
- 空态 / disabled 态真实可见
- `WorkContext` 成为单一主状态源
- 不出现第二个 mode 切换入口

## 3. Scope

### In

- `WorkContext` 或等价统一状态结构
- 上下文条字段配置
- 六个字段的最小展示
- 空态 / disabled / error 展示

### Out

- 模式切换 UI
- 深度 Agent 管理页面
- Settings / Tools 深度整合

## 4. Dependencies

- **Blocked-by**：`04-22-phase5-project-session-trees`
- **Blocks**：`04-22-phase5-project-aware-verification`

## 5. Subtasks

- [ ] 定义 `WorkContext` 单一主状态源
- [ ] 定义上下文条字段顺序与空态规则
- [ ] 展示当前项目 / 分支 / Agent / 模型 / context 使用率 / SubAgent 数量
- [ ] 处理 loading / empty / disabled / error 状态
- [ ] 保证上下文条不承载第二个 mode 切换入口

## 6. Related Files

- `studio/src/renderer/components/*`
- `studio/src/renderer/hooks/*`
- `studio/src/renderer/pages/*`
- 必要时 `studio/src/shared/*`

## 7. Acceptance Criteria

- [ ] 六个字段顺序符合 spec
- [ ] 空态 / disabled 态可见
- [ ] `WorkContext` 是单一主状态源
- [ ] 上下文条中没有第二个 mode 切换入口
- [ ] 切换项目 / 会话 / Agent / 模型后条内信息同步更新

## 8. Risks & Mitigations

| 风险 | 缓解 |
|---|---|
| 每个字段各自读不同状态源 | 用 `WorkContext` 和 field spec 收敛 |
| 空态只靠注释说明 | 在 UI 上真实显示 placeholder / muted / hidden 规则 |
| 上下文条偷偷承担模式切换职责 | 明确列为边界违规并禁止 |

## 9. Testing Strategy

- 单元：
  - 字段顺序 / 必显规则
- 集成：
  - `WorkContext` 变更驱动条内更新
  - 空态 / disabled / error 可见性

## 10. Definition of Done

1. 用户可一眼看到当前工作上下文
2. 上下文条拥有稳定字段契约
3. 不会和模式切换、导航入口发生语义冲突
