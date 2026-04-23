# Phase 6 · Settings Shell Integration

> **阶段**：Phase 6 Settings and Tools · 子任务 A
> **优先级**：P0
> **状态**：planning
> **来源**：[`docs/implement/phase6-settings-and-tools.md`](../../../docs/implement/phase6-settings-and-tools.md) §任务清单、[`docs/implement/phase4-electron-host.md`](../../../docs/implement/phase4-electron-host.md)、[`docs/implement/phase5-project-aware-shell.md`](../../../docs/implement/phase5-project-aware-shell.md)、[`.trellis/spec/frontend/project-shell-v1.md`](../../../.trellis/spec/frontend/project-shell-v1.md)

---

## 1. 问题

Phase 5 已经把桌面主壳做成 `project-aware`，但 Settings / Tools 仍没有真正进入 `studio/src/renderer/**` 的主体验。若不先建立桌面壳内的 Settings 页面骨架，后续 Providers / Memory / MCP / Skills 会继续散落在旧 Web 面板里。

## 2. 目标

在 `studio/src/renderer/**` 内建立 Settings / Tools 的页面骨架、路由入口和状态边界，并明确：

- 唯一主壳仍是 Phase 5 的 project-aware shell
- Settings / Tools 是主壳中的一个稳定入口
- `cli/web/src/**` 只保留为旧实现与信息架构参考
- 页面必须真实处理 loading / empty / error / disabled 状态

## 3. 范围

### 包含

- Settings / Tools 页面骨架
- 页面路由与侧栏入口对接
- Section / Tab 的容器分层
- 通过 bridge 读取必要状态
- 空态、错误态、禁用态的真实展示

### 不包含

- Providers 的具体 CRUD
- Memory / MCP / Skills 的具体数据面板
- 任何 Phase 7 恢复 / 打包 / 发布能力

## 4. 依赖

- **Blocked-by**：Phase 4 Electron Host、Phase 5 Project-aware Shell
- **Blocks**：`04-23-phase6-provider-config-and-toml`、`04-23-phase6-memory-overview-and-rebuild`、`04-23-phase6-mcp-status-and-management`、`04-23-phase6-skills-and-plugins-status`

## 5. 子任务

- [ ] 建立桌面端 Settings / Tools 页面容器
- [ ] 把入口接入现有 project-aware 左侧主壳
- [ ] 复用旧 Web 页面作为信息架构参考，但不回退实现落点
- [ ] 明确页面的 loading / empty / error / disabled 状态
- [ ] 抽出必要的 bridge / hook 边界

## 6. 相关文件

- `studio/src/renderer/App.tsx`
- `studio/src/renderer/pages/StudioHomePage.tsx`
- `studio/src/renderer/components/ProjectShellSidebar.tsx`
- `studio/src/renderer/components/ModeSwitch.tsx`
- `studio/src/renderer/components/ContextBar.tsx`
- `studio/src/renderer/hooks/useStudioBridge.ts`
- `studio/src/shared/studio-bridge-contract.ts`
- `studio/src/main/studio-ipc.ts`
- `studio/src/preload/studio-bridge-api.ts`
- `cli/web/src/pages/SettingsPage.tsx`
- `cli/web/src/components/Sidebar.tsx`

## 7. 验收标准

- [ ] 桌面主壳中可以进入 Settings / Tools
- [ ] 页面骨架不依赖旧 Web 壳作为运行时主实现
- [ ] 页面容器、展示组件、hook、bridge 边界清晰
- [ ] 空态、错误态、禁用态在 UI 上真实可见
- [ ] 没有新增第二个 mode 真入口

## 8. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 把旧 `cli/web` 页面直接搬进桌面主壳 | 只保留信息架构与交互参考，实际落点写死在 `studio/src/renderer/**` |
| 页面骨架过度抽象 | 先完成容器和状态边界，再让后续子任务填具体面板 |
| 与 Phase 5 project-aware shell 冲突 | 只复用 shell，不改 shell 的主叙事 |

## 9. 测试策略

- 单元测试：
  - 页面路由 / 入口选择
  - sidebar 入口显隐
  - 状态分支渲染
- 集成测试：
  - 桌面主壳进入 Settings / Tools
  - bridge 未就绪时的降级展示
- 手工验证：
  - 从主壳打开 Settings / Tools
  - 最小宽度下仍可操作

## 10. 完成定义

1. Settings / Tools 在桌面主壳中有稳定入口
2. 页面骨架能承接后续 Providers / Memory / MCP / Skills 子任务
3. 旧 Web 壳只剩参考意义，不再是主实现落点
