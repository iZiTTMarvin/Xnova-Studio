# [Phase 4 · 03] Main Process Workspace — Window Lifecycle, Workspace Dialog and Host Logging

> **Phase**：Phase 4 Electron Host · 子任务 B
> **Priority**：P0
> **Status**：planning
> **Source**：[`docs/implement/phase4-electron-host.md`](../../../docs/implement/phase4-electron-host.md) §任务清单 B

---

## 1. Problem

即使 `studio/` 工程存在，若没有稳定的 main process，Electron 仍然只是空壳：窗口无法正确创建，workspace 无法通过原生能力打开，宿主级错误和启动日志也无从观测。

## 2. Goal

实现 Electron main process 的最小宿主能力：

- 创建和销毁主窗口
- 处理应用生命周期
- 调起“打开 workspace”原生对话框
- 输出基础日志与错误

## 3. Scope

### In

- 创建 `BrowserWindow`
- 配置最小安全窗口选项
- 处理 `app.whenReady` / `window-all-closed` / `activate`
- 封装“打开目录作为 workspace”的宿主能力
- 返回 workspace 选择结果
- 基础日志与错误输出

### Out

- 不做 preload API 设计
- 不做 renderer 状态展示
- 不做复杂菜单、托盘、多窗口
- 不在 main process 内直接实现 runtime 业务流程

## 4. Dependencies

- **Blocked-by**：`04-22-phase4-studio-bootstrap`
- **Blocks**：`04-22-phase4-preload-ipc-bridge`、`04-22-phase4-renderer-minimal-shell`

## 5. Subtasks

- [ ] 实现主窗口创建与关闭
- [ ] 处理最小应用生命周期
- [ ] 封装 workspace 打开对话框
- [ ] 处理用户取消选择与路径为空场景
- [ ] 补主进程日志与错误输出

## 6. Related Files

- `studio/src/main/index.ts`
- `studio/src/main/window.ts`
- `studio/src/main/workspace.ts`
- `studio/src/main/logger.ts`

## 7. Acceptance Criteria

- [ ] 主窗口可稳定创建
- [ ] 关闭窗口、重新激活等生命周期行为清晰
- [ ] 可通过系统对话框选择 workspace 目录
- [ ] 取消选择不会导致崩溃或脏状态
- [ ] 启动失败和运行时错误对开发者可见
- [ ] main process 只承载宿主职责，不承载复杂业务逻辑

## 8. Risks & Mitigations

| 风险 | 缓解 |
|---|---|
| main process 越界承载过多业务 | 严格把 IPC 设计和 runtime 请求留给 preload / renderer |
| workspace 对话框只测成功路径 | 显式覆盖取消选择、空结果、异常路径 |
| 窗口选项偷开危险能力 | 以 preload 为边界，主窗口默认保持安全选项 |

## 9. Testing Strategy

- 轻集成：窗口生命周期函数
- 单元：workspace 选择结果处理
- 手工：启动窗口、关闭、重新激活、打开 workspace

## 10. Definition of Done

1. main process 能作为稳定宿主入口存在
2. workspace 打开能力可被 preload / renderer 继续消费
3. 没有把复杂业务回填到 main process
