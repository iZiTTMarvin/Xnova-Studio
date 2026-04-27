# AI 子任务通用模板

## 使用原则

- 一次只给 AI 一个阶段或一个明确子任务，不要把 5 个阶段一起塞进去。
- 每个任务都要写清楚：
  - 目标
  - 范围
  - 禁止改动的部分
  - 参考实现
  - 验证方式
- 如果任务偏 UI，就交给擅长交互和视觉的 AI。
- 如果任务偏状态管理、IPC、runtime、重构，就交给偏工程实现的 AI。

---

## 模板 1：通用工程任务模板

```md
你现在负责 Xnova Studio 交互现代化改造中的一个子任务。

## 任务标题
<填写任务名>

## 任务目标
<一句话说清楚这次只要做什么>

## 任务类型
<前端 / UI / 全栈 / 后端 / 状态管理 / 性能优化>

## 必读文档
- `implementation_plan.md`
- `项目交互改造计划.md`
- `<对应 task 的 prd.md>`
- `<需要的 spec 文件>`

## 参考实现
- OpenCowork 路径：`D:\visual_ProgrammingSoftware\毕设and简历Projects\OpenCowork-main`
- 重点参考文件：
  - `<文件 1>`
  - `<文件 2>`

## 本次允许修改的文件
- `<文件路径 1>`
- `<文件路径 2>`

## 本次不要改的内容
- 不要顺手做下一个 Phase 的事情
- 不要扩大到无关模块
- 不要重写已有 contract，除非本任务明确要求

## 具体要求
1. `<要求 1>`
2. `<要求 2>`
3. `<要求 3>`

## 实现约束
- 保持现有 shared contract 兼容
- 优先复用已有工具函数和组件
- 不要复制 OpenCowork 代码后再慢慢改，先抽机制再适配
- 注释只写必要的 why

## 验收标准
- [ ] `<可验证标准 1>`
- [ ] `<可验证标准 2>`
- [ ] `<可验证标准 3>`

## 必跑验证
- `pnpm --filter xnova-studio typecheck`
- `pnpm --filter xnova-studio test -- <相关测试>`
- `<如需要再加 build>`

## 输出要求
请最终返回：
1. 改了什么
2. 为什么这么改
3. 跑了哪些验证
4. 还有什么风险或后续建议
```

---

## 模板 2：给 UI / 交互型 AI 的模板

```md
你负责的是 Xnova Studio 的 UI / 交互层改造任务。

## 任务目标
这次只优化以下内容：
<thinking / tool card / markdown / subagent / 自动滚动 / 时间线交互>

## 设计要求
- 保持现有 Studio 主壳结构，不改信息架构
- 不要做“另一套产品风格”，要在现有风格上升级质感
- 优先提升：
  - 信息层次
  - 可读性
  - 展开/折叠体验
  - 流式状态反馈
  - 长内容可浏览性
- 不要为了炫技引入大量复杂动画

## 技术要求
- 只在本任务指定文件内修改
- 保持 `Project Shell v1` 语义不变
- 不破坏已有 submit / session / workspace / runtime 状态流

## 参考实现
- `OpenCowork-main/src/renderer/src/components/chat/ThinkingBlock.tsx`
- `OpenCowork-main/src/renderer/src/components/chat/ToolCallCard.tsx`
- `OpenCowork-main/src/renderer/src/components/chat/ToolCallGroup.tsx`
- `OpenCowork-main/src/renderer/src/components/chat/SubAgentCard.tsx`
- `OpenCowork-main/src/renderer/src/components/chat/MessageList.tsx`

## 验收标准
- 交互更清晰，但不引入性能倒退
- 流式过程有明确反馈
- 展开/折叠状态合理
- 长内容默认收敛，细节可展开

## 必跑验证
- `pnpm --filter xnova-studio typecheck`
- `pnpm --filter xnova-studio test -- <相关 UI 测试>`
- `pnpm --filter xnova-studio build`
```

---

## 模板 3：给后端 / 架构型 AI 的模板

```md
你负责的是 Xnova Studio 的 runtime / main / shared contract / 状态架构类任务。

## 任务目标
<例如：引入 main 侧事件缓冲层 / 拆分状态 store / 收敛 shared contract>

## 重点约束
- 严格遵守 `renderer -> preload -> main -> runtime` 边界
- renderer 不能直连宿主能力
- main 不能重新实现 runtime 业务逻辑
- shared contract 改动必须最小且可验证

## 重点文件
- `<main 文件>`
- `<shared contract 文件>`
- `<hook/store 文件>`

## 参考实现
- `<OpenCowork 对应 batcher/store 文件>`

## 验收标准
- 数据流清晰
- 事件顺序正确
- 不引入状态串线
- 测试可证明行为成立

## 必跑验证
- `pnpm --filter xnova-studio typecheck`
- `pnpm --filter xnova-studio test -- <相关测试>`
- 必要时 `pnpm --filter xnova-studio build`
```

---

## 当前改造任务分发建议

### 适合交给“会做 UI、会做交互质感”的 AI

- `04-27-studio-interaction-phase4-ux-upgrade`
  - 重点：Thinking、Tool Card、Markdown、SubAgent Card
  - 类型：前端 UI / 交互体验
- `04-27-studio-interaction-phase5-scroll-polish`
  - 重点：自动滚动、回到底部、历史加载、时间线细节打磨
  - 类型：前端 UI / 交互体验

### 有一部分用户可见，但本质更偏前端工程，不建议交给纯视觉型 AI

- `04-27-studio-interaction-phase0-stopgap`
  - 重点：RAF 批量缓冲、memo、历史消息隔离
  - 类型：前端性能 / 渲染优化
- `04-27-studio-interaction-phase3-virtualization`
  - 重点：虚拟化、内存窗口、输出截断
  - 类型：前端基础设施 / 性能

### 明显偏工程实现 / 架构 / 状态管理，不建议交给只擅长 UI 的 AI

- `04-27-studio-interaction-phase1-batcher`
  - 重点：main 侧 `AdaptiveEventBatcher`、IPC 事件合并
  - 类型：全栈偏后端 / 宿主层
- `04-27-studio-interaction-phase2-state-store`
  - 重点：`useStudioBridge` 拆 store、zustand/immer、selector 订阅
  - 类型：前端架构 / 状态管理 / 全栈协同

---

## 最推荐的实际分发方式

- 第一批：
  - 工程 AI：Phase 1
  - 工程 AI：Phase 2
- 第二批：
  - 前端工程 AI：Phase 3
  - UI AI：先预研 Phase 4
- 第三批：
  - UI AI：Phase 4
  - UI AI：Phase 5

原因：
- Phase 1 / 2 决定底层架构，必须先稳定。
- Phase 3 依赖 Phase 2 的状态结构。
- Phase 4 / 5 最适合在底层稳定后交给擅长体验的 AI 发挥。

---

## 当前任务名速查

- 父任务：`04-27-studio-interaction-modernization`
- Phase 0：`04-27-studio-interaction-phase0-stopgap`
- Phase 1：`04-27-studio-interaction-phase1-batcher`
- Phase 2：`04-27-studio-interaction-phase2-state-store`
- Phase 3：`04-27-studio-interaction-phase3-virtualization`
- Phase 4：`04-27-studio-interaction-phase4-ux-upgrade`
- Phase 5：`04-27-studio-interaction-phase5-scroll-polish`
