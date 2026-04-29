# Runtime Warmup 与事件可观测性专项规范

> 本规范约束 Studio 首次响应优化、运行时预热、submit timing、模型请求事件、工具事件的跨层实现。它适用于 `packages/core/**`、`packages/runtime/**`、`packages/providers/**`、`packages/observability/**`、`apps/studio/src/main/**`、`apps/studio/src/shared/**`。

## 当前事实

- `packages/runtime/src/create-runtime.ts` 当前在每次 `RuntimeInstance.submit()` 内先发 `runtime_bootstrap_start`，再等待 `bootstrapAll(input.cwd)` 完成。
- `packages/core/src/bootstrap.ts` 已在内部记录 skills、instructions、hooks、sessionStartHooks、fileIndex、plugins、memory、shellSnapshot、gitContext、systemPrompt、total 等耗时，但还没有逐项透传给 Studio timing summary。
- `apps/studio/src/main/studio-submit-timing.ts` 当前主要记录首个模型请求、首包、首个可见进展；多轮工具反馈后的后续模型请求还没有聚合统计。
- `apps/studio/src/main/studio-ipc.ts` 的 `openWorkspace / bindWorkspace` 当前只更新 host state，不预热 runtime。
- `packages/providers/src/providers/openai-compat.ts` 与 `anthropic.ts` 当前主要在最终工具调用成形后输出 `tool_call`；provider 层尚未提供工具参数增量事件。

## 场景：Studio Runtime Warmup 与 Prepared Snapshot

### 1. Scope / Trigger

- 触发条件：
  - 新增或修改 workspace 打开后的 runtime warmup
  - 新增或修改 `PreparedRuntimeSnapshot`、snapshot cache、cache key 或失效规则
  - 新增或修改 `bootstrapAll(...)` timing sink
  - 修改 submit fast path / slow path 分支
  - 修改 provider/model/agent/skills/memory/mcp/git 变化后的 snapshot 失效
- 这是跨层契约：main 负责调度，runtime/core 负责装配，renderer 只展示状态；任何一层绕开 contract 都会导致“看起来快了，但实际上下文或工具注册不完整”。

### 2. Signatures

```ts
type RuntimeWarmupStatus =
  | 'idle'
  | 'warming'
  | 'ready'
  | 'stale'
  | 'failed'

interface RuntimeWarmupStatusChangedEvent {
  status: RuntimeWarmupStatus
  cwd: string
  cacheKey: string
  selectionKey?: string
  durationMs?: number
  error?: string
}

interface RuntimeWarmupPrepareRequest {
  projectPath: string
  agentId?: string | null
  providerId?: string | null
  modelId?: string | null
  mode?: 'standard' | 'xforge'
}

interface BootstrapTimingSink {
  (stage: string, durationMs: number): void
}

interface PreparedRuntimeSnapshot {
  cacheKey: string
  cwd: string
  workspaceRoot: string
  agentId: string | null
  mode: 'standard' | 'xforge'
  configFingerprint: string
  providerFingerprint: string
  skillsVersion: string
  hooksVersion: string
  mcpToolListVersion: string
  memoryVersion: string
  gitContextVersion: string
  bootstrapReady: boolean
  systemPrompt?: string
  toolDefinitions?: unknown[]
  /** 只允许 main/runtime 内存引用，不允许 IPC 发送 */
  toolRegistry?: unknown
  createdAt: number
}

interface RuntimePreparedSnapshot {
  systemPrompt?: string
  toolDefinitions?: unknown[]
  toolRegistry?: unknown
  bootstrapWarnings?: string[]
  bootstrapTimings?: BootstrapTimings
}

interface RuntimeSubmitInput {
  text: string
  preparedSnapshot?: RuntimePreparedSnapshot
}

interface RuntimeTurnResult {
  sessionId: string | null
  preparedSnapshot?: RuntimePreparedSnapshot
}
```

### 3. Contracts

- Warmup 必须由 Studio main 调度，不允许 renderer 直接调用 `bootstrapAll()` 或访问 runtime internals。
- Warmup 不得调用 LLM，不得创建 `AgentLoop`，不得消耗 token。
- Warmup cache key 必须使用规范化 cwd / workspaceRoot；Windows 上不得只依赖 `trim()`。
- Workspace 打开后启动 warmup 时，main 侧必须使用与 renderer 默认 submit 一致的身份维度：默认 Agent、provider、model、mode 与配置指纹必须和 `StudioShellInspector -> hydrateStudioBridgeSnapshot -> RuntimeSubmitRequest` 这条链路一致。尤其当默认 Agent 非空时，warmup key 不能落成 `__default_agent__`，否则首次 submit 会查另一个 key。
- Renderer 确定当前 `projectPath / agentId / providerId / modelId / mode` 后，必须通过 shared bridge 调用 `warmup.prepare(...)` 通知 main 按当前 UI 选择启动或复用 warmup；用户切换 Agent、provider/model 或 mode 后也必须重新 prepare。Renderer 不得自行计算 provider/config fingerprint，也不得接触 warmup cacheKey。
- Main 广播 warmup 状态到 renderer 时，可以携带不透明 `selectionKey`，renderer 只用它匹配“当前 UI 选择”；不得通过 IPC 发送 cwd、cacheKey、system prompt、tool definitions 或 provider secrets。
- `PreparedRuntimeSnapshot` 可以在内存保存 system prompt、tool definitions 与可执行 tool registry，但不得通过 IPC 发给 renderer，也不得写入日志。
- `PreparedRuntimeSnapshot` 进入 `ready` 前必须具备真正可复用的装配产物：至少包含 `systemPrompt`、完整 `toolDefinitions`（含参数 schema）和可执行 `toolRegistry`。只填充 `bootstrapReady` 的空壳 snapshot 不允许命中 fast path。
- Runtime fast path 必须实际消费 `RuntimeSubmitInput.preparedSnapshot`：命中时跳过已准备好的 `bootstrapAll()`、`getSystemPrompt()`、`getRegistry()`、`registerMcpTools()`，并把 snapshot 内的 `toolRegistry` 传给 `AgentLoop`。
- Runtime slow path 成功后必须通过 `RuntimeTurnResult.preparedSnapshot` 返回真实装配结果，Studio main 用它刷新 warmup snapshot；不得用只有 `skillsReady/fileIndexReady/systemPromptReady` 的空对象伪装 ready。
- Studio main 可以用 `turn_end/session_end` terminal event 让 UI 先收敛，但不能让合成的 terminal result 抢先替代真实 `RuntimeTurnResult`；否则 slow path 返回的 `preparedSnapshot` 会丢失，后续 submit 仍然无法命中 fast path。
- Submit 入口必须统一执行 snapshot validate：
  - 命中且未过期：走 fast path，跳过已准备好的装配步骤。
  - 未命中、过期或 warmup failed：走 slow path，并在成功后刷新 snapshot。
- Warmup 失败不得阻塞 submit；submit 必须回退到 slow path，并给 renderer 一个可见 warning。
- Skills、hooks、MCP、memory、provider config、agent、git HEAD、workspace 切换任一变化，都必须让对应 snapshot 失效或进入 `stale`。
- Provider/model/config/agent/mode/workspace 必须进入 cache key 或 submit validate 输入；skills/hooks/MCP/memory/git/agent 文件这类可能绕过 Studio UI 的变化，必须通过真实 mutation 入口或轻量版本指纹在 validate 时兜底发现。
- `bootstrapAll` 内部子阶段耗时必须能通过 timing sink 发出 `bootstrap.<stage>`，同时保持 `BootstrapResult.timings` 兼容。
- submit timing 不得记录 API key、Authorization、完整 prompt、完整 messages、工具内容全文。

### 4. Validation & Error Matrix

| 条件 | 处理方式 |
|---|---|
| warmup 里调用 provider chat / model stream | 视为 token 消耗红线，必须移除 |
| warmup 创建 `AgentLoop` | 视为边界违规，必须留到 submit |
| snapshot key 未规范化路径 | 视为缓存命中缺陷，必须补 Windows 路径测试 |
| warmup failed 后 submit 直接失败 | 视为可用性缺陷，必须回退 slow path |
| snapshot 把 system prompt 或 API key 通过 IPC 发给 renderer | 视为敏感信息泄漏，必须删除字段并补脱敏测试 |
| skills/hooks/mcp/memory/git 变化后仍复用旧 snapshot | 视为上下文污染，必须补失效规则 |
| fast path 只打 timing/log，但 runtime submit 仍完整 bootstrap | 视为假快路径，必须把 prepared snapshot 传入 runtime 并实际复用 |
| slow path 成功后刷新空壳 snapshot | 视为高风险缓存污染，必须用 runtime 返回的真实装配结果刷新 |
| warmup snapshot 的工具定义缺少参数 schema 或 MCP 注册结果 | 视为工具能力不完整，必须保存完整 tool definitions 并复用可执行 registry |
| timing summary 只有 `runtime_bootstrap` 总耗时 | 视为观测不足，必须补 `bootstrap.*` 子阶段 |

### 5. Good / Base / Bad Cases

- Good：
  - `openWorkspace` 后进入 `warming`，后台完成 `bootstrapAll`，状态变为 `ready`
  - submit 时先 validate snapshot，命中则直接进入 history/context/model request
  - snapshot 失效后 UI 仍可提交，系统走 slow path 兜底
- Base：
  - 至少先预热本地 bootstrap，并把子阶段 timing 暴露出来
- Bad：
  - 只在 openWorkspace 后偷偷调用一次 `bootstrapAll`，没有状态机、cache key、失效和测试
  - 为了快而跳过 tool registry / agent 初始化，导致后续工具不可用

### 6. Tests Required

- `bootstrap.test.ts`：
  - timing sink 收到每个 `bootstrap.<stage>`
  - `BootstrapTimings` 类型覆盖实际字段
- `studio-runtime-warmup.test.ts`：
  - `idle -> warming -> ready`
  - `warming -> failed`
  - workspace 切换 abort 旧 warmup
  - snapshot stale 后 submit 走 slow path
  - ready snapshot 必须包含 system prompt、完整 tool definitions、可执行 tool registry
  - workspace 版本指纹变化会让 ready snapshot 进入 stale
- `studio-runtime-service.test.ts`：
  - warmup ready 时 submit 使用 fast path
  - warmup failed 时 submit 不失败，回退旧路径
  - fast path 命中时向 runtime submit 传入 `preparedSnapshot`
  - slow path 成功后用 `RuntimeTurnResult.preparedSnapshot` 刷新 snapshot
  - timing 不泄露敏感字段
- `packages/runtime` 测试：
  - `RuntimeSubmitInput.preparedSnapshot` 命中时跳过 bootstrap/systemPrompt/registry 注册，并复用 snapshot tool registry
- `studio-ipc.test.ts` / preload 测试：
  - warmup status channel 参数校验
- Windows 路径回归：
  - `D:/foo`、`D:\foo`、末尾斜杠不会产生不同 cache key。

### 7. Wrong vs Correct

#### Wrong

```ts
void bootstrapAll(workspacePath)
```

问题：

- 没有状态机，renderer 不知道是否 ready
- 没有失效规则，后续容易复用过期上下文
- 没有统一 submit validate，未来 snapshot fast path 接不上

#### Correct

```ts
const status = warmupManager.start({
  cwd: normalizeRuntimePath(workspacePath),
  workspaceRoot: normalizeRuntimePath(workspacePath),
  config,
})

const snapshot = warmupManager.validateSnapshot(submitSelection)
if (snapshot?.bootstrapReady) {
  // fast path：复用已准备的本地装配结果
} else {
  // slow path：完整装配并刷新 snapshot
}
```

先建立最终骨架，再逐步填充 snapshot 内容。

## 场景：模型请求与工具事件必须可观测

### 1. Scope / Trigger

- 触发条件：
  - 修改 provider stream chunk 类型
  - 修改 `AgentLoop` 事件类型
  - 修改 runtime -> Studio 的事件转发
  - 修改 Studio submit timing summary
  - 新增工具 intent、工具参数增量、工具 ready 等事件

### 2. Signatures

```ts
type ModelRequestPhase = 'initial' | 'after_tool_result' | 'retry'

type RuntimeToolLifecycleEvent =
  | { type: 'tool_intent'; toolName: string; toolCallId: string }
  | { type: 'tool_args_delta'; toolCallId: string; partialArgs: Record<string, unknown> }
  | { type: 'tool_ready'; toolName: string; toolCallId: string; args: Record<string, unknown> }
  | { type: 'tool_start'; toolName: string; toolCallId: string; args: Record<string, unknown> }
  | { type: 'tool_end'; toolName: string; toolCallId: string; success: boolean; durationMs?: number }
```

### 3. Contracts

- 每轮 LLM 调用都必须发 `model_request_started`，并带 `phase`。
- `model_first_chunk` 必须区分 `text / thinking / tool_call`。
- submit timing 需要同时支持首个 mark 和多轮聚合；不能只用 `markFirst` 覆盖后续 `after_tool_result` 请求。
- AgentLoop 必须有交互式轮次预算和卡死保护；当 `after_tool_result` 请求过多或连续低进展时，必须先发可观测 warning 并要求模型收束，仍不收束时以 `budget_exceeded` 或 `stalled` 停止，不能让一次 Studio submit 无限自转。
- AgentLoop guard 事件只能记录计数、原因、级别和工具名摘要，不得记录完整 prompt、messages、工具参数全文或工具输出全文。
- 工具事件必须按生命周期递进：
  - `tool_intent`：模型刚产生工具名，UI 可先出壳。
  - `tool_args_delta`：参数边生成边展示，必须做摘要，不展示全文内容。
  - `tool_ready`：参数完整并进入执行队列。
  - `tool_start`：实际执行开始。
  - `tool_end`：执行完成。
- provider 不支持 tool delta 时，可以只发 `tool_ready/tool_start/tool_end`，renderer 必须兼容降级路径。
- OpenAI-compatible provider 解析 LangChain `tool_call_chunks` 时，必须用首个带 `id` 的 chunk 记录 `index -> toolCallId`，因为后续 arguments chunk 常只带 `index`。不得因后续 chunk 缺少 `id` 而丢失参数增量。
- `AgentLoop` 聚合 arguments delta 时，可以从不完整 JSON 中保守提取已经闭合的顶层字段（例如 `path`、`command`），但不得猜测未闭合字段内容；相同参数快照应去重，避免 UI 重复刷新。
- `write_file.content`、大段 shell output、prompt/messages 不得进入 timing summary 或默认工具参数预览。

### 4. Validation & Error Matrix

| 条件 | 处理方式 |
|---|---|
| 第二轮模型请求没有 phase | 视为观测缺口，必须补 `after_tool_result` |
| `after_tool_result` 连续过多但仍继续请求模型 | 视为 AgentLoop 预算缺陷，必须软收束后硬停止 |
| 连续多轮只有工具调用且没有可见文本进展 | 视为低进展卡死风险，必须触发 guard warning / stalled |
| provider 无法提供 tool args delta | 允许降级为 `tool_ready`，但不得伪造增量 |
| 工具参数全文包含大文件内容 | UI 只显示摘要，timing 不记录 |
| `tool_end` 早于 `tool_start` | 视为事件序列违规，必须修 core/runtime |
| timing 只记录第一轮模型请求 | 视为长尾不可诊断，必须增加数组聚合 |

### 5. Good / Base / Bad Cases

- Good：
  - UI 在模型生成工具名时即显示“准备调用工具”
  - 参数路径逐步出现，执行开始后切 running，完成后切 done/error
  - timing summary 能看出每轮模型请求和每批工具耗时
- Base：
  - 至少保证现有 `tool_start/tool_end` 同步转发，动作类工具 running 态可见
- Bad：
  - 工具只有完成后才突然出现
  - 只在 debug.log 有工具详情，renderer 对用户黑盒

### 6. Tests Required

- provider 单元测试：
  - OpenAI-compatible 分块 tool call 转为 intent/args delta
  - Anthropic content block tool use 转为 intent/args delta
- `agent-loop` 测试：
  - `tool_intent -> tool_args_delta* -> tool_ready -> tool_start -> tool_end`
- `create-runtime` 测试：
  - 新事件完整转发到 Studio runtime event
- `studio-submit-timing.test.ts`：
  - 多轮 `model_request_started` 按 phase 聚合
  - AgentLoop guard 原因和轮次计数进入 summary 且脱敏
  - 敏感字段脱敏
- `agent-loop` 预算测试：
  - 超过 after_tool_result 预算前先软收束
  - 软收束后仍调用工具时以 `budget_exceeded` 停止
  - 连续低进展时以 `stalled` 停止

### 7. Wrong vs Correct

#### Wrong

```ts
yield { type: 'tool_call', toolCall: finalToolCall }
```

问题：工具只有在模型完全生成完参数后才出现，用户看不到模型正在准备调用什么。

#### Correct

```ts
yield { type: 'tool_intent', toolName, toolCallId }
yield { type: 'tool_args_delta', toolCallId, partialArgs }
yield { type: 'tool_ready', toolName, toolCallId, args }
```

事件粒度先补齐，UI 才能稳定展示 agent 的过程。
