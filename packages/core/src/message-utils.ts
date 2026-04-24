// src/core/message-utils.ts

import type {
  Message,
  MessageContent,
  TextContent,
  ToolCallContent,
  ToolResultContent,
} from './types.js'

export function normalizeContent(content: Message['content']): MessageContent[] {
  if (typeof content === 'string') {
    return [{ type: 'text', text: content }]
  }
  if (Array.isArray(content)) {
    return content
  }
  return [content as MessageContent]
}

export function extractText(blocks: MessageContent[]): string {
  return blocks
    .filter((content): content is TextContent => content.type === 'text')
    .map((content) => content.text)
    .join('')
}

export function findToolCalls(blocks: MessageContent[]): ToolCallContent[] {
  return blocks.filter((block): block is ToolCallContent => block.type === 'tool_call')
}

export function findToolResults(blocks: MessageContent[]): ToolResultContent[] {
  return blocks.filter((block): block is ToolResultContent => block.type === 'tool_result')
}

export function findOrphanToolCalls(
  messages: ReadonlyArray<Message>,
): Array<{ toolCallId: string; toolName: string }> {
  const pending = new Map<string, string>()
  for (const message of messages) {
    for (const block of normalizeContent(message.content)) {
      if (block.type === 'tool_call') {
        pending.set((block as ToolCallContent).toolCallId, (block as ToolCallContent).toolName)
      }
      if (block.type === 'tool_result') {
        pending.delete((block as ToolResultContent).toolCallId)
      }
    }
  }
  return [...pending.entries()].map(([toolCallId, toolName]) => ({ toolCallId, toolName }))
}
