import { describe, expect, it, vi } from 'vitest'
import { AdaptiveEventBatcher } from '../src/main/adaptive-event-batcher'
import type { StudioRuntimeEvent } from '../src/shared/studio-bridge-contract'

function createEvent(
  input: Partial<StudioRuntimeEvent> & Pick<StudioRuntimeEvent, 'type'>,
): StudioRuntimeEvent {
  return {
    timestamp: '2026-04-27T00:00:00.000Z',
    runId: 'run-1',
    sessionId: 'session-1',
    ...input,
  }
}

describe('AdaptiveEventBatcher', () => {
  it('前台窗口内连续 text_delta 会合并后再发送', async () => {
    vi.useFakeTimers()
    try {
      const emitted: StudioRuntimeEvent[] = []
      const batcher = new AdaptiveEventBatcher({
        foregroundFlushMs: 33,
      })
      batcher.setHandler((event) => emitted.push(event))

      batcher.push(
        createEvent({
          type: 'text_delta',
          payload: { text: '第一段' },
        }),
      )
      batcher.push(
        createEvent({
          type: 'text_delta',
          timestamp: '2026-04-27T00:00:00.100Z',
          payload: { text: '第二段' },
        }),
      )

      expect(emitted).toEqual([])

      await vi.advanceTimersByTimeAsync(33)

      expect(emitted).toEqual([
        expect.objectContaining({
          type: 'text_delta',
          payload: {
            text: '第一段第二段',
          },
        }),
      ])
    } finally {
      vi.useRealTimers()
    }
  })

  it('text_delta 与 thinking 会保留顺序，只合并相邻同类片段', async () => {
    vi.useFakeTimers()
    try {
      const emitted: StudioRuntimeEvent[] = []
      const batcher = new AdaptiveEventBatcher({
        foregroundFlushMs: 33,
      })
      batcher.setHandler((event) => emitted.push(event))

      batcher.push(
        createEvent({
          type: 'text_delta',
          payload: { text: 'A' },
        }),
      )
      batcher.push(
        createEvent({
          type: 'thinking',
          payload: { text: 'B' },
        }),
      )
      batcher.push(
        createEvent({
          type: 'thinking',
          payload: { text: 'C' },
        }),
      )
      batcher.push(
        createEvent({
          type: 'text_delta',
          payload: { text: 'D' },
        }),
      )

      await vi.advanceTimersByTimeAsync(33)

      expect(emitted.map((event) => [event.type, event.payload?.text])).toEqual([
        ['text_delta', 'A'],
        ['thinking', 'BC'],
        ['text_delta', 'D'],
      ])
    } finally {
      vi.useRealTimers()
    }
  })

  it('收到控制事件时会先 flush 文本，再立即发送控制事件', () => {
    const emitted: StudioRuntimeEvent[] = []
    const batcher = new AdaptiveEventBatcher({
      foregroundFlushMs: 33,
    })
    batcher.setHandler((event) => emitted.push(event))

    batcher.push(
      createEvent({
        type: 'text_delta',
        payload: { text: '缓冲文本' },
      }),
    )
    batcher.push(
      createEvent({
        type: 'tool_start',
        payload: {
          toolCallId: 'tool-1',
          toolName: 'read_file',
        },
      }),
    )

    expect(emitted.map((event) => event.type)).toEqual([
      'text_delta',
      'tool_start',
    ])
    expect(emitted[0]?.payload?.text).toBe('缓冲文本')
  })

  it('后台窗口使用更慢的 flush 周期', async () => {
    vi.useFakeTimers()
    try {
      const emitted: StudioRuntimeEvent[] = []
      const batcher = new AdaptiveEventBatcher({
        foregroundFlushMs: 33,
        backgroundFlushMs: 150,
      })
      batcher.setHandler((event) => emitted.push(event))
      batcher.setForeground(false)

      batcher.push(
        createEvent({
          type: 'text_delta',
          payload: { text: '后台文本' },
        }),
      )

      await vi.advanceTimersByTimeAsync(149)
      expect(emitted).toEqual([])

      await vi.advanceTimersByTimeAsync(1)
      expect(emitted).toEqual([
        expect.objectContaining({
          type: 'text_delta',
          payload: { text: '后台文本' },
        }),
      ])
    } finally {
      vi.useRealTimers()
    }
  })
})
