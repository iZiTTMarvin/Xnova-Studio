# Studio 交互现代化改造

## Goal

基于 `D:\visual_ProgrammingSoftware\毕设and简历Projects\OpenCowork-main` 的成熟交互架构，对 Xnova Studio 的流式对话、主进程事件传输、状态管理、长会话渲染和时间线体验做一次分阶段现代化改造。目标不是表层换皮，而是在不破坏现有 Studio 主链路契约的前提下，解决卡顿、长会话膨胀、工具过程可视化薄弱、时间线交互粗糙等系统性问题。

## Requirements

- 以 `implementation_plan.md` 和 `项目交互改造计划.md` 作为本任务的权威需求来源。
- 采用父 task + 多子 task 的推进方式，按阶段顺序完成：
  - Phase 0：renderer 侧止血，降低高频 delta 带来的整页重渲染。
  - Phase 1：在 main 侧引入事件缓冲层，减少 IPC 风暴。
  - Phase 2：重构 `useStudioBridge`，建立多 store 状态架构。
  - Phase 3：为长会话引入虚拟化、内存窗口和输出截断。
  - Phase 4：升级 thinking / tool card / markdown / subagent 体验。
  - Phase 5：补齐自动滚动、历史加载和整体联调收尾。
- 允许引入下列依赖，并在对应子任务中完成接入与验证：
  - `zustand`
  - `immer`
  - `motion`
  - `react-markdown`
  - `remark-gfm`
  - `react-virtuoso`
- 所有跨层改动必须遵守 `renderer -> preload -> main -> runtime` 边界，不能让 renderer 直连宿主能力，也不能让 main 重新长出第二套 runtime 业务逻辑。
- OpenCowork 只作为参考实现与交互基线，禁止无差别复制；所有迁移都要先适配 Xnova 的 shared contract、runtime event 类型和现有测试基础。

## Acceptance Criteria

- [ ] 父 task 下的 6 个子 task 都有清晰 PRD、context 和完成标准。
- [ ] 每个子 task 都能独立通过本阶段涉及的类型检查、测试或构建验证。
- [ ] Studio 在高频 `text_delta` 输出时，不再出现整页级重渲染风暴。
- [ ] main 到 renderer 的高频事件链路具备批量缓冲和终端事件立即刷新的能力。
- [ ] `useStudioBridge` 不再承担巨石式全量状态管理职责，组件能按需订阅状态切片。
- [ ] 长会话（100+ 消息）场景下，时间线渲染与内存占用明显优于当前基线。
- [ ] thinking、tool、markdown、subagent 与自动滚动体验达到文档约定的目标基线。

## Definition of Done

- 所有子 task 按顺序完成并通过验证。
- 受影响范围的 `typecheck / test / build` 通过。
- 如形成新的稳定约束，回写 `.trellis/spec/`。
- 若产生明显用户可见变化，补充 `CHANGELOG.md`。
- 最终可通过 Trellis 的 `check -> update-spec -> finish` 流程收尾。

## Technical Approach

采用“先止血、再缓冲、再重构、再提质”的递进策略，避免一次性重写 Studio 主链路：

1. 先在 renderer 侧通过 RAF 批量缓冲和 `React.memo` 把最致命的重渲染问题压住。
2. 再把事件合并前移到 main 侧，减少 IPC 次数与渲染端事件压力。
3. 在状态流量可控后，拆掉 `useStudioBridge` 的巨石结构，建立 `runtime / session / settings` 多 store 设计。
4. 之后再引入消息虚拟化、内存窗口和体验增强，避免在脆弱状态管理上直接叠复杂 UI。
5. 所有阶段都以 OpenCowork 的对应模块为参照，但保留 Xnova 当前 shared contract、workspace 绑定和 runtime boundary 约束。

## Decision (ADR-lite)

**Context**：Xnova 当前卡顿不是单一组件问题，而是“高频流式事件 + 巨石状态管理 + 无渲染隔离 + 长会话无限增长”叠加后的架构性缺陷。

**Decision**：
- 采用多子 task 分阶段推进，而不是一次性大重构。
- 引入 `zustand + immer` 作为状态容器。
- 引入 `motion`、`react-markdown`、`react-virtuoso` 作为体验层升级基础依赖。
- 以 OpenCowork 的实现模式为参考，但要求逐层适配 Xnova 的事件模型与宿主边界。

**Consequences**：
- 初期会出现一段“新旧状态架构并存”的过渡期，需要明确阶段边界和回归验证。
- 引入新依赖会增加维护面，但可显著降低自研状态/渲染/滚动逻辑的复杂度。
- 通过阶段化改造，可以让每一步都有可回退的最小落地点。

## Out of Scope

- 不改造 provider、tool registry、memory、MCP 等与本次交互体验无直接关系的底层能力。
- 不把 OpenCowork 的所有 UI/动画细节原样搬运到 Xnova。
- 不在本父 task 内处理与 Studio 主聊天时间线无关的新功能需求。

## Technical Notes

- 核心需求文档：
  - `implementation_plan.md`
  - `项目交互改造计划.md`
- 关键 Xnova 入口：
  - `apps/studio/src/renderer/hooks/useStudioBridge.ts`
  - `apps/studio/src/renderer/components/ConversationTimeline.tsx`
  - `apps/studio/src/renderer/components/ToolActionRow.tsx`
  - `apps/studio/src/renderer/components/ReasoningRow.tsx`
  - `apps/studio/src/main/studio-runtime-service.ts`
  - `apps/studio/src/shared/studio-bridge-contract.ts`
- OpenCowork 关键参考索引见 `research/opencowork-reference-index.md`。
