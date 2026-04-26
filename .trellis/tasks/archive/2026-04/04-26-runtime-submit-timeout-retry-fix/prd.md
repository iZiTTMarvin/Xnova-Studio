# 修复 Studio runtime submit 超时报错误杀

## Goal

修复 Xnova Studio 在正常对话场景下仍然被 `runtime submit` 60 秒 watchdog 误杀的问题，避免用户在模型已有流式进展时仍收到“请检查网络连接、API Key 或 baseURL 配置”的错误提示。

## What I already know

- 当前 `apps/studio/src/main/studio-runtime-service.ts` 对整次 `runtimeInstance.submit()` 使用固定 60 秒总时长超时。
- runtime 已支持流式事件（`text_delta`、`thinking`、`tool_start`、`tool_end`、`warning`、`error`），但 host watchdog 没有利用这些进展信号。
- renderer 在 submit 返回失败时会自己追加一次系统错误，同时 IPC 广播的 `runtime.error` 也会再追加一次，导致同一条错误被显示两次。
- 本任务横跨 `main -> preload -> renderer` 主链路，需要遵守 `.trellis/spec/backend/runtime-boundary.md` 与 `.trellis/spec/frontend/project-shell-v1.md`。

## Requirements

- submit watchdog 必须保留，但语义改为“连续一段时间没有新的运行进展才中断”，不能再按整轮固定总时长误杀。
- runtime 事件、权限交互等进展信号必须能重置 submit watchdog。
- 无进展超时触发后，仍需调用 `runtimeInstance.abort()`，并返回用户可见错误。
- renderer 对同一条 submit 错误只显示一次，不再重复追加系统消息。

## Acceptance Criteria

- [ ] 新增失败测试覆盖“长于 watchdog 但持续有 runtime 事件时，submit 仍能成功完成”。
- [ ] 保留回归测试覆盖“持续无进展时，submit 会 abort 并返回明确错误”。
- [ ] 新增或更新 renderer 测试覆盖“同一条 submit 错误不会重复显示”。
- [ ] `pnpm --filter xnova-studio test` 通过。
- [ ] 根级 `pnpm typecheck` 通过。
- [ ] `CHANGELOG.md` 已更新。

## Out of Scope

- 不在本任务中重做 provider retry 策略。
- 不在本任务中调整 Studio 的整体交互设计。
