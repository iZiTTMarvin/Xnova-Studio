# Codex App 首页与会话布局参考

## 参考来源

- 用户提供的 `ui模板.html`
- 用户提供的 Codex App 截图 1-4
- 当前 `apps/studio/src/renderer/**` 主壳实现

## 关键设计判断

1. **侧边栏必须固定。**
   左侧栏是项目和会话导航，不应跟随主会话滚动。项目区右侧只保留“折叠”和“添加新项目”两类真实动作，筛选/排序暂不进入本轮范围。

2. **首页不是 dashboard。**
   首屏核心应是“要在当前项目中构建什么？”与中央 composer，而不是 overview、统计卡片或状态墙。

3. **会话页 composer 固定悬浮。**
   用户首次提交后，聊天时间线变成唯一滚动区；composer 固定在底部，宽度和高度稳定，不因为消息变多而跟着移动或变形。

4. **上下文条靠近输入框。**
   项目、分支、Agent、模型、Context、SubAgent 是发送行为的上下文，应放在 composer 附近，而不是远离输入区的 dashboard 卡片。

5. **消息正文优先。**
   assistant 回复应接近文档正文排版：小标签 + 正文列。user 消息可使用轻量气泡区分，但不能把所有消息都包成厚重卡片。

6. **工具和 thinking 保持结构化但低装饰。**
   Phase 4 的 tool/reasoning/markdown 展示继续保留可展开、可诊断能力，但视觉从“卡片墙”降级为紧凑过程行。

7. **自动滚动需要尊重用户。**
   Phase 5 的策略是默认跟随流式输出；用户主动上滚后暂停，并提供“回到底部”入口。

## 本轮落地文件

- `apps/studio/src/renderer/pages/StudioHomePage.tsx`
- `apps/studio/src/renderer/pages/StudioHomePage.css`
- `apps/studio/src/renderer/components/ProjectShellSidebar.tsx`
- `apps/studio/src/renderer/components/ConversationTimeline.tsx`
- `apps/studio/src/renderer/components/Icons.tsx`
- `apps/studio/tests/conversation-timeline-tool-summary.test.tsx`
