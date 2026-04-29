# 子任务: Submit Timing 与 Bootstrap 子阶段观测

## Goal

把首次响应慢从“只有一个 runtime bootstrap 总耗时”拆成可诊断的子阶段 timing，并让多轮模型请求、工具后续请求、首个可见进展都能在 Studio submit timing 中被看见。这个任务是后续 warmup 和 snapshot fast path 的观测地基。

## What I Already Know

- `packages/core/src/bootstrap.ts` 已经记录 bootstrap 内部耗时，但类型和外发事件不完整。
- `packages/runtime/src/create-runtime.ts` 当前只发 `runtime_bootstrap_start/done`。
- `apps/studio/src/main/studio-submit-timing.ts` 当前用 `markFirst`，后续 `after_tool_result` 模型请求会被忽略。
- timing 脱敏已有基础：`SAFE_DETAIL_KEYS` 和敏感 key pattern。

## Scope

- `packages/core/src/bootstrap.ts`
- `packages/runtime/src/create-runtime.ts`
- `apps/studio/src/main/studio-submit-timing.ts`
- `apps/studio/src/renderer/stores/runtime-store.ts`
- 相关测试

## Requirements

- 为 `bootstrapAll` 增加 timing sink，逐项发出 `bootstrap.skills`、`bootstrap.instructions`、`bootstrap.hooks`、`bootstrap.sessionStartHooks`、`bootstrap.fileIndex`、`bootstrap.plugins`、`bootstrap.memory`、`bootstrap.shellSnapshot`、`bootstrap.gitContext`、`bootstrap.systemPrompt`、`bootstrap.total`。
- 修正 `BootstrapTimings` 类型，让类型覆盖实际字段，避免继续使用 `as unknown as BootstrapTimings` 掩盖字段缺失。
- `create-runtime` 把 bootstrap 子阶段转为 runtime `timing_mark`。
- `studio-submit-timing` 支持：
  - 首次关键事件 summary。
  - 多轮 `model_request_started/finished/failed` 按 phase 聚合。
  - bootstrap 子阶段 summary。
- renderer store 增加子阶段中文文案，避免 bootstrap 阶段 UI 死寂。
- 所有 timing 详情必须继续脱敏，不记录 prompt、messages、headers、API key、工具内容全文。

## Acceptance Criteria

- [ ] Submit timing summary 能看到 bootstrap 子阶段耗时。
- [ ] 多轮模型请求能按 `initial / after_tool_result / retry` 统计。
- [ ] 任一 bootstrap 子阶段超过阈值时，开发态日志能指出具体 stage。
- [ ] 不新增敏感字段泄漏。
- [ ] 现有 submit timing 测试继续通过。

## Tests Required

- `bootstrap.test.ts`：断言 timing sink 收到所有子阶段。
- `studio-submit-timing.test.ts`：断言 bootstrap 子阶段、多轮 model request 聚合、敏感字段脱敏。
- `runtime-store` 相关测试：断言新增 timing stage 能映射为中文状态。

## Out of Scope

- 不做 warmup。
- 不跳过 bootstrap。
- 不改 provider tool lifecycle。

## Technical Notes

- 先做观测再做优化，避免后续 warmup 后不知道收益来自哪里。
- 这个任务完成后，可以用真实 dev 环境重新采样首次响应瓶颈。
