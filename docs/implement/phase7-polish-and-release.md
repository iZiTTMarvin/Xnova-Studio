# Phase 7 - Polish and Release

## 阶段目标

把 `Xnova Studio v1` 从“已经能跑”提升到“可以长期自用、可发布试用”。

## 前置依赖

- `Phase 5 - Project-aware Shell`
- `Phase 6 - Settings and Tools`

## 本阶段范围

### 包含

- 恢复逻辑
- 错误态与边缘状态
- 性能优化
- 打包与发布准备

### 不包含

- 外部 Agent Adapter
- 多 Agent 编排系统
- 重型插件生态治理

## 任务清单

### A. Recoverability

- [ ] 最近项目恢复
- [ ] 最近会话恢复
- [ ] 最近 Agent / Mode / Model 恢复
- [ ] 用户可一键回到项目推荐值

### B. 错误态与边缘状态

- [ ] runtime 未就绪提示
- [ ] workspace 路径失效提示
- [ ] project config 错误提示
- [ ] memory 降级提示
- [ ] subagent 部分结果 / 停止状态提示

### C. 性能

- [ ] 避免 overview 拖慢首屏
- [ ] 项目树 / 会话树 / 子代理列表性能优化
- [ ] 大会话恢复的性能观察与优化

### D. 发布准备

- [ ] Electron 打包脚本
- [ ] Windows 安装包产物
- [ ] 版本信息整理
- [ ] README / 文档同步

## 重点涉及模块

- project-aware shell 相关组件
- session restore / persistence 模块
- Electron 打包配置
- README / CHANGELOG / 发布说明

## 测试要求

### 集成测试

- 恢复逻辑
- 错误态展示
- 配置损坏 / 路径失效场景

### E2E

- 重启应用后恢复最近工作状态
- 从已有项目继续工作

### 手工验证

- Windows 打包安装
- 首次启动
- 冷启动 / 热启动 / 重启恢复

## 完成标准

- 用户重启应用后能回到最近工作状态
- 配置、路径、runtime、memory 异常都有明确反馈
- Windows 可出安装包
- v1 具备对外试用基础

## 风险提醒

1. 不要把“可发布”误解成“已经适合扩 scope”
2. 不要在这一阶段回头引入新核心能力
3. 要优先修恢复与错误态，不要优先做表面 polish

## 交付物

- 恢复逻辑完善
- 错误态补齐
- 性能优化结果
- 打包与发布准备文档

