# Xnova-Code Studio 改进计划

> 审查日期: 2026-04-25
> 审查方法: 全量源码审查 + TypeCheck 验证 + OpenCowork 架构对比
> 当前状态: TypeCheck 全通过 (12 packages + Studio, exit 0)

---

## 改进项总览

| 优先级 | 编号 | 标题 | 严重程度 | 预计工作量 |
|--------|------|------|----------|-----------|
| P0 | IMP-001 | 权限系统重构：bash/git 工具不可用 | **致命** | 1-2 天 |
| P0 | IMP-002 | 用户交互实现：AskUserQuestion 失效 | **致命** | 1 天 |
| P0 | IMP-003 | 首次引导流程：API Key 配置向导 | **致命** | 1 天 |
| P1 | IMP-004 | Markdown 渲染引擎 | 严重 | 2 天 |
| P1 | IMP-005 | 工具调用可视化卡片 | 严重 | 2 天 |
| P1 | IMP-006 | Thinking 过程折叠展示 | 严重 | 0.5 天 |
| P1 | IMP-007 | 代码高亮 | 严重 | 0.5 天 |
| P2 | IMP-008 | SubAgent 可视化增强 | 中等 | 1-2 天 |
| P2 | IMP-009 | 终端/Bash 输出实时展示 | 中等 | 1-2 天 |
| P2 | IMP-010 | 文件 Diff 预览面板 | 中等 | 1 天 |
| P2 | IMP-011 | bootstrap 环境适配修复 | 中等 | 0.5 天 |
| P2 | IMP-012 | RuntimeManager 生命周期增强 | 中等 | 1 天 |
| P3 | IMP-013 | 自动更新 (electron-updater) | 低 | 1 天 |
| P3 | IMP-014 | 崩溃恢复与 OOM 检测 | 低 | 1 天 |
| P3 | IMP-015 | workspace trust 安全门禁 | 低 | 0.5 天 |
| P3 | IMP-016 | cleanup-service 迁移 | 低 | 0.5 天 |
| P3 | IMP-017 | validators 瘦身 (zod 化) | 低 | 1-2 天 |
| P3 | IMP-018 | 生产级打包与签名 | 低 | 2 天 |

---

## P0: 致命级 — 阻塞基本使用

### IMP-001: 权限系统重构

**问题描述:**
`studio-runtime-service.ts` 中 `defaultResolvePermission()` 将 `bash`、`git`、`kill_shell` 硬编码为 `allow: false`（第 191-196 行）。这意味着 Agent 在 Studio 中无法执行任何 shell 命令，而 shell 命令是 coding agent 最核心的能力。

**当前代码位置:**
- `apps/studio/src/main/studio-runtime-service.ts` L163-L218

**当前行为:**
```typescript
const RESTRICTED_TOOL_NAMES = new Set(['bash', 'git', 'kill_shell'])
// → 匹配时直接返回 { allow: false, reason: 'restricted-tool' }
```

**期望行为:**
所有工具权限请求应该通过 IPC 推送到 Renderer，由用户在 UI 弹窗中决策：
1. 只读工具 (`read_file`, `glob`, `grep`) → 自动放行
2. workspace 内写入工具 (`write_file`, `edit_file`) → 自动放行（在 workspace scope 内）
3. 危险工具 (`bash`, `git`, `kill_shell`) → 弹出 PermissionDialog 让用户确认
4. 支持 "本次会话记住" 选项

**需要新增的文件:**
- `apps/studio/src/renderer/components/PermissionDialog.tsx` — 权限确认弹窗 UI
- `apps/studio/src/renderer/components/PermissionDialog.css`

**需要修改的文件:**
- `apps/studio/src/main/studio-runtime-service.ts` — `defaultResolvePermission` 改为通过 IPC 推送权限请求
- `apps/studio/src/main/studio-ipc.ts` — 新增 `permission:request` / `permission:respond` 通道
- `apps/studio/src/preload/studio-ipc-contract.ts` — 新增权限相关 channel 常量
- `apps/studio/src/shared/studio-bridge-contract.ts` — 新增权限相关类型定义
- `apps/studio/src/renderer/hooks/useStudioBridge.ts` — 处理权限请求事件
- `apps/studio/src/renderer/pages/StudioHomePage.tsx` — 挂载 PermissionDialog

**设计要点:**
- Main 进程发起权限请求后，通过 `BrowserWindow.webContents.send('permission:request', ...)` 推送到 Renderer
- Renderer 弹出 `PermissionDialog`，用户操作后通过 `ipcRenderer.invoke('permission:respond', ...)` 回传决策
- Main 用 `Promise + resolve callback` 等待 Renderer 响应
- 超时兜底：30 秒无响应自动 deny

**验收标准:**
1. [ ] Agent 能成功执行 `bash` 工具（如 `ls`, `npm test` 等）
2. [ ] Agent 执行 `bash` 时弹出权限确认弹窗
3. [ ] 用户点击 "允许" 后工具正常执行
4. [ ] 用户点击 "拒绝" 后工具优雅失败
5. [ ] "本次会话记住" 勾选后同类工具不再弹窗
6. [ ] 超时 30 秒自动 deny
7. [ ] TypeCheck 通过

---

### IMP-002: 用户交互实现

**问题描述:**
`studio-runtime-service.ts` 中 `requestUserInput` 永远返回 `{ cancelled: true }`（第 276-281 行）。这导致 `AskUserQuestionTool` 完全失效，Agent 无法在执行过程中向用户提问。

**当前代码位置:**
- `apps/studio/src/main/studio-runtime-service.ts` L276-L281

**当前行为:**
```typescript
async requestUserInput(_input) {
  return { answers: {}, cancelled: true }
}
```

**期望行为:**
通过 IPC 推送到 Renderer，弹出 `UserQuestionDialog`，支持：
- text 输入
- select 单选
- multiselect 多选

**需要新增的文件:**
- `apps/studio/src/renderer/components/UserQuestionDialog.tsx` — 用户提问弹窗 UI
- `apps/studio/src/renderer/components/UserQuestionDialog.css`

**需要修改的文件:**
- `apps/studio/src/main/studio-runtime-service.ts` — `requestUserInput` 改为通过 IPC 推送
- `apps/studio/src/main/studio-ipc.ts` — 新增 `user-input:request` / `user-input:respond` 通道
- `apps/studio/src/preload/studio-ipc-contract.ts` — 新增通道常量
- `apps/studio/src/shared/studio-bridge-contract.ts` — 新增类型
- `apps/studio/src/renderer/hooks/useStudioBridge.ts` — 处理用户提问事件
- `apps/studio/src/renderer/pages/StudioHomePage.tsx` — 挂载 UserQuestionDialog

**设计要点:**
- 与 IMP-001 的 IPC 推送机制复用相同模式
- Dialog 需要支持多种输入类型（text/select/multiselect）
- 同样有超时兜底（60 秒无响应返回 cancelled）

**验收标准:**
1. [ ] `AskUserQuestionTool` 能弹出用户提问弹窗
2. [ ] 用户填写后答案正确回传到 Agent
3. [ ] 用户取消时优雅处理
4. [ ] 支持 text/select/multiselect 三种输入类型
5. [ ] TypeCheck 通过

---

### IMP-003: 首次引导流程

**问题描述:**
新用户打开 Studio 后，没有 API Key 配置引导。用户不知道如何开始使用。

**当前状态:**
- `StudioSettingsDialog` 已存在 Provider 配置功能
- 但没有首次启动时的自动引导

**期望行为:**
1. 检测 `~/.xnovacode/config.toml` 中是否有有效的 API Key
2. 没有时自动弹出 `SetupWizard` 对话框
3. 引导用户：选择 Provider → 填写 API Key → 选择默认 Model → 验证连通性
4. 验证通过后写入配置，关闭向导

**需要新增的文件:**
- `apps/studio/src/renderer/components/SetupWizard.tsx` — 首次配置向导 UI
- `apps/studio/src/renderer/components/SetupWizard.css`

**需要修改的文件:**
- `apps/studio/src/renderer/pages/StudioHomePage.tsx` — 检测是否需要弹出向导
- `apps/studio/src/renderer/hooks/useStudioBridge.ts` — 增加 provider 配置状态检测

**设计要点:**
- 步骤式引导（Step 1/2/3）
- 利用现有 `settingsApi.testProviderConnection()` 验证连通性
- 利用现有 `settingsApi.saveProviderSettings()` 保存配置
- 向导完成后自动刷新 runtime inspect 状态

**验收标准:**
1. [ ] 首次启动（无 config.toml）时自动弹出向导
2. [ ] 向导引导用户完成 Provider + API Key + Model 配置
3. [ ] 连通性验证成功后保存配置
4. [ ] 向导关闭后 runtime 状态自动刷新为 ready
5. [ ] 已配置用户启动时不再弹出向导
6. [ ] TypeCheck 通过

---

## P1: 严重级 — 影响核心体验

### IMP-004: Markdown 渲染引擎

**问题描述:**
当前对话回复以纯文本展示，不支持 Markdown 格式化。Agent 回复的代码块、列表、表格、链接等都无法正确渲染。

**当前代码位置:**
- `apps/studio/src/renderer/components/ConversationTimeline.tsx`
- `apps/studio/src/renderer/hooks/useStudioBridge.ts` 中的 `liveConversation.assistantText`

**需要新增的依赖:**
- `react-markdown` — Markdown 渲染
- `remark-gfm` — GitHub Flavored Markdown 支持
- `rehype-highlight` 或 `shiki` — 代码高亮（可与 IMP-007 合并）

**需要新增的文件:**
- `apps/studio/src/renderer/components/MarkdownRenderer.tsx` — 统一 Markdown 渲染组件
- `apps/studio/src/renderer/components/MarkdownRenderer.css`

**需要修改的文件:**
- `apps/studio/src/renderer/components/ConversationTimeline.tsx` — 使用 MarkdownRenderer 渲染消息
- `apps/studio/package.json` — 添加依赖

**验收标准:**
1. [ ] Agent 回复中的代码块正确渲染（带语法高亮）
2. [ ] 列表、表格、链接等 Markdown 元素正确展示
3. [ ] 行内代码 (`code`) 有样式区分
4. [ ] 长代码块有横向滚动
5. [ ] 流式输出时 Markdown 渐进渲染不闪烁

---

### IMP-005: 工具调用可视化卡片

**问题描述:**
当前 `liveConversation.toolEvents` 已经收集了工具调用事件数据，但 UI 只是基础展示。需要将每次工具调用渲染为可视化卡片。

**当前数据源:**
- `useStudioBridge.ts` L486-L537 已正确处理 `tool_start` / `tool_end` 事件

**需要新增的文件:**
- `apps/studio/src/renderer/components/ToolCallCard.tsx` — 工具调用卡片
- `apps/studio/src/renderer/components/ToolCallCard.css`

**需要修改的文件:**
- `apps/studio/src/renderer/components/ConversationTimeline.tsx` — 插入工具调用卡片

**卡片内容:**
- 工具图标 + 工具名（如 `bash`, `read_file`, `write_file`）
- 关键参数摘要（如 bash 的 command, read_file 的文件路径）
- 执行状态标签（运行中 spinner / 成功 ✓ / 失败 ✗）
- 耗时显示
- 可折叠的详细参数和结果

**验收标准:**
1. [ ] 每次工具调用渲染为独立卡片
2. [ ] 运行中显示 spinner 动画
3. [ ] 完成后显示成功/失败状态
4. [ ] 显示工具执行耗时
5. [ ] 可点击展开详细参数和结果

---

### IMP-006: Thinking 过程折叠展示

**问题描述:**
`liveConversation.thinkingText` 已收集 thinking 数据，但 UI 未展示或展示方式不够直观。

**需要新增的文件:**
- `apps/studio/src/renderer/components/ThinkingBlock.tsx` — Thinking 折叠展示组件
- `apps/studio/src/renderer/components/ThinkingBlock.css`

**需要修改的文件:**
- `apps/studio/src/renderer/components/ConversationTimeline.tsx` — 插入 ThinkingBlock

**验收标准:**
1. [ ] Thinking 内容显示在独立的可折叠区域
2. [ ] 默认折叠，点击展开
3. [ ] 视觉样式与正式回复区分（半透明/斜体/灰色背景等）
4. [ ] 流式输出时平滑更新

---

### IMP-007: 代码高亮

**问题描述:**
Agent 回复中的代码块无语法高亮，影响可读性。

**实现方式:**
- 与 IMP-004 合并，在 `MarkdownRenderer` 中集成代码高亮
- 推荐使用 `shiki`（支持主题切换）或 `prism-react-renderer`

**验收标准:**
1. [ ] 常见语言（TS/JS/Python/Bash/JSON/CSS/HTML）正确高亮
2. [ ] 暗色主题下的高亮配色

---

## P2: 中等级 — 提升体验

### IMP-008: SubAgent 可视化增强

**问题描述:**
SubAgent 执行过程缺少直观的可视化。当前 `selectedSubagentEntry` 已有数据但展示简陋。

**需要修改的文件:**
- `apps/studio/src/renderer/pages/StudioHomePage.tsx` L587-L643 的 subagent 展示区

**增强内容:**
- SubAgent 执行进度条
- 子任务调用树状展示
- 并行 SubAgent 的甘特图式时间线
- SubAgent 工具调用卡片复用

**验收标准:**
1. [ ] SubAgent 有进度状态展示
2. [ ] 支持查看子 Agent 的工具调用详情

---

### IMP-009: 终端/Bash 输出实时展示

**问题描述:**
Agent 执行 bash 命令时，用户看不到实时输出，只能等待执行完成后看结果摘要。

**需要新增的文件:**
- `apps/studio/src/renderer/components/BashOutputPanel.tsx` — 终端输出面板

**需要修改的文件:**
- `apps/studio/src/renderer/components/ToolCallCard.tsx` — bash 类工具的展开区域使用终端面板

**验收标准:**
1. [ ] bash 命令输出实时流式展示
2. [ ] 终端风格渲染（等宽字体、暗色背景）
3. [ ] 长输出可滚动

---

### IMP-010: 文件 Diff 预览面板

**问题描述:**
Agent 修改文件后，用户看不到修改了什么。

**需要新增的依赖:**
- `diff2html` 或 `@monaco-editor/react`（轻量级可选 `diff2html`）

**需要新增的文件:**
- `apps/studio/src/renderer/components/FileDiffPanel.tsx` — Diff 展示面板
- `apps/studio/src/renderer/components/FileDiffPanel.css`

**验收标准:**
1. [ ] `write_file` / `edit_file` 工具的结果展示 diff
2. [ ] diff 有行号和增删着色

---

### IMP-011: bootstrap 环境适配修复

**问题描述:**
`packages/core/src/bootstrap.ts` 中有几处 Electron 环境不适用的代码。

**具体问题:**

1. **L543** `isDevMode` 用 `process.argv[1].endsWith('.ts')` 判断：
   - Electron 环境下 `process.argv[1]` 是 main.js 路径，此判断不准确
   - 修复：增加 `app.isPackaged` 等 Electron 环境检测

2. **L640** `process.on('exit')` 注册在每次 `bootstrapAll` 调用时：
   - 多次调用会重复注册
   - 修复：加 flag 防止重复注册

3. **模块级单例** `mcpManager`, `fileIndex`, `memoryManagerInstance` 等：
   - 多 workspace 切换时旧实例不会被清理
   - 修复：`bootstrapAll` 的 cwd 变化时主动清理旧实例

**需要修改的文件:**
- `packages/core/src/bootstrap.ts`

**验收标准:**
1. [ ] `isDevMode` 在 Electron dev 和 prod 模式下正确识别
2. [ ] `process.on('exit')` 不重复注册
3. [ ] workspace 切换时旧 bootstrap 实例被正确清理
4. [ ] TypeCheck 通过

---

### IMP-012: RuntimeManager 生命周期增强

**问题描述:**
`studio-runtime-manager.ts` 没有 runtime 实例过期清理机制，长时间运行可能内存泄漏。

**需要修改的文件:**
- `apps/studio/src/main/studio-runtime-manager.ts`

**增强内容:**
- 添加 TTL 过期机制（如 30 分钟无活动自动 dispose）
- 添加最大实例数限制
- 添加 dispose 时的资源清理日志

**验收标准:**
1. [ ] 超过 TTL 的 runtime 实例自动释放
2. [ ] dispose 时正确清理所有资源
3. [ ] 有日志记录生命周期事件

---

## P3: 低优先级 — 完善生产质量

### IMP-013: 自动更新

**需要新增的依赖:**
- `electron-updater`

**需要新增的文件:**
- `apps/studio/src/main/updater.ts` — 自动更新逻辑

**验收标准:**
1. [ ] 启动时检查更新
2. [ ] 有更新时通知用户
3. [ ] 支持静默下载 + 重启安装

---

### IMP-014: 崩溃恢复与 OOM 检测

**需要修改的文件:**
- `apps/studio/src/main/lifecycle.ts` — 添加 `render-process-gone` 监听

**参考 OpenCowork:**
- `attachWindowCrashLogging()` 模式
- OOM 时自动 reload 并带 recovery 参数

**验收标准:**
1. [ ] Renderer 进程崩溃时自动重载
2. [ ] OOM 时尝试降级恢复
3. [ ] 崩溃日志写入本地文件

---

### IMP-015: workspace trust 安全门禁

**需要从 CLI 移植:**
- `废弃/cli/src/core/workspace-trust.ts`

**需要新增的文件:**
- `packages/platform/src/workspace-trust.ts`
- `apps/studio/src/renderer/components/WorkspaceTrustDialog.tsx`

**验收标准:**
1. [ ] 首次打开不信任目录时弹出警告
2. [ ] 用户确认信任后记录，后续不再弹窗

---

### IMP-016: cleanup-service 迁移

**需要从 CLI 移植:**
- `废弃/cli/src/core/cleanup-service.ts`

**迁移目标:**
- `packages/core/src/cleanup-service.ts`

**验收标准:**
1. [ ] 旧 session 文件自动清理
2. [ ] 过期日志文件自动清理

---

### IMP-017: validators 瘦身

**问题描述:**
`apps/studio/src/preload/studio-validators.ts` 53KB 手写验证器，维护成本高。

**方案:**
- 引入 `zod` 或 `valibot`（推荐 `valibot`，体积更小）
- 估计可从 53KB 缩减到 3-5KB

**验收标准:**
1. [ ] 所有 parse 函数改为 schema 驱动
2. [ ] 验证行为不变（通过现有测试）
3. [ ] TypeCheck 通过

---

### IMP-018: 生产级打包与签名

**需要配置:**
- `electron-builder` 配置
- Windows NSIS / portable 打包
- macOS DMG + notarization（可选）
- GitHub Actions CI/CD

**验收标准:**
1. [ ] `pnpm --filter xnova-studio build` 成功
2. [ ] 产出可分发安装包
3. [ ] 安装后可正常运行

---

## 执行顺序建议

```
第 1-3 天 (P0 全部):
  IMP-001 → IMP-002 → IMP-003
  验收: Agent 能接收消息 → 执行 bash → 返回结果

第 4-7 天 (P1 全部):
  IMP-004+IMP-007 → IMP-005 → IMP-006
  验收: 对话有 Markdown 渲染、代码高亮、工具卡片、Thinking 折叠

第 8-12 天 (P2 全部):
  IMP-011 → IMP-012 → IMP-008 → IMP-009 → IMP-010
  验收: SubAgent 可视化、终端输出、文件 Diff

第 13-18 天 (P3 全部):
  IMP-013 → IMP-014 → IMP-015 → IMP-016 → IMP-017 → IMP-018
  验收: 自动更新、崩溃恢复、安全、清理、打包
```
