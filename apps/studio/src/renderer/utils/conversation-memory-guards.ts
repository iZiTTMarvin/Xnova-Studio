import type {
  StudioActiveSessionDetail,
  StudioConversationBlock,
  StudioConversationMessage,
  StudioShellSnapshot,
} from '../../shared/studio-bridge-contract'

export const MAX_TIMELINE_PERSISTED_MESSAGES = 240
export const TIMELINE_LOAD_MORE_PAGE_SIZE = 80
export const MAX_LIVE_CONVERSATION_BLOCKS = 200
export const MAX_TOOL_RESULT_SUMMARY_CHARS = 2_000
export const MAX_TOOL_RESULT_FULL_CHARS = 8_000
export const LIVE_WINDOW_TRUNCATED_BLOCK_ID = 'live-window-truncated'
export const LIVE_WINDOW_TRUNCATED_LABEL = '更早的实时输出已折叠，以保持时间线流畅。'

const TRUNCATED_SUFFIX = '\n... [已截断]'

export function truncateConversationText(value: string, limit: number): string {
  if (value.length <= limit) {
    return value
  }
  return value.slice(0, limit) + TRUNCATED_SUFFIX
}

function sanitizeToolBlock(
  block: Extract<StudioConversationBlock, { type: 'tool' }>,
): StudioConversationBlock {
  const nextResultSummary =
    typeof block.resultSummary === 'string'
      ? truncateConversationText(block.resultSummary, MAX_TOOL_RESULT_SUMMARY_CHARS)
      : block.resultSummary
  const nextResultFull =
    typeof block.resultFull === 'string'
      ? truncateConversationText(block.resultFull, MAX_TOOL_RESULT_FULL_CHARS)
      : block.resultFull

  if (
    nextResultSummary === block.resultSummary &&
    nextResultFull === block.resultFull
  ) {
    return block
  }

  return {
    ...block,
    ...(nextResultSummary === undefined ? {} : { resultSummary: nextResultSummary }),
    ...(nextResultFull === undefined ? {} : { resultFull: nextResultFull }),
  }
}

export function sanitizeConversationBlock(
  block: StudioConversationBlock,
): StudioConversationBlock {
  if (block.type !== 'tool') {
    return block
  }
  return sanitizeToolBlock(block)
}

export function sanitizeConversationBlocks(
  blocks: StudioConversationBlock[],
): StudioConversationBlock[] {
  let nextBlocks: StudioConversationBlock[] | null = null

  for (let index = 0; index < blocks.length; index += 1) {
    const currentBlock = blocks[index]
    if (!currentBlock) {
      continue
    }
    const sanitizedBlock = sanitizeConversationBlock(currentBlock)
    if (sanitizedBlock === currentBlock) {
      continue
    }
    if (nextBlocks === null) {
      nextBlocks = [...blocks]
    }
    nextBlocks[index] = sanitizedBlock
  }

  return nextBlocks ?? blocks
}

export function clampLiveConversationBlocks(
  blocks: StudioConversationBlock[],
): StudioConversationBlock[] {
  const sanitizedBlocks = sanitizeConversationBlocks(blocks)
  if (sanitizedBlocks.length <= MAX_LIVE_CONVERSATION_BLOCKS) {
    return sanitizedBlocks
  }
  const visibleTail = sanitizedBlocks.slice(-(MAX_LIVE_CONVERSATION_BLOCKS - 1))
  if (
    visibleTail[0]?.type === 'status' &&
    visibleTail[0].id === LIVE_WINDOW_TRUNCATED_BLOCK_ID
  ) {
    return visibleTail
  }
  return [
    {
      id: LIVE_WINDOW_TRUNCATED_BLOCK_ID,
      type: 'status',
      content: LIVE_WINDOW_TRUNCATED_LABEL,
    },
    ...visibleTail,
  ]
}

export function sanitizeConversationMessage(
  message: StudioConversationMessage,
): StudioConversationMessage {
  const sanitizedBlocks = sanitizeConversationBlocks(message.blocks)
  if (sanitizedBlocks === message.blocks) {
    return message
  }

  return {
    ...message,
    blocks: sanitizedBlocks,
  }
}

function sanitizeActiveSession(
  session: StudioActiveSessionDetail,
): StudioActiveSessionDetail {
  let nextMessages: StudioConversationMessage[] | null = null

  for (let index = 0; index < session.messages.length; index += 1) {
    const currentMessage = session.messages[index]
    if (!currentMessage) {
      continue
    }
    const sanitizedMessage = sanitizeConversationMessage(currentMessage)
    if (sanitizedMessage === currentMessage) {
      continue
    }
    if (nextMessages === null) {
      nextMessages = [...session.messages]
    }
    nextMessages[index] = sanitizedMessage
  }

  if (nextMessages === null) {
    return session
  }

  return {
    ...session,
    messages: nextMessages,
  }
}

/**
 * 进入 renderer 的 shell snapshot 会被统一做一次工具输出裁剪，
 * 避免历史会话里的超长 `resultFull` 在 Studio 重启恢复后再次撑大内存。
 */
export function sanitizeShellSnapshot(
  snapshot: StudioShellSnapshot,
): StudioShellSnapshot {
  const activeSession =
    snapshot.activeSession != null
      ? sanitizeActiveSession(snapshot.activeSession)
      : snapshot.activeSession

  if (activeSession === snapshot.activeSession) {
    return snapshot
  }

  return {
    ...snapshot,
    ...(activeSession === undefined ? {} : { activeSession }),
  }
}
