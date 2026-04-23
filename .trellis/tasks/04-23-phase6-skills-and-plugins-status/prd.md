# Phase 6 · Skills and Plugins Status

> **阶段**：Phase 6 Settings and Tools · 子任务 E
> **优先级**：P0
> **状态**：planning
> **来源**：[`docs/implement/phase6-settings-and-tools.md`](../../../docs/implement/phase6-settings-and-tools.md) §D Skills / Plugins、[`docs/implement/phase4-electron-host.md`](../../../docs/implement/phase4-electron-host.md)、[`.trellis/spec/backend/agent-schema-v1.md`](../../../.trellis/spec/backend/agent-schema-v1.md)、[`.trellis/spec/frontend/project-shell-v1.md`](../../../.trellis/spec/frontend/project-shell-v1.md)

---

## 1. 问题

Skills / Plugins 的状态在旧 Web 页面里偏管理视图，和 Phase 6 想要的“状态可见、来源可见、常用可见”并不一致。若不先收敛到状态卡片和轻量管理入口，用户会继续感知不到当前系统里有哪些技能、来源分布如何、哪些是最近常用。

## 2. 目标

实现 Skills / Plugins 的状态视图：

- 显示状态卡片
- 显示来源分布
- 显示最近 / 常用 skill
- 提供管理入口
- 不做重型插件运维后台

## 3. 范围

### 包含

- Skills / Plugins 状态卡片
- 来源分布
- 最近 / 常用 skill
- 管理入口
- 空态 / 错误态 / 未配置态

### 不包含

- 全量 marketplace 运维后台
- 外部 Agent Adapter
- 任何绕过 agent schema 的自造规则

## 4. 依赖

- **Blocked-by**：Phase 3 Agent System、Phase 4 Electron Host、Phase 5 Project-aware Shell、`04-23-phase6-settings-shell-integration`
- **Blocks**：`04-23-phase6-settings-and-tools-verification`

## 5. 子任务

- [ ] Skills / Plugins 状态卡片
- [ ] 来源分布展示
- [ ] 最近 / 常用 skill 展示
- [ ] 管理入口与导航入口
- [ ] 与 agent schema / plugin registry 的契约对齐

## 6. 相关文件

- `cli/web/src/components/PluginsTab.tsx`
- `cli/src/commands/skills.ts`
- `cli/src/commands/plugins.ts`
- `cli/src/plugin/registry.ts`
- `cli/src/plugin/storage.ts`
- `cli/src/plugin/types.ts`
- `cli/src/skills/index.ts`
- `cli/src/skills/engine/skill-tool.ts`
- `cli/src/tools/agent/schema-v1.ts`
- `cli/src/tools/agent/definition-registry.ts`
- `studio/src/shared/studio-bridge-contract.ts`
- `studio/src/main/studio-ipc.ts`
- `studio/src/preload/studio-bridge-api.ts`

## 7. 验收标准

- [ ] Skills / Plugins 状态在桌面 Settings 中可见
- [ ] 来源分布与最近 / 常用 skill 可见
- [ ] 管理入口明确且不混淆
- [ ] 与 agent schema 的模式过滤规则保持一致
- [ ] 不把页面做成重型插件市场后台

## 8. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 仅展示列表，失去状态语义 | 必须先做状态卡片，再做列表 |
| 规则与 agent schema 漂移 | 复用 `agent-schema-v1` 的约束，不再自造一套 mode 规则 |
| 面板膨胀成大后台 | 只保留状态、来源、最近 / 常用和管理入口 |

## 9. 测试策略

- 单元测试：
  - 来源分布计算
  - 最近 / 常用 skill 排序
  - 管理入口显隐
- 集成测试：
  - 不同来源的 skill / plugin 状态
  - 空态 / 错误态 / 未配置态
- 手工验证：
  - 桌面 Settings 中看到的状态是可解释的

## 10. 完成定义

1. Skills / Plugins 从旧 Web 管理视图升级为桌面主体验中的状态卡片
2. 来源分布与常用项都可见
3. 没有偏离 agent schema / plugin registry 的单一事实源
