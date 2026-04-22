# [Phase 4 · 04] Preload IPC Bridge — Secure Host API and Runtime Event Contract

> **Phase**：Phase 4 Electron Host · 子任务 C
> **Priority**：P0
> **Status**：planning
> **Source**：[`docs/implement/phase4-electron-host.md`](../../../docs/implement/phase4-electron-host.md) §任务清单 C、[`.trellis/spec/backend/runtime-boundary.md`](../../../.trellis/spec/backend/runtime-boundary.md)

---

## 1. Problem

Electron renderer 既需要访问宿主能力，也需要消费共享 runtime；如果没有 preload 安全边界，最容易出现两类严重退化：

1. renderer 直接获得 Node / shell / 文件系统能力，破坏宿主安全模型；
2. IPC channel 与 runtime 事件随手定义，导致 main、preload、renderer 三层语义漂移。

## 2. Goal

定义一个最小但稳定的 preload / IPC bridge，让 renderer 可以：

- 打开 workspace
- 读取当前 host 基础状态
- 发起最小 runtime 请求
- 订阅 runtime 或 host 返回的基础事件

同时确保参数校验、订阅清理和错误传播都有明确契约。

## 3. Scope

### In

- 定义 preload 暴露 API
- 定义最小 IPC channel 与 payload 结构
- 参数校验与错误返回语义
- runtime 事件转发
- renderer 订阅 / 取消订阅契约

### Out

- 不做完整 project-aware 事件模型
- 不做复杂多窗口通信
- 不做长期缓存或状态持久化

## 4. Dependencies

- **Blocked-by**：`04-22-phase4-studio-bootstrap`、`04-22-phase4-main-process-workspace`
- **Blocks**：`04-22-phase4-renderer-minimal-shell`、`04-22-phase4-electron-verification`

## 5. Subtasks

- [ ] 定义 renderer 可见的 host API 形状
- [ ] 实现 preload `contextBridge` 暴露
- [ ] 定义最小 IPC request / response 契约
- [ ] 建立 runtime 事件桥接与订阅清理机制
- [ ] 覆盖非法参数、异常返回与通道关闭路径

## 6. Related Files

- `studio/src/preload/index.ts`
- `studio/src/preload/ipc-contract.ts`
- `studio/src/preload/validators.ts`
- `studio/src/main/ipc.ts`
- `studio/src/shared/*`（若需要共享类型）

## 7. Acceptance Criteria

- [ ] renderer 看不到原始 Node 能力，只能看到 preload API
- [ ] IPC payload 有明确类型或校验逻辑
- [ ] workspace 打开、状态读取、最小 runtime 请求都有固定调用方式
- [ ] 事件订阅支持清理，避免泄漏
- [ ] 非法参数与运行异常有明确错误返回

## 8. Risks & Mitigations

| 风险 | 缓解 |
|---|---|
| preload 只是薄转发，没有校验 | 在本任务中明确 payload 校验与错误语义 |
| 通道命名和事件结构散落 | 抽 `ipc-contract` 或等价共享定义，集中声明 |
| renderer 订阅不清理导致事件泄漏 | API 设计要求返回 unsubscribe 句柄或等价清理方式 |

## 9. Testing Strategy

- 单元：参数校验
- 轻集成：IPC 成功 / 失败 / 非法参数
- 回归：确认 renderer 不依赖 NodeIntegration

## 10. Definition of Done

1. preload 成为 renderer 的唯一宿主能力入口
2. IPC contract 可被 renderer 子任务直接消费
3. 错误路径不再是 silent failure
