# Phase 4 交互组件体验升级

## Goal

在性能与状态基础稳定后，升级 Studio 时间线的交互质感与信息密度，包括 thinking 展示、tool card、markdown 渲染和 subagent 卡片，使其达到“可读、可诊断、可展开”的现代聊天工作台体验。

## Requirements

- Thinking 区域引入更平滑的展开/折叠与更稳定的进行中态。
- Tool 行需要支持更结构化的结果展示与更好的分组体验。
- Markdown 渲染升级为 `react-markdown + remark-gfm` 路线。
- 新增 `SubAgentCard` 或等价组件，展示子代理状态、进度与摘要。
- 升级必须建立在已有性能防线之上，不能引入明显回退。

## Acceptance Criteria

- [ ] Thinking、tool、markdown、subagent 呈现能力达到 PRD 约定基线。
- [ ] 新依赖完成接入并通过 typecheck / test / build。
- [ ] 工具结果与思考内容的展开、折叠、流式态切换更平滑。

## Definition of Done

- 关键体验组件完成升级并联调通过。
- 至少覆盖 markdown 渲染或组件状态切换的回归验证。
- 不在本阶段处理最终自动滚动状态机。

## Technical Approach

- 参考 OpenCowork 的 `ThinkingBlock / ToolCallCard / ToolCallGroup / SubAgentCard`，迁移其中的状态组织与展示模式。
- 保持 Xnova 现有 shared contract，不额外扩张为与 OpenCowork 完全同构。
- 对长文本、工具结果和 markdown 解析保持明确的性能上限意识。

## Out of Scope

- 主进程 batcher
- store 拆分
- 自动滚动最终打磨

## Technical Notes

- Xnova 目标文件：
  - `apps/studio/src/renderer/components/ReasoningRow.tsx`
  - `apps/studio/src/renderer/components/ToolActionRow.tsx`
  - `apps/studio/src/renderer/components/ToolActivityGroupRow.tsx`
  - `apps/studio/src/renderer/utils/markdown-renderer.tsx`
- OpenCowork 参考：
  - `src/renderer/src/components/chat/ThinkingBlock.tsx`
  - `src/renderer/src/components/chat/ToolCallCard.tsx`
  - `src/renderer/src/components/chat/ToolCallGroup.tsx`
  - `src/renderer/src/components/chat/SubAgentCard.tsx`
