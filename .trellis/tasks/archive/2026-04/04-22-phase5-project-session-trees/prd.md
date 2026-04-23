# [Phase 5 · 04] Project Session Trees — Recent Projects, Session Tree, SubAgent Tree and Scratchpad Separation

> **Phase**：Phase 5 Project-aware Shell · 子任务 C
> **Priority**：P0
> **Status**：planning
> **Source**：[`docs/implement/phase5-project-aware-shell.md`](../../../docs/implement/phase5-project-aware-shell.md) §任务清单 C、[`.trellis/spec/frontend/project-shell-v1.md`](../../../.trellis/spec/frontend/project-shell-v1.md)

---

## 1. Problem

仅有左侧壳并不能形成真正的项目感。用户真正感知 `project-aware` 的关键是：最近项目、项目内会话树、子代理会话折叠，以及全局聊天只保留 scratchpad 语义。

## 2. Goal

交付最小但真实可用的数据呈现：

- 最近项目列表
- 项目内会话树
- 子代理会话折叠呈现
- 全局聊天列表只保留 scratchpad 语义

## 3. Scope

### In

- project-aware tree 数据结构或 selector
- 最近项目列表展示
- 项目内会话树展示
- 子代理会话折叠 / 展开
- scratchpad 全局聊天语义分离
- 与聊天主视图的最小同步

### Out

- 完整搜索能力
- Settings / Tools 深度整合
- 新的持久化引擎重构

## 4. Dependencies

- **Blocked-by**：`04-22-phase5-startup-route`、`04-22-phase5-sidebar-information-architecture`
- **Blocks**：`04-22-phase5-context-bar`、`04-22-phase5-project-aware-verification`

## 5. Subtasks

- [ ] 定义 project / session / subagent tree 的读取模型
- [ ] 展示最近项目列表
- [ ] 展示项目内会话树
- [ ] 展示子代理树折叠呈现
- [ ] 明确 scratchpad 全局聊天语义并与项目会话分离
- [ ] 保证侧栏树与聊天流状态同步

## 6. Related Files

- `studio/src/renderer/components/*`
- `studio/src/renderer/hooks/*`
- `studio/src/renderer/pages/*`
- 必要时 `studio/src/preload/*` / `studio/src/main/*`
- `cli/src/ui/useChat.ts`（只读参考）

## 7. Acceptance Criteria

- [ ] 最近项目列表可见
- [ ] 项目内会话树可见
- [ ] 子代理会话能折叠呈现
- [ ] scratchpad 聊天不再与项目会话混为同一主工作流
- [ ] 侧栏树状态与聊天流状态不漂移
- [ ] renderer 仍不直接接触 Node / SQLite / 文件系统

## 8. Risks & Mitigations

| 风险 | 缓解 |
|---|---|
| 用临时数组硬编码 project tree，后续无法增长 | 先定义 selector / adapter，再渲染 |
| scratchpad 重新长成第二套主工作流 | PRD 明确限定其只保留全局聊天语义 |
| 子代理树与聊天流状态不同步 | 必须由统一事件 / 状态源驱动，并补同步测试 |

## 9. Testing Strategy

- 单元：
  - tree selector / scratchpad 过滤规则
- 集成：
  - 最近项目与会话树显示
  - 子代理折叠状态与聊天流同步
- 手工：
  - 在 Electron 中检查 project tree / subagent tree / scratchpad 分离

## 10. Definition of Done

1. 项目维度已经成为左侧主叙事
2. 会话树和子代理树具备增长友好结构
3. 全局聊天语义被明确限制在 scratchpad
