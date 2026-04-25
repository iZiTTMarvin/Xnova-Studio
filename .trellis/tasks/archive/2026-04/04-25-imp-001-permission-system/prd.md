# IMP-001 权限系统重构

## 问题描述

`apps/studio/src/main/studio-runtime-service.ts` 中 `defaultResolvePermission()` 将 `bash`、`git`、`kill_shell` 硬编码为拒绝，导致 Agent 在 Studio 中无法执行 shell 命令。shell 命令是 coding agent 的核心能力，因此当前行为会阻塞基本使用。

## 当前行为

```typescript
const RESTRICTED_TOOL_NAMES = new Set(['bash', 'git', 'kill_shell'])
```

当工具名匹配硬编码黑名单时，直接返回：

```typescript
{ allow: false, reason: 'restricted-tool' }
```

## 期望行为

所有工具权限请求应通过明确策略处理：

1. 只读工具（`read_file`、`glob`、`grep`）自动放行。
2. workspace scope 内的写入工具（`write_file`、`edit_file`）自动放行。
3. 危险工具（`bash`、`git`、`kill_shell`）通过 IPC 推送到 Renderer，由用户在弹窗中确认。
4. 支持“本次会话记住”选项，同类工具在本次会话内不再弹窗。
5. Main 进程等待 Renderer 响应时必须有 30 秒超时兜底，超时自动拒绝。

## 影响文件

### 新增文件

- `apps/studio/src/renderer/components/PermissionDialog.tsx`
- `apps/studio/src/renderer/components/PermissionDialog.css`

### 修改文件

- `apps/studio/src/main/studio-runtime-service.ts`
- `apps/studio/src/main/studio-ipc.ts`
- `apps/studio/src/preload/studio-ipc-contract.ts`
- `apps/studio/src/shared/studio-bridge-contract.ts`
- `apps/studio/src/renderer/hooks/useStudioBridge.ts`
- `apps/studio/src/renderer/pages/StudioHomePage.tsx`

## 设计要点

- Main 进程发起权限请求后，通过 `BrowserWindow.webContents.send('studio:permission:request', request)` 推送到 Renderer。
- Renderer 弹出 `PermissionDialog`，用户操作后通过 `ipcRenderer.invoke('studio:permission:respond', response)` 回传决策。
- Main 侧使用 `Promise + Map<requestId, resolve>` 管理异步权限响应。
- Renderer 只负责展示权限信息和回传用户决策，不直接执行工具或访问 runtime internals。
- 权限响应必须通过 shared contract 建模，避免 main、preload、renderer 各自复制类型。

## 验收标准

1. Agent 能成功执行 `bash` 工具，例如 `ls`、`npm test`。
2. Agent 执行 `bash` 时弹出权限确认弹窗。
3. 用户点击“允许”后工具正常执行。
4. 用户点击“拒绝”后工具优雅失败。
5. 勾选“本次会话记住”后，同类工具在本次会话内不再弹窗。
6. 权限请求 30 秒无响应时自动拒绝。
7. `pnpm typecheck` 通过。

## 测试计划

- `studio-runtime-service.test.ts` 覆盖危险工具 IPC 请求、用户响应、会话记住、超时拒绝、workspace 写入工具自动放行。
- `studio-ipc.test.ts` 覆盖 `studio:permission:respond` 参数校验与回调分发。
- `studio-preload-bridge.test.ts` 覆盖 Renderer 订阅 `studio:permission:request` 与回传 `studio:permission:respond`。
- `PermissionDialog.test.tsx` 覆盖弹窗展示关键参数、危险等级、允许/拒绝与记住选项。
