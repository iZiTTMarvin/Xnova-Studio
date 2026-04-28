# OpenCowork agent 交互调研

## 结论

OpenCowork 的交互优势来自完整事件管道，而不是单个 UI 组件。它把模型输出、思考过程、工具参数流、工具执行、请求调试、回放分析都统一成事件，再由 renderer 侧状态机落到 UI。Xnova 当前方向与它一致，但事件粒度更粗，所以应学习事件协议和生命周期拆分，不应直接搬 OpenCowork 的大组件和 provider 专属字段。

## 关键文件

* `D:\visual_ProgrammingSoftware\毕设and简历Projects\OpenCowork-main\src\shared\agent-stream-protocol.ts`：定义 agent 流式事件协议。
* `D:\visual_ProgrammingSoftware\毕设and简历Projects\OpenCowork-main\src\main\ipc\js-agent-runtime.ts`：主进程运行时把内部事件包装后发给前端。
* `D:\visual_ProgrammingSoftware\毕设and简历Projects\OpenCowork-main\src\main\ipc\adaptive-event-batcher.ts`：事件批处理，减少高频流式事件造成的 IPC 压力。
* `D:\visual_ProgrammingSoftware\毕设and简历Projects\OpenCowork-main\src\main\lib\responses-websocket-session-manager.ts`：Responses websocket session、warmup、reuse、fallback 管理。
* `D:\visual_ProgrammingSoftware\毕设and简历Projects\OpenCowork-main\src\renderer\src\lib\api\openai-responses.ts`：OpenAI Responses provider 事件生成与 TTFT/cache/debug 指标。
* `D:\visual_ProgrammingSoftware\毕设and简历Projects\OpenCowork-main\src\renderer\src\hooks\use-chat-actions.ts`：renderer 侧事件状态机。
* `D:\visual_ProgrammingSoftware\毕设and简历Projects\OpenCowork-main\src\renderer\src\components\chat\ThinkingBlock.tsx`：思考过程展示。
* `D:\visual_ProgrammingSoftware\毕设and简历Projects\OpenCowork-main\src\renderer\src\components\chat\ToolCallCard.tsx`：单工具卡片。
* `D:\visual_ProgrammingSoftware\毕设and简历Projects\OpenCowork-main\src\renderer\src\components\chat\ToolCallGroup.tsx`：工具分组。
* `D:\visual_ProgrammingSoftware\毕设and简历Projects\OpenCowork-main\src\renderer\src\components\chat\TranscriptMessageList.tsx`：历史会话回放列表。
* `D:\visual_ProgrammingSoftware\毕设and简历Projects\OpenCowork-main\src\renderer\src\components\chat\transcript-utils.ts`：历史回放静态分析与缓存。

## 事件流

```text
provider / model stream
  -> openai-responses.ts
  -> AgentStreamEvent
  -> main IPC batcher
  -> agent-stream-receiver.ts
  -> stream-event-adapter.ts
  -> use-chat-actions.ts
  -> chat store
  -> ThinkingBlock / ToolCallCard / ToolCallGroup / TranscriptMessageList
```

工具生命周期可概括为：

```text
tool_use_streaming_start
  -> UI 先创建工具壳
tool_use_args_delta
  -> 参数持续补齐
tool_use_generated
  -> 无 streaming_start 时补壳
tool_call_start
  -> 工具真正开始执行
tool_call_result
  -> 写入 output / error / completedAt
iteration_end
  -> tool_result 回灌到对话
```

## 适合 Xnova 学习的点

* 事件协议统一：先把 provider 原始流转为稳定事件，再让 UI 处理稳定结构。
* 工具生命周期拆细：模型刚决定调用工具时先显示工具壳，参数边生成边显示，真正执行时再切 running。
* thinking 独立组件：实时思考时展开，完成后可折叠，避免和正文混在一起。
* 工具分组与摘要：大量探索类工具可以合并展示，动作类工具保留更完整详情。
* 历史回放与实时渲染分层：实时状态机和历史 transcript 分析不互相污染。
* request_debug 思路：把 TTFT、cache 命中、连接复用、fallback 等指标做成可解释事件。

## 不适合直接照搬的点

* 不直接搬 `AssistantMessage.tsx` 这类大一统组件。它能力完整，但职责过重，和 Xnova 当前较干净的分层不匹配。
* 不直接搬 OpenAI Responses 专属字段，例如 `prompt_cache_key`、`previousResponseId`、`reusedConnection`、`websocketRequestKind`。Xnova provider 更杂，应先定义 provider 无关字段。
* 不直接搬重型 transcript 静态分析缓存，除非后续确认 Xnova 历史会话规模需要。
* 不为每种工具写大量专门 UI。Xnova 更适合“少量核心工具深度展示 + 其他工具通用摘要”。
* 不无条件暴露原始 thinking。需要保留产品与安全边界，区分用户可见 reasoning 与内部调试。

## 对 Xnova audit 方案的映射

* 审计文档里的 `tool_intent/tool_args_delta/tool_ready` 与 OpenCowork 的 `tool_use_streaming_start/tool_use_args_delta/tool_call_start/tool_call_result` 是同一个方向，建议按 Xnova 命名做 provider 无关事件。
* `ToolActionRow` 最小 running 可见时间是短期补丁，解决“已经有 tool_start 但用户看不到”的问题；OpenCowork 式工具参数流是中期协议升级。
* Xnova 已有 `ReasoningRow`、`ToolActionRow`、`ToolActivityGroupRow`，无需先重画 UI；关键是补足事件粒度和运行状态。
* warmup/cache 方面，OpenCowork 的 websocket warmup 与 Xnova 的本地 bootstrap warmup不是同一个问题。Xnova 应先预热本地 bootstrap，再考虑 provider 连接或 prompt/toolDefs snapshot。
