// src/core/types.ts

export type Role = 'user' | 'assistant' | 'system' | 'tool'

export interface TextContent {
  type: 'text'
  text: string
}

export interface ToolCallContent {
  type: 'tool_call'
  toolCallId: string
  toolName: string
  args: Record<string, unknown>
}

export interface ToolResultContent {
  type: 'tool_result'
  toolCallId: string
  result: unknown
  isError?: boolean
}

/** 图片内容块（多模态消息，Provider 层读取 base64 时使用 imageId 查找文件） */
export interface ImageContent {
  type: 'image'
  imageId: string     // 图片文件 UUID 引用
  mediaType: string   // image/jpeg | image/png | image/webp
}

export type MessageContent = TextContent | ToolCallContent | ToolResultContent | ImageContent

export interface Message {
  role: Role
  content: MessageContent | MessageContent[] | string
  id?: string
  createdAt?: Date
}

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

export interface StreamChunk {
  type: 'text' | 'tool_call' | 'tool_call_delta' | 'usage' | 'done' | 'error' | 'thinking' | 'timing'
  text?: string
  /** 思考过程内容（thinking 类型时有值） */
  thinking?: string
  toolCall?: ToolCallContent
  /**
   * 工具调用增量（tool_call_delta 类型时有值）。
   * Provider 流式输出工具名或参数片段时使用。
   * - 首个 delta 必须包含 toolCallId 和 toolName。
   * - 后续 delta 只需 toolCallId 和 argumentsDelta。
   */
  toolCallDelta?: {
    toolCallId: string
    /** 首个 delta 携带工具名，后续可省略 */
    toolName?: string
    /** JSON 参数增量片段（原始字符串，由 AgentLoop 聚合后解析） */
    argumentsDelta?: string
  }
  usage?: TokenUsage
  error?: string
  /** LLM 调用结束原因（done 类型时有值） */
  stopReason?: string
  /** 非敏感性能阶段名（timing 类型时有值） */
  stage?: string
  /** 当前阶段相对耗时（毫秒），不包含 prompt / key / content */
  elapsedMs?: number
}
