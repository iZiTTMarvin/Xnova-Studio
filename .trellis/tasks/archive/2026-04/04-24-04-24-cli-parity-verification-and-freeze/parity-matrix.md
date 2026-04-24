# CLI 核心能力对照矩阵（packages/* + apps/studio）

## 当前判定基线

- 旧 CLI 的“事实源”以 `cli/src/commands/**`、`cli/src/ui/**`、`cli/src/runtime/**`、各领域目录为准。
- 当前主线只认 `packages/* + apps/studio`。
- 本矩阵区分三种结论：
  - `已闭环`：Studio 已有真实 UI/API 主链路，且具备测试或显式回归证据。
  - `部分闭环`：能力已迁入 package / service，Studio 仅开放部分入口。
  - `冻结不迁`：属于旧 CLI 壳层或终端/Web 专属体验，不再作为 Studio 主线能力继续迁移。

## 对照矩阵

| 能力 | 旧 CLI 事实源 | 新 package / service | Studio UI / API 落点 | 验证证据 | 结论 |
|---|---|---|---|---|---|
| 聊天提交与流式输出 | `cli/src/ui/useChat.ts`、`cli/src/ui/App.tsx`、`cli/src/runtime/create-runtime.ts` | `packages/runtime/src/create-runtime.ts`、`packages/runtime/src/types.ts` | `apps/studio/src/main/studio-runtime-manager.ts`、`studio-runtime-service.ts`、`useStudioBridge.ts`、`ConversationTimeline.tsx` | `apps/studio/tests/studio-runtime-service.test.ts`、`use-studio-bridge-submit.test.tsx`、`studio-main-flow-regression.test.tsx`、`renderer-shell.test.tsx` | 已闭环 |
| 模型切换 | `cli/src/commands/model.ts`、`cli/src/ui/ModelPicker.tsx`、`cli/src/ui/useChat.ts` | `packages/runtime/src/engine-service-api.ts` 的 `runtime.setModel()` | `SessionModelPicker.tsx`、`useStudioBridge.ts` submit contract、`studio-runtime-service.ts` | `apps/studio/tests/studio-engine-service-api-adapter.test.ts`、`studio-ipc-runtime-submit-provider.test.ts`、`studio-main-flow-regression.test.tsx`、`renderer-shell.test.tsx` | 已闭环 |
| 上下文压缩与快照 | `cli/src/commands/compact.ts`、`cli/src/commands/context.ts`、`cli/src/ui/App.tsx` | `packages/runtime/src/engine-service-api.ts` 的 `runtime.compactContext()` / `runtime.getContextSnapshot()` | 当前未暴露 Studio bridge / renderer 入口 | `packages/runtime/src/__tests__/engine-service-api.test.ts`、`engine-service-api.boundary.test.ts` | 部分闭环：能力已 package 化，Studio 未开放显式入口 |
| 会话恢复 | `cli/src/commands/resume.ts`、`cli/src/ui/ResumePanel.tsx`、`cli/src/ui/useChat.ts` | `packages/runtime/src/engine-service-api.ts` 的 `sessionService.resumeSession()`、`packages/persistence/src/persistence/session-store.ts` | `studio-shell-inspector.ts` 冷启动恢复、`useStudioBridge.ts` 最近会话恢复、`studio-runtime-service.ts` 提交前补历史恢复 | `apps/studio/tests/startup-route.test.ts`、`mode-switch-and-recovery.test.tsx`、`studio-main-flow-regression.test.tsx`、`studio-runtime-service.test.ts` | 已闭环 |
| 会话分叉 | `cli/src/commands/fork.ts`、`cli/src/ui/ForkPanel.tsx`、`cli/src/ui/useChat.ts` | `packages/runtime/src/engine-service-api.ts` 的 `sessionService.forkFromEvent()` | 当前未暴露 Studio bridge / renderer 入口 | `packages/runtime/src/__tests__/engine-service-api.test.ts` | 部分闭环：能力已 package 化，Studio 未开放显式入口 |
| Memory list/search/write/delete/rebuild | `cli/src/commands/remember.ts`、`cli/src/memory/**`、`cli/src/ui/App.tsx` | `packages/runtime/src/engine-service-api.ts` 的 `memoryService.*`、`packages/memory/src/**` | `studio-memory-service.ts` + `memory.getOverview/rebuild`；Studio 设置/工具页当前只开放 overview / rebuild | `packages/runtime/src/__tests__/engine-service-api.test.ts`、`packages/memory/src/__tests__/overview-service.test.ts`、`apps/studio/tests/memory-settings-bridge.test.ts`、`memory-settings-ipc.test.ts`、`memory-settings-page.test.tsx` | 部分闭环：Studio 已验证 overview / rebuild，CRUD 仍停留在 package capability |
| MCP 状态读取 / 管理 | `cli/src/commands/mcp.ts`、`cli/src/mcp/**`、`cli/src/ui/McpStatusView.tsx` | `packages/runtime/src/engine-service-api.ts` 的 `mcpService.*`、`packages/mcp/src/status-service.ts` | `studio-mcp-service.ts`、shared bridge `mcp.*`、Tools 页 | `packages/mcp/src/__tests__/status-service.test.ts`、`apps/studio/tests/mcp-settings-bridge.test.ts`、`mcp-settings-ipc.test.ts`、`mcp-settings-page.test.tsx` | 已闭环 |
| Skills 列表与读取 | `cli/src/commands/skills.ts`、`cli/src/skills/**`、`cli/src/ui/App.tsx` | `packages/runtime/src/engine-service-api.ts` 的 `skillsService.list/getContent/getOverview()`、`packages/skills/src/engine/store.ts`、`plugins-overview-service.ts` | `studio-skills-plugins-service.ts`、shared bridge `skillsPlugins.getOverview`、Tools 页 | `packages/skills/src/__tests__/plugins-overview-service.test.ts`、`apps/studio/tests/skills-plugins-bridge.test.ts`、`skills-plugins-ipc.test.ts`、`skills-plugins-page.test.tsx` | 部分闭环：overview 已进入 Studio，逐条读取未开放显式入口 |
| Usage 汇总 | `cli/src/commands/usage.ts`、`cli/src/observability/token-meter.ts` | `packages/runtime/src/engine-service-api.ts` 的 `usageService.getSummary()` | Studio 当前仅通过 `studio-shell-inspector.ts` 把 message-level usage 带入会话消息；尚无聚合 usage API / 页面 | `packages/runtime/src/__tests__/engine-service-api.test.ts`、`apps/studio/tests/studio-shell-contract-regression.test.ts` | 部分闭环：消息级 usage 可见，聚合 usage 未开放 |
| Cleanup 预览与执行 | `cli/src/commands/gc.ts`、`packages/core/src/cleanup-service.ts` 对应旧实现 | `packages/runtime/src/engine-service-api.ts` 的 `maintenanceService.getStats()/cleanup()`、`packages/core/src/cleanup-service.ts` | 当前未暴露 Studio bridge / renderer 入口 | `packages/runtime/src/__tests__/engine-service-api.test.ts` | 部分闭环：能力已 package 化，Studio 未开放显式入口 |
| Plugin 最小能力 | `cli/src/commands/plugins.ts`、`cli/src/plugin/**` | `packages/runtime/src/engine-service-api.ts` 的 `pluginService.list()`、`packages/plugin/src/registry.ts`、`packages/skills/src/plugins-overview-service.ts` | `skillsPlugins.getOverview` 与 Tools 页插件概览 | `packages/plugin/src/__tests__/registry.test.ts`、`apps/studio/tests/skills-plugins-page.test.tsx` | 已闭环（最小只读概览） |

## Studio 已闭环的核心链路

1. 打开 Workspace。
2. 通过 `main` 的 `studio-runtime-manager` 取得 workspace / session / agent 维度的 runtime / engine service。
3. renderer 通过 shared bridge 发起 `runtime.submit`，并携带 `sessionId / agentId / providerId / modelId`。
4. `ConversationTimeline` 展示持久化消息、流式文本、thinking、tool events、warning / error。
5. 刷新后可通过 shell snapshot 恢复最近项目与会话。
6. Memory / MCP / Skills / Plugins 的当前 Studio 页面全部通过 host API 获取，不再依赖旧 CLI action / command 分发语义。

## 冻结不迁的旧 CLI 壳层

以下内容继续保留在 `cli/` 仅作历史供体或参考，不再作为 Studio 主线验收项：

- `cli/src/commands/bridge.ts`
  - 旧 CLI ↔ Web bridge 壳层，不再迁入 `apps/studio`。
- `cli/src/commands/help.ts`、`exit.ts`、`registry.ts`、`types.ts`
  - 终端命令词法、帮助文案、进程退出属于宿主壳层，不迁入 engine service。
- `cli/src/ui/terminal-screen.ts`、`StatusBar.tsx`、`InputBar.tsx`、`CommandSuggestion.tsx`
  - 终端专属交互，不迁入 renderer 主壳。
- `cli/web/**`
  - 历史 Web Dashboard，不再作为主维护面。

## 冻结边界说明

- `cli/` 继续保留源码，目的是：
  - 提供历史行为对照；
  - 作为 copy-first migration 的供体；
  - 为仍依赖 CLI 的用户保留参考实现。
- `cli/` 不再承担：
  - 新功能首发；
  - Studio 主链路回归验收；
  - runtime / host / renderer 边界定义。
- 当前主线边界只认：
  - `packages/runtime`
  - `packages/core`
  - 各领域 `packages/*`
  - `apps/studio`
