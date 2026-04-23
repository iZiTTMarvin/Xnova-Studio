# Phase 7 · Polish and Release

> **阶段**：Phase 7 Polish and Release · 父任务
> **优先级**：P0
> **状态**：planning
> **来源**：[`docs/implement/phase7-polish-and-release.md`](../../../docs/implement/phase7-polish-and-release.md)、[`docs/implement/phase5-project-aware-shell.md`](../../../docs/implement/phase5-project-aware-shell.md)、[`docs/implement/phase6-settings-and-tools.md`](../../../docs/implement/phase6-settings-and-tools.md)

---

## 1. 问题

Phase 5 与 Phase 6 已经把 `project-aware shell`、Settings / Tools 主体验和基本 bridge / IPC 打通，但当前桌面端仍停留在“可以跑、可以演示”的阶段，还没有达到“可长期自用、可发布试用”的质量门。若不先把 Phase 7 拆成高质量任务，后续实现很容易混成一个“大收尾工单”，最终把恢复逻辑、错误态、性能与发布准备交叉污染。

## 2. 目标

把 Phase 7 拆成一组严格受边界约束、可独立验收的 Trellis 任务，形成如下顺序：

1. 恢复逻辑与偏好恢复
2. runtime / workspace / config 错误态
3. memory / subagent 边缘反馈
4. 主壳性能与大会话恢复优化
5. 打包与发布准备
6. 最终验证与 release readiness

同时锁定 Phase 7 的阶段边界：

- 只做 polish、recoverability、error handling、performance、packaging
- 不引入新的核心产品能力
- 不回退 Phase 4 / Phase 5 / Phase 6 已经验证通过的边界
- 不把“发布准备”扩成外部 Agent Adapter 或重型插件运维能力

## 3. 范围

### 包含

- Phase 7 任务树拆分
- 每个子任务的 PRD / implement / check 上下文
- 与 Phase 5 / 6 的边界说明
- 打包、验证与 release readiness 的收口顺序

### 不包含

- 具体实现代码
- Phase 8 级别的新功能扩展
- 外部 Agent Adapter
- 多 Agent 编排系统
- 重型插件生态治理

## 4. 依赖

- **Blocked-by**：Phase 5 Project-aware Shell、Phase 6 Settings and Tools
- **Blocks**：所有 Phase 7 子任务

## 5. 子任务

- [ ] `04-23-phase7-recoverability-and-preference-restore`
- [ ] `04-23-phase7-runtime-workspace-and-config-error-states`
- [ ] `04-23-phase7-memory-and-subagent-edge-feedback`
- [ ] `04-23-phase7-shell-performance-and-large-session-recovery`
- [ ] `04-23-phase7-packaging-and-release-prep`
- [ ] `04-23-phase7-verification-and-release-readiness`

## 6. 相关文件

- `docs/implement/phase7-polish-and-release.md`
- `docs/implement/phase5-project-aware-shell.md`
- `docs/implement/phase6-settings-and-tools.md`
- `studio/src/renderer/pages/StudioHomePage.tsx`
- `studio/src/renderer/hooks/useStudioBridge.ts`
- `studio/src/renderer/utils/startup-route.ts`
- `studio/src/renderer/utils/mode-resolver.ts`
- `studio/src/main/studio-shell-inspector.ts`
- `studio/src/main/studio-runtime-inspector.ts`
- `studio/src/main/studio-ipc.ts`
- `studio/package.json`
- `studio/electron.vite.config.ts`

## 7. 验收标准

- [ ] Phase 7 已被拆成多个可直接执行的 Trellis 任务
- [ ] 每个子任务都有明确 PRD、实现上下文和检查上下文
- [ ] 子任务边界覆盖恢复、错误态、性能、打包和最终验证
- [ ] 任务树没有把 scope 扩到新核心能力
- [ ] 后续 AI 可直接按任务顺序执行，不需要重新拆解

## 8. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 把 Phase 7 做成一个大杂烩工单 | 按恢复、错误态、性能、打包、验证拆成独立子任务 |
| 提前扩 scope 到新功能 | 每个子任务都写明“只补 Phase 7，不新增主能力” |
| 把验证和实现混在一起 | 单独保留 verification 任务，禁止在验证任务再加功能 |
| 为了发布准备破坏现有运行边界 | 明确继续遵守 `renderer -> preload -> main -> cli service` 链路 |

## 9. 测试策略

- 任务层验证：
  - 每个子任务补齐 `implement.jsonl` / `check.jsonl`
  - 相关 spec 与实现落点已显式注入
- 阶段层验证：
  - 恢复、错误态、性能、打包、验证顺序清晰
  - 最终由 release readiness 任务统一验收

## 10. 完成定义

1. Phase 7 的任务树已经可直接交给 AI 逐个执行
2. 每个子任务都能独立形成开发工单
3. 阶段边界足够清晰，不会在收尾阶段继续降级或扩 scope
