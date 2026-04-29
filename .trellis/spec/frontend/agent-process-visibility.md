# Agent 过程可见性专项规范

> 本规范约束 Studio renderer 如何展示 agent 思考、模型请求、工具准备、工具执行、工具结果与 warmup 状态。适用范围：`apps/studio/src/renderer/**`、`apps/studio/src/shared/**`，以及与展示事件直接相关的 main/preload bridge contract。

## 当前事实

- `apps/studio/src/renderer/stores/runtime-store.ts` 是 runtime 事件落到 live conversation 的主要状态入口。
- `ConversationTimeline.tsx` 负责持久化消息、live assistant 消息、thinking placeholder、活动指示器和工具行渲染。
- `ReasoningRow.tsx` 已支持实时思考展开、完成后折叠和计时。
- `ToolActionRow.tsx` 当前直接根据真实 `tool.status` 展示 running/done/error；如果工具很快完成，running 视觉态可能短到用户看不到。
- `ToolActivityGroupRow.tsx` 只负责工具组展开/折叠，不保证单个动作类工具的最小 running 可见时间。

## 场景：Studio 必须展示 Agent 过程，而不是只展示最终答案

### 1. Scope / Trigger

- 触发条件：
  - 修改 runtime 事件到 renderer store 的映射
  - 修改 `ConversationTimeline`、`ReasoningRow`、`ToolActionRow`、`ToolActivityGroupRow`
  - 新增 `tool_intent / tool_args_delta / tool_ready`
  - 新增 runtime warmup 状态展示
  - 修改历史会话回放中的 thinking/tool block 呈现

### 2. Signatures

```ts
type ToolDisplayStatus =
  | 'pending'
  | 'running'
  | 'done'
  | 'error'

interface ToolRowModel {
  id: string
  toolCallId: string
  toolName: string
  args: Record<string, unknown>
  status: 'running' | 'done' | 'error'
  success?: boolean
  durationMs?: number
  resultSummary?: string
  resultFull?: string
}

interface RuntimeWarmupViewState {
  status: 'idle' | 'warming' | 'ready' | 'stale' | 'failed'
  label: string
}
```

### 3. Contracts

- Renderer store 必须保存真实 runtime 状态；展示层可以为了可感知性延迟视觉状态，但不得篡改持久化 block。
- 动作类工具的 running 视觉态必须有最小可见时间；取消、失败、组件卸载时必须清理 timer。
- 探索类工具可以继续走工具组聚合；动作类工具需要更明确地展示目标、状态和结果摘要。
- `tool_intent` 到达时，UI 可以创建 pending 工具壳；如果 provider 不支持 intent，必须兼容从 `tool_start` 直接创建 running 工具行。
- `tool_args_delta` 只能展示安全摘要，例如 path、command 摘要、行数、文件名；不得展示 `write_file.content` 全文。
- thinking 应独立成可折叠行；实时思考中默认展开，完成后可自动折叠，但用户手动展开状态要保留。
- warmup 状态必须是辅助提示，不能禁用输入框；submit 仍由 runtime-ready / workspace 门禁控制。
- AgentLoop 触发轮次预算或低进展保护时，renderer 必须展示可读 warning；终态文案应表达“已触发安全停止”，不能伪装成普通成功，也不能留下 pending/running 工具 spinner。
- bash 工具返回 `[工具策略提示]` 这类结构化失败摘要时，工具行必须把“建议改用哪个工具”作为可见摘要展示，不能只显示泛化的命令失败或退出码。

### 4. Validation & Error Matrix

| 条件 | 处理方式 |
|---|---|
| 工具 100ms 内完成，用户看不到 running | 动作类工具用展示层 min-visible timer |
| 取消 run 后 spinner 继续显示 | 必须立即清 timer 并切到取消/停止态 |
| `tool_args_delta` 包含文件全文 | 只保留摘要，不渲染全文 |
| provider 不支持 intent | 从 `tool_start` 补建工具行 |
| warmup failed | 显示“运行时准备失败，将在提交时重试”，但不禁用 composer |
| thinking 内容为空但模型已开始推理 | 展示 thinking placeholder 和计时 |
| AgentLoop 达到轮次预算或低进展阈值 | 显示安全停止 warning，并用终态状态块说明“已触发安全停止” |
| bash 因 Windows 工具策略拦截返回 hint | 显示建议工具，例如“建议工具: read_file / write_file / glob”，帮助用户理解下一步 |

### 5. Good / Base / Bad Cases

- Good：
  - 用户发送后立即看到“正在准备运行时 / 正在请求模型 / 思考中 / 准备调用工具 / 正在执行工具”
  - 工具参数安全摘要随事件更新
  - 工具结果显示成功/失败和简短摘要
- Base：
  - 至少保证 `tool_start` 能插入 running 行，`tool_end` 能更新 done/error
- Bad：
  - UI 长时间空白，直到最终答案出现
  - 工具只在完成后闪一下成功，没有过程
  - 为展示方便把 store 里的真实状态延迟写入

### 6. Tests Required

- `ToolActionRow` 组件测试：
  - 快速 `running -> done` 至少保持指定视觉时间
  - error / cancel / unmount 清理 timer
- `runtime-store` 测试：
  - `tool_intent/tool_args_delta/tool_ready/tool_start/tool_end` 状态机
  - 不支持 intent 时从 `tool_start` 补行
- `conversation-render-rows` 测试：
  - 动作类工具单独展示，探索类工具分组展示
- `ConversationTimeline` 测试：
  - warmup / thinking / tool pending / running / done 都能渲染
- `runtime-store` 测试：
  - AgentLoop guard warning 能追加 system warning
  - `budget_exceeded/stalled/max_turns` 终态显示为安全停止，而非普通完成
- `tool-event-summary` 测试：
  - bash 工具策略 hint 能从 resultSummary 中提取为可读摘要，并标记为错误严重度

### 7. Wrong vs Correct

#### Wrong

```tsx
const isRunning = tool.status === 'running'
return isRunning ? <Spinner /> : <IconCheck />
```

问题：真实状态虽然正确，但极快工具会让 spinner 没有机会被用户看见。

#### Correct

```tsx
const displayStatus = useMinimumVisibleRunningStatus(tool.status, {
  enabled: isActionTool(tool.toolName),
  minVisibleMs: 600,
})
```

真实状态仍由 store 决定，展示层只保证动作过程可感知。

## 场景：Warmup 状态在 UI 中必须可解释但不阻塞

### 1. Scope / Trigger

- 触发条件：
  - 新增 `runtime.warmup.status_changed` 事件
  - 修改 `useStudioBridge` 订阅
  - 修改 `StudioHomePage`、composer 附近状态文案、上下文条

### 2. Signatures

```ts
interface RuntimeWarmupStatusChangedEvent {
  status: 'idle' | 'warming' | 'ready' | 'stale' | 'failed'
  cwd: string
  selectionKey?: string
  durationMs?: number
  error?: string
}
```

### 3. Contracts

- `warming` 文案：“正在准备运行时...”
- `ready` 文案：“运行时已就绪”
- `stale` 文案：“运行时配置变化，正在重新准备...”
- `failed` 文案：“运行时准备失败，将在提交时重试”
- warmup 文案只解释后台准备状态，不替代 runtime inspect 的 ready/not-ready 门禁。
- renderer 不得展示 cwd 之外的敏感细节，不得展示 system prompt 或 API 配置。
- renderer 必须在当前 `agent / provider / model / mode` 确定后请求 selection-aware warmup，并只接收匹配当前 `selectionKey` 的 warmup 状态；旧模型或旧 Agent 的 `ready` 事件不能让当前 UI 显示“运行时已就绪”。

### 4. Validation & Error Matrix

| 条件 | 处理方式 |
|---|---|
| warmup 正在进行 | composer 可用性按 runtime-ready 判断，不因 warmup 禁用 |
| warmup ready | 下次 submit 可走 fast path，但 UI 只显示“已就绪” |
| warmup failed | 显示提示，submit 走 slow path |
| workspace 切换 | 旧 warmup 状态不得继续显示在新 workspace |

### 5. Good / Base / Bad Cases

- Good：用户知道后台在准备，不会以为 app 卡死。
- Base：至少显示 warming/failed。
- Bad：warming 期间直接禁用输入，或 failed 后不允许提交。

### 6. Tests Required

- `useStudioBridge` 订阅 warmup status 并在 workspace 切换时清理旧状态。
- `StudioHomePage` 显示正确文案。
- shared contract/preload 校验 status 枚举。

### 7. Wrong vs Correct

#### Wrong

```ts
if (warmupStatus !== 'ready') disableComposer()
```

#### Correct

```ts
const composerDisabled = runtimeStatus !== 'ready' || !workspacePath
const warmupLabel = getWarmupStatusLabel(warmupStatus)
```

warmup 是体验提示和性能优化，不是发送消息的唯一门禁。
