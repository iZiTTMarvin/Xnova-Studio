# Phase 6 - Settings and Tools

## 阶段目标

把现有的 Providers / Memory / MCP / Skills 页面能力整合进桌面主体验。

本阶段的核心不是“再造一套管理后台”，而是：

- 复用已有页面资产
- 统一配置读写
- 让状态可见、错误可见、入口清晰

## 前置依赖

- `Phase 2 - Config Migration`
- `Phase 4 - Electron Host`
- `Phase 5 - Project-aware Shell`

## 本阶段范围

### 包含

- Providers
- Memory
- MCP
- Skills / Plugins 状态页

### 不包含

- 重型插件运维后台
- 外部 Agent Adapter 管理

## 任务清单

### A. Providers

- [ ] 适配 `config.toml`
- [ ] 支持默认 provider / model
- [ ] 支持新增 / 编辑 / 删除 provider
- [ ] 支持 test connection

### B. Memory

- [ ] 默认开启展示
- [ ] embedding 配置
- [ ] 当前状态与降级提示
- [ ] rebuild 入口
- [ ] 全局 / 项目记忆概览

### C. MCP

- [ ] MCP 状态卡片
- [ ] 连接成功 / 失败 / 未配置状态
- [ ] 打开配置 / 管理入口

### D. Skills / Plugins

- [ ] Skills 状态卡片
- [ ] 来源分布
- [ ] 最近 / 常用 skill
- [ ] 管理入口

## 重点涉及模块

- `cli/web/src/pages/SettingsPage.tsx`
- `cli/web/src/components/McpTab.tsx`
- `cli/web/src/components/PluginsTab.tsx`
- `cli/web/src/components/MemoryPanel.tsx`

## 测试要求

### 集成测试

- Provider 配置保存与读取
- Memory 降级提示
- MCP 状态显示
- Skills 来源分布显示

### 手工验证

- Settings 页面流程完整可用
- 工具页状态对用户可解释

## 完成标准

- 用户能在桌面端完成关键全局配置
- 状态不是隐式的
- 错误不是 silent failure

## 风险提醒

1. 不要重做现有页面逻辑，只做必要整合
2. 不要把“状态页”做成庞大的运维后台
3. Memory 的收益应优先于机制细节展示

## 交付物

- 桌面端 Settings / Tools 主体验整合
- TOML 驱动的 Providers / Memory 配置
- MCP / Skills 状态展示

