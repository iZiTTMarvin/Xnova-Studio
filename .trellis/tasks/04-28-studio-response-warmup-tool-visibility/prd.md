# brainstorm: 优化 Studio 首次响应与工具过程可见性

## Goal

降低 Xnova Studio 模型调用前的首次等待感，并把 agent 思考、工具调用、工具参数和结果等过程更清楚地展示出来。当前先做方案审查与参考项目调研，确认 `docs/audits/studio-first-response-warmup-and-tool-visibility-audit.md` 的方案是否符合 Xnova 架构，以及哪些 OpenCowork 交互模式值得学习。

## What I Already Know

* 用户指出 Claude 昨天已整理审计文档，目标是解决模型调用较慢和工具过程黑盒问题。
* 审计文档把问题拆成两条主线：首次响应慢主要来自 submit 路径上的 runtime bootstrap；工具过程黑盒主要来自工具 running 态和更早的 tool intent / args delta 不够可见。
* 用户提供 `D:\visual_ProgrammingSoftware\毕设and简历Projects\OpenCowork-main` 作为完整 agent 参考项目，希望学习它的 agent 交互、思考和工具调用呈现。
* 本阶段先做只读评估与方案对照，不直接修改产品代码。

## Assumptions

* Xnova 现有架构会优先保持 main/runtime/renderer 分层清晰，不为了体验改造破坏已有边界。
* warmup 必须不调用 LLM、不消耗 token，失败时 submit 能回退到旧路径。
* 工具可见性改造应优先做到展示层改善，再考虑 provider/core 事件协议扩展。

## Open Questions

* 是否先按“低风险可观测性 + UI 可见性”切第一批实现，还是直接推进 warmup fast path 架构改造？

## Requirements

* 审查 audit 文档中的 runtime warmup、snapshot cache、tool running 最小可见时间、tool_intent/tool_args_delta 等建议是否符合当前代码。
* 对照 OpenCowork 的完整 agent 交互实现，总结可借鉴和不可直接照搬的部分。
* 形成一份清晰的阶段性建议，包含推荐优先级、风险点、验收方式和后续实现边界。
* 用户明确希望最终方案“做好、做完整”，轻量 warmup 只能作为完整 warmup/snapshot fast path 架构下的第一步，不能做成一次性补丁。
* 所有方案说明必须用中文解释项目专有名词，不能只堆英文术语。

## Acceptance Criteria

* [ ] 明确判断 audit 文档整体方向是否正确。
* [ ] 指出 audit 文档中需要修正、补充或谨慎处理的地方。
* [ ] 给出 OpenCowork 可学习的交互设计清单和关键文件线索。
* [ ] 给出 Xnova 后续实现的推荐落地顺序。
* [ ] 给出完整 warmup/snapshot fast path 的最终架构边界，并说明分阶段如何不阻断最终形态。
* [ ] 关键术语配中文解释，保证非直接看代码的人也能理解。

## Definition of Done

* 当前阶段完成只读代码/文档审查。
* 子代理调研结果已整合到最终判断。
* 若进入实现阶段，再补充对应测试、类型检查、lint 或构建验证。

## Out of Scope

* 本阶段不修改生产代码。
* 本阶段不调用真实 LLM 做 warmup 测试。
* 本阶段不重构 runtime/provider/core 的事件协议。

## Technical Notes

* Audit 文档：`docs/audits/studio-first-response-warmup-and-tool-visibility-audit.md`
* Xnova 关注模块：`apps/studio`、`packages/runtime`、`packages/core`、`packages/providers`、`packages/persistence`
* 参考项目：`D:\visual_ProgrammingSoftware\毕设and简历Projects\OpenCowork-main`
