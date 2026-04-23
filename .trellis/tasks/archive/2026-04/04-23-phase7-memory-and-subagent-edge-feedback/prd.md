# Phase 7 · Memory and SubAgent Edge Feedback

> **阶段**：Phase 7 Polish and Release · 子任务 C
> **优先级**：P0
> **状态**：planning
> **来源**：[`docs/implement/phase7-polish-and-release.md`](../../../docs/implement/phase7-polish-and-release.md) §B、[`docs/implement/phase6-settings-and-tools.md`](../../../docs/implement/phase6-settings-and-tools.md)、[`.trellis/spec/backend/agent-schema-v1.md`](../../../.trellis/spec/backend/agent-schema-v1.md)

---

## 1. 问题

Phase 6 已经让 Memory、MCP、Skills / Plugins 的状态在 Settings / Tools 中可见，但 Phase 7 还要求补齐两类“运行中边缘反馈”：

- memory 降级提示
- subagent 部分结果 / 停止状态提示

如果缺少这部分，用户只能在配置页看到静态状态，却无法在主工作流中理解“为什么当前效果变差”或“子代理到底执行到了哪里”。

## 2. 目标

在不引入新 Agent 编排能力的前提下，把以下边缘反馈补齐到桌面主体验：

- memory 降级 / 不可用 / 恢复中的提示
- subagent partial result / stopped / interrupted 状态提示
- 状态与错误都要可见、可解释、可测试

## 3. 范围

### 包含

- memory 降级态从设置页扩展到主体验可见反馈
- subagent 部分结果 / 停止状态的展示合同
- 与 runtime 事件、bridge、renderer 展示的状态联动
- 状态文案与 UI 表达的一致性

### 不包含

- 新的 subagent 编排系统
- 新的 memory 机制
- 性能优化
- 打包与发布

## 4. 依赖

- **Blocked-by**：Phase 6 Settings and Tools、`04-23-phase7-runtime-workspace-and-config-error-states`
- **Blocks**：`04-23-phase7-verification-and-release-readiness`

## 5. 子任务

- [ ] 收敛 memory 降级 / 关闭 / 恢复中状态的展示合同
- [ ] 为 subagent partial / stopped / interrupted 增加显式展示
- [ ] 明确 runtime 事件到 renderer UI 的映射边界
- [ ] 避免把状态提示做成新工作流入口
- [ ] 补齐边缘状态回归测试

## 6. 相关文件

- `studio/src/shared/studio-bridge-contract.ts`
- `studio/src/main/studio-ipc.ts`
- `studio/src/main/studio-memory-service.ts`
- `studio/src/renderer/hooks/useStudioBridge.ts`
- `studio/src/renderer/hooks/useMemoryOverview.ts`
- `studio/src/renderer/components/MemoryOverviewCard.tsx`
- `studio/src/renderer/components/ContextBar.tsx`
- `studio/src/renderer/pages/StudioHomePage.tsx`
- `cli/src/memory/overview-service.ts`
- `cli/src/runtime/types.ts`
- `cli/src/tools/agent/dispatch-agent.ts`

## 7. 验收标准

- [ ] memory 降级态在用户主工作流中可见，而不只停留在设置页
- [ ] subagent 部分结果 / 停止状态有明确反馈
- [ ] 状态提示不形成第二套主工作流或第二个模式入口
- [ ] renderer 仍只消费 bridge / IPC 契约，不直接碰 runtime 内部状态
- [ ] 所有状态都能区分 loading / degraded / stopped / error

## 8. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 为了显示 subagent 状态而引入新编排逻辑 | 只展示已有状态，不扩核心能力 |
| memory 提示只在配置页可见 | 把主工作流的反馈补齐到主壳或上下文区域 |
| 状态名与契约不一致 | 统一从 shared contract 与 runtime event 推导 |

## 9. 测试策略

- 单元测试：
  - memory 状态分支
  - subagent 状态分支
- 集成测试：
  - degraded / stopped / interrupted 展示
  - runtime 事件映射到 UI
- 手工验证：
  - memory 不可用时的提示
  - subagent 中途停止时的提示

## 10. 完成定义

1. 用户能理解当前 memory 和 subagent 的边缘状态
2. 反馈是可见的，不再依赖日志或猜测
3. 没有借着补反馈偷偷扩成新 Agent 系统
