<!-- TRELLIS:START -->
# Trellis Instructions

These instructions are for AI assistants working in this project.

Use the `/trellis:start` command when starting a new session to:
- Initialize your developer identity
- Understand current project context
- Read relevant guidelines

Use `@/.trellis/` to learn:
- Development workflow (`workflow.md`)
- Project structure guidelines (`spec/`)
- Developer workspace (`workspace/`)

If you're using Codex, project-scoped helpers may also live in:
- `.agents/skills/` for reusable Trellis skills
- `.codex/agents/` for optional custom subagents

Keep this managed block so 'trellis update' can refresh the instructions.

<!-- TRELLIS:END -->

## 技术决策记录

### Windows 终端中文乱码修复 (2026-04-25)
- **问题**: Electron 主进程在 Windows 控制台输出中文时乱码（控制台默认代码页 GBK 936）。
- **根因**: `execSync('chcp 65001')` 在子进程中执行，无法修改当前进程（Electron）的控制台代码页。
- **方案**: 开发模式下通过 `apps/studio/scripts/dev.js` 启动脚本，在启动 `electron-vite` 之前先执行 `chcp 65001`。由于子进程与父进程共享控制台，代码页修改是全局的，Electron 会继承 UTF-8 代码页。
- **文件**: `apps/studio/scripts/dev.js`, `apps/studio/package.json`

### 发送消息后输入框未清空 (2026-04-25)
- **问题**: 用户发送消息后，输入框仍然保留原内容。
- **根因**: `submitPrompt` 在 `bridge.runtime.submit` 成功后会同步执行 `getSnapshot` 和 `inspectRuntime`。如果这些后续步骤抛出异常（如网络抖动、inspector 错误），`submitPrompt` 会返回 `ok: false`，导致前端 `handleSubmitPrompt` 不执行 `setComposerInput('')`。
- **方案**:
  1. 将 `submitPrompt` 中的状态刷新逻辑移入异步 fire-and-forget 任务，并用 `try/catch` 包裹，确保 `bridge.runtime.submit` 成功后一定返回 `ok: true`。
  2. 在 `handleSubmitPrompt` 中，调用 `submitPrompt` 之前立即清空输入框；若最终返回失败或抛出异常，再恢复输入内容。
- **文件**: `apps/studio/src/renderer/hooks/useStudioBridge.ts`, `apps/studio/src/renderer/pages/StudioHomePage.tsx`

### Git 错误输出污染控制台 (2026-04-25)
- **问题**: `getGitBranch` 在非 git 仓库目录执行时，`execSync` 将 `fatal: not a git repository` 输出到父进程 stderr。
- **根因**: Node.js `execSync` 在命令失败时默认将子进程 stderr 转发到父进程 stderr，即使被 try/catch 捕获。
- **方案**: 将 `execSync` 替换为 `spawnSync`，并显式设置 `stdio: ['pipe', 'pipe', 'ignore']`，完全阻止 stderr 泄漏。
- **文件**: `packages/persistence/src/persistence/session-utils.ts`
