# Phase 7 · Shell Performance and Large Session Recovery

> **阶段**：Phase 7 Polish and Release · 子任务 D
> **优先级**：P1
> **状态**：planning
> **来源**：[`docs/implement/phase7-polish-and-release.md`](../../../docs/implement/phase7-polish-and-release.md) §C、[`docs/implement/phase5-project-aware-shell.md`](../../../docs/implement/phase5-project-aware-shell.md)

---

## 1. 问题

Phase 5 / 6 让桌面主壳具备了更多上下文与状态页，但随着最近项目、会话树、子代理树、Settings / Tools 卡片一起进入主壳，首屏和大数据量恢复的性能风险显著增加。当前还没有一个单独任务，专门负责“不要让 overview / shell 恢复把首屏拖慢”。

## 2. 目标

完成 Phase 7 的性能收口：

- 避免 overview 或重型状态读取拖慢首屏
- 优化项目树 / 会话树 / 子代理列表的渲染与恢复
- 对大会话恢复做性能观察与必要优化
- 保持可观察性，避免凭感觉调性能

## 3. 范围

### 包含

- 启动阶段的数据分层加载
- 大会话 / 大树形列表恢复的性能优化
- 关键链路的性能观察与日志
- 必要的渲染策略、状态拆分与读取顺序优化

### 不包含

- 视觉 polish
- 新的 UI 功能
- 打包与发布

## 4. 依赖

- **Blocked-by**：`04-23-phase7-recoverability-and-preference-restore`
- **Blocks**：`04-23-phase7-verification-and-release-readiness`

## 5. 子任务

- [ ] 识别首屏阻塞链路
- [ ] 调整主壳数据读取顺序，避免 overview 拖慢启动
- [ ] 优化项目树 / 会话树 / 子代理列表恢复
- [ ] 为大会话恢复增加可观察指标或日志
- [ ] 补齐性能回归验证

## 6. 相关文件

- `studio/src/renderer/hooks/useStudioBridge.ts`
- `studio/src/renderer/pages/StudioHomePage.tsx`
- `studio/src/renderer/components/ProjectTreePanel.tsx`
- `studio/src/renderer/components/ScratchpadList.tsx`
- `studio/src/main/studio-shell-inspector.ts`
- `studio/src/main/studio-runtime-inspector.ts`
- `studio/src/main/logger.ts`
- `cli/src/persistence/session-store.ts`
- `cli/src/persistence/session-types.ts`

## 7. 验收标准

- [ ] 首屏不会被重型 overview 读取拖慢
- [ ] 项目树 / 会话树 / 子代理树在大数据量下仍可恢复和操作
- [ ] 大会话恢复有性能观察依据，而不是纯主观判断
- [ ] 性能优化不改变既有功能语义
- [ ] 没有为了性能绕过安全边界或类型边界

## 8. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 为了性能把逻辑拆碎成难维护的分支 | 先测量阻塞链路，再做最小化优化 |
| 用缓存掩盖错误恢复问题 | 先保证正确恢复，再优化加载顺序 |
| 性能优化破坏主壳语义 | 所有优化都要保留 Phase 5 / 6 的主叙事与边界 |

## 9. 测试策略

- 单元测试：
  - 恢复流程中的分层加载策略
- 集成测试：
  - 大会话恢复
  - 首屏路径与非首屏路径的读取差异
- 手工验证：
  - 冷启动、热启动、大会话恢复观察

## 10. 完成定义

1. Phase 7 的性能问题有明确优化目标和证据
2. 大会话恢复不再明显拖慢主壳体验
3. 优化保持正确性优先，不做不可解释的“玄学加速”
