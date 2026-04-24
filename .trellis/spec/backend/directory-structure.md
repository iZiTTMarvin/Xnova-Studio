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

当前主线已切换为 **`packages/ + apps/`**：

```text
Xnova-Code/
├─ packages/
│  ├─ runtime/            # 产品核心运行时入口
│  ├─ core/               # 运行时编排内核
│  ├─ config/
│  ├─ providers/
│  ├─ persistence/
│  ├─ tools/
│  ├─ memory/
│  ├─ mcp/
│  ├─ skills/
│  └─ ...
├─ apps/
│  ├─ studio/             # 唯一主宿主
│  └─ cli/                # 次级宿主占位 / 兼容适配
├─ cli/                   # 历史供体与迁移参考，非主落点
└─ studio/                # 冻结的旧桌面目录
```

新增规则：

- 想做“Studio 和未来 CLI 都能复用”的代码，优先进入 `packages/*`。
- `packages/runtime` 是产品核心入口，不应再放在 `cli/` 目录语义下。
- `apps/studio` 是唯一主宿主；`studio/` 仅保留为冻结参考目录。
- 终端交互、旧命令系统、旧桥接服务属于宿主/遗留层，不应再反向定义核心目录结构。

### Design Decision: Packages/Apps 优先于继续挂靠 cli/

**Context**：产品主线已从 CLI 切换到 Studio，继续把 runtime 物理放在 `cli/src/` 下会持续误导 AI、维护者和后续迁移任务。

**Options Considered**：
1. 继续维持 `cli/src/runtime/` 作为共享运行时，再逐步修补边界
2. 迁入 `packages/runtime` / `packages/core`，由 `apps/studio` 作为主宿主消费

**Decision**：选择方案 2。原因是当前阶段最大的风险已不再是“是否过早 monorepo”，而是“runtime 物理位置与产品语义长期错位”。

**Why**：

- `runtime` 仍挂在 `cli/` 下时，任何人都会默认它是 CLI 内部实现
- `apps/studio` 作为主宿主需要稳定依赖 package 化核心，而不是直接绑定历史供体目录
- `cli/` 现在的职责是提供可迁移能力，不再是定义项目主结构的锚点

**Wrong vs Correct**

#### Wrong

```text
cli/src/runtime/
cli/src/core/
studio/
```

让主产品继续依赖历史目录语义。

#### Correct

```text
packages/runtime/
packages/core/
apps/studio/
```

让物理位置、语义边界和产品主线保持一致。

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
