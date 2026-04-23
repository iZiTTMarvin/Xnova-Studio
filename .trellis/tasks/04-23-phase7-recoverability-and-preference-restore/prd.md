# Phase 7 · Recoverability and Preference Restore

> **阶段**：Phase 7 Polish and Release · 子任务 A
> **优先级**：P0
> **状态**：planning
> **来源**：[`docs/implement/phase7-polish-and-release.md`](../../../docs/implement/phase7-polish-and-release.md) §A、[`docs/implement/phase5-project-aware-shell.md`](../../../docs/implement/phase5-project-aware-shell.md)、[`.trellis/spec/frontend/state-management.md`](../../../.trellis/spec/frontend/state-management.md)

---

## 1. 问题

Phase 5 已经具备冷启动路由判断和项目主壳，但恢复逻辑仍不完整：最近项目、最近会话、最近 Agent / Mode / Model、以及“回到项目推荐值”的闭环还没有作为一个统一、可验证的恢复系统落定。若不先把这条链路做扎实，桌面端一旦重启，就会从“能工作”退回“每次都要重新配置”。

## 2. 目标

完成 Phase 7 的 recoverability 主链路：

- 最近项目恢复
- 最近会话恢复
- 最近 Agent / Mode / Model 恢复
- 用户可一键回到项目推荐值
- 恢复优先级严格遵守 `project > user > builtin`

并确保恢复是显式、可测试、可回退的，而不是散落在多个 Hook 里的隐式副作用。

## 3. 范围

### 包含

- 冷启动 / 热启动 / 重启后的恢复链路
- 最近工作上下文持久化与恢复
- 模式、模型、Agent 偏好恢复
- “回到项目推荐值”入口与状态
- 恢复失败时的安全回退

### 不包含

- workspace 路径失效提示的完整错误态文案
- project config 损坏提示
- memory 降级提示
- subagent 部分结果 / 停止状态提示
- 打包与发布

## 4. 依赖

- **Blocked-by**：Phase 5 Project-aware Shell、Phase 6 Settings and Tools
- **Blocks**：`04-23-phase7-runtime-workspace-and-config-error-states`、`04-23-phase7-verification-and-release-readiness`

## 5. 子任务

- [ ] 收敛最近项目 / 最近会话恢复的单一事实源
- [ ] 收敛最近 Agent / Mode / Model 恢复优先级
- [ ] 提供“回到项目推荐值”入口
- [ ] 明确恢复成功、回退、无数据三种状态
- [ ] 补齐回归测试与重启路径验证

## 6. 相关文件

- `studio/src/renderer/utils/startup-route.ts`
- `studio/src/renderer/utils/mode-resolver.ts`
- `studio/src/renderer/utils/work-context.ts`
- `studio/src/renderer/hooks/useStudioBridge.ts`
- `studio/src/renderer/pages/StudioHomePage.tsx`
- `studio/src/main/studio-shell-inspector.ts`
- `studio/src/shared/studio-bridge-contract.ts`
- `cli/src/config/resolver.ts`
- `cli/src/config/config-manager.ts`
- `cli/src/persistence/session-store.ts`

## 7. 验收标准

- [ ] 重启应用后可以恢复最近项目
- [ ] 重启应用后可以恢复最近工作会话
- [ ] Agent / Mode / Model 的恢复优先级符合 `project > user > builtin`
- [ ] 用户能一键回到项目推荐值
- [ ] 无最近数据、无可恢复数据、恢复回退三种状态都可见

## 8. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 恢复逻辑散落在多个 Hook 与工具函数中 | 收敛单一事实源与明确优先级 |
| 恢复失败后静默回退 | 必须把回退原因通过 UI / warning 暴露 |
| 模式恢复与 Phase 5 主壳冲突 | 继续复用顶部唯一 `Standard / XForge` 入口，不新增新入口 |

## 9. 测试策略

- 单元测试：
  - 启动路由决策
  - 模式恢复优先级
  - 推荐值回退逻辑
- 集成测试：
  - 最近项目 / 最近会话恢复
  - Agent / Mode / Model 恢复
- 手工验证：
  - 冷启动 / 热启动 / 重启恢复
  - 回到项目推荐值

## 10. 完成定义

1. 用户重启应用后能回到最近工作状态
2. 恢复优先级和回退策略都有明确规则
3. 恢复逻辑不会再依赖隐式 local state 拼接
