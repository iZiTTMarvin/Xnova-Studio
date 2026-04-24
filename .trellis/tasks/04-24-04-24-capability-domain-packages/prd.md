# 抽离能力领域包 tools/memory/mcp/skills/plugin

## Goal

把高阶能力域从旧 CLI 中抽离出来，形成 `packages/tools`、`packages/memory`、`packages/mcp`、`packages/skills`，并处理运行时插件相关最小必要能力。

## Scope

- 工具定义与 registry 相关能力
- Memory 管理、RAG、相关工具
- MCP 管理与工具桥接
- Skills 发现、存储、system prompt 组装
- 若当前主链路需要，迁移 runtime plugin 最小读取/注册能力

## Source of Truth

- `cli/src/tools/**`
- `cli/src/memory/**`
- `cli/src/mcp/**`
- `cli/src/skills/**`
- `cli/src/plugin/**`（仅在主链路需要时）

## Copy-First Migration Rule

- 以目录复制为第一优先
- 不先重写工具 schema、memory pipeline、mcp bridge
- plugin 只迁主链路实际依赖的最小能力，不做范围扩张

## Requirements

- tools / memory / mcp / skills 迁移后仍能被 runtime/core 直接装配
- 保持旧 CLI 工具调用、记忆写入、MCP 初始化、Skills 发现的核心行为
- 不把 CLI 命令外壳一起迁入 packages

## Acceptance Criteria

- [ ] tools/memory/mcp/skills 包可被新 runtime 装配
- [ ] 旧 CLI 主链路中的工具/记忆/MCP/skills 能一一复现
- [ ] plugin 若迁移，只保留主链路所需最小运行时能力

## Dependencies

- `04-24-packages-apps-bootstrap`
- `04-24-core-kernel-extract`
- `04-24-foundation-domain-packages`

## Testing Strategy

- 迁移现有工具、memory、mcp、skills 测试
- 增加主链路集成测试覆盖 runtime 装配

