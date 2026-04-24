import { describe, expect, it, vi } from 'vitest'
import { SessionLogger } from '../session-logger.js'

function makeStore() {
  const events: unknown[] = []
  return {
    events,
    create: vi.fn(() => 'sid-1'),
    loadMessages: vi.fn(() => ({ leafEventUuid: 'start-uuid' })),
    append: vi.fn((_: string, event: unknown) => {
      events.push(event)
    }),
  }
}

describe('SessionLogger baseline', () => {
  it('应保留 user/assistant 日志写入语义', () => {
    const store = makeStore()
    const logger = new SessionLogger(store as never)

    const sessionId = logger.ensureSession('anthropic', 'claude-sonnet-4-6')
    expect(sessionId).toBe('sid-1')

    logger.logUserMessage('你好')
    logger.logAssistantMessage('收到', 'claude-sonnet-4-6', 'anthropic')

    expect(store.append).toHaveBeenCalledTimes(2)
    expect(store.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'user' }),
        expect.objectContaining({ type: 'assistant' }),
      ]),
    )
  })
})
