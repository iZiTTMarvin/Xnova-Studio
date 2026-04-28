# OpenCowork 参考索引

## 参考项目

- 路径：`D:\visual_ProgrammingSoftware\毕设and简历Projects\OpenCowork-main`

## 本次改造重点对照

### 流式缓冲与事件批量

- `src/main/ipc/adaptive-event-batcher.ts`

### 状态管理

- `src/renderer/src/stores/chat-store.ts`
- `src/renderer/src/stores/agent-store.ts`
- `src/renderer/src/stores/ui-store.ts`

### 消息与时间线渲染

- `src/renderer/src/components/chat/MessageList.tsx`
- `src/renderer/src/components/chat/MessageItem.tsx`
- `src/renderer/src/components/chat/AssistantMessage.tsx`

### thinking / 工具 / subagent 展示

- `src/renderer/src/components/chat/ThinkingBlock.tsx`
- `src/renderer/src/components/chat/ToolCallCard.tsx`
- `src/renderer/src/components/chat/ToolCallGroup.tsx`
- `src/renderer/src/components/chat/SubAgentCard.tsx`

## 使用原则

- 先抽取“机制”，再落到 Xnova 的契约与目录边界。
- 优先迁移批量、隔离、虚拟化、输出截断等性能机制。
- UI 细节只在不破坏 Xnova 主链路语义的前提下对齐。
