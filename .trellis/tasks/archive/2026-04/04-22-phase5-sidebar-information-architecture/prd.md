# [Phase 5 · 03] Sidebar Information Architecture — Primary Navigation and Project/Chat Dual Blocks

> **Phase**：Phase 5 Project-aware Shell · 子任务 B
> **Priority**：P0
> **Status**：planning
> **Source**：[`docs/implement/phase5-project-aware-shell.md`](../../../docs/implement/phase5-project-aware-shell.md) §任务清单 B、[`.trellis/spec/frontend/project-shell-v1.md`](../../../.trellis/spec/frontend/project-shell-v1.md)

---

## 1. Problem

Phase 4 仍是单页最小闭环，没有 project-aware 左侧壳。若一级导航和双 block 壳结构不先落定，项目树、聊天树和上下文条都会失去稳定承载位置。

## 2. Goal

建立桌面主壳的左侧信息架构：

- 一级导航按 `project-shell-v1.md` 的固定顺序落定
- `项目` 与 `聊天` 两个 block 彼此独立折叠 / 展开
- 为后续 project tree / scratchpad chat / tools / settings 留出稳定位置

## 3. Scope

### In

- 左侧一级导航常量与渲染
- 项目 / 聊天双 block 容器
- 折叠 / 展开与独立滚动
- loading / empty / disabled 骨架态

### Out

- 项目树 / 会话树真实数据填充
- 上下文条
- 模式切换
- Settings / Tools 深度内容

## 4. Dependencies

- **Blocked-by**：`04-22-phase5-startup-route`
- **Blocks**：`04-22-phase5-project-session-trees`、`04-22-phase5-context-bar`

## 5. Subtasks

- [ ] 固定一级导航顺序
- [ ] 建立 project-aware 左侧壳布局
- [ ] 拆分项目 / 聊天双 block
- [ ] 支持两个 block 独立折叠 / 展开 / 滚动
- [ ] 处理 loading / empty / disabled 骨架态

## 6. Related Files

- `studio/src/renderer/components/*`
- `studio/src/renderer/pages/*`
- `studio/src/renderer/styles.css`
- `cli/web/src/components/Sidebar.tsx`（只读参考）

## 7. Acceptance Criteria

- [ ] 一级导航顺序与名称符合 spec
- [ ] `项目` 与 `聊天` 两个 block 独立存在
- [ ] 两个 block 支持独立折叠 / 展开
- [ ] UI 上可见 loading / empty / disabled 状态
- [ ] 没有额外新增一级入口绕开信息架构

## 8. Risks & Mitigations

| 风险 | 缓解 |
|---|---|
| 先做视觉布局，不先锁定信息架构 | 用导航常量和 block 常量作为单一事实源 |
| block 结构与后续 project tree 不兼容 | 先留出插槽与滚动容器，不把树结构写死在单文件里 |
| 提前夹带 Phase 6 的页面内容 | 本任务只做壳和骨架，不做深内容整合 |

## 9. Testing Strategy

- 组件测试：
  - 一级导航顺序断言
  - 双 block 折叠 / 展开行为
- 集成：
  - 骨架态 / 空态 / 禁用态展示

## 10. Definition of Done

1. 左侧 project-aware 壳结构已经落定
2. 后续 project tree 与 scratchpad chat 有稳定插槽
3. 信息架构不会因后续实现继续漂移
