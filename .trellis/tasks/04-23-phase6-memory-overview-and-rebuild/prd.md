# Phase 6 · Memory Overview and Rebuild

> **阶段**：Phase 6 Settings and Tools · 子任务 C
> **优先级**：P0
> **状态**：planning
> **来源**：[`docs/implement/phase6-settings-and-tools.md`](../../../docs/implement/phase6-settings-and-tools.md) §B Memory、[`docs/implement/phase2-config-migration.md`](../../../docs/implement/phase2-config-migration.md)、[`.trellis/spec/backend/database-guidelines.md`](../../../.trellis/spec/backend/database-guidelines.md)、[`.trellis/spec/frontend/state-management.md`](../../../.trellis/spec/frontend/state-management.md)

---

## 1. 问题

Memory 目前在旧 Web 页面里更像一个独立面板，但 Phase 6 需要的是“状态可见、降级可见、重建可见”的桌面主体验。如果不先把 Memory 作为状态卡片和概览入口收敛，用户很难知道当前是否启用、是否降级、是否需要 rebuild。

## 2. 目标

把 Memory 从“隐式能力”变成“可解释能力”：

- 默认开启展示
- 显示 embedding 配置状态
- 显示当前状态与降级提示
- 提供 rebuild 入口
- 提供全局 / 项目记忆概览
- 所有外部输入、恢复数据都先校验再收窄

## 3. 范围

### 包含

- Memory 状态卡片
- embedding 配置展示
- 降级提示
- rebuild 入口
- 全局 / 项目记忆概览
- 记忆相关错误态与空态

### 不包含

- 大规模向量算法重写
- Release / 打包 / 性能调优
- 任何 silent failure

## 4. 依赖

- **Blocked-by**：Phase 2 Config Migration、Phase 4 Electron Host、Phase 5 Project-aware Shell、`04-23-phase6-settings-shell-integration`
- **Blocks**：`04-23-phase6-settings-and-tools-verification`

## 5. 子任务

- [ ] Memory 默认开启状态在 UI 中可见
- [ ] embedding 配置状态可见
- [ ] 降级提示可见且可解释
- [ ] rebuild 入口可用
- [ ] 全局 / 项目记忆概览展示
- [ ] 缺失 / 损坏 / 失败状态真实展示

## 6. 相关文件

- `cli/web/src/components/MemoryPanel.tsx`
- `cli/src/config/config-manager.ts`
- `cli/src/config/legacy-migration.ts`
- `cli/src/config/toml/types.ts`
- `cli/src/config/__tests__/resolver.effective-merge.test.ts`
- `studio/src/shared/studio-bridge-contract.ts`
- `studio/src/main/studio-ipc.ts`
- `studio/src/preload/studio-bridge-api.ts`
- `cli/src/persistence/session-store.ts`
- `cli/src/persistence/session-types.ts`

## 7. 验收标准

- [ ] Memory 的启用状态和降级状态都能在桌面 Settings 中看见
- [ ] embedding 配置不完整时有明确提示
- [ ] rebuild 入口可操作，失败路径可见
- [ ] 全局 / 项目记忆概览可区分
- [ ] 不会把 Memory 做成静默的“后台开关”

## 8. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 只做展示，不做可解释状态 | 将状态、降级、失败都作为一等 UI 状态 |
| rebuild 入口只是摆设 | 补失败态与结果态，保证用户知道发生了什么 |
| 读取记忆时碰到不完整数据直接崩 | 输入先校验再收窄，失败要回退到可见提示 |

## 9. 测试策略

- 单元测试：
  - Memory 状态判定
  - 降级提示文案
  - rebuild 请求参数
- 集成测试：
  - embedding 配置完整 / 不完整 / 错误
  - 记忆概览显示
  - rebuild 成功 / 失败
- 手工验证：
  - 桌面 Settings 中查看 Memory 状态
  - 降级提示与 rebuild 路径可解释

## 10. 完成定义

1. Memory 在桌面主体验里是可解释的状态卡片
2. rebuild 与降级提示都是真实可见的
3. 不再依赖旧 Web 面板作为主入口
