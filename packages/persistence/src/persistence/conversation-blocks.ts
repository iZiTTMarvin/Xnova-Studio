export const SESSION_CONVERSATION_SCHEMA_VERSION = 2

export type SessionConversationBlock =
  | {
      id: string
      type: 'text'
      content: string
    }
  | {
      id: string
      type: 'thinking'
      content: string
    }
  | {
      id: string
      type: 'tool'
      toolCallId: string
      toolName: string
      args: Record<string, unknown>
      status: 'running' | 'done' | 'error'
      durationMs?: number
      success?: boolean
      resultSummary?: string
      resultFull?: string
      agentId?: string
    }
  | {
      id: string
      type: 'status'
      content: string
    }
  | {
      id: string
      type: 'system'
      content: string
      level: 'info' | 'warning' | 'error'
    }

export interface SessionConversationMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  blocks: SessionConversationBlock[]
  model?: string
  provider?: string
  usage?: {
    inputTokens: number
    outputTokens: number
    cacheReadTokens: number
    cacheWriteTokens: number
  }
  stopReason?: string
  llmCallCount?: number
  toolCallCount?: number
}

export function getMessagePlainText(
  message: Pick<SessionConversationMessage, 'blocks'>,
): string {
  return message.blocks
    .filter(
      (block): block is Extract<SessionConversationBlock, { type: 'text' }> =>
        block.type === 'text',
    )
    .map((block) => block.content)
    .join('')
    .trim()
}

export function createTextBlock(
  id: string,
  content: string,
): SessionConversationBlock {
  return {
    id,
    type: 'text',
    content,
  }
}
