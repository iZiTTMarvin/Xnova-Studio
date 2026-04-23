# Runtime Boundary 专项规范

> 本规范约束 `Xnova Studio v1` 的 `shared runtime + dual host` 边界，避免后续实现时把 CLI UI、桌面宿主、Web/renderer 状态重新耦回同一层。

## 当前事实

- **Phase 1 已落定（2026-04-21）**：
  - `cli/src/runtime/` 已创建，含 `types.ts` / `create-runtime.ts` / `tool-registry.ts` / `events.ts` / `bridge.ts` / `index.ts`
  - `cli/src/host/cli/` 已创建，含 `repl.ts` / `pipe-mode.ts` / `lifecycle.ts` / `index.ts`
  - `cli/bin/ccli.ts` 已重写为薄入口，委托给 `host/cli/`
  - `runtime/` 已验证无 `ink` / `electron` / `ui/*` 依赖
- 当前运行时装配中心仍是 `cli/src/core/bootstrap.ts`（过渡期保留，Phase 2 逐步迁移）
- 当前主业务循环仍由 `cli/src/core/agent-loop.ts`、`cli/src/ui/useChat.ts` 和工具/存储单例共同驱动
- 当前桌面宿主 `studio/` 尚未实现
- 需求文档已锁定目标方向：
  - `shared runtime + dual host`
  - 先抽 `cli/src/runtime/`（已完成）
  - 再由 `cli/src/host/cli/`（已完成）与未来 `studio/` 消费

## 场景：定义 shared runtime / host / renderer contract

### 1. Scope / Trigger

- 触发条件：
  - 新建 `cli/src/runtime/**`
  - 把 `core/bootstrap.ts` 中的装配逻辑拆出去
  - 新建 `studio/` 宿主
  - 为 renderer 暴露 runtime 事件、命令或 IPC
- 这是高风险 cross-layer 变更，必须先有代码契约，再开始大规模搬代码。

### 2. Signatures

v1 建议以以下签名为目标：

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

function createRuntime(input: RuntimeConfigInput, bridge: RuntimeHostBridge): Promise<RuntimeInstance>
```

> **类型引用约定（已落定，参见 `cli/src/runtime/types.ts`）**：
>
> 上述签名中的所有类型已由 Phase 1 `04-21-runtime-boundary` 落定到 `cli/src/runtime/types.ts`：
>
> - `ResolvedConfig`：Phase 1 直接复用 `CCodeConfig`（字段平移，不改名）。Phase 2 config-toml-migration 完成后扩展为 project > user > builtin 合并结果。
> - `RuntimeEvent` / `RuntimeEventType`：已落定，含 `text_delta` / `tool_start` / `tool_end` / `agent_start` / `agent_end` / `turn_end` / `session_end` / `error` / `warning` / `context_update`。
> - `PermissionRequest` / `PermissionResolution`：已落定，含 `toolName` / `args` / `sessionId` / `allow` / `remember`。
> - `UserQuestionRequest` / `UserQuestionResult`：已落定，复用 `AgentLoop` 的 `UserQuestion` / `UserQuestionResult` 定义。
> - `RuntimeSubmitInput`：已落定，主字段含 `text` / `provider?` / `model?` / `history?` / `loggedUserContent?` / `nonInteractive?` / `waitForMcp?` / `resumeLeafUuid?` / `attachments?`。
> - `RuntimeSnapshot`：已落定，含 `sessionId` / `isRunning` / `provider` / `model` / `contextUsed` / `contextLimit` / `warnings`。
> - `RuntimeTurnResult`：已落定，含 `text` / `thinking` / `stopReason` / `llmCallCount` / `toolCallCount` / `usage` / `aborted` / `historyCompacted` / `sessionId` / `error?`。
> - **实现约束**：新增字段须同时更新本 spec 与 `cli/src/runtime/types.ts`。

当前代码里的现实入口主要是：

- `bootstrapAll()`
- `getRegistry()`
- `registerMcpTools()`
- `getSystemPrompt()`
- `useChat().submit()`

后续拆分时应围绕这些真实能力演进，而不是凭空再造一套平行运行时。

### 3. Contracts

#### Runtime 负责什么

- AgentLoop orchestration
- Tool registry 组装
- MCP / Skills / Memory / Hook / Plugin runtime 装配
- Session / context / subagent / event 生命周期
- 配置解析后的消费

#### Runtime 不负责什么

- Ink 组件渲染
- Electron 窗口、菜单、托盘、文件对话框
- Web/renderer 路由与页面状态

#### CLI host 负责什么

- REPL / pipe mode / terminal-screen
- 终端键盘输入与中断
- Ink UI 组合

#### Desktop host 负责什么

- 窗口生命周期
- preload / IPC
- workspace 绑定
- 原生菜单与宿主级错误展示

#### Renderer 负责什么

- 页面与组件
- 用户交互
- 调用 host/runtime 暴露的能力
- 展示 runtime 事件与状态

### 4. Validation & Error Matrix

| 条件 | 处理方式 |
|---|---|
| runtime 直接 import Ink/Electron UI 代码 | 视为边界违规，必须回退 |
| host 重新实现 ToolRegistry / AgentLoop | 视为重复实现，必须复用 runtime |
| renderer 直接触达 SQLite / shell / 本地文件系统 | 必须通过 host/runtime 桥接，不允许直连 |
| runtime 初始化部分能力失败（如 embedding） | 可降级，但必须通过 warning/event 暴露 |
| host/renderer 未就绪 | runtime 不应直接依赖 UI 完成后才可构建 |

### 5. Good / Base / Bad Cases

- Good：
  - `runtime` 输出统一事件流，CLI 与桌面只消费
  - CLI host 只负责终端交互，不再装配底层能力
  - renderer 只通过 bridge/IPC 请求 runtime 行为
- Base：
  - 先从 `core/bootstrap.ts` 抽出 registry/session/config 边界，保留兼容层
- Bad：
  - 把 `useChat`、Bridge API、Electron IPC、ToolRegistry 再次揉成一个模块
  - CLI host 和 desktop host 各自复制一套 memory/mcp 初始化逻辑

### 6. Tests Required

- 单元测试：
  - runtime factory 输入输出
  - host bridge 事件分发
- 集成测试：
  - runtime bootstrap
  - CLI host 消费 runtime
  - desktop host（未来）通过 IPC 消费 runtime
- 回归测试：
  - CLI 不因拆 runtime 而失去现有主链路
  - runtime 不引入对 Ink UI 的直接依赖
  - `useChat` / `pipe-runner` 不得再直接 new `AgentLoop`

### 7. Wrong vs Correct

#### Wrong

```ts
// studio renderer 里直接 import CLI 终端组件与 bootstrap 单例
import { App } from '../../cli/src/ui/App'
import { bootstrapAll } from '../../cli/src/core/bootstrap'
```

问题：

- 宿主和渲染层越级依赖
- 无法形成真正可复用 runtime

#### Correct

```ts
// renderer 只消费 host 暴露的 runtime bridge
const runtime = await hostBridge.connectRuntime()
await runtime.submit({ text: 'analyze current project' })
```

## 当前代码参考

- Runtime 层（Phase 1 已落定）：
  - 类型契约：`cli/src/runtime/types.ts`
  - Factory 入口：`cli/src/runtime/create-runtime.ts`
  - Bridge 实现：`cli/src/runtime/bridge.ts`（`NoopBridge` / `CallbackBridge`）
- CLI Host 层（Phase 1 已落定）：
  - REPL 启动：`cli/src/host/cli/repl.ts`
  - Pipe Mode：`cli/src/host/cli/pipe-mode.ts`
  - 生命周期：`cli/src/host/cli/lifecycle.ts`
  - 薄入口：`cli/bin/ccli.ts`
- Core 层（过渡期保留）：
  - 装配中心：`cli/src/core/bootstrap.ts`
  - 业务循环：`cli/src/core/agent-loop.ts`
  - 终端业务 Hook：`cli/src/ui/useChat.ts`
  - Bridge 适配：`cli/src/server/bridge/*`

## 反模式

- 不要在 Phase 1 做目录搬家大于边界抽象。
- 不要在 renderer 里偷连底层单例。
- 不要让 runtime contract 只存在于聊天记录，而没有写进 spec 与测试。

## 相关 spec

- [`directory-structure.md`](./directory-structure.md) 已在 `v1 演进落点` 与 `Design Decision: 渐进式拆分优先于 monorepo 搬家` 段落中**显式禁止** Phase 1 直接把仓库改成 `apps/cli + apps/studio + packages/runtime` 布局。Runtime 切分的落点（`cli/src/runtime/`、`cli/src/host/cli/`）以那份 spec 为准，本 spec 不重复定义。
- [`config-toml-migration.md`](./config-toml-migration.md) 定义 `ResolvedConfig` / `CCodeConfigLike` 的字段结构，runtime 输入的 `config` 必须是该结构的消费者。
- [`agent-schema-v1.md`](./agent-schema-v1.md) 定义 agent 加载后的结构；runtime 的 agent registry 与 dispatch 逻辑必须复用该 schema，不得自造一套。

## 场景：Studio Main 读取 CLI 持久化事实源时避免引入 Native DB Barrel

### 1. Scope / Trigger

- 触发条件：
  - `studio/src/main/**` 或 `studio/src/preload/**` 需要读取 CLI 持久化事实源
  - 读取会话树、最近项目、project-aware inspector、smoke 相关宿主适配
- 这是典型 infra + cross-layer 场景：一旦 Electron main bundle 间接引入 `libsql`/原生动态依赖，`build` 可能通过，但真实 Electron 启动会在 main process 直接崩溃。

### 2. Signatures

推荐签名：

```ts
import { SessionStore } from '../../../cli/src/persistence/session-store.js'

const store = new SessionStore(join(homedir(), '.xnovacode', 'sessions'))
```

禁止在 `studio` main/preload 中用作会话树来源的签名：

```ts
import { sessionStore } from '../../../cli/src/persistence/index.js'
```

### 3. Contracts

- `studio` main/preload 若只需要会话 JSONL：
  - 只允许 import `session-store.ts` / `session-types.ts` / `session-utils.ts` 这类 leaf module
- `studio` main/preload 若需要 SQLite / 向量库：
  - 必须显式评审 native 依赖打包策略，不能通过 CLI barrel 间接带入
- `cli/src/persistence/index.ts` 当前会 re-export：
  - `db.ts`
  - `ensureMemoryVectors`
  - `getDb`
  - 这些会把 `libsql`/native dynamic require 一起带进 Electron main bundle

### 4. Validation & Error Matrix

| 条件 | 处理方式 |
|---|---|
| `studio` main import `cli/src/persistence/index.ts` | 视为高风险边界违规，必须改为 leaf import |
| Electron build 通过但真实启动报 `Could not dynamically require "@libsql/..."` | 优先回溯最近的 CLI barrel import，而不是先改 Electron 配置 |
| 只需要 session JSONL，却顺带 import `db.ts` | 视为重复耦合，必须拆掉 |

### 5. Good / Base / Bad Cases

- Good：
  - `studio-shell-inspector` 直接 new `SessionStore(...)`，只读取 JSONL 会话事实源
- Base：
  - 通过依赖注入把 `SessionStore` 传给 inspector，测试和宿主都不碰 SQLite
- Bad：
  - `studio` main 通过 `@persistence/index` 取 `sessionStore`，让 `libsql` 在 Electron main runtime 动态加载

### 6. Tests Required

- 单元测试：
  - `studio-shell-inspector.test.ts` 断言源码不再 import `cli/src/persistence/index`
  - `studio` main 侧若新增 Settings / Memory / Tools 服务，需断言不会在启动主路径静态 import 会触发 `libsql` 的模块
  - inspector 在损坏会话下仍能返回最近项目，而不是把整个 shell 弄崩
- 集成 / smoke：
  - 真实 Electron smoke 通过 `host.getState -> openWorkspace -> runtime.inspect`
  - 不再出现 main process `@libsql/...` 动态 require 崩溃

### 7. Wrong vs Correct

#### Wrong

```ts
import { sessionStore } from '../../../cli/src/persistence/index.js'
```

问题：

- 通过 barrel 间接带入 `db.ts`
- Electron main bundle 会包含原生动态依赖
- build 可能通过，真实启动才崩

#### Correct

```ts
import { SessionStore } from '../../../cli/src/persistence/session-store.js'

const store = new SessionStore(join(homedir(), '.xnovacode', 'sessions'))
```

并把 `store` 作为 inspector 依赖注入，保持 `studio` main 只消费 JSONL 事实源，而不是无意碰到 SQLite/native 层。

### 8. Extended Note: 按需加载会触发 Native 依赖的服务

- 适用场景：
  - `studio/src/main/**` 新增 Memory / Settings / Tools 服务
  - 服务内部会读取 `db.ts`、`libsql-vector-store.ts`、`memory overview` 之类最终依赖 `libsql` 的模块
- 规则：
  - **禁止**把这类服务静态 import 到 Electron main 的启动主路径
  - 如果确实需要通过 IPC 触发，必须延迟到 handler 调用时再 `import()`，并确保失败能显式返回给 renderer
  - **补充红线（2026-04-23 Phase 7）**：
    即便是 `readMemoryOverview()` 这类“只读概览”服务，也**不能**在模块顶层静态 `import '../persistence/db.js'`；
    否则 Electron 打包态会在导入阶段直接触发 `@libsql/...` native require，连 fallback 逻辑都来不及执行
- 典型风险：
  - `electron-vite build` 通过，但真实启动立刻报
    `Could not dynamically require "@libsql/..."`
- 推荐做法：
  - 启动主路径只挂载 thin IPC handler
  - handler 内部按需加载会触发 native 依赖的实现
  - 对 read-only overview / status service，也要把 `db.ts` 读取下沉到函数内部（例如默认 getter 用 `await import('../persistence/db.js')`），而不是停留在文件顶层 import
  - renderer 把失败显示成降级提示，不允许主进程因某张状态卡片直接崩溃
