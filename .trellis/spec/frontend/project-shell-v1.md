# Project Shell v1 专项规范

> 本规范约束 `apps/studio/src/renderer/**` 当前主线的 **project-aware 主体验**：冷启动恢复、左侧壳、上下文条、模式切换、会话时间线、模型选择器、submit 主链路。目标是确保 Studio 不再退化成“只有壳子、没有对话本身”的假聊天界面。

## 当前事实

- 当前主壳已经落在 `apps/studio/src/renderer/pages/StudioHomePage.tsx`
- 主链路核心由下列实现组成：
  - `useStudioBridge.ts`：冷启动恢复、workspace 打开、runtime inspect / submit、live conversation 状态
  - `ProjectShellSidebar.tsx`：一级导航 + 项目块 / 聊天块
  - `ContextBar.tsx`：工作上下文条
  - `ModeSwitch.tsx`：顶部唯一模式切换入口
  - `ConversationTimeline.tsx`：持久化消息 + 流式消息 + 工具过程
  - `SessionModelPicker.tsx`：会话级 provider / model 选择器
- `apps/studio/src/shared/studio-bridge-contract.ts` 已是 Studio 主链路共享契约事实源：
  - `RuntimeSubmitRequest` 已包含 `sessionId / agentId / providerId / modelId`
  - `StudioShellSnapshot` 已包含 `activeSession.messages`
  - `StudioRuntimeEvent` 已承载 `text_delta / tool_start / tool_end / warning / error` 等流式事件
- `XForge` 当前不是可用模式；点击时必须弹出明确提示，而不是静默切换或继续假装可用。

## 场景：建立 Studio project-aware 主壳的交互契约

### 1. Scope / Trigger

- 触发条件：
  - 改动 `StudioHomePage.tsx`
  - 改动 `useStudioBridge.ts`
  - 改动 `ProjectShellSidebar`、`ModeSwitch`、`ContextBar`
  - 改动 `ConversationTimeline`、`SessionModelPicker`
  - 改动 `startup-route.ts`、`work-context.ts`
  - 改动与会话恢复、模型选择、模式切换、聊天主链路相关的 shared contract
- 这是高风险跨层约束：UI 漂移会让产品从“可用工作台”退回“只显示几张卡片的空壳”。

### 2. Signatures

当前主线应围绕以下接口收敛：

```ts
interface StartupRouteInput {
  recentProject: StudioStartupProjectCandidate | null
  recentSession: StudioStartupSessionCandidate | null
  userOverride?: 'blank-chat' | 'last-session'
}

type StartupRouteResult =
  | { kind: 'blank-chat'; reason: 'user-override' | 'no-recent-project' | 'no-recent-session' }
  | { kind: 'blank-chat'; reason: 'project-missing'; projectPath: string }
  | { kind: 'blank-chat'; reason: 'session-invalid'; projectPath: string; sessionId: string }
  | { kind: 'restore-session'; projectPath: string; sessionId: string }

type PrimaryNavId = 'quick-chat' | 'search' | 'agents' | 'projects' | 'tools'

interface WorkContext {
  projectPath: string | null
  branch: string | null
  agentId: string | null
  modelId: string | null
  mode: 'standard' | 'xforge'
  contextUsageLabel: string | null
  runningSubagents: number
}

interface RuntimeSubmitRequest {
  text: string
  projectPath?: string | null
  sessionId?: string | null
  agentId?: string | null
  providerId?: string | null
  modelId?: string | null
}

interface StudioHostApi {
  bindWorkspace(workspacePath: string): Promise<StudioHostState>
}
```

### 3. Contracts

#### 冷启动与默认入口

- Studio 冷启动必须通过 `resolveStartupRoute(...)` 决定进入：
  - 空白聊天页
  - 恢复最近工作会话
- 默认叙事是“直接进入聊天工作区”，不是 Overview、统计面板或设置页。
- 最近项目路径失效、最近会话损坏时，必须回退到空白聊天页并给出明确提示。

#### 左侧壳

- 当前主线的一级导航固定为：
  1. 新对话
  2. 搜索
  3. Agents
  4. 项目
  5. 工具
- 设置作为底部 utility 入口，不与顶部模式切换竞争主叙事。
- 项目块与聊天块必须独立折叠 / 展开，并各自维护 loading / empty / disabled / ready 状态。
- 已经存在 `shellSnapshot` 时，项目块和聊天块在会话切换、项目刷新等后台加载过程中必须保留已有内容；不要把侧边栏抽屉整块替换成 loading 文案造成闪烁。

#### 上下文条

- 字段顺序固定：
  1. 项目
  2. 分支
  3. Agent
  4. 模型
  5. Context
  6. 运行中的 SubAgent
- 字段展示与点击跳转必须共享同一份 `WorkContext` 事实源。
- 上下文条不得新增第二个模式切换入口。

#### 会话时间线

- `ConversationTimeline` 必须同时展示：
  - 持久化消息
  - 当前待发送的用户消息
  - 流式 assistant 文本
  - thinking 文本
  - 工具开始 / 结束事件
  - system warning / error
- 首轮 submit 尚未落盘出 `activeSession` 时，只要 `liveConversation` 已经存在待发送消息、流式内容或系统错误，renderer 也必须直接进入会话视图；不得继续停留在空白项目入口页。
- 不能只显示会话标题、项目路径、分支和消息条数，而不显示“对话本身”。

#### Codex-like 主界面布局

- 默认首页必须是“中央 composer + 工作上下文条 + 少量建议动作”的项目入口，不允许退回 overview、统计卡片墙或 dashboard 首页。
- 左侧栏固定在视口内，项目块右侧只保留真实可用动作；当前基线为“折叠/展开项目”和“添加新项目”，不要提前加入无实现的筛选、排序按钮。
- 项目块内部必须是 workspace 抽屉结构：项目行负责选择/展开项目，项目下缩进展示该项目的会话，不允许把所有项目和所有会话平铺成两个无归属列表。
- 全局项目 `+` 只打开新 workspace；项目行里的“开始新对话”只清空当前 `selectedSessionId` 并保留该项目作为下一次 submit 的归属。
- 会话页只让 `ConversationTimeline` 成为滚动区；侧边栏、顶部 header 与底部 composer 都必须保持固定，不随消息记录滚动。
- 会话页 composer 必须悬浮在底部且尺寸稳定，不能因为消息条数、工具输出或上下文条变化而向下移动或变高到遮住主内容。
- 工作上下文条应靠近 composer，表示本次发送会携带的项目、分支、Agent、模型、Context 与 SubAgent 状态；不要把它做成远离输入区的 dashboard 卡片。
- assistant 消息优先使用正文排版，user 消息可用轻量气泡区分；不要把所有消息统一包成厚重大卡片。
- 自动滚动策略必须至少区分：
  - 默认跟随流式输出到底部；
  - 用户主动上滚后暂停跟随；
  - 提供显式“回到底部”入口恢复跟随。

#### 模型选择器

- `SessionModelPicker` 必须位于 composer 附近，表示“当前会话要用哪个 provider / model”。
- 选择结果必须进入 `RuntimeSubmitRequest.providerId / modelId`，而不是只改本地展示。
- “默认模型”设置属于设置页；“当前会话模型”属于输入区附近，两者不能混淆。
- renderer 只能调用 shared contract 中定义的 `runtime.submit(...)`；不得 fallback 到 legacy `submitPrompt`。

#### Mode 切换

- `ModeSwitch` 是顶部唯一主切换入口。
- `Standard` 可用；`XForge` 当前点击时必须弹出“暂未开放”提示。
- 模式切换不应隐式清空当前项目、会话、模型或 Agent 选择。

#### runtime-not-ready 门禁

- 未绑定 workspace 或 runtime inspect 非 `ready` 时：
  - composer 发送按钮必须不可用
  - `submitPrompt()` 必须二次拦截，不能只靠视觉提示
- 系统不得在“未就绪”状态下回退到错误目录偷偷执行。
- 当前主 Agent 切换属于 renderer 会话偏好；不得依赖未固化的 `shell.setCurrentPrimaryAgent` 一类隐藏入口。

#### 项目选择与 Host Workspace 同步

- `selectProject(projectPath)` 不只是 renderer 本地选择；它必须先通过 `host.bindWorkspace(projectPath)` 同步 main 侧 `StudioHostState.workspacePath`。
- `host.bindWorkspace(...)` 成功后，renderer 必须用返回的 host state 更新本地状态，再刷新 shell snapshot / runtime inspect。
- `submitPrompt()` 发送前必须二次检查：如果 `selectedProjectPath` 与 `hostState.workspacePath` 不一致，必须先重新绑定 host workspace，再提交。
- 不允许让 `selectedProjectPath`、`hostState.workspacePath`、`RuntimeSubmitRequest.projectPath` 三者长期漂移；当前项目必须成为 submit contract 的项目事实源。

### 4. Validation & Error Matrix

| 条件 | 处理方式 |
|---|---|
| 最近项目路径失效 | 回退到空白聊天页，并显示路径失效提示 |
| 最近会话损坏 | 回退到空白聊天页，并显示会话损坏提示 |
| runtime 未就绪 | 输入区禁用，`submitPrompt()` 返回明确错误 |
| 用户点击 `XForge` | 弹出“暂未开放”提示，不切换成假可用状态 |
| provider / model 只在 UI 改了，submit 不携带 | 视为主链路缺陷，必须修 contract |
| 会话视图只显示元数据，不显示消息流 | 视为 P0 不可用，必须回退 |
| 首轮消息已经发出，但因为 `activeSession` 尚未持久化而仍停留在空白入口页 | 视为 P0 可见性缺陷，必须立即展示 `liveConversation` |
| 工具过程只存在 main 日志，renderer 不显示 | 视为主链路缺口，必须补时间线呈现 |
| renderer 通过 `submitPrompt` / `setCurrentPrimaryAgent` 等旧 fallback 路径工作 | 视为 contract 漂移，必须回到 shared bridge |
| `selectProject` 只更新 renderer 状态，不同步 `host.bindWorkspace` | 视为 workspace 双轨漂移，必须补 shared contract 调用 |
| submit 时 `selectedProjectPath` 与 `hostState.workspacePath` 不一致 | 必须先重新绑定 host workspace，再进入 runtime submit |
| 用户上滚查看历史时仍被流式输出强制拉回底部 | 视为 Phase 5 滚动策略缺陷，必须暂停跟随并展示“回到底部”入口 |
| 会话页 composer 跟随时间线滚动或被长消息挤出可视区 | 视为主工作台布局缺陷，必须恢复底部固定悬浮 |

### 5. Good / Base / Bad Cases

- Good：
  - `resolveStartupRoute(...)` 纯函数决定冷启动结果
  - `useStudioBridge.submitPrompt(...)` 同时做门禁、submit、会话刷新、live conversation 清理
  - `useStudioBridge.selectProject(...)` 先绑定 host workspace，再刷新 shell/runtime 状态
  - `ConversationTimeline` 同时呈现持久化与流式过程
  - `SessionModelPicker` 的选择真正进入 submit contract
- Base：
  - 至少保证“打开 workspace -> 发送 -> 看到回复与工具过程 -> 刷新后还能恢复会话”
- Bad：
  - 首页只是几张状态卡片
  - runtime-not-ready 只是 banner，不是门禁
  - 模型 pill 是静态文案，点不动也不生效

### 6. Tests Required

- 单元测试：
  - `resolveStartupRoute(...)` 覆盖无项目 / 有项目无会话 / 项目失效 / 会话损坏 / 恢复会话
  - `work-context.ts` 断言字段顺序与来源优先级
  - `SessionModelPicker` 断言 provider 切换时默认模型同步
- 集成测试：
  - `useStudioBridge` 的 workspace 门禁与 submit 契约透传
  - `ConversationTimeline` 对 persisted + live conversation 的渲染
  - `ModeSwitch` 点击 `XForge` 的提示行为
  - `renderer-shell.test.tsx` 断言首轮 submit 尚未生成持久化 session 时，仍会立即显示对话流
  - `renderer-shell.test.tsx` / `use-studio-bridge-submit.test.tsx` 断言不再依赖 legacy fallback 语义
  - `use-studio-bridge-submit.test.tsx` 断言 `selectProject` 会调用 `host.bindWorkspace(projectPath)`，且 submit 前会修复 workspace 漂移
- E2E / smoke：
  - 打开 workspace -> 发送消息 -> 收到流式回复与工具过程
  - 重启后恢复最近项目与会话

### 7. Wrong vs Correct

#### Wrong

```tsx
<section>
  <h2>{activeSession.title}</h2>
  <span>{activeSession.messageCount} 条消息</span>
</section>
```

```tsx
<span className="pill">openai / gpt-5.4</span>
```

```ts
if (runtimeStatus !== 'ready') {
  setRuntimeError('未就绪')
}
await bridge.runtime.submit({ text })
```

问题：

- 看不到对话本身
- 模型是静态文案，不是可执行选择
- “未就绪”没有真正拦截 submit

#### Correct

```tsx
<ConversationTimeline
  session={activeSessionDetail}
  liveConversation={liveConversation}
/>

<SessionModelPicker
  settingsApi={settingsApi}
  currentProviderId={currentProviderId}
  currentModelId={currentModelId}
  onChange={setCurrentProviderModel}
/>
```

```ts
if (!hostState.workspacePath?.trim() || runtimeStatus !== 'ready') {
  return { ok: false, error: '请先绑定 Workspace，再开始项目会话。' }
}

await bridge.runtime.submit({
  text: prompt,
  projectPath,
  sessionId: selectedSessionId,
  agentId: currentAgentId,
  providerId: currentProviderId,
  modelId: currentModelId,
})
```

```ts
const boundHostState = await bridge.host.bindWorkspace(projectPath)
setHostState(boundHostState)
```

### 当前代码参考

- 主壳页面：`apps/studio/src/renderer/pages/StudioHomePage.tsx`
- 主桥接 Hook：`apps/studio/src/renderer/hooks/useStudioBridge.ts`
- 冷启动恢复：`apps/studio/src/renderer/utils/startup-route.ts`
- 上下文条事实源：`apps/studio/src/renderer/utils/work-context.ts`
- 共享契约：`apps/studio/src/shared/studio-bridge-contract.ts`

## 反模式

- 不要把 Studio 再做成“看起来像 IDE，实则不能聊天”的假壳。
- 不要让 runtime-not-ready 只是提示文案，不是功能门禁。
- 不要把“默认模型”和“当前会话模型”混成一套状态。
- 不要在顶部以外再放第二个模式切换真入口。
