# Xnova Studio v1 Implementation Plan

Status: Draft  
Last Updated: 2026-04-21  
Owner: Xnova Core

## 1. 目的

这份文档用于把 `Xnova Studio v1` 的设计决策拆成可执行的实现任务。

它回答的不是“做什么”，而是：

- 先做哪几步
- 每步改哪些模块
- 哪些地方必须兼容迁移
- 每步如何测试与验收
- 哪些工作可以并行，哪些必须串行

## 2. 上游基线文档

本计划基于以下文档收敛得出：

1. 核心设计文档  
   `C:\Users\xuhaochen\.gstack\projects\Xnova-Code\xuhaochen-unknown-design-20260421-103231.md`
2. 工程测试计划  
   `C:\Users\xuhaochen\.gstack\projects\Xnova-Code\xuhaochen-unknown-eng-review-test-plan-20260421-162600.md`
3. Deferred/TODO 清单  
   `D:\visual_ProgrammingSoftware\毕设and简历Projects\Xnova-Code\TODOS.md`
4. 当前能力基线  
   `D:\visual_ProgrammingSoftware\毕设and简历Projects\Xnova-Code\cli完成进度.md`
5. 当前产品说明与外部暴露能力  
   `D:\visual_ProgrammingSoftware\毕设and简历Projects\Xnova-Code\cli\README.md`

## 3. 已锁定决策

以下决策已视为实现前提，不再在 v1 内反复摇摆：

1. `v1` 桌面宿主锁定为 `Electron`
2. 保留“全局聊天”一级块，但它只是轻量 `scratchpad`
3. `v1` 不保留 `project-level agent` 产品层能力
4. `Overview` 不再作为默认首页，默认入口必须是空白聊天页或最近工作会话恢复
5. `v1` 以 `Xnova` 主 Agent 主链路为中心，不把外部 Agent Adapter 纳入交付范围

## 4. 实现原则

### 4.1 总原则

- 最小化改动，不做不必要的大重构
- 迁移优先于重写
- 先稳 runtime，再接桌面壳
- 先建立测试骨架，再做结构性迁移
- 所有 schema 变更都必须有兼容层与回退策略

### 4.2 关键风险

当前真正的风险不在 UI，而在以下四件事：

1. `shared runtime` 边界定义不清
2. `config.json -> config.toml` 迁移有 silent reset 风险
3. 当前系统本质上仍是 `session-first`，`project-aware` 还不是事实源
4. Agent 体系已有内置/自定义/插件历史包袱，不能一刀切替换

## 5. 推荐目录策略

### 5.1 v1 阶段的目录建议

为避免一上来把仓库改成重型 monorepo，v1 推荐采用“渐进式拆分”：

```text
Xnova-Code/
├─ cli/
│  ├─ src/
│  │  ├─ runtime/          # 新增，共享 runtime 层
│  │  ├─ host/cli/         # 新增，CLI 宿主适配
│  │  ├─ config/
│  │  ├─ tools/
│  │  ├─ memory/
│  │  ├─ persistence/
│  │  └─ ...
│  └─ web/
├─ studio/                 # 新增，Electron 宿主
│  ├─ src/main/
│  ├─ src/preload/
│  └─ src/renderer/
└─ docs/
   └─ plans/
```

### 5.2 为什么不直接改成 packages/apps

不推荐在 v1 第一阶段直接改成：

- `apps/cli`
- `apps/studio`
- `packages/runtime`

原因：

- 当前仓库测试基础几乎为空
- 先做仓库级大搬家，会把“架构重排”和“行为迁移”叠在一起
- 对当前项目来说，这不是最小风险路径

推荐顺序是：

1. 先在 `cli/src/runtime` 内抽共享层
2. 抽稳后再让 `studio/` 消费它
3. 如果后续长期维护需要，再做 packages 化

## 6. 目标架构

```text
                   +----------------------+
                   |   Electron Host      |
                   |  window / menu / IPC |
                   +----------+-----------+
                              |
                              v
                   +----------------------+
                   |  Renderer UI Shell   |
                   | chat / project / tool|
                   +----------+-----------+
                              |
                              v
      +-------------------------------------------------------------+
      |                    Shared Runtime                            |
      | AgentLoop | ToolRegistry | MCP | Skills | Memory            |
      | SessionStore | AgentLoader | ConfigResolver                 |
      | ProjectStateResolver | RuntimeEvents                        |
      +------------------------+------------------------------------+
                               |
                      +--------+--------+
                      |                 |
                      v                 v
                 CLI Host          Desktop Persistence
```

## 7. 里程碑总览

| 里程碑 | 名称 | 目标 | 依赖 | 预估优先级 |
|---|---|---|---|---|
| M0 | 测试与基线冻结 | 建立测试骨架与迁移前基线 | 无 | P0 |
| M1 | Runtime Boundary | 抽出共享 runtime 层 | M0 | P0 |
| M2 | Config Migration | 打通 TOML 与 project config | M0, M1 | P0 |
| M3 | Agent System Migration | 打通新 agent schema 与兼容层 | M1, M2 | P0 |
| M4 | Desktop Host Skeleton | 建立 Electron 宿主与基本 IPC | M1 | P1 |
| M5 | Project-aware Shell | 完成主界面、项目树、空白聊天页、上下文条 | M2, M3, M4 | P1 |
| M6 | Settings / Tools Integration | 打通 Providers / Memory / MCP / Skills UI | M2, M4, M5 | P1 |
| M7 | Polish / Recoverability | 最近项目恢复、性能、错误态、发布准备 | M5, M6 | P1 |

## 8. 详细任务拆解

### M0. 测试与基线冻结

#### 目标

在做任何结构迁移前，先建立最小测试护栏，避免后续改动只能靠人工猜。

#### 任务

1. 建立测试目录与分类
   - `cli/src/**` 对应单元/集成测试目录
   - `studio/` 建立宿主级测试目录
2. 补充最小测试运行约定
   - 单元测试
   - 集成测试
   - 后续 E2E 占位
3. 固化当前行为基线
   - 当前 `config.json` 行为
   - 当前 `dispatch_agent` / `SubAgent` 行为
   - 当前会话恢复行为
4. 为迁移高风险点先写失败测试
   - `config` 迁移
   - agent schema 兼容
   - 最近项目恢复

#### 涉及模块

- `cli/vitest.config.ts`
- `cli/src/config/*`
- `cli/src/tools/agent/*`
- `cli/src/persistence/*`

#### 验收标准

- 能稳定跑第一批单元测试
- 高风险迁移点已有失败测试占位
- 实现计划中的关键链路都能映射到测试用例

### M1. Runtime Boundary

#### 目标

把当前 `cli/src/core/bootstrap.ts` 一口气做太多事的问题拆开，形成可复用的共享 runtime。

#### 任务

1. 新建 `cli/src/runtime/`
2. 把以下能力抽为 runtime 层
   - AgentLoop 组合入口
   - Tool registry 构建
   - MCP / Skills / Memory runtime 装配
   - Session / event 接口
3. 把 CLI 专属职责移入 `cli/src/host/cli/`
   - REPL 启动
   - Pipe Mode
   - 终端 UI 装配
4. 给 runtime 明确输入/输出边界
   - config
   - cwd/workspace
   - runtime events
   - lifecycle hooks

#### 涉及模块

- `cli/src/core/bootstrap.ts`
- `cli/src/core/agent-loop.ts`
- `cli/src/tools/core/*`
- `cli/src/memory/*`
- `cli/src/skills/*`
- `cli/src/mcp/*`
- `cli/src/persistence/*`

#### 验收标准

- CLI 仍能正常运行
- runtime 不再依赖 CLI UI 组件
- Electron 宿主可以在不引入 CLI 终端组件的前提下消费 runtime

### M2. Config Migration

#### 目标

在不破坏现有用户配置的前提下，引入：

- `~/.xnovacode/config.toml`
- `.xnovacode/project.toml`

#### 任务

1. 定义 TOML schema
   - providers
   - memory
   - agent
   - modes
   - features
2. 实现双读策略
   - 优先 `config.toml`
   - 兼容读取旧 `config.json`
3. 实现安全迁移
   - 从 JSON 迁移到 TOML
   - 迁移失败时不覆盖原 JSON
   - 明确回退与提示
4. 新增 project config resolver
   - 读取 `.xnovacode/project.toml`
   - 合并 `project > user > builtin`
5. 更新设置写回逻辑
   - 桌面端只写 TOML
   - 旧 JSON 不再作为主写入目标

#### 涉及模块

- `cli/src/config/config-manager.ts`
- `cli/src/core/initializer.ts`
- `cli/web/src/pages/SettingsPage.tsx`

#### 验收标准

- 旧用户不丢配置
- 新配置能稳定读写 TOML
- project config 能参与默认值决策
- 不再出现 silent reset

### M3. Agent System Migration

#### 目标

把当前 agent 体系升级到设计文档里的 v1 schema，同时保持兼容。

#### 任务

1. 定义新 schema
   - `id`
   - `name`
   - `summary`
   - `mode`
   - `inherits`
   - `when_to_use`
   - `tool_policy`
   - `model_preference`
   - `extra`
2. 保留旧内置 agent 兼容读取
   - `general`
   - `explore`
   - `plan`
3. 建立来源策略
   - `builtin`
   - `user`
4. 明确 mode 过滤规则
   - 主 Agent 候选
   - SubAgent 候选
5. 不开放 `project-level agent` 产品能力
   - 运行时只保留兼容空间
   - UI 不暴露项目级 agent

#### 涉及模块

- `cli/src/tools/agent/built-in.ts`
- `cli/src/tools/agent/definition-registry.ts`
- `cli/src/tools/agent/types.ts`
- 新 agent loader / validator

#### 验收标准

- 内置 agent 正常工作
- 用户 agent 可创建、编辑、删除、切换
- `mode` / `inherits` / `tool_policy` 有明确校验和报错
- UI 只看到 `builtin + user`

### M4. Desktop Host Skeleton

#### 目标

建立 `Electron` 宿主最小可运行壳，不在这一阶段追求完整 UI。

#### 任务

1. 新建 `studio/`
2. 建立 Electron main / preload / renderer 三层
3. 打通与 runtime 的最小 IPC
4. 支持：
   - 启动窗口
   - 打开 workspace
   - 启动主聊天页
   - 基础日志与错误输出

#### 涉及模块

- `studio/src/main/*`
- `studio/src/preload/*`
- `studio/src/renderer/*`

#### 验收标准

- Electron 应用可启动
- 可绑定本地 workspace
- 可展示 renderer 主界面
- 可与 runtime 交互

### M5. Project-aware Shell

#### 目标

把当前 session-first Web 体验升级为 project-aware 主体验。

#### 任务

1. 默认首页切到空白聊天页
2. 建立左侧信息架构
   - 快速聊天
   - 搜索
   - Agents
   - 项目
   - 聊天
   - 工具
   - 设置
3. 建立项目树 / 会话树 / 子代理树
4. 建立上下文条
   - 当前项目
   - 当前分支
   - 当前 Agent
   - 当前模型
   - Context
   - 运行中 SubAgent 数量
5. 建立模式切换
   - `Standard`
   - `XForge`
6. 全局聊天块只保留 scratchpad 语义

#### 涉及模块

- `cli/web/src/App.tsx`
- `cli/web/src/components/Sidebar.tsx`
- `cli/web/src/pages/ChatPage.tsx`
- 新 project shell 相关组件

#### 验收标准

- 默认不再落到 `Overview`
- 有项目时能恢复最近工作会话
- 全局聊天与项目内会话不会互相打架
- 子代理会话能在聊天流和树里一致呈现

### M6. Settings / Tools Integration

#### 目标

复用现有页面资产，把设置与工具状态纳入桌面主体验。

#### 任务

1. Providers
   - TOML 读写
   - test connection
   - 默认 provider / model
2. Memory
   - 默认开启
   - embedding 配置
   - 降级提示
   - rebuild 入口
3. MCP
   - 状态卡片
   - 连接成功/失败/未配置
4. Skills
   - 来源分布
   - 最近/常用 skill
   - 管理入口

#### 涉及模块

- `cli/web/src/pages/SettingsPage.tsx`
- `cli/web/src/components/McpTab.tsx`
- `cli/web/src/components/PluginsTab.tsx`
- `cli/web/src/components/MemoryPanel.tsx`

#### 验收标准

- 用户可在桌面端完成关键全局配置
- MCP / Skills / Memory 状态可见
- 错误态不是 silent failure

### M7. Polish / Recoverability

#### 目标

把 v1 从“能跑”提升到“能长期自用”。

#### 任务

1. 最近项目恢复
2. 最近会话恢复
3. 最近 Agent / Mode / Model 恢复
4. 断连 / runtime 未就绪 / 路径失效提示
5. 会话树与 SubAgent 历史性能优化
6. 打包与发布准备

#### 验收标准

- 重启应用后能稳定回到最近工作状态
- 路径失效、配置损坏、服务异常时用户有明确反馈
- 首屏不被统计大盘拖慢

## 9. 测试策略映射

### 9.1 单元测试

必须覆盖：

- config migration / merge
- project config precedence
- agent schema parse / validate
- mode filter / inherits resolution
- project-aware identity mapping

### 9.2 集成测试

必须覆盖：

- runtime bootstrap
- session restore
- provider / memory / mcp settings flow
- subagent state sync

### 9.3 E2E

v1 至少两条：

1. 新建项目链路
2. 打开已有项目并恢复最近工作链路

### 9.4 TDD 要求

非微小改动必须遵守：

1. 先写失败测试
2. 再实现
3. 再跑验证

禁止在以下高风险点上跳过 TDD：

- config 迁移
- agent schema 迁移
- project-aware 恢复逻辑
- SubAgent 状态同步

## 10. 依赖关系与并行建议

### 10.1 必须串行

- `M0 -> M1 -> M2 -> M3`
- `M1 -> M4`
- `M2 + M3 + M4 -> M5`

### 10.2 可并行

在 `M1` 之后可以并行推进：

- `studio/` 宿主骨架
- agent schema validator
- TOML parser / config resolver

在 `M5` 之后可以并行推进：

- Providers / Memory / MCP / Skills 页面重组
- 恢复逻辑与性能优化

## 11. 里程碑验收门

### Gate A — Runtime Ready

满足以下条件才可进入桌面 UI 主开发：

- shared runtime 已形成边界
- CLI 正常运行
- 基础测试可跑

### Gate B — Config / Agent Ready

满足以下条件才可大规模接 UI：

- TOML 配置可读写
- agent schema 有兼容层
- `builtin + user` 来源策略稳定

### Gate C — Host Ready

满足以下条件才可做 project-aware 主壳：

- Electron 宿主可启动
- workspace 可绑定
- runtime IPC 可用

### Gate D — v1 Ready

满足以下条件才可认为 v1 进入可自用状态：

- 空白聊天页为默认入口
- 最近项目 / 最近会话恢复可用
- Providers / Memory / MCP / Skills 可配置或可见
- 两条 E2E 链路稳定通过

## 12. 本计划之外的重要后续文档

建议在实现过程中继续补三份文档：

1. `docs/architecture/xnova-runtime-boundary.md`
   - 明确 runtime / host / renderer contract
2. `docs/specs/config-toml-migration.md`
   - 明确 JSON -> TOML 迁移与回退
3. `docs/specs/agent-schema-v1.md`
   - 明确 agent schema、兼容层、校验规则

## 13. 结论

这份实现计划的核心不是“尽快做出桌面壳”，而是：

1. 先把共享 runtime 抽稳
2. 先把配置与 agent 迁移做对
3. 再让桌面宿主消费这些稳定边界
4. 最后再把 project-aware UI 做成真正的主体验

如果严格按这个顺序推进，`Xnova Studio v1` 会更像一次“产品化迁移”，而不是一次“看起来很新、但底层更乱”的重写。
