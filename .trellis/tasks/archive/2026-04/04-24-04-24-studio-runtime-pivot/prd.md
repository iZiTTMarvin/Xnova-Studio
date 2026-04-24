# Studio 运行时主线切换与 CLI 能力抽离

## Goal

把当前仓库的产品主线从 `cli` 明确切换到 `studio`。后续本项目只围绕 `studio` 演进；`cli` 不再作为需要持续兼容、维护或验收的主产品，而只作为“能力供体”和迁移参考。最终目标不是继续把运行时挂在 `cli/` 目录下，而是把运行时与核心领域能力迁移到独立的 `packages/` 层，让 `apps/studio` 成为主宿主，`apps/cli` 仅作为可选次级宿主。

## What I already know

- 用户已明确要求：
  - 以后本项目以 `studio` 为主
  - 不再维护或理会 `cli`
  - 如果 `cli` 中有重要能力，应抽离到新的独立核心目录
- 当前 `studio` 主链路虽然已经接入 shared runtime，但运行时事实源仍深度依赖 `cli/src/**`：
  - `cli/src/runtime/create-runtime.ts` 仍依赖 `bootstrapAll`、`contextManager`、`sessionLogger`、`tokenMeter`
  - `studio/src/main/studio-runtime-service.ts` 只是 Electron host 对这套 CLI 过渡 runtime 的适配层
- 当前设计文档写的是 `shared runtime + dual host`，方向本身没错，但“shared runtime”仍挂在 `cli/src/` 内部，导致 `studio` 长期受 CLI 结构绑架。
- 当前目录事实：
  - `cli/src/` 已沉淀的高价值领域：`config/`、`core/`、`mcp/`、`memory/`、`observability/`、`persistence/`、`platform/`、`providers/`、`runtime/`、`skills/`、`tools/`
  - `cli/src/` 明显的 CLI/旧宿主专属层：`commands/`、`host/cli/`、`server/`、`ui/`

## Assumptions (temporary)

- 采用 **`packages/ + apps/`** 结构作为最终迁移目标。
- `runtime` 的物理位置必须脱离 `cli/`，否则后续维护者仍会误判它是 CLI 内部实现。
- `cli` 在迁移完成后允许冻结、降级或仅保留参考价值；当前阶段不再把“CLI 还能不能跑”作为主验收标准。
- `studio` 仍维持三层结构：
  - `studio/src/main`
  - `studio/src/preload`
  - `studio/src/renderer`
- `renderer` 不直接碰文件系统/数据库/native 依赖，核心运行时仍由 `main` 持有。

## Open Questions

- 当前无阻塞性开放问题；若后续需要命名确认，默认采用 `core/`。

## Requirements (evolving)

- 最终目录结构改为 `packages/ + apps/`，避免运行时继续寄生在 `cli/` 目录语义下。
- `packages/runtime` 必须成为产品核心入口，而不是 `apps/cli` 的内部实现。
- `packages/core` 与其他领域包承载真正可复用的业务能力，不再让 `studio` 直接引用 `cli/src/**`。
- `apps/studio` 必须原生持有运行时实例与会话生命周期，不能继续每轮请求都临时拼接 CLI 单例。
- `apps/cli`、旧 `cli/web`、CLI UI、命令层不再作为主线依赖或主验收对象。
- 后续所有新增功能默认只面向 `packages/* + apps/studio`，不再要求对 `cli` 做镜像实现或回归兼容。
- Electron 三层边界必须固定：
  - `main`：创建 runtime、读写本地文件、调用工具、管理 provider/session/project、转发 runtime event、处理权限
  - `preload`：安全桥、参数校验、IPC invoke/on，不承载业务
  - `renderer`：展示与交互，不直接碰 `fs` / `child_process` / provider api key / runtime internals / tool execution

## Acceptance Criteria (evolving)

- [ ] 仓库存在 `packages/runtime`，其职责被明确建模为产品核心运行时
- [ ] 仓库存在 `packages/core` 及其他领域包，承载从旧 `cli/src/**` 抽离出的核心能力
- [ ] `apps/studio/src/main/**` 只依赖 `packages/*`，不再依赖旧 `cli/src/runtime/**` 作为长期事实源
- [ ] `apps/studio` 的主会话、工具调用、SubAgent、Memory、MCP、会话恢复都通过 package 化后的运行时实例驱动
- [ ] `apps/cli` 不再是任何新功能的验收前提
- [ ] `renderer` 不直接访问 `fs` / `child_process` / provider secrets / runtime internals / tool execution
- [ ] 迁移过程有阶段化测试与回退策略，避免一次性重写全部能力

## Definition of Done (team quality bar)

- 迁移阶段的单元测试 / 集成测试补齐
- `studio` typecheck / test / build 通过
- 关键架构决策与目录边界写入 spec / changelog
- 迁移范围、冻结范围、供体范围明确，不再口头约定

## Out of Scope (explicit)

- 不在这次任务里继续为 `cli/web` 或 CLI UI 做体验修修补补
- 不在这次任务里追求 `cli` 与 `studio` 双宿主长期并行维护
- 不在这次任务里保留“为了兼容旧 CLI 结构而继续把核心挂在 `cli/src/` 下”的过渡方案

## Technical Notes

- 目标目录方案：

```text
Xnova-Code/
├─ packages/
│  ├─ runtime/
│  │  └─ src/
│  │     ├─ create-runtime.ts
│  │     ├─ types.ts
│  │     ├─ bridge.ts
│  │     ├─ events.ts
│  │     └─ inspect.ts
│  ├─ core/
│  │  └─ src/
│  │     ├─ agent-loop.ts
│  │     ├─ bootstrap.ts
│  │     └─ context-manager.ts
│  ├─ providers/
│  ├─ tools/
│  ├─ memory/
│  ├─ mcp/
│  ├─ skills/
│  ├─ config/
│  └─ persistence/
├─ apps/
│  ├─ studio/
│  └─ cli/
└─ cli/                   # 旧实现，冻结/供体/参考
```

- Electron 三层职责固定：
  - `main`
    - 创建 runtime
    - 管理项目路径 / provider config / session
    - 调工具、读写本地文件、处理权限请求
    - 转发 runtime event
  - `preload`
    - 暴露 `window.xnovaStudio`
    - 参数校验
    - IPC invoke / subscribe
    - 不承载业务逻辑
  - `renderer`
    - 聊天 UI
    - 工具调用卡片
    - 权限确认弹窗
    - 模型选择器
    - 项目树 / 会话树 / Memory / MCP / 设置页

- `renderer` 禁止直接接触：
  - `fs`
  - `child_process`
  - provider api key
  - runtime internals
  - tool execution

- `cli/src/commands/**` 迁移原则：
  - **不原样迁移 command 文件**
  - command 只是一层 CLI 语法壳，真正需要抽的是其背后的业务能力和 service API
  - `registry.ts` / `types.ts` / `help.ts` / `exit.ts` 视为宿主层或交互层，不进入 engine core
  - 需要抽成 engine service 的能力包括：
    - `runtime.setModel`
    - `runtime.compactContext`
    - `runtime.getContextSnapshot`
    - `memoryService`
    - `mcpService`
    - `skillsService`
    - `sessionService`
    - `usageService`
    - `pluginService`
    - `maintenanceService`

- `cli/src/commands/**` 业务能力拆解：

| 命令 | 当前命令文件职责 | 真正业务能力位置 | 迁移目标 |
|---|---|---|---|
| `model` | 解析 `/model` 语法 | `App.tsx` + `useChat.switchModel()` | `runtime.setModel()` / `modelCatalogService` |
| `compact` | 解析 compact 参数 | `useChat.compactMessages()` | `runtime.compactContext()` |
| `context` | 纯命令壳 | `App.tsx` 读 `contextTracker/contextManager` | `runtime.getContextSnapshot()` |
| `resume` | 打开恢复面板 | `useChat.loadSession()` + `sessionStore` | `sessionService.list/resume` |
| `fork` | 打开分叉面板 | `useChat.forkFromEvent()` + `sessionStore` | `sessionService.forkFromEvent()` |
| `remember` | 解析 memory 子命令 | `MemoryManager` | `memoryService` |
| `mcp` | 纯命令壳 | `getMcpInfo()` / bootstrap | `mcpService` |
| `skills` | 列表/加载 skill 名称 | `skillStore` + UI 注入 | `skillsService`，必要时补 `runtime.attachSkill()` |
| `plugins` | 纯命令壳 | `pluginRegistry` | `pluginService.list()` |
| `usage` | 纯命令壳 | `tokenMeter` 聚合 | `usageService` / `sessionService.getUsageSummary()` |
| `gc` | 解析 cleanup 参数 | `cleanup-service.ts` | `maintenanceService` |
| `clear` | 纯命令壳 | `useChat.clearMessages()` + `contextManager.clearHistory()` | `sessionService.clearConversation()` |
| `bridge` | CLI ↔ Web 旧桥接 | `server/bridge/*` | 默认不迁移到 studio 主线 |
| `help` | 动态生成帮助文案 | `registry.getAll()` | renderer 命令帮助，不进 engine |
| `exit` | 强制退出 CLI | `process.exit` | host 行为，不进 engine |

- 第一批优先抽离的能力建议：
  - `runtime/`
  - `core/agent-loop.ts`
  - `core/bootstrap.ts`
  - `core/context-manager.ts`
  - `providers/`
  - `tools/`
  - `config/`
  - `persistence/`
  - `memory/`
  - `mcp/`
  - `skills/`
  - `observability/`
  - `platform/`

- 不迁移为主线资产：
  - `ui/`
  - `server/`
  - `commands/`
  - `host/cli/`
  - `cli/web/`

- 核心问题不是“Electron 不适合”，而是当前 shared runtime 仍寄生在 CLI 目录和 CLI 单例之上。
- 迁移原则：
  - 先抽 package、再改 `studio` import、最后冻结旧 `cli`
  - 不复制粘贴两套 runtime
  - 不让 `renderer` 直接碰 native / db / shell

## Proposed Architecture

### Approach A: `packages + apps/studio` 主线（Recommended）

- `packages/runtime` 成为唯一运行时入口
- `packages/core` 与领域包承载核心能力
- `apps/studio/main` 持有 `RuntimeManager` / `RuntimeSession`
- `renderer` 只消费 IPC bridge
- `apps/cli` 降级，旧 `cli/` 冻结为历史供体

优点：

- 符合用户当前产品目标
- 彻底解除 `studio` 对 `cli` 目录结构的心理与技术依赖
- 运行时物理位置和语义一致，不再误导 AI/维护者
- Electron 三层边界会更清晰

缺点：

- 需要一次明确的迁移期
- 需要重写 import 边界和测试基线
- 需要接受旧 `cli` 的冻结和阶段性失效

### Approach B: 继续在 `cli/src/runtime` 上增量修补

- `studio` 继续通过 `cli/src/runtime/**` 调用 shared runtime
- 逐步补单例注入、修 host 边界

优点：

- 初始改动小

缺点：

- 继续被 `cli` 结构绑架
- 方向与“以后项目只以 studio 为主”冲突
- 运行时语义继续误导 AI 和维护者
- 容易陷入长期过渡态

当前推荐结论：**采用 Approach A。**

## Execution Subtasks

1. `04-24-packages-apps-bootstrap`
   - 建 `packages/ + apps/` 骨架与构建基线
   - 把现有 `studio/` 平滑迁到 `apps/studio/`
2. `04-24-runtime-package-extract`
   - 复制旧 `cli/src/runtime/**` 到 `packages/runtime`
   - 保住 runtime 合同与测试基线
3. `04-24-core-kernel-extract`
   - 复制旧 `cli/src/core` 中的运行时内核文件到 `packages/core`
4. `04-24-foundation-domain-packages`
   - 复制 `config/providers/persistence/platform/observability`
5. `04-24-capability-domain-packages`
   - 复制 `tools/memory/mcp/skills` 与必要 plugin 能力
6. `04-24-engine-service-api`
   - 把旧 commands/App/useChat 背后的业务动作收敛成 engine services
7. `04-24-studio-main-host-runtime-manager`
   - main 持有 runtime manager / session manager / host bridge
8. `04-24-studio-preload-renderer-engine-migration`
   - preload/renderer 全面改接新 engine services
9. `04-24-cli-parity-verification-and-freeze`
   - 对照旧 CLI 核心能力逐项复现验收，并冻结旧实现
