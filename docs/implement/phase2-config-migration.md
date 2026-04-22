# Phase 2 - Config Migration

## 阶段目标

在不破坏现有用户配置的前提下，完成：

- `config.json -> config.toml`
- `project.toml` 引入
- `project > user > builtin` 配置优先级落地

本阶段的重点是**安全迁移**，不是“尽快换成 TOML”。

## 前置依赖

- `Phase 1 - Runtime Foundation` 已完成
- runtime 已支持独立配置解析入口

## 本阶段范围

### 包含

- `~/.xnovacode/config.toml`
- `.xnovacode/project.toml`
- 配置解析、合并、迁移、回退策略
- 设置页写回逻辑改造

### 不包含

- Agent schema 迁移
- Electron 宿主
- project-aware UI 展示

## 任务清单

### A. TOML Schema 设计

- [x] 定义 `config.toml` 顶层 section
  - [x] providers
  - [x] memory
  - [x] agent
  - [x] modes
  - [x] features
- [x] 定义 `project.toml` 最小字段集
  - [x] `agent.default`
  - [x] `agent.max_parallel_subagents`
  - [x] `features.enabled`
  - [x] `modes.allowed`
  - [x] `modes.recommended`

### B. 迁移策略

- [x] 实现双读
  - [x] 优先读 `config.toml`
  - [x] 回退读 `config.json`
- [x] 实现安全迁移
  - [x] 从 JSON 生成 TOML
  - [x] 迁移失败时保留原 JSON
  - [x] 向用户输出明确错误，而不是 silent reset
- [x] 设计”迁移已完成”标记策略（TOML 存在即视为已迁移，无需额外标记文件）

### C. Project Config Resolver

- [x] 新增 `.xnovacode/project.toml` 读取逻辑
- [x] 实现 `project > user > builtin` 合并
- [x] 明确字段级合并规则
  - [x] 标量覆盖
  - [x] 对象按 key merge
  - [x] 数组整组覆盖

### D. 设置页改造

- [x] 设置页读取改为 TOML 主格式
- [x] 设置页保存改为只写 TOML
- [x] Provider / Memory 页面与新 schema 对齐

## 重点涉及模块

- `cli/src/config/config-manager.ts`
- `cli/src/core/initializer.ts`
- `cli/web/src/pages/SettingsPage.tsx`
- 未来新增的 TOML parser / serializer 模块

## 测试要求

### 单元测试

- JSON -> TOML 迁移
- project config merge
- 缺失字段 / 非法字段处理

### 集成测试

- 旧用户配置不丢失
- 新配置可读写
- 设置页改造后仍能稳定保存 Provider / Memory 配置

## 完成标准

- 新老用户都能稳定启动
- 旧 `config.json` 可迁移且不丢数据
- `project.toml` 可以影响运行时默认值
- 设置页与运行时消费的是同一套配置语义

## 风险提醒

1. 绝不能出现“配置损坏后自动覆盖成默认值但用户无感知”
2. 不要把 project config 和 agent schema 混到一起做
3. 迁移逻辑必须有回退与提示

## 交付物

- `config.toml` schema
- `project.toml` schema
- 迁移实现
- 配置 merge 实现
- 对应测试

## 交付确认（2026-04-23 fix-A/B/C 完成后）

> **状态更新**：2026-04-22 回退后识别出的 fix-A / fix-B / fix-C 已全部完成；阶段级 DoD 重新达成。下表按 [docs/implement/phase2-config-migration.md:97-102](#完成标准) 的 4 条硬验收门评估，证据指向实际落地代码与测试套件。

| 完成标准 | 状态 | 证据 |
|---|---|---|
| 新老用户都能稳定启动 | ✅ | `cli/src/core/initializer.ts` 重写为 TOML-first：仅通过 `ConfigManager` 保证目录 / 主配置就位，不再写 `config.json`，损坏 TOML / JSON 一律 warning 不覆盖。`initializer.toml-first.test.ts`（5 用例）锁死四条路径：全新目录只生成 TOML、仅 legacy JSON 合法时迁移+保留原 JSON、legacy JSON 损坏不备份不重置、TOML 损坏绝不覆盖。 |
| 旧 `config.json` 可迁移且不丢数据 | ✅ | `ConfigManager.#loadFromLegacyJson` 去除"缺字段回写 JSON"分支（fix-A），legacy JSON 成为只读迁移源；真实 CLI 启动链路通过 `initialize()` → `ConfigManager.load()` 串联，`initializer.toml-first.test.ts::仅存在合法 legacy config.json` 断言 JSON 原文件字节级保留，同时首次 load 产出 `config.toml`。 |
| `project.toml` 可以影响运行时默认值 | ✅ | `resolver.ts` 按 spec §3 合并 `agent/modes/features`（标量/对象按 key merge、数组整组覆盖），`CCodeConfig` 扩展对应 camelCase 字段；新增 `loadEffectiveRuntimeConfig(cwd)` 作为主链路统一入口；`pipe-runner` / `useChat` / `App.tsx` / `bootstrap.ts` / `dispatch-agent.ts` 全部接入。`resolver.effective-merge.test.ts`（6 用例）+ `main-chain.resolved-config.test.ts`（3 用例）锁死合并规则与主链路契约。 |
| 设置页与运行时消费的是同一套配置语义 | ✅ | `field-mapping.ts` 补齐 user 层 `[agent]` / `[modes]` / `[features]` 双向映射，`runtimeToTomlUser` / `tomlToRuntimeUser` 在 `field-mapping.test.ts`（17 用例）中 round-trip 无损、引用不共享。SettingsPage 通过 `settings-contract` 的 API 读写路径不变，但 UI 写入文案已指向 `~/.xnovacode/config.toml`（fix-C）。 |
| 不存在 silent reset / silent fallback | ✅ | `initializer.ts` 中不存在任何 "备份+重写" 路径；`ConfigManager` 的损坏 TOML / 损坏 legacy JSON 一律走 `#warnings` + `getLastWarnings()`；`resolver.ts` 的 `project.toml` 损坏走 `warnings` 通道但不改原文件。`initializer.toml-first.test.ts` 验证不产生 `.bak` 文件。 |

### 阶段状态

- 父任务 `04-21-phase2-config-migration` → `completed`（2026-04-23）
- 收口任务 `04-22-phase2-config-verification` → `completed`（2026-04-23）
- 五个子任务（A~E）保持 `completed`；fix-A / fix-B / fix-C 由收口任务统一收拢，不单独开子任务。

### 已完成项（fix 序列实际落地）

- **fix-A（P0，已完成）**：
  - `CCodeConfig` 新增 `agent / modes / features` camelCase 字段（`config-manager.ts`）
  - `field-mapping.ts` 补 user 层 `[agent] / [modes] / [features]` 双向映射
  - `resolver.ts` 合并 `project > user > builtin`，标量/对象按 key merge、数组整组覆盖；新增 `loadEffectiveRuntimeConfig(cwd)` 统一入口
  - 主链路接入：`pipe-runner` / `useChat` / `App.tsx` / `bootstrap.ts` / `dispatch-agent.ts`
  - `initializer.ts` 重写为 TOML-first：接受 `{ userDir, projectDir }` 注入；通过 `ConfigManager` 承担主配置落地；损坏 JSON/TOML 绝不备份不重置
  - `ConfigManager.#loadFromLegacyJson` 去除 "缺字段回写 JSON" 分支
- **fix-B（P0，已完成）**：
  - `field-mapping.test.ts` 新增 10 条 user 层 `[agent] / [modes] / [features]` 单向 + round-trip 测试（共 17 用例全绿）
- **fix-C（P3，已完成）**：
  - `cli/web/src/pages/SettingsPage.tsx:426` 文案 → `~/.xnovacode/config.toml`
  - `providers/registry.ts` 2 处错误文案、`bootstrap.ts` memory warning 文案、`useChat.ts` 注释同步修正

### 验证命令（2026-04-23 实测）

- `pnpm -C cli typecheck` → 0 error
- `pnpm -C cli exec vitest run` → **19 passed / 1 skipped；121 tests passed / 5 skipped**（较原 97 passed 新增 24 条阶段级测试）
  - 新增测试文件：`initializer.toml-first.test.ts`（5）/ `resolver.effective-merge.test.ts`（6）/ `main-chain.resolved-config.test.ts`（3）
  - `field-mapping.test.ts` 从 7 扩展到 17 用例（fix-B 新增 10 条）
- `cli/web/build:check` 依赖 `node_modules`，本次未跑；UI 改动仅文案一行，无类型变化

