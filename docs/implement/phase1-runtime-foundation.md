# Phase 1 - Runtime Foundation

## 阶段目标

建立 `Xnova Studio v1` 的共享 runtime 地基，并补齐最小测试护栏。

这一阶段不追求桌面 UI，不追求视觉效果，唯一目标是：

- 把现有 `cli` 中真正可复用的运行时能力切出来
- 让后续 `Electron Host` 有清晰的消费边界
- 避免后续在没有测试护栏的前提下做结构迁移

## 前置依赖

- 已确认 `v1` 宿主锁定为 `Electron`
- 已确认 `v1` 不引入外部 Agent Adapter`
- 已有文档：
  - `docs/xnova-studio-v1开发文档.md`
  - `docs/xnova-studio-V1核心设计文档.md`
  - `docs/xnova-stuido-V1工程测试计划.md`

## 本阶段范围

### 包含

- 测试基线建立
- `shared runtime` 边界切分
- `CLI host` 职责收敛
- runtime 事件与生命周期接口定义

### 不包含

- TOML 配置迁移
- Agent schema 新字段
- Electron 宿主
- project-aware UI

## 任务清单

### A. 测试基线

- [ ] 建立统一测试目录结构
- [ ] 为 runtime 迁移高风险点先写失败测试
- [ ] 固化当前 `config.json`、会话恢复、SubAgent 关键行为
- [ ] 确认最小测试命令在仓库中可稳定执行

### B. Runtime Boundary

- [ ] 新建 `cli/src/runtime/` 目录
- [ ] 抽出 runtime 入口，避免 `bootstrap.ts` 继续承担全部装配职责
- [ ] 把以下能力收口到 runtime 层
  - [ ] AgentLoop orchestration
  - [ ] Tool registry build
  - [ ] MCP / Skills / Memory runtime assembly
  - [ ] Session/event API
- [ ] 明确 runtime 的输入参数
  - [ ] workspace / cwd
  - [ ] config
  - [ ] lifecycle hooks
  - [ ] runtime event listeners

### C. CLI Host 收敛

- [ ] 新建 `cli/src/host/cli/`
- [ ] 把 REPL 启动逻辑从 runtime 装配逻辑中剥离
- [ ] 把 Pipe Mode 入口收敛到 host 层
- [ ] 把 CLI UI 组件依赖从共享 runtime 中移除

### D. Runtime 契约文档化

- [ ] 产出 runtime 对外 contract 草案
- [ ] 定义 runtime event 基本类型
- [ ] 定义 host 与 runtime 的错误传播方式
- [ ] 定义初始化与销毁生命周期

## 重点涉及模块

- `cli/src/core/bootstrap.ts`
- `cli/src/core/agent-loop.ts`
- `cli/src/tools/core/*`
- `cli/src/memory/*`
- `cli/src/mcp/*`
- `cli/src/skills/*`
- `cli/src/persistence/*`
- `cli/src/ui/*`

## 测试要求

### 单元测试

- runtime 初始化参数解析
- event 接口与生命周期边界
- tool registry 构建逻辑

### 集成测试

- CLI 仍可启动并跑通基本对话链路
- runtime 与 CLI host 的分层后仍能正确调工具

## 完成标准

- CLI 正常运行
- 共享 runtime 不再依赖 CLI UI 组件
- 后续 `Electron Host` 可以只消费 runtime，而不需要套整个 CLI
- 第一批基础测试能稳定跑通

## 风险提醒

1. 不要在这一阶段同时改配置格式
2. 不要在这一阶段做大范围目录搬家
3. 不要把“文档分层”误当成“代码已经解耦”

## 交付物

- runtime 目录骨架
- CLI host 目录骨架
- 第一批测试基线
- runtime contract 草案

## 完成确认（2026-04-22）

> 结论：基于当前代码实现、测试结果与 `.trellis` 任务记录，**Phase 1 判定为“基本完成”（可进行完成确认）**。  
> 原因：阶段目标能力均已落地并可运行，但仍存在 1 个已识别的结构性遗留点（见下文“遗留点”）。

### 关键证据

- Runtime 边界已落地并进入主链路消费：
  - `cli/src/runtime/types.ts`、`cli/src/runtime/create-runtime.ts`、`cli/src/runtime/bridge.ts`、`cli/src/runtime/events.ts`、`cli/src/runtime/index.ts` 已存在并可用。
  - `cli/src/core/pipe-runner.ts` 与 `cli/src/ui/useChat.ts` 均通过 `createRuntime()` 驱动运行时，不再直接自行装配 AgentLoop 主流程。
- CLI Host 收敛已落地：
  - `cli/src/host/cli/repl.ts`、`cli/src/host/cli/pipe-mode.ts`、`cli/src/host/cli/lifecycle.ts`、`cli/src/host/cli/launcher.ts` 已形成宿主层入口与生命周期管理。
  - `cli/bin/ccli.ts` 已作为薄入口，参数解析后委托 `runCliHost()`。
- Runtime/Host 边界约束已具备验证证据：
  - `cli/src/runtime/**` 未发现 `ink` / `electron` / `ui/*` 依赖。
- 测试基线与阶段测试可稳定执行：
  - `cli/package.json` 已固化 `test:baseline`。
  - 实测命令：
    - `pnpm -C cli exec vitest run src/runtime/__tests__/create-runtime.test.ts src/runtime/__tests__/integration.test.ts src/host/cli/__tests__/launcher.test.ts src/host/cli/__tests__/lifecycle.baseline.test.ts src/core/__tests__/pipe-runner.runtime.test.ts src/config/__tests__/config-manager.baseline.test.ts src/persistence/__tests__/session-store.baseline.test.ts src/tools/agent/__tests__/dispatch-agent.baseline.test.ts`
  - 结果：`8 passed files / 42 passed tests`。
- `.trellis` Phase 1 相关任务均为完成状态：
  - `.trellis/tasks/archive/2026-04/04-21-test-baseline/task.json`：`status = completed`
  - `.trellis/tasks/archive/2026-04/04-21-runtime-boundary/task.json`：`status = completed`
  - `.trellis/tasks/archive/2026-04/04-21-cli-host-extraction/task.json`：`status = completed`

### 遗留点（如实记录）

- `cli/src/core/bootstrap.ts` 仍保留本地 `buildRegistry()` 并作为当前主要 registry 装配路径。
- `cli/src/runtime/tool-registry.ts` 虽已实现 `buildToolRegistry()`，但**尚未成为主装配入口**。

该遗留点不否定 Phase 1 的“基本完成”结论，但说明 Runtime 装配职责仍处于过渡态，建议在后续阶段继续收口。
