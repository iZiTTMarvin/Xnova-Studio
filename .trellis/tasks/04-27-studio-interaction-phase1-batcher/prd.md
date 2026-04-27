# Phase 1 主进程事件缓冲层

## Goal

把事件合并能力从 renderer 前移到 main，通过引入适配 Xnova 的 `AdaptiveEventBatcher`，显著减少高频流式场景下 main -> renderer 的 IPC 消息数量，同时保证终端事件、权限事件和错误事件不会被延迟到不可接受的程度。

## Requirements

- 新增 `apps/studio/src/main/adaptive-event-batcher.ts`。
- 支持 foreground / background 双速 flush 策略。
- 支持 `text_delta` 与 `thinking` 的字符串累积。
- 非可聚合事件需要先 flush 当前 run 的累积内容，再立即透传。
- `run_completed / run_failed / run_cancelled` 等终端事件必须触发清理。
- `studio-runtime-service.ts` 发送 runtime event 时必须接入 batcher，而不是继续直接 `webContents.send(...)`。

## Acceptance Criteria

- [ ] main 侧具备可测试的事件批量缓冲实现。
- [ ] 高频文本流场景下，renderer 接收到的 IPC 事件数显著下降。
- [ ] 终端事件顺序正确，没有出现文本丢失、thinking 丢失或 run 清理不一致。
- [ ] 新增单元测试，并通过 `xnova-studio` typecheck / test。

## Definition of Done

- `AdaptiveEventBatcher` 被接入到 Studio main 主链路。
- 针对聚合、立即 flush、清理、可见性切换至少覆盖一批核心测试。
- 不在本阶段引入 renderer store 重构。

## Technical Approach

- 以 OpenCowork 的 `AdaptiveEventBatcher` 为机制参考，重写为适配 `StudioRuntimeEvent` 的实现。
- 在 batcher 内以 `runId` 为粒度维护累积器。
- 通过窗口前后台状态控制 flush 频率，并保留一个字符/缓冲上限防止极端堆积。

## Out of Scope

- renderer store 拆分
- 时间线虚拟化
- tool card / markdown 体验升级

## Technical Notes

- Xnova 目标文件：
  - `apps/studio/src/main/studio-runtime-service.ts`
  - `apps/studio/src/shared/studio-bridge-contract.ts`
- OpenCowork 参考：
  - `src/main/ipc/adaptive-event-batcher.ts`
