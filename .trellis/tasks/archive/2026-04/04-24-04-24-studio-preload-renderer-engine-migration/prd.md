# Studio Preload/Renderer 迁移到 Engine Services

## Goal

让 `apps/studio` 的 preload 只做安全桥，renderer 只做展示与交互，全面改接新的 engine service / host API。

## Scope

- preload 参数校验与 invoke/on bridge
- renderer 改接 engine service，不再依赖旧 CLI action 语义
- 聊天 UI、项目树、会话树、设置页、MCP/Memory/Skills 面板改走新 API

## Source of Truth

- `studio/src/preload/**`
- `studio/src/renderer/**`
- 旧 `cli/src/ui/App.tsx` 中被证明有价值的交互逻辑

## Copy-First Migration Rule

- 对现有 `studio/src/preload/**`、`studio/src/renderer/**` 优先复制到 `apps/studio/`
- 在复制后的宿主 UI 上改 API 指向，不重新发明一套新页面
- 仅把旧 CLI UI 中确有价值的交互模式按需迁入 renderer

## Requirements

- preload 不放业务逻辑
- renderer 不直接访问 `fs` / `child_process` / provider secrets / runtime internals / tool execution
- renderer 通过 host API 驱动聊天、模型切换、记忆、MCP、会话恢复等能力

## Acceptance Criteria

- [ ] preload 只剩安全桥职责
- [ ] renderer 不再依赖旧 CLI commands/action 分发
- [ ] renderer 主链路全部可通过 engine service/host API 完成

## Dependencies

- `04-24-packages-apps-bootstrap`
- `04-24-engine-service-api`
- `04-24-studio-main-host-runtime-manager`

## Testing Strategy

- preload bridge 测试
- renderer 主流程回归测试
- 关键 UI 状态与错误态验证

