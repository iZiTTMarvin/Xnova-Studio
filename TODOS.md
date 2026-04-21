# TODOS

## 2026-04-21 /autoplan 候选 deferred 项

- **外部 Agent Adapter**
  - What: 在 `Xnova Studio v1` 之后再引入 Claude Code / Codex 等外部 worker adapter。
  - Why: 当前真正的风险在 shared runtime 与 project-aware 主链路，先接外部 agent 会把注意力拉偏。
  - Pros: 能保住 v1 边界，减少宿主、权限、协议三线并发复杂度。
  - Cons: v1 差异化不会立刻体现为多 agent 调度。
  - Context: 上一版 design doc 曾把 external adapter 放得更靠前；本轮 autoplan 明确把它后移。
  - Depends on / blocked by: 依赖 runtime contract、session/project identity、desktop host 稳定。

- **自动发现模型与配置写回**
  - What: 后续为 provider 增加 model auto-discovery、缓存、写回能力。
  - Why: 现在手动维护模型列表已可用，但长期体验一般。
  - Pros: 减少配置维护成本。
  - Cons: 要处理 provider 差异、缓存失效、用户覆写规则。
  - Context: 当前 `SettingsPage` 已支持手动维护 provider/models，v1 没必要同时做自动发现。
  - Depends on / blocked by: 依赖 TOML 配置体系先稳定。

- **Project-level Agent 共享策略**
  - What: 重新讨论 project-level agent 是否作为团队共享能力暴露给产品层。
  - Why: 当前代码与计划在这里存在明显张力，后续需要正式决策。
  - Pros: 若保留，可支持团队定制 workflow。
  - Cons: 会增加 schema、可见性、优先级、迁移复杂度。
  - Context: 当前计划偏向 `user > builtin`，但现有实现历史上并不完全如此。
  - Depends on / blocked by: 依赖 agent schema 与 source policy 先稳定。

- **小窗口高可用布局**
  - What: 为 `<1024px` 窗口宽度定义高可用布局。
  - Why: v1 仍以桌面宽屏为主，但真实用户会缩窗。
  - Pros: 提升日常使用鲁棒性。
  - Cons: 会拉长 UI 复杂度与测试面。
  - Context: 本轮 design review 已把 `<1024px` 标为“尽量不崩溃”，不是正式支持范围。
  - Depends on / blocked by: 依赖三段式主布局稳定后再做。

- **重型插件 / 工具管理台**
  - What: 为 MCP / Skills / Plugins 增加更深的管理、诊断、权限面板。
  - Why: 当前 v1 只需要状态可见和基本配置，重型控制台属于下一阶段。
  - Pros: 后续能支撑更复杂的生态运维。
  - Cons: 容易和主聊天体验争资源。
  - Context: 当前已有 `McpTab`、`PluginsTab`，但还不是完整运维后台。
  - Depends on / blocked by: 依赖 v1 主链路上线并确认真实使用痛点。

