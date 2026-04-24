# Studio Main 接入 RuntimeManager 与 Engine Host API

## Goal

让 `apps/studio` 的 `main` 进程成为真正的运行时宿主持有者，负责创建并管理 `RuntimeManager` / `RuntimeSession`，并通过 Host API 对外暴露 engine 能力。

## Scope

- 建立 `RuntimeManager`
- 建立 session/workspace 级持有与生命周期管理
- main 进程处理权限请求、运行时事件转发、provider/session/project 管理
- `main` 层只依赖 `packages/*`

## Source of Truth

- `studio/src/main/studio-runtime-service.ts`
- `studio/src/main/studio-ipc.ts`
- `studio/src/main/studio-shell-inspector.ts`
- 旧 `cli` 中与 session/provider/bridge 相关的核心运行时逻辑

## Copy-First Migration Rule

- 对已有 `studio/src/main/**` 文件优先复制到 `apps/studio/src/main/**`
- 在此基础上把底层依赖改为 `packages/*`
- 只有在需要改成长生命周期 runtime manager 时才做结构升级

## Requirements

- `main` 持有运行时，不再每次提交都临时拼接一轮 CLI 过渡 runtime
- `main` 提供面向 preload 的宿主 API，不把业务塞进 preload
- `main` 不再直接依赖旧 `cli/src/**`

## Acceptance Criteria

- [ ] `apps/studio/src/main/**` 只依赖 `packages/*`
- [ ] 运行时实例可按 workspace/session 长生命周期持有
- [ ] 权限请求、工具事件、session 恢复都由 `main` 承担宿主职责

## Dependencies

- `04-24-packages-apps-bootstrap`
- `04-24-runtime-package-extract`
- `04-24-core-kernel-extract`
- `04-24-foundation-domain-packages`
- `04-24-capability-domain-packages`
- `04-24-engine-service-api`

## Testing Strategy

- main 进程服务单测
- IPC/host 集成测试
- `apps/studio` 主链路回归

