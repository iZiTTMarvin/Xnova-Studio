# Phase 3 Agent System 任务拆分研究

## 1. 输入文档与事实源

- 主需求文档：`docs/implement/phase3-agent-system.md`
- 约束 spec：`.trellis/spec/backend/agent-schema-v1.md`
- 代码入口：
  - `cli/src/tools/agent/types.ts`
  - `cli/src/tools/agent/built-in.ts`
  - `cli/src/tools/agent/definition-registry.ts`
  - `cli/src/tools/agent/dispatch-agent.ts`
  - `cli/src/tools/agent/__tests__/agent-schema-v1.todo.test.ts`
- UI 现状：
  - `cli/web/src/App.tsx` 当前没有 `AgentsPage` 路由
  - `cli/web/src/pages/SettingsPage.tsx` 仅有配置页，不包含用户 agent 管理能力
  - `cli/web/src/components/SubAgentCard.tsx` / `SubAgentDrawer.tsx` 仅覆盖运行态展示，不是管理入口

## 2. 现状诊断

### 2.1 Runtime / 类型层

- `types.ts` 仍定义 `built-in | custom | plugin`
- `definition-registry.ts` 注释仍显式提到：
  - 全局自定义 `~/.xnovacode/agents/*.md`
  - 项目自定义 `.xnovacode/agents/*.md`
  - 插件（预留）
- `built-in.ts` 仍以 `general / explore / plan` 的硬编码对象注册

### 2.2 测试基线

- `agent-schema-v1.todo.test.ts` 已把 Phase 3 关键行为写成待实现测试：
  - `mode`
  - `inherits`
  - `tool_policy`
  - 缺字段报错
  - `user > builtin`
- `dispatch-agent.baseline.test.ts` 可作为兼容主路径锚点

### 2.3 UI / 产品层

- 当前没有专门的 Agent 管理页面
- 这意味着“用户 agent 创建 / 编辑 / 删除 / 切换”不能和“后端存储/解析”塞进同一个 task，否则实现节奏、验证维度和风险边界都会混在一起

## 3. 拆分原则

1. **先契约、后兼容、再消费**
   - schema 没锁定前，不进入 loader / UI
2. **把“兼容旧行为”单独成 task**
   - 这样可以明确守住 Phase 1/2 的基线，不被新功能混淆
3. **把“过滤规则”从“管理能力”中拆出**
   - `primary / subagent / all` 同时影响 runtime、config、UI，是典型共享契约
4. **把“用户 agent 存储服务”与“UI 管理入口”分开**
   - 便于先完成 backend 可靠性，再做用户面
5. **单独设置 verification 收口 task**
   - 防止所有功能都做了，但没有阶段级回归闭环

## 4. 推荐子任务

1. `04-22-phase3-agent-schema-v1`
   - schema、validator、错误语义、失败测试转正
2. `04-22-phase3-agent-compat-loader`
   - 旧内置兼容、来源收敛、override 规则
3. `04-22-phase3-agent-mode-filtering`
   - 候选池过滤与 `default_agent` 约束
4. `04-22-phase3-user-agent-crud`
   - 用户 agent 持久化、模板/空白脚手架、CRUD
5. `04-22-phase3-agent-management-ui`
   - UI 管理入口、切换与管理流
6. `04-22-phase3-agent-verification`
   - 集成回归、阶段验收

## 5. 依赖顺序

```text
schema-v1
  ↓
compat-loader
  ↓
mode-filtering
  ↓
user-agent-crud
  ↓
agent-management-ui
  ↓
verification
```

并行建议：

- `mode-filtering` 可在 `compat-loader` 后半段并行预研，但正式实现仍依赖 schema / source contract 已稳定
- `agent-management-ui` 可在 `user-agent-crud` API/service 契约稳定后开始

## 6. 当前假设

- Phase 3 不把 project-level agent 重新带回产品层，即使 runtime 内部保留兼容空间，UI 和管理链路也不得暴露
- 用户 agent 默认使用 Markdown + frontmatter 文件存储
- UI 管理入口必须新增独立 `Agents` 页面或等价独立管理面板，不允许退回 `SettingsPage` 子区块

## 7. 进入 Execute 前的最小准备

- 每个子任务都要有自己的 `prd.md`
- 每个子任务都初始化 `implement.jsonl` / `check.jsonl`
- 子任务实现时严格执行：
  - 先写失败测试
  - 再实现
  - 再跑 `trellis-check`
