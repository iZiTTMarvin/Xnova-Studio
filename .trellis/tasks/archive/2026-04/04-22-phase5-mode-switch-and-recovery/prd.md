# [Phase 5 · 06] Mode Switch and Recovery — Top-level Standard/XForge Switch and Priority Resolution

> **Phase**：Phase 5 Project-aware Shell · 子任务 E
> **Priority**：P1
> **Status**：planning
> **Source**：[`docs/implement/phase5-project-aware-shell.md`](../../../docs/implement/phase5-project-aware-shell.md) §任务清单 E、[`.trellis/spec/frontend/project-shell-v1.md`](../../../.trellis/spec/frontend/project-shell-v1.md)

---

## 1. Problem

`Standard / XForge` 目前还没有作为顶部唯一主切换入口落地，也没有明确与项目配置、最近选择和当前会话之间的恢复优先级。如果这一块先天模糊，项目、Mode、Agent、模型之间会快速产生竞态。

## 2. Goal

实现顶部唯一的 `Standard / XForge` 模式切换，并定义恢复联动规则：

- mode 只通过顶部主入口切换
- mode 与 `project.toml` / 最近选择 / 用户临时覆盖有明确优先级
- mode 切换不重置 workspace / project / 会话

## 3. Scope

### In

- mode resolver / selector
- 顶部模式切换 UI
- 与项目配置、最近选择、当前会话的恢复优先级
- mode 切换后的 UI 同步

### Out

- 第二个 mode 切换入口
- 改造 Settings / Tools 页面
- 改写 runtime 核心协议

## 4. Dependencies

- **Blocked-by**：`04-22-phase5-startup-route`、`04-22-phase5-context-bar`
- **Blocks**：`04-22-phase5-project-aware-verification`

## 5. Subtasks

- [ ] 定义 mode 恢复优先级
- [ ] 实现顶部唯一主切换入口
- [ ] 接入 `project.toml` / 最近选择 / 当前会话状态
- [ ] 保证切换 mode 不清空项目 / workspace / 会话
- [ ] 保证没有第二个 mode 切换真入口

## 6. Related Files

- `studio/src/renderer/components/*`
- `studio/src/renderer/hooks/*`
- `studio/src/renderer/pages/*`
- 必要时 `studio/src/preload/*` / `studio/src/main/*`
- `cli/src/config/resolver.ts`（只读参考）

## 7. Acceptance Criteria

- [ ] 顶部存在唯一 `Standard / XForge` 切换入口
- [ ] mode 恢复优先级有明确实现与测试
- [ ] 切换 mode 不清空项目 / 会话
- [ ] `project.toml` / 最近选择 / 当前会话联动符合 spec
- [ ] 没有第二个 mode 切换真入口

## 8. Risks & Mitigations

| 风险 | 缓解 |
|---|---|
| mode 同时存放在多个状态源 | 用 resolver / selector 收敛并补单测 |
| 切换 mode 意外重建会话或重绑项目 | 测试中明确断言项目 / 会话保持不变 |
| UI 多处出现 mode 切换入口 | 评审和验收都按单一主入口检查 |

## 9. Testing Strategy

- 单元：
  - mode 恢复优先级
- 集成：
  - mode 切换与项目 / 会话保持
  - 顶部主入口唯一性
- 手工：
  - Electron 中切换 `Standard / XForge` 并确认上下文不丢

## 10. Definition of Done

1. 顶部模式切换已经成为唯一主入口
2. mode 恢复与项目配置联动规则被锁定
3. 不会为后续 Phase 6/7 留下多入口状态债务
