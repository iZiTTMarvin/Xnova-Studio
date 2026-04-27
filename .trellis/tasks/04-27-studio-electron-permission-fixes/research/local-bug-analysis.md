# 本地 Bug 分析摘录

## Electron 启动失败

- `electron-vite` 5.0.0 的 `getElectronPath()` 会调用 `require.resolve('electron')`。
- pnpm isolated 模式下，`electron` 只存在于 `apps/studio/node_modules/electron`，不一定能被 `electron-vite` 自身依赖树解析到。
- 推荐修复是根目录 `.npmrc` 增加 `public-hoist-pattern[]=electron`，避免使用过宽的 `shamefully-hoist=true`。

## 写文件被静默拒绝

- `write_file` / `edit_file` 不走交互权限弹窗；只有 `bash` / `git` / `kill_shell` 走 `PermissionDialog`。
- Studio renderer 的 `selectedProjectPath` 与 main host 的 `hostState.workspacePath` 可能不一致。
- runtime 实际 `cwd` 可能来自 `request.projectPath`，但权限判断基准使用 `hostState.workspacePath`。
- 当用户选择项目 B，但 host workspace 仍是 A 时，项目 B 内写入会被误判为 `outside-workspace`。

## 权限原因丢失

- `StudioRuntimeService` 的 `PermissionResolution` 已有 `reason`。
- `packages/runtime/src/create-runtime.ts` 当前只把 `resolution.allow` 传给 `AgentLoop`。
- `packages/core/src/agent-loop.ts` 当前只接收 boolean，并把所有拒绝硬编码成 `rejected by user`。
- 完整修复需要把权限 resolution 作为结构化结果传过 core/runtime 边界。
