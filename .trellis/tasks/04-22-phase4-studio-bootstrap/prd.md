# [Phase 4 · 02] Studio Bootstrap — Electron Project Skeleton and Tooling Baseline

> **Phase**：Phase 4 Electron Host · 子任务 A
> **Priority**：P0
> **Status**：planning
> **Source**：[`docs/implement/phase4-electron-host.md`](../../../docs/implement/phase4-electron-host.md) §任务清单 A

---

## 1. Problem

当前仓库没有 `studio/` 工程，因此 Electron host 还没有任何可承载代码的目录、脚本或构建基线。后续 main / preload / renderer 子任务没有稳定落点，也无法进行最小启动验证。

## 2. Goal

建立 `studio/` 工程骨架，使后续子任务可以在一个明确的 Electron 项目内增量实现，而不是边写边定工程结构。

## 3. Scope

### In

- 新建 `studio/`
- 新建 `src/main` / `src/preload` / `src/renderer`
- 建立 `package.json`、`tsconfig`、开发与构建脚本
- 建立最小 HTML / renderer 入口
- 建立 Electron 主入口占位与 preload 入口占位
- 明确开发模式与产物目录

### Out

- 不实现具体业务 IPC
- 不实现 workspace 打开流程
- 不实现 runtime 请求
- 不做完整 UI

## 4. Dependencies

- **Requires**：`runtime-boundary.md` 与目录边界已读完
- **Blocks**：Phase 4 其余 4 个子任务

## 5. Subtasks

- [ ] 创建 `studio/` 目录与基础文件
- [ ] 确定 `main / preload / renderer` 的入口文件命名与目录结构
- [ ] 确定开发启动方式与构建命令
- [ ] 确定产物目录与静态资源入口
- [ ] 跑通一次最小空窗口启动或等价构建验证

## 6. Related Files

- `studio/package.json`
- `studio/tsconfig*.json`
- `studio/src/main/index.ts`
- `studio/src/preload/index.ts`
- `studio/src/renderer/main.tsx`
- `studio/src/renderer/index.html`

## 7. Acceptance Criteria

- [ ] `studio/` 工程结构完整存在
- [ ] 目录命名与分层符合 Trellis 规范
- [ ] 有清晰的开发启动命令
- [ ] 有清晰的构建命令
- [ ] 至少能完成一次最小启动或最小构建验证

## 8. Risks & Mitigations

| 风险 | 缓解 |
|---|---|
| 工程骨架过重，提前引入不必要工具链 | 只引入支撑 Phase 4 最小运行的依赖 |
| 路径结构混乱，后续 main/preload/renderer 继续漂移 | 在本任务里一次锁定目录落点和入口命名 |
| 只建目录不做验证，后续才发现工程跑不起来 | 本任务末尾必须跑最小启动或构建 smoke |

## 9. Testing Strategy

- `studio` 最小类型检查
- `studio` 最小构建或空窗口启动
- 路径与入口文件存在性检查

## 10. Definition of Done

1. `studio/` 工程骨架可被后续子任务直接复用
2. 启动 / 构建命令已明确
3. 不需要再为“工程放哪、怎么起”重新讨论
