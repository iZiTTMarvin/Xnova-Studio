# 子任务: Snapshot Fast Path 与失效规则

## Goal

在 warmup 骨架基础上，把 system prompt、tool definitions、agent/provider metadata 等装配产物纳入 `PreparedRuntimeSnapshot`，实现真正的 submit fast path，并建立可测试的失效规则。

## What I Already Know

- `bootstrapAll` 构建 system prompt，目前通过 `getSystemPrompt()` 读取。
- tool registry 当前在 submit 内 `getRegistry()` + `registerMcpTools(registry)`。
- agent prompt 在 submit 内 `agentCatalog.resolvePrimaryAgent(...)` 后拼接。
- provider/model 切换不应触发完整本地 bootstrap，但会影响 provider capability/fingerprint。

## Dependencies

- 依赖 `04-28-studio-runtime-warmup-snapshot-skeleton`。
- 依赖 `04-28-studio-bootstrap-timing-observability`，便于比较 fast path 收益。

## Scope

- `packages/core/src/bootstrap.ts`
- `packages/runtime/src/create-runtime.ts`
- `packages/runtime/src/engine-service-api.ts`
- `apps/studio/src/main/studio-runtime-warmup.ts`
- 新增或扩展 snapshot 相关 main helper
- 相关测试

## Requirements

- 扩展 `PreparedRuntimeSnapshot`：
  - `systemPrompt`
  - `toolDefinitions`
  - `agentConfigFingerprint`
  - `skillsVersion`
  - `hooksVersion`
  - `mcpToolListVersion`
  - `memoryVersion`
  - `gitContextVersion`
- 定义 `cacheKey`：
  - normalized cwd
  - normalized workspaceRoot
  - agentId
  - mode
  - provider/model config fingerprint
  - project/user config fingerprint
- 实现失效规则：
  - workspace 切换：全部失效。
  - provider settings 保存：provider fingerprint 失效。
  - agent 切换：agent prompt 维度失效。
  - skills/hooks 文件变化：system prompt 失效。
  - MCP 配置变化：tool definitions 失效。
  - memory 重建：memory version 失效。
  - git HEAD/branch 变化：git context version 失效。
- Submit fast path：
  - snapshot valid 时复用 system prompt/tool definitions/agent metadata。
  - snapshot invalid 时走 slow path 并刷新 snapshot。
  - fast path 不改变外部页面调用方式。
- 安全要求：
  - snapshot 保存在内存。
  - 不把 system prompt、tool definitions 原文写入日志或 IPC。
  - 不存 raw API key，只存 fingerprint。

## Acceptance Criteria

- [ ] warmup ready 后 submit 到 `model_request_started` 的本地准备耗时明显下降。
- [ ] timing summary 中能看到 fast path 命中。
- [ ] 任一失效条件触发后，下一次 submit 不复用旧 snapshot。
- [ ] fast path 与 slow path 的工具注册、agent prompt、memory/git context 行为一致。
- [ ] 没有 system prompt/API key 通过日志或 IPC 泄漏。

## Tests Required

- `studio-runtime-warmup.test.ts`：
  - snapshot key 生成。
  - 每类失效条件。
  - ready/stale/failed 行为。
- `create-runtime` 或 runtime service 集成测试：
  - fast path 命中跳过重复装配。
  - snapshot 缺失回退 slow path。
- 安全测试：
  - timing/log/IPC 不包含 prompt、apiKey、Authorization。

## Out of Scope

- 不做 tool intent/args delta。
- 不做 provider websocket 预连。
- 不改变持久化 session schema。

## Technical Notes

- 这一步才是真正完整的 snapshot fast path。
- 需要特别小心“复用缓存导致上下文 stale”的风险，宁可保守失效，也不要复用错上下文。
