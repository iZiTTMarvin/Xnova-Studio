# Backend 开发规范

> 适用范围：`packages/**` 中的运行时、编排内核、配置、持久化、Provider、Tools、Memory、MCP、Skills、Plugin、Platform、Observability 等后端与基础设施代码，以及 `apps/studio/src/main/**`、`apps/studio/src/preload/**` 的宿主适配代码。
>
> 当前状态：`packages/* + apps/studio` 主线已落地；`cli/` 与根 `studio/` 仅保留为历史供体与迁移参考。

## 当前基线

- 产品核心 backend 已收敛到 `packages/*`：
  - `packages/runtime/`：shared runtime factory、bridge、events、inspect、engine service API
  - `packages/core/`：`AgentLoop`、`bootstrap`、`context-manager`、cleanup、hooks、file-index 等编排内核
  - `packages/config/providers/persistence/tools/memory/mcp/skills/plugin/platform/observability/`：稳定领域能力
- `apps/studio` 是当前唯一主宿主：
  - `src/main/` 负责 Electron main host、权限、runtime 生命周期、服务装配
  - `src/preload/` 只负责安全桥、参数校验与 IPC 暴露
- `apps/cli/`、`cli/` 与根 `studio/` 不再定义 backend 物理边界。需要复用 legacy 能力时，应先收敛进 `packages/*`，再由宿主消费。
- 任何从 `cli/src/commands/**`、旧 bridge、旧 host 迁出的业务能力，都必须优先改造成 `packages/runtime/src/engine-service-api.ts` 或对应领域 service，而不是把命令文件原样搬进宿主。

## 指南索引

| 指南 | 作用 | 状态 |
|---|---|---|
| [directory-structure.md](./directory-structure.md) | 目录边界、模块归属、命令迁移落点 | 当前主线 |
| [database-guidelines.md](./database-guidelines.md) | SQLite / libsql / migration / 向量存储约束 | 基础版 |
| [error-handling.md](./error-handling.md) | 失败边界、降级策略、用户可见错误 | 基础版 |
| [logging-guidelines.md](./logging-guidelines.md) | 调试日志、会话观测、脱敏要求 | 基础版 |
| [quality-guidelines.md](./quality-guidelines.md) | TDD、类型检查、测试门禁、反模式 | 基础版 |
| [runtime-boundary.md](./runtime-boundary.md) | runtime / host / preload / renderer 的共享契约与 engine service API 约束 | 当前主线 |
| [config-toml-migration.md](./config-toml-migration.md) | `config.json -> config.toml` 与 `project.toml` 迁移契约 | 专项 spec |
| [agent-schema-v1.md](./agent-schema-v1.md) | Agent frontmatter v1、来源与校验规则 | 专项 spec |

## Pre-Development Checklist

开始任何 backend 相关改动前，至少完成以下检查：

1. 先确认改动属于哪一层：
   - shared runtime / engine service API：`packages/runtime/**`
   - 编排内核：`packages/core/**`
   - 配置、Provider、持久化、Tools、Memory、MCP、Skills、Plugin、Platform、Observability：对应 `packages/*`
   - Studio host / preload 适配：`apps/studio/src/main/**`、`apps/studio/src/preload/**`
2. 必读 [directory-structure.md](./directory-structure.md)。
3. 如果改动涉及以下主题，追加阅读：
   - runtime / host / preload / renderer 边界、engine service API、submit 契约、打包边界：读 [runtime-boundary.md](./runtime-boundary.md)
   - 配置、迁移、持久化：读 [database-guidelines.md](./database-guidelines.md) 和 [error-handling.md](./error-handling.md)
   - 启动编排、Hook、MCP、Memory：读 [error-handling.md](./error-handling.md) 和 [logging-guidelines.md](./logging-guidelines.md)
   - 新增 service、工具、Agent、API 契约：读 [quality-guidelines.md](./quality-guidelines.md)
   - TOML 配置、项目配置、迁移：加读 [config-toml-migration.md](./config-toml-migration.md)
   - Agent 文件、模式、继承、默认 Agent：加读 [agent-schema-v1.md](./agent-schema-v1.md)
4. 任何修改常量、schema、配置键、IPC channel、engine service API 或目录边界前，先全仓搜索同类定义，避免只改一处。
5. 如果需求来自旧 `cli/src/commands/**` 或旧 host：
   - 先抽象 service 能力与 contract
   - 再迁移宿主入口
   - 禁止“先复制命令文件，再慢慢清理”
6. renderer 永远不能直连 `fs`、`child_process`、provider secrets、runtime internals、tool execution；任何新增能力都必须走 `main/preload/runtime` 边界。

## Quality Check

提交 backend 改动前至少确认：

- 相关 package 与 `apps/studio` 的类型检查通过：
  - 至少跑受影响包的 `pnpm --filter <pkg> typecheck`
  - 跨层改动默认跑根级 `pnpm typecheck`
- 涉及逻辑变更时，已补对应测试或失败用例；跨层改动默认补集成断言。
- 涉及 host 打包、native 依赖、Electron main 入口时，额外验证 `pnpm build` 或受影响宿主的 build。
- 新增错误路径不会静默吞掉；要么向上抛出，要么记录 warning 并给用户可见反馈。
- `apps/studio/src/main` 与 `src/preload` 没有重新复制 runtime / memory / mcp / session 的业务逻辑。
- 新模块没有把 UI、宿主、运行时逻辑重新耦在一起。
- 若改动形成了新的稳定约束，及时回写本目录 spec，而不是只留在聊天记录里。

## 专项 Spec 触发器

下列改动默认必须读取对应专项 spec：

- `runtime-boundary.md`
  - 新增或修改 `packages/runtime/**`
  - 新增或修改 `packages/core/**` 的装配边界
  - 新增或修改 `apps/studio/src/main/**`、`apps/studio/src/preload/**`
  - 迁移旧 `cli/src/commands/**` 到 engine service API
  - 改动 renderer -> preload -> main -> runtime 的 submit / inspect / event 契约
- `config-toml-migration.md`
  - 读写 `config.toml` / `project.toml`
  - 迁移或兼容旧 `config.json`
  - 改动 provider / memory / modes / features 默认值合并规则
- `agent-schema-v1.md`
  - 解析 agent frontmatter
  - 新增或修改 `mode / inherits / tool_policy / model_preference`
  - 主 Agent / SubAgent 候选池过滤
