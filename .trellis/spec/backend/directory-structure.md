# Backend 目录与模块边界

> 本文件描述当前仓库后端代码的真实组织方式，以及 `Xnova Studio v1` 开发期新增代码应落在哪一层。

## 当前目录事实

当前后端主体位于 `cli/src/`，核心目录如下：

```text
cli/src/
├─ core/            # 启动编排、AgentLoop、事件总线、上下文管理
├─ config/          # config.json、权限、指令、MCP 配置读取
├─ persistence/     # session JSONL、SQLite、恢复逻辑
├─ memory/          # 记忆管理、RAG、向量存储、相关工具
├─ providers/       # LLM Provider 适配与包装
├─ tools/           # 核心工具、扩展工具、Agent 工具
├─ hooks/           # hook 发现与执行
├─ mcp/             # MCP manager 与工具桥接
├─ server/          # Web dashboard / bridge API
├─ file-index/      # 文件索引与监听
├─ plugin/          # runtime plugin 注册与存储
├─ platform/        # shell / path / snapshot 等平台能力
└─ observability/   # session logger / token meter
```

## 模块归属规则

### 1. `core/` 只放运行时编排，不放宿主 UI

- 典型文件：
  - `cli/src/core/bootstrap.ts`
  - `cli/src/core/agent-loop.ts`
  - `cli/src/core/context-manager.ts`
- 这里可以依赖工具、Provider、Persistence、Memory。
- 这里**不应**直接依赖具体页面、Ink 组件或未来 Electron renderer 组件。

### 2. `config/` 负责读取、合并、校验配置，不负责 UI 交互

- 典型文件：
  - `cli/src/config/config-manager.ts`
  - `cli/src/config/mcp-config.ts`
  - `cli/src/config/instructions-loader.ts`
- 新增配置读取逻辑优先放这里。
- “配置保存成功后页面如何提示”属于前端或 API 层，不属于 `config/`。

### 3. `persistence/` 负责本地事实源

- 典型文件：
  - `cli/src/persistence/db.ts`
  - `cli/src/persistence/session-store.ts`
- 任何本地 SQLite、JSONL、恢复索引、branch/session 树，都应落在这里。
- 不要把 SQL 或文件读写逻辑散落到 `core/`、`tools/`、`server/`。

### 4. `tools/` 是工具定义层，不是业务杂物箱

- 典型文件：
  - `cli/src/tools/core/read-file.ts`
  - `cli/src/tools/ext/verify-code.ts`
  - `cli/src/tools/agent/dispatch-agent.ts`
- 单个工具文件应只关心：
  - 参数 schema
  - 权限/限制
  - 执行逻辑
  - 结果回传
- 如果工具依赖复杂业务，业务应抽到 `core/`、`memory/`、`persistence/` 等模块，再由工具调用。

### 5. `server/` 只做桥接与 API 暴露

- 典型文件：
  - `cli/src/server/bridge/server.ts`
  - `cli/src/server/dashboard/api.ts`
- Server 层负责 HTTP / WebSocket / bridge 协议。
- 业务规则不要在 server 再写一份，应复用 `core/`、`config/`、`persistence/`。

## v1 演进落点

需求文档已锁定的方向是 `shared runtime + dual host`。在不做大搬家的前提下，新增结构性代码优先按下面落位：

```text
Xnova-Code/
├─ cli/
│  └─ src/
│     ├─ runtime/         # 新增：共享运行时入口、边界、装配
│     ├─ host/cli/        # 新增：CLI 宿主适配
│     ├─ core/            # 逐步收敛到更小的编排与兼容层
│     └─ ...
├─ studio/                # 新增：桌面宿主
└─ docs/
```

或者最小落点可以理解为：

```text
cli/src/
├─ runtime/         # 新增：共享运行时入口、边界、装配
├─ host/cli/        # 新增：CLI 宿主适配
├─ core/            # 逐步收敛到更小的编排与兼容层
└─ ...
```

新增规则：

- 想做“CLI 和桌面都能复用”的代码，优先考虑 `runtime/`。
- 明显只属于终端交互、pipe mode、Ink 装配的逻辑，放 `host/cli/`。
- 在 `studio/` 尚未创建前，不要为了“未来也许复用”把所有东西硬塞进 `core/`。
- `v1` 明确采用**渐进式拆分**，不是先做重型 monorepo 搬家。
- **禁止**在 `Phase 1` 一开始把仓库整体改造成 `apps/cli + apps/studio + packages/runtime` 结构。
- 如果后续真的需要 packages 化，也必须满足：
  - `runtime` 边界已经在 `cli/src/runtime/` 内跑稳
  - CLI 主链路与测试基线已经稳定
  - 桌面宿主已经开始实际消费该边界

### Design Decision: 渐进式拆分优先于 monorepo 搬家

**Context**：`docs/xnova-studio-v1开发文档.md` 已明确，当前项目仍处于测试基础薄弱、主链路尚在收敛阶段。

**Options Considered**：
1. 立即做 `apps/packages` 大搬家
2. 先在 `cli/src/` 内抽 `runtime/` 与 `host/cli/`，再让 `studio/` 接入

**Decision**：选择方案 2。原因是当前阶段最大的风险是“行为迁移”和“运行时边界不稳”，而不是仓库目录看起来不够高级。

**Why**：

- 先做 monorepo 搬家，会把目录迁移、构建链、路径别名、运行时回归叠在同一批变更里
- 当前 `cli/` 仍是唯一真实主实现，应该先围绕它抽稳定边界
- `studio/` 尚未落地时，过早 packages 化只会放大迁移成本

**Wrong vs Correct**

#### Wrong

```text
apps/cli
apps/studio
packages/runtime
packages/config
packages/agents
```

在没有 runtime 稳定边界、没有测试基线前直接全仓搬家。

#### Correct

```text
cli/src/runtime/
cli/src/host/cli/
studio/
```

先完成增量拆分，再决定是否值得继续 packages 化。

## 命名约定

- 文件名统一使用 `kebab-case`：`config-manager.ts`、`session-store.ts`
- 管理器/注册器/桥接器类名使用 `PascalCase`：`ConfigManager`、`HookManager`
- 纯函数工具文件优先按职责命名，而不是 `utils.ts`
- 目录名使用领域词，而不是抽象词：
  - 推荐：`memory/`, `providers/`, `persistence/`
  - 避免：`helpers/`, `misc/`, `common/`

## 新文件放置判断

### 放在 `core/`

- 需要组合多个子系统
- 代表一次完整运行时流程
- 不依赖具体 UI 视图

### 放在 `config/`

- 解析配置文件
- 合并多级配置
- 校验配置字段

### 放在 `persistence/`

- 要落地到 SQLite / JSONL / 本地文件
- 与 session / branch / restore / pricing / memory meta 有关

### 放在 `server/`

- HTTP route
- WebSocket 消息桥接
- Dashboard API 适配

## 示例文件

- 运行时编排示例：`cli/src/core/bootstrap.ts`
- 配置管理示例：`cli/src/config/config-manager.ts`
- 持久化示例：`cli/src/persistence/db.ts`
- 工具边界示例：`cli/src/tools/agent/types.ts`
- Server 边界示例：`cli/src/server/dashboard/api.ts`

## 反模式

- 不要把 SQL 直接写进 UI 或 command 文件。
- 不要把 Web API DTO、CLI 宿主状态、运行时核心状态揉在一个模块里。
- 不要新建“临时过渡目录”长期搁置；如果是过渡层，要在注释或 spec 中写明未来收敛方向。
