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

- [ ] 定义 `config.toml` 顶层 section
  - [ ] providers
  - [ ] memory
  - [ ] agent
  - [ ] modes
  - [ ] features
- [ ] 定义 `project.toml` 最小字段集
  - [ ] `agent.default`
  - [ ] `agent.max_parallel_subagents`
  - [ ] `features.enabled`
  - [ ] `modes.allowed`
  - [ ] `modes.recommended`

### B. 迁移策略

- [ ] 实现双读
  - [ ] 优先读 `config.toml`
  - [ ] 回退读 `config.json`
- [ ] 实现安全迁移
  - [ ] 从 JSON 生成 TOML
  - [ ] 迁移失败时保留原 JSON
  - [ ] 向用户输出明确错误，而不是 silent reset
- [ ] 设计“迁移已完成”标记策略

### C. Project Config Resolver

- [ ] 新增 `.xnovacode/project.toml` 读取逻辑
- [ ] 实现 `project > user > builtin` 合并
- [ ] 明确字段级合并规则
  - [ ] 标量覆盖
  - [ ] 对象按 key merge
  - [ ] 数组整组覆盖

### D. 设置页改造

- [ ] 设置页读取改为 TOML 主格式
- [ ] 设置页保存改为只写 TOML
- [ ] Provider / Memory 页面与新 schema 对齐

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

