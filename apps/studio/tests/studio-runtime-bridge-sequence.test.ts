import { describe, expect, it, vi } from 'vitest'
import { createStudioRuntimeService } from '../src/main/studio-runtime-service'
import type {
  RuntimeHostBridge,
  RuntimeInstance,
  RuntimeTurnResult,
} from '@xnova/runtime'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

describe('studio runtime bridge sequence', () => {
  it('main 会同步转发 tool_start / tool_end，不存在额外缓冲队列', async () => {
    const startedAt = Date.now()
    const timeline: Array<{ label: string; at: number }> = []
    const mark = (label: string) => {
      timeline.push({
        label,
        at: Date.now() - startedAt,
      })
    }

    let runtimeBridge: RuntimeHostBridge | null = null

    const runtimeInstance: RuntimeInstance = {
      submit: vi.fn(async (): Promise<RuntimeTurnResult> => {
        mark('runtime_emit tool_start')
        runtimeBridge?.emit({
          type: 'tool_start',
          timestamp: '2026-04-26T00:00:01.000Z',
          sessionId: 'session-bridge',
          payload: {
            toolCallId: 'tool-bridge',
            toolName: 'write_file',
            args: {
              path: 'D:/workspace/demo/SPEC.md',
              content: '# spec\\n...',
            },
          },
        })

        await sleep(15)

        mark('runtime_emit tool_end')
        runtimeBridge?.emit({
          type: 'tool_end',
          timestamp: '2026-04-26T00:00:02.000Z',
          sessionId: 'session-bridge',
          payload: {
            toolCallId: 'tool-bridge',
            toolName: 'write_file',
            success: true,
            durationMs: 15,
          },
        })

        return {
          text: '',
          thinking: '',
          stopReason: 'end_turn',
          llmCallCount: 1,
          toolCallCount: 1,
          usage: {
            inputTokens: 10,
            outputTokens: 2,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
          },
          aborted: false,
          historyCompacted: false,
          sessionId: 'session-bridge',
        }
      }),
      abort: vi.fn(),
      dispose: vi.fn(async () => undefined),
      getSnapshot: vi.fn(() => ({
        sessionId: 'session-bridge',
        isRunning: false,
        provider: 'openai',
        model: 'gpt-4.1-mini',
        warnings: [],
      })),
    }

    const service = createStudioRuntimeService({
      createRuntimeFn: vi.fn(async (_input, bridge) => {
        runtimeBridge = bridge
        return runtimeInstance
      }),
      loadResolvedConfigFn: vi.fn(() => ({
        effective: {
          defaultProvider: 'openai',
          defaultModel: 'gpt-4.1-mini',
          providers: {},
        },
        source: {},
        warnings: [],
      })),
    })

    await expect(
      service.submit(
        {
          text: '继续',
          projectPath: 'D:/workspace/demo',
        },
        {
          workspacePath: 'D:/workspace/demo',
          lastSelection: null,
        },
        (event) => {
          if (event.type === 'tool_start') {
            mark('main_forward tool_start')
          }
          if (event.type === 'tool_end') {
            mark('main_forward tool_end')
          }
        },
      ),
    ).resolves.toEqual({
      ok: true,
      sessionId: 'session-bridge',
    })

    const labels = timeline.map((item) => item.label)
    expect(labels).toEqual([
      'runtime_emit tool_start',
      'main_forward tool_start',
      'runtime_emit tool_end',
      'main_forward tool_end',
    ])

    console.log(
      timeline
        .map((item) => `T+${item.at}ms ${item.label}`)
        .join('\n'),
    )
  })
})
