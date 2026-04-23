# [Phase 5 · 01] Project-aware Shell — Desktop Main Shell, Work Context and Information Architecture

> **Phase**：Phase 5 Project-aware Shell · 主任务
> **Priority**：P0
> **Status**：planning
> **Source**：[`docs/implement/phase5-project-aware-shell.md`](../../../docs/implement/phase5-project-aware-shell.md)、[`docs/implement/phase4-electron-host.md`](../../../docs/implement/phase4-electron-host.md)、[`.trellis/spec/frontend/project-shell-v1.md`](../../../.trellis/spec/frontend/project-shell-v1.md)

---

## 1. Problem

Phase 4 已经交付了 Electron 宿主最小闭环，但当前桌面体验仍然只是“能跑的最小页面”，还没有形成真正的 `project-aware` 主叙事：

1. 默认入口仍未明确收敛到空白聊天页 / 最近工作会话恢复。
2. 左侧信息架构、项目块 / 聊天块、项目树 / 会话树 / 子代理树尚未建立。
3. 输入框附近缺少稳定的工作上下文条，用户无法感知“当前在操作哪个项目、哪个 Agent、哪个 Mode”。
4. `Standard / XForge` 仍未作为顶部唯一主切换入口落地。

如果这一阶段处理不好，桌面壳会重新退化成 `session-first` 的普通聊天壳，直接违背 `project-shell-v1.md` 已锁定的产品方向。

## 2. Goal

在 **不破坏 Phase 4 Electron Host 边界** 的前提下，交付桌面端第一个真正可感知的 `project-aware shell`：

- 冷启动默认进入空白聊天页或恢复最近工作会话
- 左侧形成 project-aware 信息架构
- 最近项目 / 项目会话 / 子代理会话具备基本树形呈现
- 输入框附近出现工作上下文条
- 顶部存在唯一的 `Standard / XForge` 模式切换

## 3. Scope

### In

- 空白聊天页与冷启动恢复决策
- 左侧一级导航与项目 / 聊天双 block 壳
- 最近项目列表、项目会话树、子代理树、scratchpad 聊天语义分离
- 工作上下文条
- 顶部模式切换与恢复
- Phase 5 所需测试、验证与 smoke checklist

### Out

- Settings / Tools 深度整合
- 发布收尾、打包、自动更新
- 新的产品级一级导航扩张
- 绕过 Phase 4 preload / IPC / runtime 边界的“快修”

## 4. Dependencies

- **Requires**：Phase 2 `Config Migration`、Phase 3 `Agent System`、Phase 4 `Electron Host`
- **Blocks**：Phase 6 `Settings and Tools`、Phase 7 `Polish and Release`

## 5. Current Architecture Note

虽然 `docs/implement/phase5-project-aware-shell.md` 的“重点涉及模块”仍提到 `cli/web/src/*`，但 **当前仓库真实落地基础已经是 Phase 4 的 `studio/` Electron 宿主**。

因此本阶段默认实现落点应为：

- `studio/src/renderer/**`：主壳、页面、组件、Hook
- 必要时少量补充 `studio/src/preload/**` / `studio/src/main/**`：仅用于继续暴露宿主边界内已有能力

`cli/web/src/*` 在本阶段只作为信息架构和已有交互模式的参考来源，**不能把桌面主壳重新做回 `cli/web`**。若文档与现状冲突，优先保持 Phase 4 已落定的 Electron host / preload / runtime boundary。

## 6. Subtasks

- [ ] **6.1** 子任务：`04-22-phase5-startup-route`
  - 实现空白聊天默认入口、Overview 降级与冷启动恢复决策
- [ ] **6.2** 子任务：`04-22-phase5-sidebar-information-architecture`
  - 实现 project-aware 左侧一级导航与项目 / 聊天双 block 壳结构
- [ ] **6.3** 子任务：`04-22-phase5-project-session-trees`
  - 实现最近项目、项目会话树、子代理树与 scratchpad 聊天语义分离
- [ ] **6.4** 子任务：`04-22-phase5-context-bar`
  - 实现输入框附近的工作上下文条
- [ ] **6.5** 子任务：`04-22-phase5-mode-switch-and-recovery`
  - 实现顶部 `Standard / XForge` 模式切换与恢复联动
- [ ] **6.6** 子任务：`04-22-phase5-project-aware-verification`
  - 收口 Phase 5 的单元 / 集成 / E2E / 手工 smoke 验证

## 7. Execution Order

建议顺序：

1. `04-22-phase5-startup-route`
2. `04-22-phase5-sidebar-information-architecture`
3. `04-22-phase5-project-session-trees`
4. `04-22-phase5-context-bar`
5. `04-22-phase5-mode-switch-and-recovery`
6. `04-22-phase5-project-aware-verification`

## 8. Related Files

### 预期新增 / 修改

- `studio/src/renderer/App.tsx`
- `studio/src/renderer/pages/*`
- `studio/src/renderer/components/*`
- `studio/src/renderer/hooks/*`
- `studio/src/renderer/types/*`（若需要）
- 必要时少量 `studio/src/preload/*` / `studio/src/main/*`

### 只读参考

- `docs/implement/phase5-project-aware-shell.md`
- `docs/implement/phase4-electron-host.md`
- `cli/web/src/App.tsx`
- `cli/web/src/components/Sidebar.tsx`
- `cli/web/src/pages/ChatPage.tsx`
- `cli/src/ui/useChat.ts`

## 9. Reference Specs

- [`.trellis/spec/frontend/project-shell-v1.md`](../../../.trellis/spec/frontend/project-shell-v1.md)
- [`.trellis/spec/frontend/state-management.md`](../../../.trellis/spec/frontend/state-management.md)
- [`.trellis/spec/frontend/directory-structure.md`](../../../.trellis/spec/frontend/directory-structure.md)
- [`.trellis/spec/frontend/component-guidelines.md`](../../../.trellis/spec/frontend/component-guidelines.md)
- [`.trellis/spec/frontend/hook-guidelines.md`](../../../.trellis/spec/frontend/hook-guidelines.md)
- [`.trellis/spec/frontend/type-safety.md`](../../../.trellis/spec/frontend/type-safety.md)
- [`.trellis/spec/frontend/quality-guidelines.md`](../../../.trellis/spec/frontend/quality-guidelines.md)
- [`.trellis/spec/backend/runtime-boundary.md`](../../../.trellis/spec/backend/runtime-boundary.md)
- [`.trellis/spec/backend/config-toml-migration.md`](../../../.trellis/spec/backend/config-toml-migration.md)
- [`.trellis/spec/backend/agent-schema-v1.md`](../../../.trellis/spec/backend/agent-schema-v1.md)

## 10. Acceptance Criteria

- [ ] 默认首页是空白聊天页或恢复后的最近工作会话，不再落到统计页
- [ ] 左侧一级导航、项目块 / 聊天块、项目树 / 会话树 / 子代理树符合 `project-shell-v1.md`
- [ ] 输入框附近可以看到稳定的工作上下文条
- [ ] `Standard / XForge` 作为顶部唯一主切换入口存在
- [ ] 全局聊天保持 scratchpad 语义，不与项目会话冲突
- [ ] 没有回退或破坏 Phase 4 的 Electron 宿主边界
- [ ] 本阶段测试与 smoke 通过

## 11. Risks & Mitigations

| 风险 | 缓解 |
|---|---|
| 为了赶进度把桌面壳继续做回 `cli/web` | PRD 显式规定 `studio/src/renderer/**` 为默认落点，`cli/web` 仅作参考 |
| 把“项目感”只做成文案，而不是状态与信息架构 | 强制把冷启动恢复、会话树、上下文条、模式切换都列为验收项 |
| 模式、Agent、项目、会话状态出现多事实源竞态 | 用 `state-management.md` 的三层模型收敛，必须补 resolver / selector 测试 |
| 上下文条或侧栏偷偷新增第二个 mode / project 真入口 | 用 `project-shell-v1.md` 硬约束拒绝越界设计 |

## 12. Testing Strategy

- 单元测试：
  - 启动路由 / mode / work context resolver
  - 上下文条字段顺序与可见性
  - 子代理树 / scratchpad 语义判定
- 集成测试：
  - 冷启动恢复
  - 最近项目 / 会话 / Agent / Mode / Model 同步
  - 侧栏树与聊天流同步
- E2E / 手工：
  - 新建项目链路
  - 接手已有项目链路
  - Electron 内 smoke 与手工交互检查

## 13. Definition of Done

1. 上述 Acceptance Criteria 全部打勾
2. 六个子任务全部完成并通过验证
3. 桌面端主体验正式从“最小宿主闭环”提升为“project-aware 主壳”
4. 若发现 Phase 5 文档与当前 Electron 现实有冲突，已在最终汇报中明确说明取舍依据
