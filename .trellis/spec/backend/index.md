# Backend 开发规范

> 适用范围：`cli/src/**` 中除 `ui/` 之外的运行时、配置、持久化、Provider、Bridge Server、Memory、MCP、Tools 等后端与基础设施代码。
>
> 当前状态：基础版 bootstrap 规范。内容来源于现有 `cli/` 代码骨架，以及 [`docs/xnova-studio-v1开发文档.md`](../../../docs/xnova-studio-v1开发文档.md)、[`docs/xnova-studio-V1核心设计文档.md`](../../../docs/xnova-studio-V1核心设计文档.md)、[`docs/xnova-stuido-V1工程测试计划.md`](../../../docs/xnova-stuido-V1工程测试计划.md)。

## 当前基线

- 当前仓库的主实现仍集中在 `cli/src/`，尚未落地 `studio/` 与最终的 `shared runtime + dual host` 拆分。
- 因此本规范分成两层：
  - **现有事实**：新改动必须先遵守当前代码已经形成的模式。
  - **v1 基线**：对尚未开发完成的能力，以需求文档中已锁定的方向作为新增代码的默认约束。
- 当“现有实现”与“v1 基线”冲突时：
  - 修 bug、补小功能时，以现有实现兼容为先。
  - 做结构性演进时，以 `shared runtime`、`project-aware config`、`Agent/Memory/MCP` 可复用边界为目标，并保留迁移兼容层。

## 指南索引

| 指南 | 作用 | 状态 |
|---|---|---|
| [directory-structure.md](./directory-structure.md) | 目录边界、模块归属、命名方式 | 基础版 |
| [database-guidelines.md](./database-guidelines.md) | SQLite / libsql / migration / 向量存储约束 | 基础版 |
| [error-handling.md](./error-handling.md) | 失败边界、降级策略、用户可见错误 | 基础版 |
| [logging-guidelines.md](./logging-guidelines.md) | 调试日志、会话观测、脱敏要求 | 基础版 |
| [quality-guidelines.md](./quality-guidelines.md) | TDD、类型检查、测试门禁、反模式 | 基础版 |
| [runtime-boundary.md](./runtime-boundary.md) | `shared runtime + dual host` 的边界契约 | 专项 spec |
| [config-toml-migration.md](./config-toml-migration.md) | `config.json -> config.toml` 与 `project.toml` 迁移契约 | 专项 spec |
| [agent-schema-v1.md](./agent-schema-v1.md) | Agent frontmatter v1、来源与校验规则 | 专项 spec |

## Pre-Development Checklist

开始任何 backend 相关改动前，至少完成以下检查：

1. 先确认改动属于哪一层：
   - 运行时编排：`cli/src/core/**`
   - 配置：`cli/src/config/**`
   - 持久化：`cli/src/persistence/**`
   - Provider / MCP / Memory / Hooks / Tools：对应子目录
2. 必读 [directory-structure.md](./directory-structure.md)。
3. 如果改动涉及以下主题，追加阅读：
   - 配置、迁移、持久化：读 [database-guidelines.md](./database-guidelines.md) 和 [error-handling.md](./error-handling.md)
   - 启动编排、Hook、MCP、Memory：读 [error-handling.md](./error-handling.md) 和 [logging-guidelines.md](./logging-guidelines.md)
   - 新增命令、工具、Agent、API 契约：读 [quality-guidelines.md](./quality-guidelines.md)
   - runtime / host / renderer 边界：加读 [runtime-boundary.md](./runtime-boundary.md)
   - TOML 配置、项目配置、迁移：加读 [config-toml-migration.md](./config-toml-migration.md)
   - Agent 文件、模式、继承、默认 Agent：加读 [agent-schema-v1.md](./agent-schema-v1.md)
4. 任何修改常量、schema、配置键或目录边界前，先全仓搜索同类定义，避免只改一处。
5. 任何计划中的“新架构”代码都不能直接绕过当前 CLI 主链路；如果要演进，必须沿 `runtime -> host` 的方向做增量拆分。

## Quality Check

提交 backend 改动前至少确认：

- `cli` 侧 `pnpm typecheck` 通过。
- 涉及逻辑变更时，已补对应测试或失败用例。
- 新增错误路径不会静默吞掉；要么向上抛出，要么记录 warning 并给用户可见反馈。
- 配置、数据库、Agent schema、Memory、Session 恢复等高风险链路，不能只做“成功路径”。
- 新模块没有把 UI、宿主、运行时逻辑重新耦合在一起。
- 若改动形成了新的稳定约束，及时回写本目录 spec，而不是只留在聊天记录里。

## 专项 Spec 触发器

下列改动默认必须读取对应专项 spec：

- `runtime-boundary.md`
  - 新增 `cli/src/runtime/**`
  - 拆分 `core/bootstrap.ts`
  - 新建 `studio/` 宿主或 IPC 适配
- `config-toml-migration.md`
  - 读写 `config.toml` / `project.toml`
  - 迁移或兼容旧 `config.json`
  - 改动 provider / memory / modes / features 默认值合并规则
- `agent-schema-v1.md`
  - 解析 agent frontmatter
  - 新增或修改 `mode / inherits / tool_policy / model_preference`
  - 主 Agent / SubAgent 候选池过滤
