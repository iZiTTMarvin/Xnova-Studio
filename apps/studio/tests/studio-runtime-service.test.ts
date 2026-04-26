import { describe, expect, it, vi } from 'vitest'
import { createStudioRuntimeService } from '../src/main/studio-runtime-service'
import { STUDIO_BRIDGE_CHANNELS } from '../src/shared/studio-bridge-contract'
import type {
  RuntimeHostBridge,
  RuntimeInstance,
  RuntimeTurnResult,
} from '@xnova/runtime'

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}

describe('studio runtime service', () => {
  it('调用 shared runtime submit，并把 runtime 事件透传给 renderer', async () => {
    let runtimeBridge: RuntimeHostBridge | null = null

    const runtimeInstance: RuntimeInstance = {
      submit: vi.fn(async () => {
        runtimeBridge?.emit({
          type: 'text_delta',
          timestamp: '2026-04-23T00:00:00.000Z',
          sessionId: 'session-1',
          payload: {
            text: '正在分析项目结构...',
          },
        })

        return {
          text: '分析完成',
          thinking: '',
          stopReason: 'end_turn',
          llmCallCount: 1,
          toolCallCount: 0,
          usage: {
            inputTokens: 10,
            outputTokens: 20,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
          },
          aborted: false,
          historyCompacted: false,
          sessionId: 'session-1',
        }
      }),
      abort: vi.fn(),
      dispose: vi.fn(async () => undefined),
      getSnapshot: vi.fn(() => ({
        sessionId: 'session-1',
        isRunning: false,
        provider: 'openai',
        model: 'gpt-4o',
        warnings: [],
      })),
    }

    const createRuntimeFn = vi.fn(async (_input, bridge) => {
      runtimeBridge = bridge
      return runtimeInstance
    })
    const loadResolvedConfigFn = vi.fn(() => ({
      effective: {
        defaultProvider: 'openai',
        defaultModel: 'gpt-4o',
        providers: {},
      },
      source: {},
      warnings: [],
    }))

    const service = createStudioRuntimeService({
      createRuntimeFn,
      loadResolvedConfigFn,
      fallbackCwd: 'D:/workspace/fallback',
    })
    const emittedEvents: Array<{
      type: string
      timestamp: string
      payload?: Record<string, unknown>
      sessionId?: string
    }> = []

    await expect(
      service.submit(
        {
          text: '  分析当前项目结构  ',
          projectPath: 'D:/workspace/demo',
          agentId: 'planner',
          modelId: 'gpt-4o',
        },
        {
          workspacePath: null,
          lastSelection: null,
        },
        (event) => {
          emittedEvents.push(event)
        },
      ),
    ).resolves.toEqual({
      ok: true,
      sessionId: 'session-1',
    })

    expect(loadResolvedConfigFn).toHaveBeenCalledWith('D:/workspace/demo')
    expect(createRuntimeFn).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: 'D:/workspace/demo',
      }),
      expect.any(Object),
    )
    expect(runtimeInstance.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        text: '分析当前项目结构',
        history: [{ role: 'user', content: '分析当前项目结构' }],
        loggedUserContent: '分析当前项目结构',
        model: 'gpt-4o',
      }),
    )
    expect(emittedEvents).toEqual([
      expect.objectContaining({
        type: 'run_started',
      }),
      expect.objectContaining({
        type: 'text_delta',
        sessionId: 'session-1',
      }),
      expect.objectContaining({
        type: 'run_completed',
        sessionId: 'session-1',
      }),
    ])
  })

  it('submit 失败时发出 run_failed，而不是只依赖 runtime.error', async () => {
    const runtimeInstance: RuntimeInstance = {
      submit: vi.fn(async () => ({
        text: '',
        thinking: '',
        stopReason: 'error',
        llmCallCount: 1,
        toolCallCount: 0,
        usage: {
          inputTokens: 10,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
        aborted: false,
        historyCompacted: false,
        sessionId: 'session-1',
        error: 'provider failed',
      })),
      abort: vi.fn(),
      dispose: vi.fn(async () => undefined),
      getSnapshot: vi.fn(() => ({
        sessionId: 'session-1',
        isRunning: false,
        provider: 'openai',
        model: 'gpt-4o',
        warnings: [],
      })),
    }
    const service = createStudioRuntimeService({
      createRuntimeFn: vi.fn(async () => runtimeInstance),
      loadResolvedConfigFn: vi.fn(() => ({
        effective: {
          defaultProvider: 'openai',
          defaultModel: 'gpt-4o',
          providers: {},
        },
        source: {},
        warnings: [],
      })),
    })
    const emittedTypes: string[] = []

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
          emittedTypes.push(event.type)
        },
      ),
    ).resolves.toEqual({
      ok: false,
      error: 'provider failed',
    })

    expect(emittedTypes).toEqual(['run_started', 'run_failed'])
  })

  it('runtime 发出可见输出但 submit 不 resolve 时，用户 cancel 会 abort 并发 run_cancelled', async () => {
    let runtimeBridge: RuntimeHostBridge | null = null

    const runtimeInstance: RuntimeInstance = {
      submit: vi.fn((): Promise<RuntimeTurnResult> => {
        runtimeBridge?.emit({
          type: 'text_delta',
          timestamp: '2026-04-26T00:00:01.000Z',
          sessionId: 'session-1',
          payload: {
            text: '已经产生可见输出',
          },
        })
        return new Promise(() => undefined)
      }),
      abort: vi.fn(),
      dispose: vi.fn(async () => undefined),
      getSnapshot: vi.fn(() => ({
        sessionId: 'session-1',
        isRunning: true,
        provider: 'minimax',
        model: 'MiniMax-M2.7',
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
          defaultProvider: 'minimax',
          defaultModel: 'MiniMax-M2.7',
          providers: {},
        },
        source: {},
        warnings: [],
      })),
    })
    const emittedEvents: Array<{ type: string; payload?: Record<string, unknown> }> = []

    const submitPromise = service.submit(
      {
        text: '继续',
        projectPath: 'D:/workspace/demo',
      },
      {
        workspacePath: 'D:/workspace/demo',
        lastSelection: null,
      },
      (event) => {
        emittedEvents.push(event)
      },
    )

    await flushMicrotasks()
    expect(emittedEvents.map((event) => event.type)).toContain('text_delta')

    await expect(
      service.cancel({
        reason: 'user-stop',
      }),
    ).resolves.toMatchObject({
      ok: true,
    })

    expect(runtimeInstance.abort).toHaveBeenCalledTimes(1)
    expect(emittedEvents.map((event) => event.type)).toEqual([
      'run_started',
      'text_delta',
      'run_cancelled',
    ])
    const lateRuntimeBridge = runtimeBridge as RuntimeHostBridge | null
    if (lateRuntimeBridge) {
      lateRuntimeBridge.emit({
        type: 'turn_end',
        timestamp: '2026-04-26T00:00:03.000Z',
        sessionId: 'session-1',
        payload: {
          stopReason: 'end_turn',
          aborted: false,
        },
      })
      lateRuntimeBridge.emit({
        type: 'session_end',
        timestamp: '2026-04-26T00:00:04.000Z',
        sessionId: 'session-1',
        payload: {
          status: 'done',
        },
      })
    }
    expect(emittedEvents.map((event) => event.type)).toEqual([
      'run_started',
      'text_delta',
      'run_cancelled',
    ])
    await expect(submitPromise).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining('已停止当前运行'),
    })
  })

  it('runtime 发出 model_request_* 事件时，会透传给 renderer 并保留 runId', async () => {
    let runtimeBridge: RuntimeHostBridge | null = null

    const runtimeInstance: RuntimeInstance = {
      submit: vi.fn(async () => {
        runtimeBridge?.emit({
          type: 'model_request_started',
          timestamp: '2026-04-26T00:00:00.000Z',
          sessionId: 'session-1',
          payload: {
            providerId: 'minimax',
            modelId: 'MiniMax-M2.7',
            phase: 'initial',
          },
        })
        runtimeBridge?.emit({
          type: 'model_first_chunk',
          timestamp: '2026-04-26T00:00:01.000Z',
          sessionId: 'session-1',
          payload: {
            elapsedMs: 900,
          },
        })
        runtimeBridge?.emit({
          type: 'model_request_finished',
          timestamp: '2026-04-26T00:00:02.000Z',
          sessionId: 'session-1',
          payload: {
            ttftMs: 900,
            elapsedMs: 1400,
          },
        })
        return {
          text: 'done',
          thinking: '',
          stopReason: 'end_turn',
          llmCallCount: 1,
          toolCallCount: 0,
          usage: {
            inputTokens: 1,
            outputTokens: 1,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
          },
          aborted: false,
          historyCompacted: false,
          sessionId: 'session-1',
        }
      }),
      abort: vi.fn(),
      dispose: vi.fn(async () => undefined),
      getSnapshot: vi.fn(() => ({
        sessionId: 'session-1',
        isRunning: false,
        provider: 'minimax',
        model: 'MiniMax-M2.7',
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
          defaultProvider: 'minimax',
          defaultModel: 'MiniMax-M2.7',
          providers: {},
        },
        source: {},
        warnings: [],
      })),
    })
    const emittedEvents: Array<{ type: string; runId?: string }> = []

    await expect(
      service.submit(
        {
          text: '继续',
          projectPath: 'D:/workspace/demo',
          providerId: 'minimax',
          modelId: 'MiniMax-M2.7',
        },
        {
          workspacePath: 'D:/workspace/demo',
          lastSelection: null,
        },
        (event) => {
          emittedEvents.push(event)
        },
      ),
    ).resolves.toEqual({
      ok: true,
      sessionId: 'session-1',
    })

    expect(emittedEvents.map((event) => event.type)).toEqual([
      'run_started',
      'model_request_started',
      'model_first_chunk',
      'model_request_finished',
      'run_completed',
    ])
    expect(emittedEvents[1]?.runId).toBe(emittedEvents[0]?.runId)
    expect(emittedEvents[2]?.runId).toBe(emittedEvents[0]?.runId)
  })

  it('runtime 发出 turn_end 后，即使 submit 暂不 resolve，也会收敛为 run_completed', async () => {
    let runtimeBridge: RuntimeHostBridge | null = null

    const runtimeInstance: RuntimeInstance = {
      submit: vi.fn((): Promise<RuntimeTurnResult> => {
        runtimeBridge?.emit({
          type: 'text_delta',
          timestamp: '2026-04-26T00:00:01.000Z',
          sessionId: 'session-1',
          payload: {
            text: '写入完成',
          },
        })
        runtimeBridge?.emit({
          type: 'turn_end',
          timestamp: '2026-04-26T00:00:02.000Z',
          sessionId: 'session-1',
          payload: {
            stopReason: 'end_turn',
            aborted: false,
          },
        })
        return new Promise(() => undefined)
      }),
      abort: vi.fn(),
      dispose: vi.fn(async () => undefined),
      getSnapshot: vi.fn(() => ({
        sessionId: 'session-1',
        isRunning: false,
        provider: 'minimax',
        model: 'MiniMax-M2.7',
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
          defaultProvider: 'minimax',
          defaultModel: 'MiniMax-M2.7',
          providers: {},
        },
        source: {},
        warnings: [],
      })),
    })
    const emittedTypes: string[] = []

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
          emittedTypes.push(event.type)
        },
      ),
    ).resolves.toMatchObject({
      ok: true,
      sessionId: 'session-1',
    })

    expect(emittedTypes).toEqual([
      'run_started',
      'text_delta',
      'turn_end',
      'run_completed',
    ])
    expect(emittedTypes.filter((type) => type === 'run_completed')).toHaveLength(1)
  })

  it('没有 active run 时 cancel 返回失败', async () => {
    const service = createStudioRuntimeService()

    await expect(service.cancel({})).resolves.toEqual({
      ok: false,
      error: '当前没有正在运行的 Agent run。',
    })
  })

  it('dispose 会中断仍在后台执行的 active run 并释放 submit 等待', async () => {
    const runtimeInstance: RuntimeInstance = {
      submit: vi.fn((): Promise<RuntimeTurnResult> => new Promise(() => undefined)),
      abort: vi.fn(),
      dispose: vi.fn(async () => undefined),
      getSnapshot: vi.fn(() => ({
        sessionId: 'session-1',
        isRunning: true,
        provider: 'minimax',
        model: 'MiniMax-M2.7',
        warnings: [],
      })),
    }
    const service = createStudioRuntimeService({
      createRuntimeFn: vi.fn(async () => runtimeInstance),
      loadResolvedConfigFn: vi.fn(() => ({
        effective: {
          defaultProvider: 'minimax',
          defaultModel: 'MiniMax-M2.7',
          providers: {},
        },
        source: {},
        warnings: [],
      })),
    })
    const emittedTypes: string[] = []

    const submitPromise = service.submit(
      {
        text: '继续',
        projectPath: 'D:/workspace/demo',
      },
      {
        workspacePath: 'D:/workspace/demo',
        lastSelection: null,
      },
      (event) => {
        emittedTypes.push(event.type)
      },
    )

    await flushMicrotasks()
    await service.dispose()

    expect(runtimeInstance.abort).toHaveBeenCalledTimes(1)
    expect(runtimeInstance.dispose).toHaveBeenCalledTimes(1)
    expect(emittedTypes).toContain('run_cancelled')
    await expect(submitPromise).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining('应用正在退出，已停止当前运行'),
    })
  })

  it('空文本会返回失败，且不会创建 runtime 实例', async () => {
    const createRuntimeFn = vi.fn()
    const loadResolvedConfigFn = vi.fn()

    const service = createStudioRuntimeService({
      createRuntimeFn,
      loadResolvedConfigFn,
      fallbackCwd: 'D:/workspace/fallback',
    })

    await expect(
      service.submit(
        {
          text: '   ',
        },
        {
          workspacePath: null,
          lastSelection: null,
        },
        vi.fn(),
      ),
    ).resolves.toEqual({
      ok: false,
      error: 'runtime.submit.text 不能为空。',
    })

    expect(createRuntimeFn).not.toHaveBeenCalled()
    expect(loadResolvedConfigFn).not.toHaveBeenCalled()
  })

  it('同一会话连续 submit 时应复用已创建的 runtime 实例', async () => {
    const runtimeInstance: RuntimeInstance = {
      submit: vi
        .fn()
        .mockResolvedValueOnce({
          text: 'first',
          thinking: '',
          stopReason: 'end_turn',
          llmCallCount: 1,
          toolCallCount: 0,
          usage: {
            inputTokens: 1,
            outputTokens: 1,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
          },
          aborted: false,
          historyCompacted: false,
          sessionId: 'session-1',
        })
        .mockResolvedValueOnce({
          text: 'second',
          thinking: '',
          stopReason: 'end_turn',
          llmCallCount: 1,
          toolCallCount: 0,
          usage: {
            inputTokens: 1,
            outputTokens: 1,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
          },
          aborted: false,
          historyCompacted: false,
          sessionId: 'session-1',
        }),
      abort: vi.fn(),
      dispose: vi.fn(async () => undefined),
      getSnapshot: vi.fn(() => ({
        sessionId: 'session-1',
        isRunning: false,
        provider: 'openai',
        model: 'gpt-4o',
        warnings: [],
      })),
    }

    const createRuntimeFn = vi.fn(async () => runtimeInstance)
    const loadResolvedConfigFn = vi.fn(() => ({
      effective: {
        defaultProvider: 'openai',
        defaultModel: 'gpt-4o',
        providers: {},
      },
      source: {},
      warnings: [],
    }))

    const service = createStudioRuntimeService({
      createRuntimeFn,
      loadResolvedConfigFn,
    })

    await expect(
      service.submit(
        {
          text: 'first',
          projectPath: 'D:/workspace/demo',
        },
        {
          workspacePath: 'D:/workspace/demo',
          lastSelection: null,
        },
        vi.fn(),
      ),
    ).resolves.toEqual({
      ok: true,
      sessionId: 'session-1',
    })

    await expect(
      service.submit(
        {
          text: 'second',
          projectPath: 'D:/workspace/demo',
          sessionId: 'session-1',
        },
        {
          workspacePath: 'D:/workspace/demo',
          lastSelection: null,
        },
        vi.fn(),
      ),
    ).resolves.toEqual({
      ok: true,
      sessionId: 'session-1',
    })

    expect(createRuntimeFn).toHaveBeenCalledTimes(1)
    expect(runtimeInstance.dispose).not.toHaveBeenCalled()
  })

  it('切换到其他会话后再返回已存在会话时，应复用缓存 runtime 并补历史恢复', async () => {
    const runtimeA: RuntimeInstance = {
      submit: vi
        .fn()
        .mockResolvedValueOnce({
          text: 'session-1 first',
          thinking: '',
          stopReason: 'end_turn',
          llmCallCount: 1,
          toolCallCount: 0,
          usage: {
            inputTokens: 1,
            outputTokens: 1,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
          },
          aborted: false,
          historyCompacted: false,
          sessionId: 'session-1',
        })
        .mockResolvedValueOnce({
          text: 'session-1 second',
          thinking: '',
          stopReason: 'end_turn',
          llmCallCount: 1,
          toolCallCount: 0,
          usage: {
            inputTokens: 1,
            outputTokens: 1,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
          },
          aborted: false,
          historyCompacted: false,
          sessionId: 'session-1',
        }),
      abort: vi.fn(),
      dispose: vi.fn(async () => undefined),
      getSnapshot: vi.fn(() => ({
        sessionId: 'session-1',
        isRunning: false,
        provider: 'openai',
        model: 'gpt-4o',
        warnings: [],
      })),
    }
    const runtimeB: RuntimeInstance = {
      submit: vi.fn(async () => ({
        text: 'session-2 first',
        thinking: '',
        stopReason: 'end_turn',
        llmCallCount: 1,
        toolCallCount: 0,
        usage: {
          inputTokens: 1,
          outputTokens: 1,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
        aborted: false,
        historyCompacted: false,
        sessionId: 'session-2',
      })),
      abort: vi.fn(),
      dispose: vi.fn(async () => undefined),
      getSnapshot: vi.fn(() => ({
        sessionId: 'session-2',
        isRunning: false,
        provider: 'openai',
        model: 'gpt-4o',
        warnings: [],
      })),
    }

    const createRuntimeFn = vi
      .fn()
      .mockImplementationOnce(async () => runtimeA)
      .mockImplementationOnce(async () => runtimeB)
    const loadResolvedConfigFn = vi.fn(() => ({
      effective: {
        defaultProvider: 'openai',
        defaultModel: 'gpt-4o',
        providers: {},
      },
      source: {},
      warnings: [],
    }))
    const engineServiceApi = {
      runtime: {
        setModel: vi.fn(() => ({
          provider: 'openai',
          model: 'gpt-4o',
        })),
        getModelSelection: vi.fn(() => ({
          provider: 'openai',
          model: 'gpt-4o',
        })),
        compactContext: vi.fn(async () => ({
          ok: false as const,
          reason: 'empty-history' as const,
          message: 'No messages to compact.',
        })),
        getContextSnapshot: vi.fn(() => ({
          provider: 'openai',
          model: 'gpt-4o',
          strategy: 'full-replace',
          historyLength: 0,
          totalWindow: 128000,
          outputReserve: 16384,
          effectiveWindow: 111616,
          lastInputTokens: 0,
          usedPercentage: 0,
          remaining: 111616,
          level: 'normal' as const,
        })),
      },
      sessionService: {
        listSessions: vi.fn(() => []),
        listBranches: vi.fn(() => []),
        loadSession: vi.fn((sessionId: string) => ({
          conversationSchemaVersion: 2,
          sessionId,
          leafEventUuid: 'leaf-1',
          cwd: 'D:/workspace/demo',
          provider: 'openai',
          model: 'gpt-4o',
          messages: [
            {
              id: 'user-1',
              role: 'user' as const,
              blocks: [
                {
                  id: 'user-text-1',
                  type: 'text' as const,
                  content: '历史用户消息',
                },
              ],
            },
            {
              id: 'assistant-1',
              role: 'assistant' as const,
              blocks: [
                {
                  id: 'assistant-text-1',
                  type: 'text' as const,
                  content: '历史助手消息',
                },
              ],
            },
          ],
        })),
        resumeSession: vi.fn(),
        forkFromEvent: vi.fn(),
        clearConversation: vi.fn(),
        getCurrentSessionId: vi.fn(() => 'session-1'),
      },
    }

    const service = createStudioRuntimeService({
      createRuntimeFn,
      loadResolvedConfigFn,
      engineServiceApi,
    })
    const hostState = {
      workspacePath: 'D:/workspace/demo',
      lastSelection: null,
    }

    await expect(
      service.submit(
        {
          text: 'session-1 first',
          projectPath: 'D:/workspace/demo',
          sessionId: null,
        },
        hostState,
        vi.fn(),
      ),
    ).resolves.toEqual({
      ok: true,
      sessionId: 'session-1',
    })

    await expect(
      service.submit(
        {
          text: 'session-2 first',
          projectPath: 'D:/workspace/demo',
          sessionId: 'session-2',
        },
        hostState,
        vi.fn(),
      ),
    ).resolves.toEqual({
      ok: true,
      sessionId: 'session-2',
    })

    await expect(
      service.submit(
        {
          text: 'session-1 second',
          projectPath: 'D:/workspace/demo',
          sessionId: 'session-1',
        },
        hostState,
        vi.fn(),
      ),
    ).resolves.toEqual({
      ok: true,
      sessionId: 'session-1',
    })

    expect(createRuntimeFn).toHaveBeenCalledTimes(2)
    expect(runtimeA.submit).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        text: 'session-1 second',
        history: [
          { role: 'user', content: '历史用户消息' },
          { role: 'assistant', content: '历史助手消息' },
          { role: 'user', content: 'session-1 second' },
        ],
      }),
    )
    expect(runtimeA.dispose).not.toHaveBeenCalled()
    expect(runtimeB.dispose).not.toHaveBeenCalled()
  })

  it('默认权限策略不应无条件放行危险工具', async () => {
    let runtimeBridge: RuntimeHostBridge | null = null

    const runtimeInstance: RuntimeInstance = {
      submit: vi.fn(async () => ({
        text: 'done',
        thinking: '',
        stopReason: 'end_turn',
        llmCallCount: 1,
        toolCallCount: 0,
        usage: {
          inputTokens: 1,
          outputTokens: 1,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
        aborted: false,
        historyCompacted: false,
        sessionId: 'session-1',
      })),
      abort: vi.fn(),
      dispose: vi.fn(async () => undefined),
      getSnapshot: vi.fn(() => ({
        sessionId: 'session-1',
        isRunning: false,
        provider: 'openai',
        model: 'gpt-4o',
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
          defaultModel: 'gpt-4o',
          providers: {},
        },
        source: {},
        warnings: [],
      })),
    })

    await service.submit(
      {
        text: '继续',
        projectPath: 'D:/workspace/demo',
      },
      {
        workspacePath: 'D:/workspace/demo',
        lastSelection: null,
      },
      vi.fn(),
    )

    expect(runtimeBridge).not.toBeNull()
    await expect(
      runtimeBridge!.requestPermission({
        toolName: 'bash',
        args: { command: 'rm -rf .' },
        sessionId: 'session-1',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        allow: false,
      }),
    )
  })

  it('危险工具应通过 Renderer 权限弹窗确认，并支持本次会话记住', async () => {
    let runtimeBridge: RuntimeHostBridge | null = null
    const send = vi.fn()

    const runtimeInstance: RuntimeInstance = {
      submit: vi.fn(async () => ({
        text: 'done',
        thinking: '',
        stopReason: 'end_turn',
        llmCallCount: 1,
        toolCallCount: 0,
        usage: {
          inputTokens: 1,
          outputTokens: 1,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
        aborted: false,
        historyCompacted: false,
        sessionId: 'session-1',
      })),
      abort: vi.fn(),
      dispose: vi.fn(async () => undefined),
      getSnapshot: vi.fn(() => ({
        sessionId: 'session-1',
        isRunning: false,
        provider: 'openai',
        model: 'gpt-4o',
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
          defaultModel: 'gpt-4o',
          providers: {},
        },
        source: {},
        warnings: [],
      })),
      mainWindowManager: {
        getMainWindow: () => ({
          webContents: {
            send,
          },
        }),
      },
    })

    await service.submit(
      {
        text: '继续',
        projectPath: 'D:/workspace/demo',
      },
      {
        workspacePath: 'D:/workspace/demo',
        lastSelection: null,
      },
      vi.fn(),
    )

    expect(runtimeBridge).not.toBeNull()
    const permissionPromise = runtimeBridge!.requestPermission({
      toolName: 'bash',
      args: { command: 'pnpm test' },
      sessionId: 'session-1',
    })

    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith(
      STUDIO_BRIDGE_CHANNELS.permissionRequest,
      expect.objectContaining({
        toolName: 'bash',
        args: { command: 'pnpm test' },
        description: expect.stringContaining('pnpm test'),
      }),
    )

    const requestPayload = send.mock.calls[0]![1] as { requestId: string }
    expect(
      service.respondToPermissionRequest({
        requestId: requestPayload.requestId,
        allow: true,
        remember: true,
      }),
    ).toBe(true)

    await expect(permissionPromise).resolves.toEqual(
      expect.objectContaining({
        allow: true,
        remember: true,
      }),
    )

    await expect(
      runtimeBridge!.requestPermission({
        toolName: 'bash',
        args: { command: 'pnpm typecheck' },
        sessionId: 'session-1',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        allow: true,
        remember: true,
      }),
    )
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('危险工具权限请求超时后自动拒绝', async () => {
    let runtimeBridge: RuntimeHostBridge | null = null
    const send = vi.fn()

    const runtimeInstance: RuntimeInstance = {
      submit: vi.fn(async () => ({
        text: 'done',
        thinking: '',
        stopReason: 'end_turn',
        llmCallCount: 1,
        toolCallCount: 0,
        usage: {
          inputTokens: 1,
          outputTokens: 1,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
        aborted: false,
        historyCompacted: false,
        sessionId: 'session-1',
      })),
      abort: vi.fn(),
      dispose: vi.fn(async () => undefined),
      getSnapshot: vi.fn(() => ({
        sessionId: 'session-1',
        isRunning: false,
        provider: 'openai',
        model: 'gpt-4o',
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
          defaultModel: 'gpt-4o',
          providers: {},
        },
        source: {},
        warnings: [],
      })),
      permissionRequestTimeoutMs: 1,
      mainWindowManager: {
        getMainWindow: () => ({
          webContents: {
            send,
          },
        }),
      },
    })

    await service.submit(
      {
        text: '继续',
        projectPath: 'D:/workspace/demo',
      },
      {
        workspacePath: 'D:/workspace/demo',
        lastSelection: null,
      },
      vi.fn(),
    )

    await expect(
      runtimeBridge!.requestPermission({
        toolName: 'bash',
        args: { command: 'pnpm test' },
        sessionId: 'session-1',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        allow: false,
        reason: 'permission-timeout',
      }),
    )
  })

  it('用户提问应通过 Renderer 对话框回传答案', async () => {
    let runtimeBridge: RuntimeHostBridge | null = null
    const send = vi.fn()

    const runtimeInstance: RuntimeInstance = {
      submit: vi.fn(async () => ({
        text: 'done',
        thinking: '',
        stopReason: 'end_turn',
        llmCallCount: 1,
        toolCallCount: 0,
        usage: {
          inputTokens: 1,
          outputTokens: 1,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
        aborted: false,
        historyCompacted: false,
        sessionId: 'session-1',
      })),
      abort: vi.fn(),
      dispose: vi.fn(async () => undefined),
      getSnapshot: vi.fn(() => ({
        sessionId: 'session-1',
        isRunning: false,
        provider: 'openai',
        model: 'gpt-4o',
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
          defaultModel: 'gpt-4o',
          providers: {},
        },
        source: {},
        warnings: [],
      })),
      mainWindowManager: {
        getMainWindow: () => ({
          webContents: {
            send,
          },
        }),
      },
    })

    await service.submit(
      {
        text: '继续',
        projectPath: 'D:/workspace/demo',
      },
      {
        workspacePath: 'D:/workspace/demo',
        lastSelection: null,
      },
      vi.fn(),
    )

    const userInputPromise = runtimeBridge!.requestUserInput!({
      sessionId: 'session-1',
      questions: [
        {
          key: 'focus',
          title: '本次优先修哪一层？',
          type: 'select',
          options: [
            { label: 'renderer' },
            { label: 'main' },
          ],
        },
        {
          key: 'details',
          title: '请补充说明',
          type: 'text',
          placeholder: '例如：先打通 IPC',
        },
      ],
    })

    expect(send).toHaveBeenCalledWith(
      STUDIO_BRIDGE_CHANNELS.userInputRequest,
      expect.objectContaining({
        sessionId: 'session-1',
        questions: [
          expect.objectContaining({
            key: 'focus',
            type: 'select',
          }),
          expect.objectContaining({
            key: 'details',
            type: 'text',
          }),
        ],
      }),
    )

    const requestPayload = send.mock.calls[0]![1] as { requestId: string }
    expect(
      service.respondToUserInputRequest({
        requestId: requestPayload.requestId,
        cancelled: false,
        answers: {
          focus: 'renderer',
          details: '先补齐 Renderer 对话框',
        },
      }),
    ).toBe(true)

    await expect(userInputPromise).resolves.toEqual({
      cancelled: false,
      answers: {
        focus: 'renderer',
        details: '先补齐 Renderer 对话框',
      },
    })
  })

  it('用户提问超时后自动返回 cancelled', async () => {
    vi.useFakeTimers()

    try {
      let runtimeBridge: RuntimeHostBridge | null = null
      const send = vi.fn()

      const runtimeInstance: RuntimeInstance = {
        submit: vi.fn(async () => ({
          text: 'done',
          thinking: '',
          stopReason: 'end_turn',
          llmCallCount: 1,
          toolCallCount: 0,
          usage: {
            inputTokens: 1,
            outputTokens: 1,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
          },
          aborted: false,
          historyCompacted: false,
          sessionId: 'session-1',
        })),
        abort: vi.fn(),
        dispose: vi.fn(async () => undefined),
        getSnapshot: vi.fn(() => ({
          sessionId: 'session-1',
          isRunning: false,
          provider: 'openai',
          model: 'gpt-4o',
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
            defaultModel: 'gpt-4o',
            providers: {},
          },
          source: {},
          warnings: [],
        })),
        userInputRequestTimeoutMs: 1_000,
        mainWindowManager: {
          getMainWindow: () => ({
            webContents: {
              send,
            },
          }),
        },
      })

      await service.submit(
        {
          text: '继续',
          projectPath: 'D:/workspace/demo',
        },
        {
          workspacePath: 'D:/workspace/demo',
          lastSelection: null,
        },
        vi.fn(),
      )

      const userInputPromise = runtimeBridge!.requestUserInput!({
        sessionId: 'session-1',
        questions: [
          {
            key: 'focus',
            title: '本次优先修哪一层？',
            type: 'select',
            options: [{ label: 'renderer' }],
          },
        ],
      })

      await vi.advanceTimersByTimeAsync(1_000)

      await expect(userInputPromise).resolves.toEqual({
        cancelled: true,
        answers: {},
      })
      expect(send).toHaveBeenCalledWith(
        STUDIO_BRIDGE_CHANNELS.userInputRequest,
        expect.objectContaining({
          sessionId: 'session-1',
        }),
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('workspace 内写入工具自动放行，越界写入工具自动拒绝', async () => {
    let runtimeBridge: RuntimeHostBridge | null = null

    const runtimeInstance: RuntimeInstance = {
      submit: vi.fn(async () => ({
        text: 'done',
        thinking: '',
        stopReason: 'end_turn',
        llmCallCount: 1,
        toolCallCount: 0,
        usage: {
          inputTokens: 1,
          outputTokens: 1,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
        aborted: false,
        historyCompacted: false,
        sessionId: 'session-1',
      })),
      abort: vi.fn(),
      dispose: vi.fn(async () => undefined),
      getSnapshot: vi.fn(() => ({
        sessionId: 'session-1',
        isRunning: false,
        provider: 'openai',
        model: 'gpt-4o',
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
          defaultModel: 'gpt-4o',
          providers: {},
        },
        source: {},
        warnings: [],
      })),
    })

    await service.submit(
      {
        text: '继续',
        projectPath: 'D:/workspace/demo',
      },
      {
        workspacePath: 'D:/workspace/demo',
        lastSelection: null,
      },
      vi.fn(),
    )

    await expect(
      runtimeBridge!.requestPermission({
        toolName: 'write_file',
        args: { path: 'src/index.ts', content: 'export {}' },
        sessionId: 'session-1',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        allow: true,
        reason: 'workspace-scoped-tool',
      }),
    )

    await expect(
      runtimeBridge!.requestPermission({
        toolName: 'edit_file',
        args: { path: 'D:/outside/secret.ts', old_str: 'a', new_str: 'b' },
        sessionId: 'session-1',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        allow: false,
        reason: 'outside-workspace',
      }),
    )
  })
})
