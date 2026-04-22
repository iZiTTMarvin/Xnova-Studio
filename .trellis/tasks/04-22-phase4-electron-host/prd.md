# [Phase 4 · 01] Electron Host — Desktop Host Skeleton and Minimal Runtime Consumption

> **Phase**：Phase 4 Electron Host · 主任务
> **Priority**：P0
> **Status**：planning
> **Source**：[`docs/implement/phase4-electron-host.md`](../../../docs/implement/phase4-electron-host.md)、[`.trellis/spec/backend/runtime-boundary.md`](../../../.trellis/spec/backend/runtime-boundary.md)、[`.trellis/spec/backend/directory-structure.md`](../../../.trellis/spec/backend/directory-structure.md)

---

## 1. Problem

Phase 1 已经把 `shared runtime + host/cli` 的边界抽出来，但桌面宿主仍然不存在，导致 v1 后续阶段缺少真正的 Electron 消费方：

1. 仓库里还没有 `studio/` 工程，无法承载 Electron `main / preload / renderer`。
2. 目前只有 CLI host 能消费 runtime，Electron host 的 IPC、生命周期和 workspace 打开链路都还是空白。
3. 如果 Phase 4 不先建立最小宿主骨架，Phase 5 的 project-aware shell 只能继续寄生在 `cli/web/`，无法验证桌面形态。
4. 当前最容易犯的错误是把业务逻辑塞回 `main process`，或绕过 preload 安全边界直接在 renderer 使用 Node 能力，这会破坏 Phase 1 已锁定的 runtime / host / renderer 分层。

## 2. Goal

交付一个“最小但真实可运行”的 Electron 宿主，满足 Phase 4 文档的四个核心目标：

- `studio/` 工程存在并能启动
- Electron 窗口可正常创建和关闭
- preload 提供安全、最小的 IPC contract
- renderer 能显示当前 workspace，并向共享 runtime 发起一条最小请求

同时明确约束：**本阶段不做完整产品 UI，只做宿主骨架与最小接入。**

## 3. Scope

### In

- 新建 `studio/` 工程与目录骨架
- 建立 `src/main` / `src/preload` / `src/renderer`
- 建立 Electron 启动、构建、最小打包/运行脚本
- 实现主窗口、应用生命周期、workspace 打开对话框
- 定义 preload 暴露给 renderer 的安全 API
- 建立 renderer 对 host/runtime 的最小调用与状态展示
- 建立本阶段要求的日志、错误输出、参数校验与验证任务

### Out

- 不做完整 project-aware 主界面
- 不做 Phase 5 的默认首页、项目树、上下文条、Mode 切换
- 不做 Settings / Tools 深度整合
- 不做复杂菜单、托盘、自动更新、崩溃上报
- 不把 CLI 现有 UI 直接搬进 Electron renderer

## 4. Dependencies

- **Requires**：Phase 1 Runtime Foundation 已完成，尤其是 `cli/src/runtime/` 与 `cli/src/host/cli/` 边界稳定可复用
- **Advisory**：Phase 2 / 3 已完成时更利于后续串联，但 Phase 4 的最小宿主骨架不应硬依赖 Phase 5/6
- **Blocks**：Phase 5 Project-aware Shell、Phase 6 Settings and Tools、Phase 7 Recoverability / Packaging
- **Gate 归属**：从 Gate A `Runtime Ready` 进入 Gate C `Desktop Host Ready` 的第一步

## 5. Subtasks

- [ ] **5.1** 子任务：`04-22-phase4-studio-bootstrap`
  - 建立 `studio/` 工程骨架、脚本、目录与最小运行基线
- [ ] **5.2** 子任务：`04-22-phase4-main-process-workspace`
  - 实现 Electron main process、窗口生命周期、workspace 打开与基础日志
- [ ] **5.3** 子任务：`04-22-phase4-preload-ipc-bridge`
  - 设计 preload 安全边界、IPC API 与 runtime 事件桥接
- [ ] **5.4** 子任务：`04-22-phase4-renderer-minimal-shell`
  - 交付 renderer 最小页面、workspace 展示与最小 runtime 请求
- [ ] **5.5** 子任务：`04-22-phase4-electron-verification`
  - 收口 IPC 参数校验、生命周期验证与手工 smoke，完成 Phase 4 验收

## 5A. 子任务顺序

建议执行顺序：

1. `04-22-phase4-studio-bootstrap`
2. `04-22-phase4-main-process-workspace`
3. `04-22-phase4-preload-ipc-bridge`
4. `04-22-phase4-renderer-minimal-shell`
5. `04-22-phase4-electron-verification`

## 6. Technical Approach

### 统一原则

- Electron host 必须是 `shared runtime` 的消费者，而不是复制一套 CLI 装配逻辑。
- `main` 只处理宿主职责：窗口、生命周期、原生对话框、宿主级日志。
- `preload` 是 renderer 的唯一本地能力入口，负责 `contextBridge + IPC + 参数校验`。
- `renderer` 只通过 preload API 工作，不允许直连 Node / 文件系统 / SQLite / shell。
- 本阶段 UI 允许“简陋但清晰”，不允许为了好看提前实现 Phase 5 的复杂壳结构。

### 结果形态

- 运行：开发者可以启动 `studio/` 并看到一个可操作的桌面窗口
- 交互：点击打开 workspace 后，renderer 能看到路径变化
- 调用：renderer 能通过 host API 触发一条最小 runtime 请求并得到结果或状态

## 7. Related Files

### 预期新增/修改

- `studio/package.json`
- `studio/tsconfig*.json`
- `studio/src/main/*`
- `studio/src/preload/*`
- `studio/src/renderer/*`
- 根级或 `studio/` 级构建/启动脚本
- 可能新增的 Electron 构建配置文件

### 只读参考

- `docs/implement/phase4-electron-host.md`
- `docs/implement/phase5-project-aware-shell.md`
- `.trellis/spec/backend/runtime-boundary.md`
- `.trellis/spec/backend/directory-structure.md`
- `cli/src/runtime/*`
- `cli/src/host/cli/*`

## 8. Reference Specs（必读）

- [`.trellis/spec/backend/runtime-boundary.md`](../../../.trellis/spec/backend/runtime-boundary.md)
- [`.trellis/spec/backend/directory-structure.md`](../../../.trellis/spec/backend/directory-structure.md)
- [`.trellis/spec/backend/error-handling.md`](../../../.trellis/spec/backend/error-handling.md)
- [`.trellis/spec/backend/logging-guidelines.md`](../../../.trellis/spec/backend/logging-guidelines.md)
- [`.trellis/spec/backend/quality-guidelines.md`](../../../.trellis/spec/backend/quality-guidelines.md)
- [`.trellis/spec/frontend/directory-structure.md`](../../../.trellis/spec/frontend/directory-structure.md)
- [`.trellis/spec/frontend/quality-guidelines.md`](../../../.trellis/spec/frontend/quality-guidelines.md)
- [`.trellis/spec/frontend/type-safety.md`](../../../.trellis/spec/frontend/type-safety.md)
- [`.trellis/spec/guides/cross-layer-thinking-guide.md`](../../../.trellis/spec/guides/cross-layer-thinking-guide.md)

## 9. Acceptance Criteria

- [ ] `studio/` 工程存在，且具备最小启动与构建脚本
- [ ] Electron 主窗口能稳定启动和关闭
- [ ] preload 暴露的 API 有明确边界，renderer 不直连 Node
- [ ] 可选择本地 workspace，renderer 能收到当前 workspace 状态
- [ ] renderer 能发起一条最小 runtime 请求并得到反馈
- [ ] 启动日志与错误输出对开发者可见
- [ ] 没有把复杂业务逻辑重新塞回 `main process`
- [ ] 本阶段测试与手工 smoke 通过

## 10. Risks & Mitigations

| 风险 | 缓解 |
|---|---|
| 直接在 renderer 开 Node 能力，破坏 preload 安全边界 | preload 子任务强制定义最小 API，renderer 只能消费桥接对象 |
| 为了图省事复制 CLI host 逻辑到 Electron | 以 `runtime-boundary.md` 为准，host 只消费 runtime，不复制装配 |
| 本阶段 scope 膨胀，提前做完整产品壳 | parent PRD 明确 Out；renderer 子任务只做最小状态页 |
| `main process` 长成业务中枢 | 把 runtime 请求、状态桥接、参数校验拆到 preload / renderer / shared helper |
| 验证只跑成功路径，没有错误态 | verification task 强制覆盖参数非法、workspace 取消、窗口关闭等路径 |

## 11. Testing Strategy

- 子任务级单元 / 轻集成：
  - IPC 参数校验
  - workspace 选择结果处理
  - 窗口生命周期基础逻辑
- 构建验证：
  - `studio` 类型检查
  - `studio` 最小构建
- 手工 smoke：
  - 应用启动
  - 选择 workspace
  - renderer 收到 workspace 状态
  - 发起最小 runtime 请求

## 12. Definition of Done

1. 上述 Acceptance Criteria 全部打勾
2. 五个子任务全部完成并通过验证
3. `studio/` 可以作为后续 Phase 5/6 的真实宿主基础
4. `CHANGELOG.md` 追加一条 Phase 4 / Electron Host 相关记录
