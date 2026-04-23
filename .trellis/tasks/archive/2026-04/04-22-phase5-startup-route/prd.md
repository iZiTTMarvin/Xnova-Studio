# [Phase 5 · 02] Startup Route — Blank Chat Default, Overview Demotion and Cold-start Recovery

> **Phase**：Phase 5 Project-aware Shell · 子任务 A
> **Priority**：P0
> **Status**：planning
> **Source**：[`docs/implement/phase5-project-aware-shell.md`](../../../docs/implement/phase5-project-aware-shell.md) §任务清单 A、[`.trellis/spec/frontend/project-shell-v1.md`](../../../.trellis/spec/frontend/project-shell-v1.md)

---

## 1. Problem

当前 Phase 4 只有一个最小桌面页面，没有锁定冷启动主入口，也没有明确 `Overview` 的降级位置。若不先定义首页路由决策，后续 project-aware 壳会建立在不稳定入口之上。

## 2. Goal

实现 Phase 5 的首页入口规则：

- 冷启动默认进入空白聊天页
- `Overview` 退到二级页面
- 有最近项目且有最近会话时恢复最近工作会话
- 最近项目路径失效 / 最近会话损坏时显式降级并给反馈

## 3. Scope

### In

- `resolveStartupRoute` 或等价纯函数
- 空白聊天页入口
- `Overview` 降级为二级页面
- 最近项目 / 最近会话恢复规则
- 路径失效 / 数据损坏时的降级反馈

### Out

- 左侧信息架构
- 项目树 / 会话树细节
- 上下文条
- 模式切换

## 4. Dependencies

- **Blocked-by**：Phase 4 Electron Host 已完成
- **Blocks**：`04-22-phase5-sidebar-information-architecture`、`04-22-phase5-project-session-trees`

## 5. Subtasks

- [ ] 定义启动路由输入输出契约
- [ ] 落空白聊天页默认入口
- [ ] 将 `Overview` 改为二级页面
- [ ] 接入最近项目 / 最近会话恢复
- [ ] 覆盖路径失效与数据损坏降级路径

## 6. Related Files

- `studio/src/renderer/App.tsx`
- `studio/src/renderer/pages/*`
- `studio/src/renderer/hooks/*`
- `studio/src/renderer/utils/*`
- `cli/web/src/App.tsx`（只读参考）

## 7. Acceptance Criteria

- [ ] 冷启动默认不再进入统计页
- [ ] 无最近项目时进入空白聊天页
- [ ] 有最近项目且有最近会话时恢复最近工作会话
- [ ] 最近项目路径失效 / 最近会话损坏时会降级并有可见反馈
- [ ] 路由决策逻辑以纯函数或等价单一事实源实现

## 8. Risks & Mitigations

| 风险 | 缓解 |
|---|---|
| 恢复逻辑散落在多个组件 | 用单一 resolver 函数收敛并补单测 |
| `Overview` 虽降级但仍被默认路由间接打到 | 测试中断言默认入口只会是 blank-chat / restore-session |
| 恢复失败时页面空白 | 界面必须真实显示 fallback / error 提示 |

## 9. Testing Strategy

- 单元：
  - `resolveStartupRoute` 覆盖四条主分支
- 集成：
  - 冷启动主入口
  - 路径失效 / 最近会话损坏降级
- 手工：
  - Electron 冷启动进入空白聊天页
  - 存在最近会话时正确恢复

## 10. Definition of Done

1. 启动主入口已锁定
2. `Overview` 不再承担默认首页职责
3. 后续 sidebar / project tree / context bar 都可建立在稳定入口之上
