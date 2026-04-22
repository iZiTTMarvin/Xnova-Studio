# [Phase 4 · 05] Renderer Minimal Shell — Basic Page, Workspace State and Minimal Runtime Request

> **Phase**：Phase 4 Electron Host · 子任务 D
> **Priority**：P1
> **Status**：planning
> **Source**：[`docs/implement/phase4-electron-host.md`](../../../docs/implement/phase4-electron-host.md) §任务清单 D

---

## 1. Problem

即使 main 和 preload 已经存在，如果 renderer 只是空白页，Phase 4 仍然没有形成“用户能看到并操作”的宿主闭环，也无法证明 Electron host 已真正消费共享 runtime。

## 2. Goal

交付一个最小 renderer 页面，验证这条完整链路：

`renderer UI -> preload API -> main / runtime -> renderer 状态更新`

用户至少可以看到：

- 应用已启动
- 当前 workspace 状态
- 一个最小 runtime 请求入口与反馈区域

## 3. Scope

### In

- renderer 最小入口页
- 当前 workspace 的展示
- 打开 workspace 按钮或等价交互
- 一条最小 runtime 请求
- 请求结果 / loading / error 的基础展示

### Out

- 不做 project-aware shell
- 不做复杂路由、树结构、导航体系
- 不做 Settings / Tools / Agents 全量整合

## 4. Dependencies

- **Blocked-by**：`04-22-phase4-studio-bootstrap`、`04-22-phase4-preload-ipc-bridge`
- **Blocks**：`04-22-phase4-electron-verification`

## 5. Subtasks

- [ ] 实现最小 renderer 入口页面
- [ ] 接入 workspace 状态读取和打开交互
- [ ] 接入最小 runtime 请求入口
- [ ] 处理 loading / empty / error / disabled 四类状态
- [ ] 保持 UI 简单清晰，不提前做 Phase 5 壳结构

## 6. Related Files

- `studio/src/renderer/main.tsx`
- `studio/src/renderer/App.tsx`
- `studio/src/renderer/pages/*`
- `studio/src/renderer/components/*`
- `studio/src/renderer/hooks/*`

## 7. Acceptance Criteria

- [ ] renderer 能加载基础页面
- [ ] 页面可展示当前 workspace 或空态
- [ ] 用户可触发“打开 workspace”
- [ ] 用户可触发最小 runtime 请求并看到反馈
- [ ] loading / empty / error / disabled 状态在界面上真实可见
- [ ] 没有提前实现 Phase 5 的复杂壳结构

## 8. Risks & Mitigations

| 风险 | 缓解 |
|---|---|
| renderer 为了演示方便直接写死数据 | 以 preload API 为唯一数据来源 |
| 只做成功态，错误态不可见 | 强制把 loading / empty / error / disabled 四态写进验收 |
| 提前把 Phase 5 的导航和布局一起做了 | PRD 明确 Out，只保留最小页面 |

## 9. Testing Strategy

- 前端类型检查
- 轻集成：状态切换与请求反馈
- 手工：打开应用、打开 workspace、触发请求、查看结果

## 10. Definition of Done

1. renderer 能证明 Electron host 闭环已跑通
2. 页面状态最小可解释
3. 不会对后续 Phase 5 的信息架构形成反向束缚
