# [Phase 3 · 01] Agent System — Schema, Compatibility and User Agent Management

> **Phase**：Phase 3 Agent System · 主任务
> **Priority**：P0
> **Status**：planning
> **Source**：[`docs/implement/phase3-agent-system.md`](../../../docs/implement/phase3-agent-system.md)、[`.trellis/spec/backend/agent-schema-v1.md`](../../../.trellis/spec/backend/agent-schema-v1.md)、[`docs/xnova-studio-V1核心设计文档.md`](../../../docs/xnova-studio-V1核心设计文档.md)、[`docs/xnova-studio-v1开发文档.md`](../../../docs/xnova-studio-v1开发文档.md)

---

## 1. Problem

当前 Agent 体系仍停留在 Phase 1/2 的过渡态，主要问题包括：

1. `cli/src/tools/agent/types.ts` 仍以 `built-in | custom | plugin` 为抽象来源，和 v1 已锁定的 `builtin + user` 产品语义不一致。
2. `built-in.ts` / `definition-registry.ts` 仍围绕 `general / explore / plan` 的硬编码定义工作，还没有统一的 frontmatter v1 parser / validator / compatibility adapter。
3. `mode / inherits / tool_policy / summary` 等 v1 关键字段缺少统一契约，容易出现 parser、registry、runtime、UI 各写一套语义的漂移。
4. `default_agent` 尚未和 `primary | subagent | all` 的可见性规则绑定，后续会产生“配置能写、运行时不能用”的隐性失败。
5. 当前 Web 壳只有 SubAgent 运行态 UI，没有用户 agent 管理入口，Phase 3 范围内要求的“新建 / 编辑 / 删除 / 切换 / 模板创建”还没有产品承载面。

## 2. Goal

在保持旧内置 agent 可用的前提下，把 Agent 体系升级到 v1 设计要求，并形成可持续演进的统一契约：

- 引入新的 Markdown + frontmatter agent schema
- 建立旧内置 agent 到 v1 的兼容层
- 将来源统一收敛到 `builtin + user`
- 统一主 Agent / SubAgent 的候选池过滤规则
- 交付用户 agent 管理能力与对应测试
- 明确排除 project-level agent 的产品暴露

## 3. Scope

### In

- v1 agent frontmatter schema 与 validator
- 旧内置 `general / explore / plan` 的兼容读取与映射
- `builtin + user` 来源收敛与 override 规则
- `primary / subagent / all` 过滤与 `default_agent` 约束
- 用户 agent 的创建、编辑、删除、切换能力
- 从模板创建与从空白创建
- 本阶段要求的单元测试、集成测试与回归验证

### Out

- project-level agent 的产品能力与 UI 暴露
- 外部 Agent Adapter / plugin agent 正式接入
- `XForge` 深层 orchestration
- 与 Phase 3 目标无关的通用 UI 重设计

## 4. Dependencies

- **Requires**：Phase 1 Runtime Foundation 已完成；Phase 2 Config Migration 已完成，并已具备 `agent.default` / `agent.max_parallel_subagents` 的 TOML 解析基础
- **Blocks**：后续桌面 `Agents` 页面扩展、默认 Agent 恢复策略、更多 agent 编排能力
- **Gate 归属**：Gate B `Config / Agent Ready` 的 Agent 半段主交付物

## 5. Subtasks

- [ ] **5.1** 子任务：`04-22-phase3-agent-schema-v1`
  - 锁定 v1 frontmatter schema、字段校验与错误语义
- [ ] **5.2** 子任务：`04-22-phase3-agent-compat-loader`
  - 建立旧内置 agent 的兼容层，收敛来源到 `builtin + user`
- [ ] **5.3** 子任务：`04-22-phase3-agent-mode-filtering`
  - 中央化 `primary / subagent / all` 过滤与 `default_agent` 约束
- [ ] **5.4** 子任务：`04-22-phase3-user-agent-crud`
  - 建立用户 agent 文件存储、模板/空白骨架与 CRUD 服务
- [ ] **5.5** 子任务：`04-22-phase3-agent-management-ui`
  - 接入 Agent 选择器与管理界面，完成用户可见的创建/编辑/删除/切换
- [ ] **5.6** 子任务：`04-22-phase3-agent-verification`
  - 收口回归与 Phase 3 验收，验证内置兼容与用户 agent 消费链路

## 5A. 子任务顺序

建议执行顺序：

1. `04-22-phase3-agent-schema-v1`
2. `04-22-phase3-agent-compat-loader`
3. `04-22-phase3-agent-mode-filtering`
4. `04-22-phase3-user-agent-crud`
5. `04-22-phase3-agent-management-ui`
6. `04-22-phase3-agent-verification`

## 6. Technical Approach

### 统一原则

- 先锁 schema，再做兼容，再做过滤与管理能力，避免 UI 先实现后反推契约。
- 运行时和 UI 必须共用同一套 mode 判定结果，不能各自 hardcode。
- Phase 3 中与“用户 agent 管理”相关的能力，优先沉淀为可复用 service / loader / validator，再由 UI 消费。

### UI 承载方式

- **强制要求**：新增独立 `Agents` 管理页或等价独立管理面板。
- **禁止降级**：本阶段不允许把用户 agent 管理能力缩水为 `SettingsPage` 的临时子区块。
- **约束**：管理入口必须完整覆盖 CRUD、模板创建、空白创建、切换与错误提示，不允许只做“展示列表”。

## 7. Related Files

### 核心改动范围

- `cli/src/tools/agent/types.ts`
- `cli/src/tools/agent/built-in.ts`
- `cli/src/tools/agent/definition-registry.ts`
- `cli/src/tools/agent/dispatch-agent.ts`
- `cli/src/tools/agent/__tests__/agent-schema-v1.todo.test.ts`
- `cli/src/config/toml/schema.ts`
- `cli/src/config/resolver.ts`
- `cli/web/src/App.tsx`
- `cli/web/src/components/Sidebar.tsx`
- `cli/web/src/pages/SettingsPage.tsx`
- 未来可能新增的 agent loader / store / page / component 文件

### 只读参考

- `docs/implement/phase3-agent-system.md`
- `.trellis/spec/backend/agent-schema-v1.md`
- `cli/src/skills/engine/parser.ts`
- `cli/src/memory/storage/file-store.ts`

## 8. Reference Specs（必读）

- [`.trellis/spec/backend/agent-schema-v1.md`](../../../.trellis/spec/backend/agent-schema-v1.md)
- [`.trellis/spec/backend/directory-structure.md`](../../../.trellis/spec/backend/directory-structure.md)
- [`.trellis/spec/backend/error-handling.md`](../../../.trellis/spec/backend/error-handling.md)
- [`.trellis/spec/backend/quality-guidelines.md`](../../../.trellis/spec/backend/quality-guidelines.md)
- [`.trellis/spec/backend/runtime-boundary.md`](../../../.trellis/spec/backend/runtime-boundary.md)
- [`.trellis/spec/frontend/directory-structure.md`](../../../.trellis/spec/frontend/directory-structure.md)
- [`.trellis/spec/frontend/quality-guidelines.md`](../../../.trellis/spec/frontend/quality-guidelines.md)
- [`.trellis/spec/frontend/state-management.md`](../../../.trellis/spec/frontend/state-management.md)
- [`.trellis/spec/frontend/type-safety.md`](../../../.trellis/spec/frontend/type-safety.md)
- [`.trellis/spec/guides/code-reuse-thinking-guide.md`](../../../.trellis/spec/guides/code-reuse-thinking-guide.md)
- [`.trellis/spec/guides/cross-layer-thinking-guide.md`](../../../.trellis/spec/guides/cross-layer-thinking-guide.md)

## 9. Acceptance Criteria

- [ ] v1 frontmatter schema、字段校验与错误提示已锁定并落到代码
- [ ] 旧内置 agent 在兼容层下保持可用，不破坏现有 dispatch / tool policy 主路径
- [ ] 产品层只暴露 `builtin + user`，UI 不展示 project-level agent
- [ ] 主 Agent 候选池仅展示 `primary | all`
- [ ] SubAgent 候选池仅展示 `subagent | all`
- [ ] `default_agent` 只能引用 `primary | all`，错误路径清晰可测
- [ ] 用户可以完成自定义 agent 的新建、编辑、删除、切换
- [ ] 模板创建和空白创建都可用
- [ ] 桌面端提供独立 `Agents` 页面或等价独立管理面板，而不是挂靠 `SettingsPage` 的缩水实现
- [ ] 单元测试、集成测试、`pnpm typecheck` 与必要构建验证通过

## 10. Risks & Mitigations

| 风险 | 缓解 |
|---|---|
| 为了新 schema 破坏旧 `general / explore / plan` 主链路 | 先写失败测试，保留兼容读取器，用基线测试锁住旧行为 |
| `mode` 过滤逻辑散落在 runtime / config / UI | 抽共享 helper / selector contract，禁止 UI 自己再推导一套 |
| project-level agent 语义死灰复燃 | 在 loader 与 UI 两层都明确屏蔽，并在 PRD 中写成 out-of-scope |
| 用户 agent 文件格式与 parser 不一致 | 保存前统一走同一 validator，拒绝“UI 写一份、loader 读另一份” |
| 任务只覆盖 backend，不覆盖最终可见产品链路 | 专门拆出 UI integration 与 verification task，避免“底层做好但用户用不到” |

## 11. Testing Strategy

- 单元测试：
  - frontmatter parse / validate
  - `inherits` 解析
  - `tool_policy` 非法值报错
  - `mode` 过滤与 `default_agent` 校验
  - 用户 agent 保存 / 读取 / 删除
- 集成测试：
  - 内置 agent 兼容路径
  - 用户 agent 覆盖同名 builtin
  - 用户 agent 被主 Agent / SubAgent 正确消费
  - UI 只看到 `builtin + user`
- 回归验证：
  - `dispatch_agent` 现有主链路不倒退
  - SubAgent 相关 UI 不因 Phase 3 引入错误过滤

## 12. Definition of Done

1. 上述 Acceptance Criteria 全部打勾
2. Phase 3 所有子任务完成并通过 check
3. Agent schema、compat loader、mode filter、user agent 管理能力已贯通
4. project-level agent 未重新暴露到产品层
5. `CHANGELOG.md` 追加一条 Phase 3 Agent System 变更记录
