# Phase 3 - Agent System

## 阶段目标

把当前 Agent 体系升级到 v1 设计要求，同时保持兼容。

核心目标：

- 引入新的 agent frontmatter schema
- 支持 `builtin + user`
- 支持 `mode / inherits / tool_policy / summary`
- 不在产品层开放 `project-level agent`

## 前置依赖

- `Phase 1 - Runtime Foundation`
- `Phase 2 - Config Migration`

## 本阶段范围

### 包含

- 新 agent schema
- 旧 agent 兼容读取
- 主 Agent / SubAgent 候选池过滤
- 用户 agent 的创建、编辑、删除、切换能力

### 不包含

- project-level agent 产品能力
- 外部 Agent Adapter
- `XForge` 深层 orchestration

## 任务清单

### A. Schema 定义

- [ ] 明确字段：
  - [ ] `id`
  - [ ] `name`
  - [ ] `summary`
  - [ ] `mode`
  - [ ] `inherits`
  - [ ] `when_to_use`
  - [ ] `tool_policy`
  - [ ] `model_preference`
  - [ ] `extra`
- [ ] 明确字段校验规则
- [ ] 明确错误提示语义

### B. 兼容层

- [ ] 保留旧内置 `general / explore / plan`
- [ ] 新增兼容读取器，把旧定义映射到新 schema
- [ ] 不让现有 dispatch / tool policy 行为被意外破坏

### C. 来源与可见性

- [ ] 来源统一收敛为 `builtin / user`
- [ ] UI 不展示项目级 agent
- [ ] 运行时仅保留必要兼容空间

### D. 使用模式过滤

- [ ] 主 Agent 选择器只展示 `primary / all`
- [ ] SubAgent 候选池只展示 `subagent / all`
- [ ] `default_agent` 仅允许引用 `primary / all`

### E. 管理能力

- [ ] 用户 agent 新建
- [ ] 用户 agent 编辑
- [ ] 用户 agent 删除
- [ ] 从模板创建
- [ ] 从空白创建

## 重点涉及模块

- `cli/src/tools/agent/built-in.ts`
- `cli/src/tools/agent/definition-registry.ts`
- `cli/src/tools/agent/types.ts`
- Agent loader / validator
- 未来的桌面 `Agents` 页面与管理面板

## 测试要求

### 单元测试

- frontmatter parse / validate
- inherits resolution
- mode filter
- invalid tool_policy 报错

### 集成测试

- 内置 agent 保持可用
- 用户 agent 创建后可被主 Agent / SubAgent 正确消费

## 完成标准

- 新 schema 稳定
- 旧 agent 不失效
- UI 只看到 `builtin + user`
- 用户可以完整管理自定义 agent

## 风险提醒

1. 不要在这一阶段把 project-level agent 再引回产品层
2. 不要为了 schema 优雅牺牲旧 agent 兼容
3. 不要把 mode 过滤逻辑散落到 UI 与 runtime 两边各写一套

## 交付物

- agent schema 定义
- validator / parser
- 兼容层
- user agent 管理能力
- 对应测试

