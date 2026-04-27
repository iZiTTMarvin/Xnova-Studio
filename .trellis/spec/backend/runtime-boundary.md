# Runtime Boundary 专项规范

> 本规范约束 `Xnova Studio` 当前主线的 `packages/runtime + packages/core + apps/studio` 边界，避免后续实现时再把 renderer、host、runtime、legacy command 重新揉回一层。

## 当前事实

- 产品核心运行时已经物理迁到 `packages/*`：
  - `packages/runtime/`：shared runtime facade、bridge、events、inspect、engine service API
  - `packages/core/`：编排内核
  - 其余领域能力进入 `packages/config/providers/persistence/tools/memory/mcp/skills/plugin/platform/observability`
- `apps/studio/` 是当前唯一主宿主：
  - `src/main/` 负责 host 生命周期、权限、IPC handler、runtime 复用
  - `src/preload/` 负责安全桥
  - `src/renderer/` 只负责展示与交互
- `apps/studio/src/main/studio-runtime-manager.ts` 是当前 host 持有 runtime / engine service 的唯一事实源：
  - runtime key = `workspaceRoot + cwd + agentId + sessionId(draft/session)`
  - `studio-runtime-inspector` 优先读取 manager 中的 live runtime snapshot，再回退到 config inspect
- 根 `cli/` 与根 `studio/` 都是脱离 workspace 的 legacy 快照，不再定义运行时边界，也不再提供运行入口。
- package 消费者不得再以 `cli/src/**` 作为长期依赖入口；如果仍需吸收 legacy 能力，必须先收敛进 `packages/*`。

## 场景：Studio Main 必须通过 RuntimeManager 长生命周期持有 runtime / engine service

### 1. Scope / Trigger

- 触发条件：
  - 修改 `apps/studio/src/main/index.ts`
  - 修改 `apps/studio/src/main/studio-runtime-service.ts`
  - 修改 `apps/studio/src/main/studio-runtime-inspector.ts`
  - 新增或修改 main 侧 runtime / host bridge / engine service 装配
- 这是 `main` 宿主持有边界；如果这里退化成“入口文件现拼 runtime”，Studio 主链路会重新掉回临时拼接态。

### 2. Signatures

```ts
interface StudioRuntimeSelection {
  cwd: string
  workspaceRoot: string
  sessionId: string | null
  agentId: string | null
}

interface StudioRuntimeManager {
  getEngineServiceApi(workspaceRoot: string): EngineServiceApi
  acquireRuntime(input: {
    selection: StudioRuntimeSelection
    hostState: StudioHostState
    emitRuntimeEvent: (event: StudioRuntimeEvent) => void
  }): Promise<{ reused: boolean; reactivated: boolean }>
  commitSession(entry: StudioManagedRuntimeEntry, sessionId: string | null): void
  getRuntimeSnapshot(hostState: StudioHostState): RuntimeSnapshot | null
  dispose(): Promise<void>
}
```

### 3. Contracts

- `main/index.ts` 不得再直接 `createEngineServiceApi()` 然后散落传给多个 service；统一通过 `studio-runtime-manager` 获取。
- runtime / engine service 由 `main` 长生命周期持有；renderer 永远只看 bridge contract。
- 切回已缓存 session 时，可以复用 runtime handle，但提交前必须重新补历史恢复，避免 shared runtime 的全局 context 漂移到别的 session。
- `studio-runtime-inspector` 必须优先读 live runtime snapshot；只有当前 workspace 没有活跃 runtime 时，才允许回退到 config inspect。

### 4. Validation & Error Matrix

| 条件 | 处理方式 |
|---|---|
| `main/index.ts` 直接 `createEngineServiceApi()` 并手工传递给 runtime service | 视为 host 收口失败，必须回退到 RuntimeManager |
| Studio host 只保留单个 `activeRuntime`，切 session / workspace 就销毁旧实例 | 视为长生命周期持有缺失，必须改为 manager cache |
| 切回已缓存 session 但不补历史恢复 | 视为高风险上下文串线，必须补 hydrate history |
| inspector 只返回 config snapshot，不返回 live runtime snapshot | 视为运行时观测失真，必须修复 |

### 5. Good / Base / Bad Cases

- Good：
  - `studio-runtime-manager.ts` 统一持有 runtime / engine service
  - `studio-runtime-service.ts` 只负责 submit contract、history hydrate、permission bridge
  - `studio-runtime-inspector.ts` 优先透出 live snapshot
- Base：
  - 至少保证 workspace / session / agent 级复用不再退化成每轮临时拼接
- Bad：
  - 在 `index.ts` 里直接 new runtime / engine service 再传来传去
  - 多 session 间共享了错误的 context history

### 6. Tests Required

- 单元测试：
  - `studio-runtime-service.test.ts` 断言跨 session 切回时复用缓存 runtime 并补历史恢复
  - `studio-runtime-inspector.test.ts` 断言 live runtime snapshot 优先生效
  - `studio-main-boundary.test.ts` 断言 `main/index.ts` 走 RuntimeManager，而不是裸 `createEngineServiceApi()`
- 集成测试：
  - `studio-main-flow-regression.test.tsx` 断言打开 workspace -> submit -> 恢复会话主链路仍成立

### 7. Wrong vs Correct

#### Wrong

```ts
const engineServiceApi = createEngineServiceApi()
const runtimeService = createStudioRuntimeService({ engineServiceApi })
```

#### Correct

```ts
const runtimeManager = createStudioRuntimeManager()
const runtimeService = createStudioRuntimeService({ runtimeManager })
```

把 runtime / engine service 的长生命周期收回 `main`，而不是让入口文件继续临时拼接。

## 场景：Studio 当前项目必须成为 runtime workspace 与权限判定基准

### 1. Scope / Trigger

- 触发条件：
  - 修改 `RuntimeSubmitRequest.projectPath`
  - 修改 `StudioHostState.workspacePath`
  - 修改 `apps/studio/src/main/studio-runtime-service.ts`
  - 修改 `packages/runtime/src/create-runtime.ts`
  - 修改 `packages/core/src/agent-loop.ts` 的权限结果处理
- 这是 cross-layer contract：renderer 选择的当前项目、main 持有的 workspace、runtime `cwd/workspaceRoot`、core 工具权限必须指向同一个根目录。

### 2. Signatures

```ts
interface RuntimeSubmitRequest {
  text: string
  projectPath?: string | null
  sessionId?: string | null
  agentId?: string | null
  providerId?: string | null
  modelId?: string | null
}

interface StudioRuntimeSelection {
  cwd: string
  workspaceRoot: string
  sessionId: string | null
  agentId: string | null
}

interface PermissionResolution {
  allow: boolean
  reason?: string
}

type AgentPermissionResolveInput = boolean | PermissionResolution
```

### 3. Contracts

- `RuntimeSubmitRequest.projectPath` 显式存在且非空时，host 必须把它作为本轮 `workspaceRoot` 与 `cwd` 的优先来源。
- main 传入 `runtimeManager.acquireRuntime(...)` 的 `hostState.workspacePath` 必须与本轮有效 `workspaceRoot` 一致；不得继续使用旧 host state 做权限判定。
- `createRuntime()` 收到 runtime bridge 的 `PermissionResolution.reason` 后必须原样传给 `AgentLoop.permission_request.resolve(...)`。
- `AgentLoop` 必须兼容旧 boolean resolve，但内部统一归一化为 `{ allow, reason }`。
- 工具被拒绝时，tool result / tool done summary 必须包含真实 reason；不得硬编码为 `rejected by user`。

### 4. Validation & Error Matrix

| 条件 | 处理方式 |
|---|---|
| `projectPath` 与旧 `hostState.workspacePath` 不一致 | 本轮 submit 以 `projectPath` 为准，并同步传给 runtime manager 与权限 resolver |
| `projectPath` 为空且 host 未绑定 workspace | 直接返回 workspace 未绑定错误，不回退到 Electron 启动目录 |
| 权限 resolver 返回 `{ allow: false, reason }` | core 工具结果输出 `permission denied (<reason>)` |
| 权限 resolver 返回旧 boolean `false` | core 工具结果输出通用 `permission denied` |
| runtime 把 permission resolution 压扁成 boolean | 视为 contract 违规，必须恢复 reason 透传 |

### 5. Good / Base / Bad Cases

- Good：
  - 用户选择 `D:/workspace/project-b` 后，本轮 submit 的 `cwd/workspaceRoot/hostState.workspacePath` 全部指向 project-b
  - project-b 内的 `write_file/edit_file` 走 workspace-scoped allow
  - project-b 外路径被拒绝，并把 `outside-workspace` 等 reason 返回给 LLM 与 UI
- Base：
  - 至少保证当前项目内写入不因旧 host state 被误拒绝
- Bad：
  - UI 显示当前项目是 project-b，但权限层仍以 project-a 判断
  - 拒绝原因被统一显示为 `rejected by user`

### 6. Tests Required

- 单元测试：
  - `studio-runtime-service.test.ts` 断言显式 `projectPath` 优先成为 `cwd/workspaceRoot`
  - `create-runtime.test.ts` 断言 permission resolution 不被压扁成 boolean
  - `core-kernel-extract.test.mjs` 断言 `AgentLoop` 不再硬编码 `rejected by user`
- 集成测试：
  - `use-studio-bridge-submit.test.tsx` 断言项目选择会先绑定 host workspace，再刷新 shell/runtime 状态

### 7. Wrong vs Correct

#### Wrong

```ts
const workspaceRoot = hostState.workspacePath ?? process.cwd()
event.resolve(resolution.allow)
```

问题：

- 旧 workspace 会污染当前 submit
- 权限拒绝 reason 被丢弃，LLM 只能看到误导性的通用拒绝

#### Correct

```ts
const workspaceRoot = request.projectPath?.trim() || hostState.workspacePath
const permissionHostState = { ...hostState, workspacePath: workspaceRoot }

event.resolve({
  allow: resolution.allow,
  reason: resolution.reason,
})
```

当前项目路径是本轮 submit 的事实源；权限拒绝必须保留可诊断 reason。

## 场景：定义 shared runtime / host / renderer contract

### 1. Scope / Trigger

- 触发条件：
  - 新增或修改 `packages/runtime/**`
  - 新增或修改 `packages/core/**`
  - 新增或修改 `apps/studio/src/main/**`、`apps/studio/src/preload/**`
  - 改动 renderer -> preload -> main -> runtime 的桥接契约
- 这是高风险 cross-layer 变更，必须先有代码契约，再开始搬代码。

### 2. Signatures

当前主线应围绕以下签名收敛：

```ts
interface RuntimeConfigInput {
  cwd: string
  workspaceRoot?: string
  config: ResolvedConfig
  mode: 'standard' | 'xforge'
}

interface RuntimeHostBridge {
  emit(event: RuntimeEvent): void
  requestPermission(input: PermissionRequest): Promise<PermissionResolution>
  requestUserInput?(input: UserQuestionRequest): Promise<UserQuestionResult>
}

interface RuntimeInstance {
  submit(input: RuntimeSubmitInput): Promise<RuntimeTurnResult>
  abort(): void
  dispose(): Promise<void>
  getSnapshot(): RuntimeSnapshot
}

function createRuntime(
  input: RuntimeConfigInput,
  bridge: RuntimeHostBridge,
): Promise<RuntimeInstance>
```

> 类型引用约定：
>
> - runtime 核心类型统一定义在 `packages/runtime/src/types.ts`
> - Studio host / renderer 共用 contract 统一定义在 `apps/studio/src/shared/studio-bridge-contract.ts`
> - 新增字段时，必须同时更新类型定义、测试与本 spec

### 3. Contracts

#### Runtime 负责什么

- `AgentLoop` orchestration
- Tool registry、MCP、Skills、Memory、Plugin 等底层能力装配
- Session / context / subagent / event 生命周期
- 配置解析后的消费
- `RuntimeConfigInput.cwd` 是运行时唯一权威工作目录；`bootstrapAll()`、`AgentLoop`、ToolContext、Memory、Git context、项目级 hooks / instructions 都必须显式消费该 cwd，不得在 Studio/Electron 主链路中回退依赖 `process.cwd()`。
- runtime bootstrap 中的文件索引必须在 glob 阶段跳过 `node_modules`、`dist`、`build`、`.git` 等重型目录，并禁止跟随符号链接；不得先全量扫描再用 ignore 过滤。
- runtime / core 公共 barrel 被轻量 inspect、Studio preload 测试或静态边界测试导入时，不得在模块加载阶段打开 SQLite、启动 MCP 或执行重型扫描；`TokenMeter` 这类会触达持久化的观测对象必须惰性实例化。

#### Host 负责什么

- Electron 生命周期
- workspace 绑定
- 权限请求与决策事件
- IPC handler 与 runtime 生命周期复用

#### Preload 负责什么

- 安全桥
- 参数校验
- 事件订阅封装

#### Renderer 负责什么

- 页面与组件
- 用户交互
- 展示 runtime 事件、会话、工具过程与错误状态

#### Renderer 永远不负责什么

- `fs`
- `child_process`
- provider API key
- runtime internals
- tool execution

### 4. Validation & Error Matrix

| 条件 | 处理方式 |
|---|---|
| runtime 直接 import Electron / Ink / DOM 代码 | 视为边界违规，必须回退 |
| host 重新实现 ToolRegistry / AgentLoop / Memory / MCP 初始化 | 视为重复实现，必须复用 package 能力 |
| preload 持有业务状态或直接读写本地文件 | 视为安全桥失守，必须回退 |
| renderer 直接触达 `fs` / shell / provider secrets / tool execution | 必须通过 host/runtime 桥接，不允许直连 |
| Studio host 每次 submit 都销毁再重建 runtime，导致会话上下文丢失 | 视为主链路缺陷，必须改为按 session / cwd / agent 复用 |
| host 对权限请求无条件放行 | 视为安全红线，至少要有显式 allow / deny 策略与审计事件 |
| Studio submit 配置了 workspace，但 runtime/core 仍使用 Electron 启动目录 `process.cwd()` | 视为主链路缺陷，必须把 cwd 从 host contract 透传到 runtime/core/tool context |
| 文件索引扫描没有在 `fast-glob` 阶段忽略重型目录或仍跟随符号链接 | 视为 P0 性能缺陷，必须补回归测试后修复 |
| 导入 `@xnova/runtime` 或 `@xnova/core` barrel 时立刻打开 SQLite | 视为模块加载副作用，必须改成惰性实例化并补并发测试/静态测试 |

### 5. Good / Base / Bad Cases

- Good：
  - runtime 只输出统一事件流，Studio host 只消费
  - preload 只有桥接，不持有业务真相
  - renderer 只通过 `window.xnovaStudio` 请求能力
- Base：
  - 先把 legacy 能力收进 `packages/*`，再由宿主接入
- Bad：
  - 让 renderer 直接 import runtime 单例或持久化层
  - 让 host 与 runtime 各自复制一套 memory / mcp / session 逻辑

### 6. Tests Required

- 单元测试：
  - runtime factory 输入输出
  - host bridge 事件分发
  - preload 参数透传与类型约束
  - `createRuntime()` 必须断言 `bootstrapAll(input.cwd)` 与 `AgentLoop` config.cwd 透传
  - 文件索引必须断言 glob ignore 与 `followSymbolicLinks: false`
  - `bootstrap.ts` 必须断言 `TokenMeter` 不在模块加载阶段直接 `new`
- 集成测试：
  - Studio host 通过 shared contract 调用 runtime
  - runtime 事件能够到达 renderer 订阅层
- 回归测试：
  - package 消费者不再以 `cli/src/**` 作为长期运行时入口

### 7. Wrong vs Correct

#### Wrong

```ts
import { bootstrapAll } from '../../../cli/src/core/bootstrap'
import { sessionStore } from '../../../cli/src/persistence/index'
```

问题：

- 直接越过 `packages/*` 边界
- legacy 目录重新成为主线事实源

#### Correct

```ts
import { createRuntime } from '@xnova/runtime'
import type { StudioBridgeApi } from '../shared/studio-bridge-contract'
```

先通过 package 契约暴露能力，再由 host / preload / renderer 消费。

## 场景：迁移旧 CLI Commands 时必须下沉为 Engine Service API

### 1. Scope / Trigger

- 触发条件：
  - 迁移旧 `cli/src/commands/**`
  - 需要让 Studio host / 未来 CLI host / 自动化任务复用同一业务能力
  - 需要把“命令语义”改造成“可编程 service API”

### 2. Signatures

当前主线统一通过 `packages/runtime/src/engine-service-api.ts` 暴露能力：

```ts
interface EngineServiceApi {
  runtime: {
    setModel(input: { provider: string; model: string }): RuntimeModelSelection
    getModelSelection(): RuntimeModelSelection
    compactContext(input?: RuntimeCompactContextInput): Promise<RuntimeCompactContextResult>
    getContextSnapshot(): RuntimeContextSnapshot
  }
  sessionService: SessionService
  memoryService: MemoryService
  mcpService: McpService
  skillsService: SkillsService
  usageService: UsageService
  pluginService: PluginService
  maintenanceService: MaintenanceService
}
```

legacy command 与 capability 的映射应以 `LEGACY_COMMAND_CAPABILITY_MAP` 为准。

### 3. Contracts

- 命令词法、终端参数、slash command routing 可以保留在宿主侧。
- 真正的业务执行必须进入 engine service API 或对应领域 service。
- renderer / main / 自动化流程只能依赖 capability，不得依赖旧命令文件。
- 新能力若未来可能被多个宿主复用，默认先设计成 capability，再决定宿主入口。

### 4. Validation & Error Matrix

| 条件 | 处理方式 |
|---|---|
| 在 `apps/studio/src/main/**` 新建 `commands/` 目录复制旧 CLI 逻辑 | 视为迁移失败，必须回退到 capability 设计 |
| 宿主需要“切模型”，却直接改 UI 状态不改 runtime capability | 视为行为漂移，必须补 `runtime.setModel(...)` 调用 |
| 新能力只存在 renderer 按钮回调里，没有稳定 service API | 视为不可复用设计，禁止合入 |

### 5. Good / Base / Bad Cases

- Good：
  - `/model` -> `runtime.setModel(...)`
  - `/compact` -> `runtime.compactContext(...)`
  - `/resume` / `/fork` -> `sessionService.*`
  - `/memory` / `/mcp` / `/skills` -> 对应 service
- Base：
  - 宿主先包一层薄适配，但 capability 仍在 package 内
- Bad：
  - 把命令文件按 Electron main / renderer 各复制一遍

### 6. Tests Required

- 单元测试：
  - `createEngineServiceApi(...)` 返回的 capability 是否齐全
  - 每个 capability 的输入校验与失败路径
- 集成测试：
  - Studio host 调 capability 后是否真正影响 runtime / session / memory / mcp 状态
- 回归测试：
  - legacy command 行为与 capability 语义一致，不产生功能回退

### 7. Wrong vs Correct

#### Wrong

```ts
// apps/studio/src/main/model-command.ts
function handleModelCommand(provider: string, model: string) {
  currentModel.provider = provider
  currentModel.model = model
}
```

问题：

- 业务能力被锁死在宿主
- 无法复用于未来 CLI host 或自动化流程

#### Correct

```ts
const engine = createEngineServiceApi()
engine.runtime.setModel({ provider, model })
```

宿主只做入口适配，能力真相在 package 层。

## 场景：Studio Submit 契约必须同时满足“主链路可用”和“runtime-not-ready 门禁”

## 场景：Studio 用户提问必须通过 Shared Contract 闭环完成

### 1. Scope / Trigger

- 触发条件：
  - 修改 `RuntimeHostBridge.requestUserInput(...)`
  - 修改 `apps/studio/src/main/studio-runtime-service.ts`
  - 修改 `apps/studio/src/main/studio-ipc.ts`
  - 修改 `apps/studio/src/preload/**`
  - 修改 `apps/studio/src/shared/studio-bridge-contract.ts`
  - 修改 `apps/studio/src/renderer/hooks/useStudioBridge.ts`
  - 修改 `apps/studio/src/renderer/pages/StudioHomePage.tsx`
- 这是 runtime -> host -> preload -> renderer 的交互型 cross-layer contract，任何一层绕开 shared contract 都会让 `AskUserQuestionTool` 再次退化成假交互。

### 2. Signatures

```ts
interface UserQuestionDialogRequest {
  requestId: string
  sessionId: string
  questions: Array<{
    key: string
    title: string
    type: 'text' | 'select' | 'multiselect'
    options?: Array<{
      label: string
      description?: string
    }>
    placeholder?: string
  }>
}

interface UserQuestionDialogResponse {
  requestId: string
  cancelled: boolean
  answers: Record<string, string | string[]>
}
```

```ts
const STUDIO_BRIDGE_CHANNELS = {
  userInputRequest: 'studio:user-input:request',
  userInputRespond: 'studio:user-input:respond',
}
```

### 3. Contracts

- runtime 只能通过 `bridge.requestUserInput(input)` 发起用户提问；不得直接依赖 renderer 或宿主 UI。
- main 必须生成 `requestId`，把 runtime 请求转成 `UserQuestionDialogRequest`，并通过 `webContents.send(...)` 推送到 renderer。
- renderer 只能通过 `window.xnovaStudio.userInput.onRequest/respond` 消费与回传；不得直接 import runtime 单例、ipcRenderer 裸通道或自行维护第二套 contract。
- preload 负责校验：
  - `requestId / sessionId` 为非空字符串
  - `questions` 为非空数组
  - `type` 只允许 `text / select / multiselect`
  - `select / multiselect` 必须提供非空 `options`
  - `answers` 只允许 `string | string[]`
- main 必须维护 pending resolver 队列，等待 renderer 回答后再 resolve 给 runtime。
- 60 秒无响应时，main 必须返回：

```ts
{ answers: {}, cancelled: true }
```

- renderer 取消时也必须回传同一语义，不得伪造默认答案。

### 4. Validation & Error Matrix

| 条件 | 处理方式 |
|---|---|
| main window 不可用 | 直接返回 `{ answers: {}, cancelled: true }` |
| renderer 超过 60 秒未响应 | main 自动返回 `cancelled: true` |
| timeout 后又收到旧 response | `respond` 返回 `{ ok: false }`，不得复活旧请求 |
| `select/multiselect` 缺少 options | preload 校验失败，拒绝进入 renderer |
| `answers` 含非字符串/非字符串数组 | preload/main 校验失败 |
| renderer 直接走裸 `ipcRenderer` 或直连 runtime | 视为边界违规，必须回到 shared bridge contract |

### 5. Good / Base / Bad Cases

- Good：
  - `studio-runtime-service` 维护 pending map + timeout
  - `useStudioBridge` 持有单一 pending question 状态
  - `StudioHomePage` 挂载 `UserQuestionDialog`，并通过 bridge 回传结果
- Base：
  - 至少支持 `text / select / multiselect`
  - 至少支持提交与取消两条路径
- Bad：
  - `requestUserInput()` 固定返回 `cancelled: true`
  - renderer 直接 `prompt()` 或写死默认答案
  - main 收到问题后只打日志，不等待用户真实回答

### 6. Tests Required

- 单元测试：
  - `studio-runtime-service.test.ts` 断言 request push、response resolve、60 秒 timeout
  - `studio-ipc.test.ts` 断言 `userInput.respond` 参数校验与 handler 分发
  - `studio-preload-bridge.test.ts` 断言 preload 订阅与响应校验
  - `user-question-dialog.test.tsx` 断言三种题型收集答案正确
- 集成测试：
  - `renderer-shell.test.tsx` 断言收到 `userInput` 请求后会弹窗并通过 bridge 回传

### 7. Wrong vs Correct

#### Wrong

```ts
async requestUserInput(_input) {
  return { answers: {}, cancelled: true }
}
```

问题：

- Studio 表面支持 AskUserQuestion，实际上永远不会真正询问用户
- renderer 没有机会展示结构化问题表单

#### Correct

```ts
async requestUserInput(input) {
  return requestUserInputFromRenderer(toUserQuestionDialogRequest(input))
}
```

```ts
window.xnovaStudio.userInput.onRequest((request) => {
  setPendingUserInputRequest(request)
})
```

把等待队列、超时、校验和 UI 渲染全部收敛到 shared contract 上，才能保证 runtime/host/renderer 的交互语义一致。

### 1. Scope / Trigger

- 触发条件：
  - 修改 `apps/studio/src/shared/studio-bridge-contract.ts`
  - 修改 `apps/studio/src/main/studio-runtime-service.ts`
  - 修改 `apps/studio/src/renderer/hooks/useStudioBridge.ts`
  - 修改会话提交、模型选择、会话恢复、runtime inspect / submit 门禁

### 2. Signatures

Renderer 到 host 的提交契约：

```ts
interface RuntimeSubmitRequest {
  text: string
  projectPath?: string | null
  sessionId?: string | null
  agentId?: string | null
  providerId?: string | null
  modelId?: string | null
}
```

Host 直接调用 runtime 时的最低要求：

```ts
await runtime.submit({
  text,
  history: [{ role: 'user', content: text }],
  loggedUserContent: text,
  provider,
  model,
})
```

### 3. Contracts

- renderer 必须在 submit 前先检查：
  - 已绑定 workspace
  - runtime inspect 状态为 `ready`
- host 必须在无 workspace / cwd 时直接返回错误，不允许回退到 `process.cwd()` 静默运行。
- renderer 必须把当前 `sessionId / agentId / providerId / modelId` 一并送入 submit 契约。
- host 若直接调用 runtime，必须显式构造当前用户消息 history；不能只传 `text`。
- runtime 事件必须持续回流到 renderer，用于展示 live assistant text、thinking、tool events、warning、error。
- host 的 submit watchdog 只能按“连续无新进展”计时：收到 `text_delta / thinking / tool_* / warning / error` 等 runtime 事件，或进入权限/用户提问交互后，都必须续期或切换到对应交互超时；不得把整轮对话按固定总时长直接截断。
- watchdog 必须区分阶段：
  - 首个 runtime 进展出现前，可使用较短门限拦截真正的启动/请求挂死
  - 首个进展出现后，必须切换到更长的静默门限，避免长思考模型或 provider 的大段推理被 60 秒误杀
- renderer / preload / host 只允许调用 shared contract 中已声明的方法；不得 fallback 到 legacy `runtime.submitPrompt` 等未声明入口。

### 4. Validation & Error Matrix

| 条件 | 处理方式 |
|---|---|
| renderer 未绑定 workspace 仍允许提交 | 视为 P0 门禁缺失，必须拦截 |
| host 在无 workspace 时回退 `process.cwd()` | 视为高风险目录越界，必须拒绝 |
| submit 未携带当前 `providerId / modelId` | 视为会话模型选择失效 |
| host 直接调 runtime.submit 但 history 为空 | Provider 侧可能报 `messages must not be empty`，必须修装配 |
| runtime 事件未透传到 renderer | 视为聊天主视图不完整，必须修复 |
| 对话持续有流式进展，但 host 仍在固定总时长后强制 abort | 视为 submit watchdog 误杀，必须改为按无进展续期 |
| 已收到首个 `thinking/text/tool` 进展，但后续因较长静默又被 60 秒短门限 abort | 视为分阶段 watchdog 缺失，必须放宽 post-progress 门限 |
| renderer 通过 undocumented fallback 调 `runtime.submitPrompt` 获得“成功” | 视为 legacy 语义回潮，必须回退到 shared contract |

### 5. Good / Base / Bad Cases

- Good：
  - `useStudioBridge.submitPrompt(...)` 先做 runtime-not-ready 门禁，再发起 submit
  - `studio-runtime-service` 无 workspace 时直接返回错误
  - `sessionId / providerId / modelId` 随 submit 一起传递
- Base：
  - 至少保证首轮 history 不为空，且错误能直接显示给用户
- Bad：
  - 发送按钮可点，但实际在错误目录运行
  - 模型 UI 只是静态展示，submit 不携带模型选择

### 6. Tests Required

- 单元测试：
  - `useStudioBridge` 的门禁逻辑
  - `studio-runtime-service` 的 cwd / history / model 透传
  - `studio-runtime-service-guard.test.ts` 断言“无进展时仍会 abort、持续进展不会误杀、首进展后较长静默也不会被短门限误杀”
- 集成测试：
  - 绑定 workspace -> 选择模型 -> 发送消息 -> 收到事件 -> 会话刷新
- 回归测试：
  - 不再出现 runtime-not-ready 只是提示、却仍悄悄执行的情况

### 7. Wrong vs Correct

#### Wrong

```ts
await runtime.submit({
  text,
})
```

```ts
const cwd = hostState.workspacePath ?? process.cwd()
```

问题：

- history 为空
- 工作目录可能错位
- 用户看到“未就绪”，系统却还在运行

#### Correct

```ts
if (!hostState.workspacePath?.trim()) {
  return { ok: false, error: '当前尚未绑定 Workspace，无法开始项目会话。' }
}

await runtime.submit({
  text,
  history: [{ role: 'user', content: text }],
  loggedUserContent: text,
  provider,
  model,
})
```

先守住门禁，再进入主链路。

## 场景：Studio Main 复用 Shared Runtime 时必须保持 Native 依赖打包边界正确

### 1. Scope / Trigger

- 触发条件：
  - `apps/studio/electron.vite.config.ts`
  - `apps/studio/package.json`
  - `apps/studio/src/main/**` 通过 `@xnova/runtime` 复用 memory / persistence / libsql 相关能力

### 2. Signatures

推荐签名：

```ts
const nativeRuntimeExternals = ['libsql', /^@libsql\//]

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        external: nativeRuntimeExternals,
      },
    },
  },
})
```

```json
{
  "dependencies": {
    "libsql": "^0.5.22"
  },
  "pnpm": {
    "onlyBuiltDependencies": ["libsql"]
  }
}
```

### 3. Contracts

- Electron main bundle 复用 shared runtime 时，必须 externalize `libsql` 与 `@libsql/*`。
- `apps/studio/package.json` 必须显式声明运行时所需 native 依赖，不能依赖 legacy 目录“碰巧可解析”。
- 只读 overview / status service 也不能在主入口静态拉起会触发 native dynamic require 的模块；必要时必须延迟导入。

### 4. Validation & Error Matrix

| 条件 | 处理方式 |
|---|---|
| Electron main 未 externalize `libsql` | 视为 P0 打包边界缺陷，必须修 build 配置 |
| `apps/studio/package.json` 未声明 native 运行时依赖 | 视为宿主依赖缺陷，必须补齐 |
| build 通过但运行时报 `Could not dynamically require "@libsql/..."` | 优先检查 main build external 与延迟导入边界 |

### 5. Good / Base / Bad Cases

- Good：
  - `apps/studio/electron.vite.config.ts` 明确维护 native externals
  - `apps/studio/package.json` 自己声明 `libsql`
  - native-heavy service 按需加载
- Base：
  - 至少保证 main bundle 不错误内联 native dynamic require
- Bad：
  - 只改代码 import，不改宿主打包与依赖声明

### 6. Tests Required

- 单元测试：
  - build config / package contract 断言
- 构建验证：
  - `pnpm --filter xnova-studio build`
- 回归验证：
  - `pnpm --filter xnova-studio test`
  - 真实 Electron 启动主链路不再因 native 依赖崩溃

### 7. Wrong vs Correct

#### Wrong

```ts
export default defineConfig({
  main: {
    build: {
      rollupOptions: {},
    },
  },
})
```

#### Correct

```ts
const nativeRuntimeExternals = ['libsql', /^@libsql\//]
```

同时让 `apps/studio/package.json` 自己声明对应依赖，确保宿主边界自洽。

## 当前代码参考

- Runtime 层：
  - `packages/runtime/src/create-runtime.ts`
  - `packages/runtime/src/types.ts`
  - `packages/runtime/src/engine-service-api.ts`
- Core 层：
  - `packages/core/src/agent-loop.ts`
  - `packages/core/src/bootstrap.ts`
  - `packages/core/src/context-manager.ts`
- Studio host 层：
  - `apps/studio/src/main/studio-runtime-manager.ts`
  - `apps/studio/src/main/studio-runtime-service.ts`
  - `apps/studio/src/main/studio-runtime-inspector.ts`
  - `apps/studio/src/shared/studio-bridge-contract.ts`

## 反模式

- 不要把 runtime contract 只留在聊天记录里，不写进 spec 与测试。
- 不要让 legacy command 文件重新定义主宿主能力。
- 不要让 renderer 为了“快点打通”直接越过 preload / main。
