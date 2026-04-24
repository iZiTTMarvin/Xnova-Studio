# CLI 核心功能对照复现验证与旧实现冻结

## Goal

建立一份严格的 CLI 核心功能对照复现矩阵，确保迁移后的 `packages/* + apps/studio` 对旧核心能力一一复现，然后正式冻结旧 `cli` 实现。

## Scope

- 建立功能对照矩阵
- 逐项验证新 engine service / studio host 是否复现旧 CLI 核心能力
- 明确哪些旧 CLI 能力冻结、哪些不再迁移
- 更新文档/spec/changelog

## Source of Truth

- 旧 `cli/src/runtime/**`
- 旧 `cli/src/core/**`
- 旧 `cli/src/ui/useChat.ts`
- 旧 `cli/src/ui/App.tsx`
- 旧 `cli/src/config/providers/persistence/tools/memory/mcp/skills/**`

## Copy-First Migration Rule

- 该任务不再迁代码为主，而是逐项对照前面子任务的迁移结果
- 对照时必须以旧 CLI 核心文件为事实源，不凭印象验收

## Required Parity Matrix

- 聊天提交与流式输出
- 模型切换
- 上下文压缩与快照
- 会话恢复
- 会话分叉
- Memory list/search/write/delete/rebuild
- MCP 状态读取
- Skills 列表与读取
- Usage 汇总
- Cleanup 预览与执行
- 如保留 plugin：runtime plugin 列表/加载最小能力

## Acceptance Criteria

- [ ] 上述能力均有“旧源文件 -> 新 package/service -> studio UI/API”对照记录
- [ ] 已迁移核心能力具备测试或显式人工验收记录
- [ ] 明确写出不再迁移的旧 CLI 壳层能力
- [ ] 旧 `cli` 被标记为冻结/参考，不再主维护

## Dependencies

- 所有前置迁移任务完成后执行

## Testing Strategy

- 核心功能回归矩阵
- studio 端主链路验证
- docs/spec/changelog 更新验证

