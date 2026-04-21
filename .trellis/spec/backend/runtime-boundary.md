# Runtime Boundary 专项规范

> 本规范约束 `Xnova Studio v1` 的 `shared runtime + dual host` 边界，避免后续实现时把 CLI UI、桌面宿主、Web/renderer 状态重新耦回同一层。

## 当前事实

- 当前运行时装配中心仍是 `cli/src/core/bootstrap.ts`
- 当前主业务循环仍由 `cli/src/core/agent-loop.ts`、`cli/src/ui/useChat.ts` 和工具/存储单例共同驱动
- 当前桌面宿主 `studio/` 尚未实现
- 需求文档已锁定目标方向：
  - `shared runtime + dual host`
  - 先抽 `cli/src/runtime/`
  - 再由 `cli/src/host/cli/` 与未来 `studio/` 消费

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
  submit(input: RuntimeSubmitInput): Promise<void>
  abort(): void
  dispose(): Promise<void>
  getSnapshot(): RuntimeSnapshot
}

function createRuntime(input: RuntimeConfigInput, bridge: RuntimeHostBridge): Promise<RuntimeInstance>
```

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

- 装配中心：`cli/src/core/bootstrap.ts`
- 业务循环：`cli/src/core/agent-loop.ts`
- 终端业务 Hook：`cli/src/ui/useChat.ts`
- Bridge 适配：`cli/src/server/bridge/*`

## 反模式

- 不要在 Phase 1 做目录搬家大于边界抽象。
- 不要在 renderer 里偷连底层单例。
- 不要让 runtime contract 只存在于聊天记录，而没有写进 spec 与测试。
