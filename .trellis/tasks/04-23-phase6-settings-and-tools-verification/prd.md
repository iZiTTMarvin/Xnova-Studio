# Phase 6 · Settings and Tools Verification

> **阶段**：Phase 6 Settings and Tools · 子任务 F
> **优先级**：P0
> **状态**：planning
> **来源**：[`docs/implement/phase6-settings-and-tools.md`](../../../docs/implement/phase6-settings-and-tools.md)、[`docs/implement/phase4-electron-host.md`](../../../docs/implement/phase4-electron-host.md)、[`docs/implement/phase5-project-aware-shell.md`](../../../docs/implement/phase5-project-aware-shell.md)、[`docs/implement/phase7-polish-and-release.md`](../../../docs/implement/phase7-polish-and-release.md)

---

## 1. 问题

Phase 6 会同时改动桌面壳、配置主链路、Memory、MCP、Skills / Plugins 和 bridge / IPC。若没有一个独立验证任务，前面几个子任务很容易“看起来完成了”，但最终没有覆盖真实 Electron、typecheck、build 和关键手工链路。

## 2. 目标

为 Phase 6 建立明确的质量门：

- 相关测试必须补齐
- `typecheck` 必须通过
- `build` 必须通过
- Electron smoke 必须通过
- 手工 critical path 必须可执行
- 验证只覆盖 Phase 6，不提前扩到 Phase 7

## 3. 范围

### 包含

- 任务级测试清单整理
- 关键回归测试补齐
- typecheck / build / smoke 验证
- 手工 critical path 清单
- 失败态与降级态验收

### 不包含

- 新功能扩展
- 打包发布
- 恢复逻辑增强

## 4. 依赖

- **Blocked-by**：`04-23-phase6-settings-shell-integration`、`04-23-phase6-provider-config-and-toml`、`04-23-phase6-memory-overview-and-rebuild`、`04-23-phase6-mcp-status-and-management`、`04-23-phase6-skills-and-plugins-status`

## 5. 子任务

- [ ] 整理 Phase 6 相关测试清单
- [ ] 补齐缺失的单元 / 集成回归测试
- [ ] 运行并记录 `typecheck`
- [ ] 运行并记录 `build`
- [ ] 运行 Electron smoke
- [ ] 手工走完 Settings / Tools critical path

## 6. 相关文件

- `docs/implement/phase6-settings-and-tools.md`
- `docs/implement/phase4-electron-host.md`
- `docs/implement/phase5-project-aware-shell.md`
- `docs/implement/phase7-polish-and-release.md`
- `.trellis/spec/frontend/quality-guidelines.md`
- `.trellis/spec/frontend/project-shell-v1.md`
- `.trellis/spec/backend/runtime-boundary.md`
- `.trellis/spec/backend/config-toml-migration.md`
- `.trellis/spec/backend/agent-schema-v1.md`
- `.trellis/spec/backend/quality-guidelines.md`
- `.trellis/spec/guides/cross-layer-thinking-guide.md`

## 7. 验收标准

- [ ] 相关测试已补齐并能稳定运行
- [ ] `typecheck` 通过
- [ ] `build` 通过
- [ ] Electron smoke 通过
- [ ] 手工 critical path 可复现
- [ ] 验证范围没有溢出到 Phase 7

## 8. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 只验证成功路径 | 必须把失败态、空态、降级态纳入验收 |
| 只在 web 环境通过，不代表真实 Electron 通过 | 必须保留真实 Electron smoke |
| 验证阶段继续扩 scope | 只做验证和回归，不再加功能 |

## 9. 测试策略

- 单元 / 集成：
  - Provider merge / TOML
  - Memory 状态与 rebuild
  - MCP 状态与管理入口
  - Skills / Plugins 状态与来源分布
- 运行时：
  - `pnpm -C studio typecheck`
  - `pnpm -C studio build`
  - `pnpm -C cli typecheck`
  - 真实 Electron smoke
- 手工：
  - Settings / Tools 页面完整走一遍

## 10. 完成定义

1. Phase 6 的功能和边界都被验证过
2. 关键链路有可复查的测试证据
3. 最终收口时可以直接说明没有越界到 Phase 7
