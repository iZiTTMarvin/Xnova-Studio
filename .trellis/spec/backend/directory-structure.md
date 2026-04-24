# Backend 目录与模块边界

> 本文件描述当前仓库 backend 的真实组织方式，目标是让“产品核心在哪一层、宿主该做什么、legacy 代码该如何吸收”保持长期清晰。

## 当前目录事实

当前 backend 主体已经切换到 `packages/* + apps/*`：

```text
Xnova-Code/
├─ packages/
│  ├─ runtime/         # shared runtime facade / bridge / events / inspect / engine service API
│  ├─ core/            # AgentLoop / bootstrap / context-manager / cleanup / hooks / file-index
│  ├─ config/          # config.toml / project.toml / resolver / migration
│  ├─ providers/       # LLM provider 适配
│  ├─ persistence/     # session JSONL / SQLite / memory facts / restore
│  ├─ tools/           # 核心工具与工具注册
│  ├─ memory/          # 记忆管理、索引、检索
│  ├─ mcp/             # MCP manager / status / mutation
│  ├─ skills/          # skills 发现、概览、内容读取
│  ├─ plugin/          # plugin registry / metadata
│  ├─ platform/        # shell / path / snapshot 等平台能力
│  └─ observability/   # session logger / token meter / metrics
├─ apps/
│  ├─ studio/          # 当前唯一主宿主（main / preload / renderer）
│  └─ cli/             # 兼容宿主 / 迁移适配，不定义核心边界
├─ cli/                # 历史供体与迁移参考
└─ studio/             # 冻结旧目录，仅脚本转发到 apps/studio
```

## 模块归属规则

### 1. `packages/runtime/` 只放运行时外观层，不放宿主逻辑

- 典型职责：
  - `createRuntime(...)`
  - runtime types / bridge / events / inspect
  - `createEngineServiceApi(...)`
- 这里**不应**直接依赖 Electron、Ink、DOM、浏览器状态或 CLI 命令解析。
- 如果某能力要被 Studio host、未来 CLI host、测试桩共同消费，优先进入这一层或对应领域 package。

### 2. `packages/core/` 只放编排内核，不放 IPC / UI / 宿主状态

- 典型文件：
  - `packages/core/src/agent-loop.ts`
  - `packages/core/src/bootstrap.ts`
  - `packages/core/src/context-manager.ts`
- 这里可以依赖 `providers / tools / persistence / memory / mcp / observability`。
- 这里**不应**直接依赖 Electron main、preload、renderer 或旧 CLI UI 组件。

### 3. 领域 package 负责稳定业务能力，不负责页面交互

- `packages/config/`：读取、合并、校验配置
- `packages/persistence/`：SQLite、JSONL、会话树、恢复事实源
- `packages/tools/`：工具 schema、权限、执行、结果
- `packages/memory/`：记忆写入、检索、重建、概览
- `packages/mcp/`：MCP 状态与增删改
- `packages/skills/` / `packages/plugin/`：技能与插件事实源
- `packages/platform/` / `packages/observability/`：底层平台与观测能力

不要把这些逻辑散落回 `apps/studio/src/main/**`、`cli/src/commands/**` 或 renderer。

### 4. `apps/studio/src/main/` 是 host orchestration，不是第二套业务层

- 负责：
  - Electron 生命周期
  - runtime 生命周期与权限决策
  - IPC handler 装配
  - workspace 选择
  - 宿主级错误与降级策略
- 不负责：
  - 重新实现 `AgentLoop`
  - 重新实现 session / memory / mcp / skills 业务能力
  - 把旧 CLI command 文件整份搬进 main

### 5. `apps/studio/src/preload/` 是安全桥，不是业务逻辑层

- 负责：
  - 暴露 `window.xnovaStudio`
  - 参数校验
  - `ipcRenderer.invoke/on` 封装
- 不负责：
  - 读写本地文件
  - 保存 provider secrets
  - 直接执行工具
  - 缓存 runtime 内部状态

### 6. `apps/studio/src/shared/` 是跨层 contract 层

- 用于承载：
  - IPC request / response DTO
  - runtime event view model
  - shell snapshot / provider settings / memory overview 等共享类型
- 任何 renderer 和 main 都会消费的结构，优先进入 `src/shared/`，不要复制两份近似类型。

## 命令迁移规则

### Design Decision: 不迁移 `cli/src/commands/**` 文件，迁移“能力”

**Context**：旧 CLI 的 `/model`、`/compact`、`/resume`、`/mcp`、`/skills` 等命令文件本质上混杂了“命令解析”和“业务执行”。如果原样搬迁，会把宿主耦合重新带进 Studio 主线。

**Decision**：只迁移业务能力，不迁移命令文件本身：

- 命令解析、终端参数、斜杠命令词法：保留在宿主侧
- 真正的能力：下沉到 `packages/runtime/src/engine-service-api.ts` 或对应领域 service

**正确落点示例**：

- `runtime.setModel(...)`
- `runtime.compactContext(...)`
- `sessionService.resumeSession(...)`
- `sessionService.forkFromEvent(...)`
- `memoryService.getOverview(...)`
- `mcpService.addServer(...)`
- `skillsService.getOverview(...)`

#### Wrong

```text
apps/studio/src/main/commands/model.ts
apps/studio/src/main/commands/mcp.ts
```

把旧命令文件按宿主重新复制一遍。

#### Correct

```text
packages/runtime/src/engine-service-api.ts
packages/memory/src/overview-service.ts
packages/mcp/src/status-service.ts
```

让宿主只负责调用 service，不重新持有业务真相。

## 命名约定

- 文件名统一使用 `kebab-case`：`config-manager.ts`、`session-store.ts`
- 管理器/注册器/桥接器类名使用 `PascalCase`：`ConfigManager`、`HookManager`
- 纯函数工具文件优先按职责命名，而不是 `utils.ts`
- 目录名使用领域词，而不是抽象词：
  - 推荐：`memory/`, `providers/`, `persistence/`
  - 避免：`helpers/`, `misc/`, `common/`

## 新文件放置判断

### 放在 `packages/runtime/`

- 需要定义 shared runtime 对外契约
- 需要给多个宿主复用
- 属于 engine service API 或 runtime facade

### 放在 `packages/core/`

- 需要组合多个子系统
- 代表一次完整运行时流程
- 不依赖具体宿主 UI 或 IPC

### 放在领域 package

- 属于稳定业务能力
- 未来会被多个宿主或测试直接消费
- 可以脱离 Electron / CLI 独立验证

### 放在 `apps/studio/src/main/`

- 只与 Electron host 生命周期、权限、IPC、窗口状态有关
- 需要把 package 能力暴露成宿主 API

### 放在 `apps/studio/src/preload/`

- 只是桥接与参数校验
- 不拥有业务状态

## 当前代码示例

- Runtime facade：`packages/runtime/src/create-runtime.ts`
- Engine service API：`packages/runtime/src/engine-service-api.ts`
- 编排内核：`packages/core/src/bootstrap.ts`
- 持久化：`packages/persistence/src/persistence/session-store.ts`
- Studio host：`apps/studio/src/main/studio-runtime-service.ts`
- Studio preload / shared contract：`apps/studio/src/preload/index.ts`、`apps/studio/src/shared/studio-bridge-contract.ts`

## 反模式

- 不要让 `apps/studio/src/main/**` 重新长出第二套 runtime / memory / session 逻辑。
- 不要让 package 消费者继续直接 import `cli/src/**` 作为长期依赖。
- 不要把 renderer、preload、main、runtime 的 DTO 各写一份近似类型。
- 不要把“临时迁移目录”长期搁置；如果是过渡层，要在 spec 或注释中写清最终收敛方向。
