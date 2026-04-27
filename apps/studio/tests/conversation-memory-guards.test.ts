import { describe, expect, it } from 'vitest'
import {
  clampLiveConversationBlocks,
  LIVE_WINDOW_TRUNCATED_BLOCK_ID,
  LIVE_WINDOW_TRUNCATED_LABEL,
  MAX_LIVE_CONVERSATION_BLOCKS,
  MAX_TOOL_RESULT_FULL_CHARS,
  sanitizeShellSnapshot,
  truncateConversationText,
} from '../src/renderer/utils/conversation-memory-guards'

describe('conversation-memory-guards', () => {
  it('liveConversation.blocks 超过上限时只保留最新窗口', () => {
    const blocks = Array.from({ length: MAX_LIVE_CONVERSATION_BLOCKS + 12 }, (_, index) => ({
      id: `text-${index}`,
      type: 'text' as const,
      content: `chunk-${index}`,
    }))

    const nextBlocks = clampLiveConversationBlocks(blocks)

    expect(nextBlocks).toHaveLength(MAX_LIVE_CONVERSATION_BLOCKS)
    expect(nextBlocks[0]?.id).toBe(LIVE_WINDOW_TRUNCATED_BLOCK_ID)
    expect(nextBlocks[0]?.type).toBe('status')
    if (nextBlocks[0]?.type !== 'status') {
      throw new Error('expected status block')
    }
    expect(nextBlocks[0].content).toBe(LIVE_WINDOW_TRUNCATED_LABEL)
    expect(nextBlocks[1]?.id).toBe('text-13')
    expect(nextBlocks.at(-1)?.id).toBe(
      `text-${MAX_LIVE_CONVERSATION_BLOCKS + 11}`,
    )
  })

  it('工具完整输出进入 renderer 前会被统一截断', () => {
    const largeOutput = 'TOOL_OUTPUT_'.repeat(900)
    const snapshot = sanitizeShellSnapshot({
      startup: {
        recentProject: null,
        recentSession: null,
      },
      recentProjects: [],
      projectSessions: [],
      activeSession: {
        sessionId: 'session-1',
        projectPath: 'D:/workspace/demo',
        title: 'demo',
        updatedAt: '2026-04-26T00:00:00.000Z',
        gitBranch: 'main',
        messageCount: 1,
        subagents: [],
        leafEventUuid: 'assistant-1',
        messages: [
          {
            id: 'assistant-1',
            role: 'assistant',
            blocks: [
              {
                id: 'tool-1',
                type: 'tool',
                toolCallId: 'tool-1',
                toolName: 'read_file',
                args: {
                  path: 'D:/workspace/demo/index.ts',
                },
                status: 'done',
                success: true,
                resultFull: largeOutput,
              },
            ],
          },
        ],
      },
      scratchpadEntries: [],
      defaults: {
        projectPath: 'D:/workspace/demo',
        branch: 'main',
        agentId: 'general',
        modelId: 'gpt-4.1-mini',
        providerId: 'openai',
        recommendedMode: null,
        allowedModes: ['standard', 'xforge'],
      },
      issues: [],
      warnings: [],
    })

    const resultFull = snapshot.activeSession?.messages[0]?.blocks[0]
    expect(resultFull?.type).toBe('tool')
    if (resultFull?.type !== 'tool') {
      throw new Error('expected tool block')
    }
    expect(resultFull.resultFull?.length).toBeGreaterThan(MAX_TOOL_RESULT_FULL_CHARS)
    expect(resultFull.resultFull).toContain('[已截断]')
  })

  it('截断后的尾缀固定且可诊断', () => {
    const truncated = truncateConversationText('a'.repeat(20), 8)

    expect(truncated.startsWith('aaaaaaaa')).toBe(true)
    expect(truncated.endsWith('[已截断]')).toBe(true)
  })
})
