# Runtime Boundary 专项规范

> 本规范约束 `Xnova Studio v1` 的 `shared runtime + dual host` 边界，避免后续实现时把 CLI UI、桌面宿主、Web/renderer 状态重新耦回同一层。

## 当前事实

- 当前主线已切换为 `packages/ + apps/`：
  - `packages/runtime/` 承载共享运行时入口、bridge、events、inspect、factory
  - `packages/core/` 承载 `AgentLoop`、`bootstrap`、`context-manager` 等编排内核
  - `apps/studio/` 是当前唯一主宿主
- `cli/` 仍保留为历史供体与迁移参考，但不再定义运行时的物理边界
- 当前运行时装配仍处于过渡态：
  - `packages/runtime` 已改为优先依赖 `@xnova/core`
  - `packages/core` 仍临时映射部分旧 `cli/src/**` 领域包，等待后续 package 子任务继续接管
- 需求文档已锁定目标方向：
  - `shared runtime + dual host`
  - 物理位置上由 `packages/runtime + packages/core` 承载核心，而不是继续挂靠 `cli/src/runtime`

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

> **类型引用约定（当前主线，参见 `packages/runtime/src/types.ts`）**：
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
> - **实现约束**：新增字段须同时更新本 spec 与 `packages/runtime/src/types.ts`。

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
| `apps/studio` main / build / test alias 仍把 `@core/@config/@memory/...` 解析回 `cli/src` | 视为 P0 假迁移，必须改为 `packages/*` 或 `packages/core` 子目录 |
| host 每次 `submit` 都先 `dispose()` 再重建 runtime | 视为会话生命周期缺陷，必须改成会话级持有并按 session/cwd/agent 复用 |
| host 对 `requestPermission()` 无条件 `allow: true` | 视为安全红线，至少要有显式 allow/deny 策略与审计事件 |
| runtime 初始化部分能力失败（如 embedding） | 可降级，但必须通过 warning/event 暴露 |
| host/renderer 未就绪 | runtime 不应直接依赖 UI 完成后才可构建 |

### 5. Good / Base / Bad Cases

- Good：
  - `runtime` 输出统一事件流，CLI 与桌面只消费
  - CLI host 只负责终端交互，不再装配底层能力
  - renderer 只通过 bridge/IPC 请求 runtime 行为
  - `apps/studio` 的 main/build/test 全部只解析到 `packages/*`
  - Studio host 以 session 维度持有 runtime，并对权限请求产出显式决策事件
- Base：
  - 先从 `core/bootstrap.ts` 抽出 registry/session/config 边界，保留兼容层
- Bad：
  - 把 `useChat`、Bridge API、Electron IPC、ToolRegistry 再次揉成一个模块
  - CLI host 和 desktop host 各自复制一套 memory/mcp 初始化逻辑
  - 看上去 import 了 `@xnova/*`，但 Vite/Vitest alias 仍偷偷回指 `cli/src`

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

- Runtime 层（当前主线）：
  - 类型契约：`packages/runtime/src/types.ts`
  - Factory 入口：`packages/runtime/src/create-runtime.ts`
  - Bridge 实现：`packages/runtime/src/bridge.ts`
- Core 层（当前主线）：
  - 编排内核：`packages/core/src/agent-loop.ts`
  - 装配中心：`packages/core/src/bootstrap.ts`
  - 上下文管理：`packages/core/src/context-manager.ts`
- Studio Host 层（当前主线）：
  - Runtime host service：`apps/studio/src/main/studio-runtime-service.ts`
  - Runtime inspect：`apps/studio/src/main/studio-runtime-inspector.ts`
- Legacy 参考层：
  - `cli/src/host/cli/*`
  - `cli/src/ui/useChat.ts`
  - `cli/src/server/bridge/*`

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

## 场景：Studio Main 复用 Shared Runtime 时必须 externalize Native Runtime Dependencies

### 1. Scope / Trigger

- 触发条件：
  - `studio/src/main/**` 通过 `cli/src/runtime/create-runtime.ts` 复用 shared runtime
  - `electron.vite.config.ts` 调整 main bundle 打包策略
  - `studio/package.json` 需要声明供 Electron main 使用的运行时依赖
- 这是 infra + cross-layer 场景：shared runtime 可以合法依赖 `libsql`，但 Electron main bundle **不能**把 `libsql` 原生动态加载逻辑错误内联；否则 build 能过，真实 `runtime.submit` 会在主链路第一轮执行时崩溃。

### 2. Signatures

推荐签名：

```ts
// studio/electron.vite.config.ts
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

- 当 `studio` main bundle 复用 CLI shared runtime，且该 runtime 传递依赖 `db.ts` / `libsql-vector-store.ts` / `memory-manager.ts`：
  - `electron-vite` main build 必须把 `libsql` 与 `@libsql/*` 设为 external
  - `studio/package.json` 必须显式声明 `libsql` 运行时依赖，不能指望从 `cli/node_modules`“碰巧解析到”
- 判定标准：
  - 构建后的 `studio/dist/main/chunks/db-*.js` 应表现为 `require("libsql")`
  - 不应再出现 Rollup commonjs helper 抛出的
    `Could not dynamically require "@libsql/..."`
- 该规则只约束 **main** 宿主边界；
  - renderer / preload 不允许直接消费 `libsql`
  - CLI 侧原本如何使用 `libsql` 不受此条约束

### 4. Validation & Error Matrix

| 条件 | 处理方式 |
|---|---|
| `studio` main bundle 未 externalize `libsql` | 视为 P0 打包边界缺陷，必须修构建配置 |
| `studio/package.json` 未声明 `libsql` 依赖 | 视为宿主依赖缺陷，必须补齐 package 声明与 lockfile |
| build 通过，但 `runtime.submit` 报 `Could not dynamically require "@libsql/..."` | 优先检查 main build external 配置与 `studio` 自身依赖，而不是先怀疑 Provider 配置 |
| 构建产物仍内联 `commonjsRequire("@libsql/...")` helper | 说明 native 依赖仍被错误 bundle，禁止合入 |

### 5. Good / Base / Bad Cases

- Good：
  - `studio/electron.vite.config.ts` 明确维护 `nativeRuntimeExternals`
  - `studio/package.json` 自己声明 `libsql`，Electron 宿主依赖自洽
  - 回归测试直接锁住 build config + package contract
- Base：
  - 只 externalize 当前已知的 `libsql` native 依赖，并在新增 native 包时照此扩展
- Bad：
  - 仅靠 “CLI 已经装过 libsql” 侥幸运行
  - 只在代码层修 import，不修宿主的打包和依赖声明

### 6. Tests Required

- 单元测试：
  - `studio/tests/native-runtime-packaging.test.ts`
    - 断言 `electron.vite.config.ts` 的 main external 含 `libsql` 与 `/^@libsql\\//`
    - 断言 `studio/package.json` 声明 `dependencies.libsql` 与 `pnpm.onlyBuiltDependencies`
- 构建验证：
  - `pnpm --dir studio build`
  - 检查 `dist/main/chunks/db-*.js` 使用 `require("libsql")`，而不是 Rollup 动态 require helper
- 回归验证：
  - `pnpm --dir studio test`
  - `pnpm --dir studio typecheck`

### 7. Wrong vs Correct

#### Wrong

```ts
export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
        },
      },
    },
  },
})
```

```json
{
  "dependencies": {
    "react": "^19.2.5"
  }
}
```

问题：

- `studio` main 会把 `libsql` 错误 bundle 进 Electron 产物
- 真实 `runtime.submit` 才暴露 native dynamic require 崩溃
- 宿主依赖不自洽，打包产物无法独立运行

#### Correct

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

这样 shared runtime 仍可复用 CLI 的 `db.ts` / Memory 链路，但 native 绑定交由 Electron main 在宿主依赖树中正常解析，不再落入 bundler 动态 require 陷阱。

## 场景：Host 直接调用 Runtime.submit 时必须显式携带当前用户消息 History

### 1. Scope / Trigger

- 触发条件：
  - `studio/src/main/**`、`host/cli/**` 或其他宿主直接调用 `runtime.submit(...)`
  - 宿主没有像 `useChat` 一样维护 `ContextManager`
- 这是 cross-layer 契约：`Runtime.submit.text` 只是本轮输入文本，不会自动替宿主把它注入 `history`。如果宿主传空 history，Provider 侧最终可能收到空 `messages`，直接在首轮请求报 400。

### 2. Signatures

推荐签名：

```ts
await runtime.submit({
  text,
  history: [{ role: 'user', content: text }],
  loggedUserContent: text,
  provider,
  model,
})
```

CLI `useChat` 这类已维护 `ContextManager` 的场景可传：

```ts
await runtime.submit({
  text,
  history: contextManager.getHistoryRef(),
  loggedUserContent,
  provider,
  model,
})
```

### 3. Contracts

- `Runtime.submit.text`：
  - 用于本轮输入的语义标识、日志与调用方状态管理
  - **不等于** Runtime 会自动构造首条 `user` history
- `Runtime.submit.history`：
  - 必须是“本轮送给 AgentLoop 的完整历史”
  - 至少包含当前用户消息；否则 `AgentLoop.run(history)` 首轮就是空数组
- `Runtime.submit.loggedUserContent`：
  - 与写入 session JSONL 的原始用户输入保持一致
  - 宿主直接调用时，默认应与 `text` 同源

### 4. Validation & Error Matrix

| 条件 | 处理方式 |
|---|---|
| 宿主直接调 `runtime.submit` 且未传 `history` | 视为高风险主链路缺陷，必须修宿主 submit 装配 |
| Provider 返回 `messages must not be empty` | 优先检查宿主是否遗漏当前 user turn history |
| 使用 `ContextManager` 的宿主传 `contextManager.getHistoryRef()` | 合法，前提是 submit 前已把当前 user turn 写入 ContextManager |

### 5. Good / Base / Bad Cases

- Good：
  - `Studio` 主进程在 submit 前构造 `[{ role: 'user', content: text }]`
  - `CLI useChat` 先 `pushUser(...)`，再把 ContextManager history 传给 runtime
- Base：
  - 一次性宿主至少保证首轮 history 不为空
- Bad：
  - 只传 `text/provider/model`，期望 Runtime 自己“猜”出 messages

### 6. Tests Required

- 单元测试：
  - `studio-runtime-service.test.ts`
  - `studio-runtime-service-guard.test.ts`
  - 断言 `runtime.submit` 收到 `history: [{ role: 'user', content: text }]` 与 `loggedUserContent`
- 回归验证：
  - 真实首轮对话不再报 Provider 侧 `messages must not be empty`

### 7. Wrong vs Correct

#### Wrong

```ts
await runtime.submit({
  text,
  provider,
  model,
})
```

问题：

- AgentLoop 首轮拿到空 history
- Provider 侧可能直接报 `messages must not be empty`

#### Correct

```ts
await runtime.submit({
  text,
  history: [{ role: 'user', content: text }],
  loggedUserContent: text,
  provider,
  model,
})
```

这样 Runtime 才能像 CLI 主链路一样，真正从当前用户消息开始构造首轮对话。
