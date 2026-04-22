# [Phase 3 · 06] Agent System — Selector and Management UI Integration

> **Priority**：P1
> **Status**：planning
> **Parent**：`04-22-phase3-agent-system`

## 1. Goal

把 Phase 3 的 Agent 能力真正接到用户可操作的界面里，完成主 Agent / SubAgent 选择器与用户 agent 管理流的产品闭环。

## 2. Scope

### In

- 主 Agent 选择器仅展示 `primary | all`
- SubAgent 候选池仅展示 `subagent | all`
- 用户 agent 的新建 / 编辑 / 删除 / 切换交互
- 从模板创建 / 从空白创建入口
- 错误提示、保存状态、刷新策略
- UI 不展示 project-level agent

### Out

- 不新增与 Phase 3 无关的仪表盘或复杂运营功能
- 不引入 project-level agent 页面
- 不重复实现 backend CRUD / loader / validator

## 3. Technical Approach

- **强制实现**：新增独立 `AgentsPage` + Sidebar 入口，保持管理语义清晰，并对齐文档中的“桌面 `Agents` 页面与管理面板”要求
- **禁止降级**：不允许把本任务缩水为 `SettingsPage` 的附属区块
- 必须共用 mode filter 与 CRUD service，禁止在 UI 层拼装业务规则

## 4. Acceptance Criteria

- 用户能看到并切换合法的主 Agent / SubAgent 候选
- 用户能完成自定义 agent 的新建 / 编辑 / 删除
- 模板创建与空白创建入口完整可用
- UI 仅显示 `builtin + user`
- 页面承载形态为独立 `AgentsPage` 或等价独立管理面板，不接受 `SettingsPage` 挂靠式缩水实现
- 保存、校验失败、冲突等异常都有明确提示

## 5. Related Files

- `cli/web/src/App.tsx`
- `cli/web/src/components/Sidebar.tsx`
- 未来新增的 `cli/web/src/pages/AgentsPage.tsx`
- 未来新增的 agent 管理组件 / hooks / API 客户端

## 6. Reference Specs

- [`.trellis/spec/frontend/directory-structure.md`](../../../.trellis/spec/frontend/directory-structure.md)
- [`.trellis/spec/frontend/quality-guidelines.md`](../../../.trellis/spec/frontend/quality-guidelines.md)
- [`.trellis/spec/frontend/state-management.md`](../../../.trellis/spec/frontend/state-management.md)
- [`.trellis/spec/frontend/type-safety.md`](../../../.trellis/spec/frontend/type-safety.md)
- [`.trellis/spec/guides/cross-layer-thinking-guide.md`](../../../.trellis/spec/guides/cross-layer-thinking-guide.md)
