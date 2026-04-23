# Phase 6 · Settings and Tools

> **阶段**：Phase 6 Settings and Tools · 父任务
> **优先级**：P0
> **状态**：planning
> **来源**：[`docs/implement/phase6-settings-and-tools.md`](../../../docs/implement/phase6-settings-and-tools.md)、[`docs/implement/phase4-electron-host.md`](../../../docs/implement/phase4-electron-host.md)、[`docs/implement/phase5-project-aware-shell.md`](../../../docs/implement/phase5-project-aware-shell.md)、[`docs/implement/phase7-polish-and-release.md`](../../../docs/implement/phase7-polish-and-release.md)

---

## 1. 问题

Phase 6 的目标是把 Providers / Memory / MCP / Skills / Plugins 真正整合进桌面主体验，但原始实现文档仍然偏向旧 Web 壳。若不先把阶段拆成可执行任务，后续很容易把 Settings 面板做成旧壳迁移，而不是桌面主壳整合。

## 2. 目标

把 Phase 6 拆成一组高质量、可单独验收的 Trellis 任务，形成明确顺序：

1. Settings / Tools 主壳骨架
2. Providers + TOML 配置整合
3. Memory 状态与 rebuild 入口
4. MCP 状态卡片与管理入口
5. Skills / Plugins 状态卡片与管理入口
6. Phase 6 最终验证

同时要把边界锁死在 Phase 6：

- 默认落点是 `studio/src/renderer/**`
- `cli/web/src/**` 只允许作为旧交互与信息架构参考
- 不允许提前做 Phase 7 的恢复增强、打包、发布收尾
- 不允许回退 Phase 4 的主 process / preload / IPC 边界

## 3. 范围

### 包含

- Phase 6 任务树拆分
- 每个子任务的 PRD / implement / check 上下文
- 任务依赖顺序与验收边界
- 与 Phase 4 / 5 / 7 的边界说明

### 不包含

- 具体功能实现
- 打包与发布
- 恢复逻辑增强
- 外部 Agent Adapter
- 重型插件运维后台

## 4. 依赖

- **Blocked-by**：Phase 2 Config Migration、Phase 4 Electron Host、Phase 5 Project-aware Shell
- **Blocks**：所有 Phase 6 子任务

## 5. 子任务

- [ ] `04-23-phase6-settings-shell-integration`
- [ ] `04-23-phase6-provider-config-and-toml`
- [ ] `04-23-phase6-memory-overview-and-rebuild`
- [ ] `04-23-phase6-mcp-status-and-management`
- [ ] `04-23-phase6-skills-and-plugins-status`
- [ ] `04-23-phase6-settings-and-tools-verification`

## 6. 相关文件

- `docs/implement/phase6-settings-and-tools.md`
- `docs/implement/phase4-electron-host.md`
- `docs/implement/phase5-project-aware-shell.md`
- `docs/implement/phase7-polish-and-release.md`
- `.trellis/spec/frontend/project-shell-v1.md`
- `.trellis/spec/frontend/state-management.md`
- `.trellis/spec/frontend/quality-guidelines.md`
- `.trellis/spec/backend/runtime-boundary.md`
- `.trellis/spec/backend/config-toml-migration.md`
- `.trellis/spec/backend/agent-schema-v1.md`

## 7. 验收标准

- [ ] Phase 6 已被拆成多个可独立执行的 Trellis 任务
- [ ] 每个子任务都有明确的 PRD、实现上下文和检查上下文
- [ ] 任务上下文能明确约束到 `studio/src/renderer/**`
- [ ] `cli/web/src/**` 仅作为参考，不会误导成主实现落点
- [ ] 阶段边界没有越界到 Phase 7

## 8. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 子任务拆得过粗，最后还是变成一个大工单 | 按功能域和验收点拆开，并保持父任务只做阶段编排 |
| 子任务之间依赖不清 | 在 PRD 中明确 blocks / blocked-by |
| AI 继续沿旧 Web 壳实现 | 在每个子任务里重复写明 `studio/src/renderer/**` 为默认落点 |
| 越界到 Phase 7 | 在父任务和验证任务中显式引用 Phase 7 作为禁区边界 |

## 9. 测试策略

- 任务层验证：
  - 每个子任务的 `implement.jsonl` / `check.jsonl` 已补齐
  - 相关 spec 已明确注入
- 阶段层验证：
  - 子任务顺序与依赖链一致
  - 验证任务覆盖 typecheck / build / smoke

## 10. 完成定义

1. Phase 6 的任务树已经可直接交给 AI 执行
2. 每个子任务都能被单独取出作为开发工单
3. 阶段边界足够清晰，不会误触 Phase 7
