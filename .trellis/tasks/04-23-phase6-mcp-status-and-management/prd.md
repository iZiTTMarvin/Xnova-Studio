# Phase 6 · MCP Status and Management

> **阶段**：Phase 6 Settings and Tools · 子任务 D
> **优先级**：P0
> **状态**：planning
> **来源**：[`docs/implement/phase6-settings-and-tools.md`](../../../docs/implement/phase6-settings-and-tools.md) §C MCP、[`docs/implement/phase4-electron-host.md`](../../../docs/implement/phase4-electron-host.md)、[`.trellis/spec/backend/runtime-boundary.md`](../../../.trellis/spec/backend/runtime-boundary.md)、[`.trellis/spec/backend/error-handling.md`](../../../.trellis/spec/backend/error-handling.md)

---

## 1. 问题

MCP 在旧 Web 页面里已经有管理能力，但 Phase 6 需要的是“状态卡片优先”的桌面主体验：连接成功、失败、未配置必须一眼可见，管理入口必须明确，且不能把页面做成重型后台。

## 2. 目标

实现 MCP 的状态卡片和基础管理入口：

- 显示连接成功 / 失败 / 未配置状态
- 提供打开配置 / 管理入口
- 保留用户可见的错误信息
- 避免把 MCP 页面做成运维后台

## 3. 范围

### 包含

- MCP 状态卡片
- 成功 / 失败 / 未配置三态
- 管理入口
- 配置打开入口
- 错误可见性

### 不包含

- 完整 MCP 管理控制台
- 重型运维后台
- 任何绕过 host / preload 的直接访问

## 4. 依赖

- **Blocked-by**：Phase 4 Electron Host、Phase 5 Project-aware Shell、`04-23-phase6-settings-shell-integration`
- **Blocks**：`04-23-phase6-settings-and-tools-verification`

## 5. 子任务

- [ ] MCP 状态三态判定
- [ ] 管理入口与配置入口
- [ ] 失败态与未配置态的可见反馈
- [ ] 通过 host / preload 暴露必要能力
- [ ] 补齐状态与错误回归测试

## 6. 相关文件

- `cli/web/src/components/McpTab.tsx`
- `cli/src/config/mcp-config.ts`
- `cli/src/config/permissions.ts`
- `studio/src/shared/studio-bridge-contract.ts`
- `studio/src/main/studio-ipc.ts`
- `studio/src/preload/studio-bridge-api.ts`
- `cli/src/server/dashboard/plugins-api.ts`

## 7. 验收标准

- [ ] MCP 的三态在桌面 Settings 中真实可见
- [ ] 管理入口和配置入口可被用户理解
- [ ] 错误不会被静默吞掉
- [ ] 没有把页面做成“后台运维中心”

## 8. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 只展示成功态，失败态缺失 | 把未配置 / 失败作为显式 UI 状态 |
| 直接在 renderer 里碰底层能力 | 只通过 host / preload 暴露的桥接调用 |
| 页面逐步膨胀成管理后台 | 只保留状态卡片与必要入口 |

## 9. 测试策略

- 单元测试：
  - MCP 状态判定
  - 入口显隐
  - 错误消息收敛
- 集成测试：
  - 正常 / 失败 / 未配置状态
  - 打开配置 / 管理入口
- 手工验证：
  - 桌面 Settings 中可解释地看到 MCP 状态

## 10. 完成定义

1. MCP 的状态与入口都能在桌面主体验中解释清楚
2. 所有能力都经过 host / preload，不回退到 renderer 直连
3. 没有越界到重型管理后台
