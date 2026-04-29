# 子任务: RuntimeWarmupManager 与 Prepared Snapshot 骨架

## Goal

建立完整 warmup 架构的第一层：main 侧 `RuntimeWarmupManager`、`RuntimeWarmupStatus` 状态机、`PreparedRuntimeSnapshot` 类型、路径规范化、取消与失败回退。第一阶段 snapshot 内容可以只包含 `bootstrapReady`，但架构必须能自然扩展到完整 fast path。

## What I Already Know

- 当前 `openWorkspace / bindWorkspace` 不做 warmup。
- 当前 `bootstrapAll` 自身用 cwd promise 缓存，但 key 只做 `trim()`，Windows 下同一路径不同写法可能 cache miss。
- 用户明确要求“做好、做完整”，不能只写一个临时后台 `bootstrapAll`。

## Scope

- 新增 `apps/studio/src/main/studio-runtime-warmup.ts`
- `apps/studio/src/main/studio-ipc.ts`
- `apps/studio/src/main/studio-runtime-manager.ts`
- `apps/studio/src/main/studio-runtime-service.ts`
- `apps/studio/src/shared/studio-bridge-contract.ts`
- 相关测试

## Requirements

- 新增 `RuntimeWarmupManager`：
  - `startWarmup(selection/config)`：启动或复用当前 warmup。
  - `abortWarmup(cwd/cacheKey)`：workspace 切换或 dispose 时取消。
  - `getStatus(cacheKey)`：读取状态。
  - `validateSnapshot(selection/config)`：submit 前校验 snapshot。
- 新增 `PreparedRuntimeSnapshot` 骨架：
  - `cacheKey`
  - `cwd`
  - `workspaceRoot`
  - `agentId`
  - `mode`
  - `configFingerprint`
  - `providerFingerprint`
  - `bootstrapReady`
  - `createdAt`
- 路径规范化：
  - 使用统一 helper 规范化 cwd/workspaceRoot。
  - 覆盖 Windows 盘符、斜杠、末尾斜杠。
- 状态机：
  - `idle -> warming -> ready`
  - `warming -> failed`
  - `ready -> stale -> warming`
  - `warming -> idle` when aborted
- 第一阶段 warmup 动作：
  - 调用规范化 cwd 的 `bootstrapAll(cwd)`。
  - 不调用 LLM。
  - 不创建 AgentLoop。
  - 不禁用 composer。
- Submit 集成：
  - submit 入口先执行 `validateSnapshot`。
  - 命中 `bootstrapReady` 时仍可调用 `bootstrapAll(cwd)`，但应命中同一个 promise/cache，作为保守 fast path。
  - 未命中或 failed 时走旧 slow path。

## Acceptance Criteria

- [ ] 打开或绑定 workspace 后触发 warmup 状态 `warming`。
- [ ] warmup 完成后状态为 `ready`，snapshot 中 `bootstrapReady=true`。
- [ ] 切换 workspace 会 abort 旧 warmup。
- [ ] warmup 失败不阻塞 submit，submit 走 slow path。
- [ ] `D:/foo` 与 `D:\foo\` 不产生两个不同 warmup cache key。
- [ ] 没有任何 LLM 调用发生在 warmup 中。

## Tests Required

- `studio-runtime-warmup.test.ts`：
  - 状态机迁移。
  - abort 与 workspace 切换。
  - failed 回退。
  - 路径规范化。
- `studio-runtime-service.test.ts`：
  - warmup ready submit 分支。
  - warmup failed submit slow path。
- `studio-ipc.test.ts`：
  - open/bind workspace 后触发 warmup。

## Out of Scope

- 不缓存完整 system prompt。
- 不缓存完整 tool definitions。
- 不跳过 AgentLoop 创建。
- 不改 renderer UI 展示；UI 在单独子任务中做。

## Technical Notes

- 这是完整架构的地基，不是临时补丁。
- 后续 `04-28-studio-snapshot-fast-path-invalidation` 会继续填充 snapshot 内容。
