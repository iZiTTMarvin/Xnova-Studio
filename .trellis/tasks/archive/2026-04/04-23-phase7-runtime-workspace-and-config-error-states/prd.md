# Phase 7 · Runtime Workspace and Config Error States

> **阶段**：Phase 7 Polish and Release · 子任务 B
> **优先级**：P0
> **状态**：planning
> **来源**：[`docs/implement/phase7-polish-and-release.md`](../../../docs/implement/phase7-polish-and-release.md) §B、[`docs/implement/phase4-electron-host.md`](../../../docs/implement/phase4-electron-host.md)、[`docs/implement/phase5-project-aware-shell.md`](../../../docs/implement/phase5-project-aware-shell.md)

---

## 1. 问题

当前主壳已经有基础 banner、warning 和 host/runtime 状态，但仍缺少一组完整、可解释、可验证的 Phase 7 错误态：runtime 未就绪、workspace 路径失效、project config 错误等仍没有形成统一的 UI 与 IPC / service 合同。若不补齐这部分，恢复链路一旦遇到脏数据，就会重新退回“能跑但解释不清”的状态。

## 2. 目标

补齐 Phase 7 明确要求的错误态与边缘状态：

- runtime 未就绪提示
- workspace 路径失效提示
- project config 错误提示
- host / preload / main / renderer 跨层错误传播
- 失败态不是 silent failure，而是用户可解释的状态

## 3. 范围

### 包含

- runtime inspect 失败 / 未就绪提示
- workspace 路径失效检测与提示
- project config 损坏 / 解析失败提示
- 配置 warning 与错误态在桌面主壳的显式展示
- IPC / bridge / host 侧错误合同收敛

### 不包含

- memory 降级提示
- subagent 部分结果 / 停止状态提示
- 打包、发布、性能优化

## 4. 依赖

- **Blocked-by**：`04-23-phase7-recoverability-and-preference-restore`
- **Blocks**：`04-23-phase7-verification-and-release-readiness`

## 5. 子任务

- [ ] 明确 runtime 未就绪的错误合同与 UI
- [ ] 明确 workspace 路径失效检测与回退
- [ ] 明确 project config 错误的 warning / error 展示
- [ ] 收敛 host / preload / renderer 的错误传播
- [ ] 补齐失败态与损坏态回归测试

## 6. 相关文件

- `studio/src/main/studio-runtime-inspector.ts`
- `studio/src/main/studio-shell-inspector.ts`
- `studio/src/main/studio-ipc.ts`
- `studio/src/preload/studio-bridge-api.ts`
- `studio/src/preload/studio-validators.ts`
- `studio/src/renderer/hooks/useStudioBridge.ts`
- `studio/src/renderer/pages/StudioHomePage.tsx`
- `studio/src/shared/studio-bridge-contract.ts`
- `cli/src/config/resolver.ts`
- `cli/src/config/config-manager.ts`

## 7. 验收标准

- [ ] runtime 未就绪时有明确提示
- [ ] workspace 路径失效时有明确提示和安全回退
- [ ] project config 错误时有明确提示，不会静默重置
- [ ] 外部输入、恢复数据、事件 payload 继续保持“先校验再收窄”
- [ ] 错误态覆盖成功可见、失败可解释、恢复可回退三条链路

## 8. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 为了补错误态把 main process 重新做成业务层 | 继续把 main 限制在宿主职责，业务逻辑下沉 service |
| 配置错误被自动覆盖 | 遵守 config-toml-migration，不做 silent reset |
| renderer 直接读取底层状态 | 仍然走 preload + IPC + 参数校验 |

## 9. 测试策略

- 单元测试：
  - IPC 参数校验与错误结果
  - 配置 warning / error 映射
- 集成测试：
  - runtime 未就绪
  - workspace 失效
  - project config 损坏
- 手工验证：
  - 启动失败提示
  - 打开失效项目后的回退体验

## 10. 完成定义

1. 配置、路径、runtime 异常都有明确反馈
2. 错误态由统一合同驱动，不再靠零散文案拼接
3. 不会为了显示错误态破坏已有安全边界
