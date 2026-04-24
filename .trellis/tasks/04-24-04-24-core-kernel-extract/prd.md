# 抽离 packages/core 内核编排与会话上下文

## Goal

把 runtime 背后的核心编排层从旧 `cli/src/core/**` 中抽出，形成 `packages/core`，重点承接 `agent-loop`、`bootstrap`、`context-manager` 等运行时内核。

## Scope

- 迁移 `agent-loop`
- 迁移 `bootstrap`
- 迁移 `context-manager`
- 补齐 `context-tracker`、相关纯编排依赖

## Source of Truth

- `cli/src/core/agent-loop.ts`
- `cli/src/core/bootstrap.ts`
- `cli/src/core/context-manager.ts`
- `cli/src/core/context-tracker.ts`
- `cli/src/core/parallel-executor.ts`
- `cli/src/core/args-summarizer.ts`

## Copy-First Migration Rule

- 先逐文件复制到 `packages/core/src/`
- 保留原有函数/类名与主流程顺序
- 只有在切断 CLI UI 依赖时才做最小重构

## Requirements

- `packages/core` 只承载运行时核心，不承载 CLI UI/命令/Ink 逻辑
- `packages/runtime` 对核心编排的依赖全部改指向 `packages/core`
- 仍保持与旧 provider/tool/history 行为一致

## Acceptance Criteria

- [ ] `packages/core/src/agent-loop.ts`、`bootstrap.ts`、`context-manager.ts` 落地
- [ ] `packages/runtime` 可通过 `packages/core` 正常编排一轮执行
- [ ] 不再从 `apps/studio` 或 `packages/runtime` 反向 import 旧 `cli/src/core/**`

## Dependencies

- `04-24-packages-apps-bootstrap`
- `04-24-runtime-package-extract`

## Testing Strategy

- 迁移 `agent-loop` 相关测试
- 验证 runtime submit 基线行为不回归

