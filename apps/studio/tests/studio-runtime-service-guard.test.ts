import { describe, expect, it, vi } from 'vitest'
import { createStudioRuntimeService } from '../src/main/studio-runtime-service'
import type {
  RuntimeHostBridge,
  RuntimeInstance,
  RuntimeTurnResult,
} from '@xnova/runtime'

describe('studio runtime service guards', () => {
  it('会把 providerId 与 modelId 一起透传到 shared runtime submit', async () => {
    let runtimeBridge: RuntimeHostBridge | null = null

    const runtimeInstance: RuntimeInstance = {
      submit: vi.fn(async () => {
        runtimeBridge?.emit({
          type: 'text_delta',
          timestamp: '2026-04-24T00:00:00.000Z',
          sessionId: 'session-2',
          payload: {
            text: '正在继续分析...',
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
          sessionId: 'session-2',
        }
      }),
      abort: vi.fn(),
      dispose: vi.fn(async () => undefined),
      getSnapshot: vi.fn(() => ({
        sessionId: 'session-2',
        isRunning: false,
        provider: 'openai',
        model: 'gpt-4.1-mini',
        warnings: [],
      })),
    }

    const createRuntimeFn = vi.fn(async (_input, bridge) => {
      runtimeBridge = bridge
      return runtimeInstance
    })
    const loadResolvedConfigFn = vi.fn(() => ({
      effective: {
        defaultProvider: 'anthropic',
        defaultModel: 'claude-sonnet-4-6',
        providers: {
          anthropic: {
            apiKey: '',
            models: ['claude-sonnet-4-6'],
          },
          openai: {
            apiKey: '',
            models: ['gpt-4.1-mini'],
          },
        },
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
          text: '继续当前项目',
          projectPath: 'D:/workspace/demo',
          providerId: 'openai',
          modelId: 'gpt-4.1-mini',
        },
        {
          workspacePath: 'D:/workspace/demo',
          lastSelection: null,
        },
        vi.fn(),
      ),
    ).resolves.toEqual({
      ok: true,
      sessionId: 'session-2',
    })

    expect(runtimeInstance.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        text: '继续当前项目',
        history: [{ role: 'user', content: '继续当前项目' }],
        loggedUserContent: '继续当前项目',
        provider: 'openai',
        model: 'gpt-4.1-mini',
      }),
    )
  })

  it('未绑定 Workspace 且未显式提供 projectPath 时直接失败，不回退到 process.cwd', async () => {
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
          text: '继续当前项目',
        },
        {
          workspacePath: null,
          lastSelection: null,
        },
        vi.fn(),
      ),
    ).resolves.toEqual({
      ok: false,
      error: '当前尚未绑定 Workspace，无法开始项目会话。',
    })

    expect(createRuntimeFn).not.toHaveBeenCalled()
    expect(loadResolvedConfigFn).not.toHaveBeenCalled()
  })

  it('runtime submit 超时时会调用 abort 并返回用户可见错误', async () => {
    const runtimeInstance: RuntimeInstance = {
      submit: vi.fn((): Promise<never> => new Promise(() => {})),
      abort: vi.fn(),
      dispose: vi.fn(async () => undefined),
      getSnapshot: vi.fn(() => ({
        sessionId: null,
        isRunning: true,
        provider: 'openai',
        model: 'gpt-4.1-mini',
        warnings: [],
      })),
    }

    const service = createStudioRuntimeService({
      createRuntimeFn: vi.fn(async () => runtimeInstance),
      loadResolvedConfigFn: vi.fn(() => ({
        effective: {
          defaultProvider: 'openai',
          defaultModel: 'gpt-4.1-mini',
          providers: {},
        },
        source: {},
        warnings: [],
      })),
      submitTimeoutMs: 5,
    })
    const emittedTypes: string[] = []

    await expect(
      service.submit(
        {
          text: '继续当前项目',
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
      error: expect.stringContaining('连续 0.005 秒没有新的运行进展'),
    })

    expect(runtimeInstance.abort).toHaveBeenCalledTimes(1)
    expect(emittedTypes).toEqual(['run_started', 'run_failed'])
  })

  it('runtime 持续输出事件时不会被固定总时长 watchdog 误杀', async () => {
    vi.useFakeTimers()
    let runtimeBridge: RuntimeHostBridge | null = null

    try {
      const runtimeInstance: RuntimeInstance = {
        submit: vi.fn(
          () =>
            new Promise<RuntimeTurnResult>((resolve) => {
              setTimeout(() => {
                runtimeBridge?.emit({
                  type: 'text_delta',
                  timestamp: '2026-04-26T00:00:01.000Z',
                  sessionId: 'session-3',
                  payload: {
                    text: '正在分析',
                  },
                })
              }, 3)

              setTimeout(() => {
                runtimeBridge?.emit({
                  type: 'thinking',
                  timestamp: '2026-04-26T00:00:02.000Z',
                  sessionId: 'session-3',
                  payload: {
                    text: '继续处理中',
                  },
                })
              }, 6)

              setTimeout(() => {
                resolve({
                  text: '分析完成',
                  thinking: '继续处理中',
                  stopReason: 'end_turn',
                  llmCallCount: 1,
                  toolCallCount: 0,
                  usage: {
                    inputTokens: 10,
                    outputTokens: 12,
                    cacheReadTokens: 0,
                    cacheWriteTokens: 0,
                  },
                  aborted: false,
                  historyCompacted: false,
                  sessionId: 'session-3',
                })
              }, 10)
            }),
        ),
        abort: vi.fn(),
        dispose: vi.fn(async () => undefined),
        getSnapshot: vi.fn(() => ({
          sessionId: 'session-3',
          isRunning: true,
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
        submitTimeoutMs: 5,
      })

      const emittedEvents: string[] = []
      const submitPromise = service.submit(
        {
          text: '继续当前项目',
          projectPath: 'D:/workspace/demo',
        },
        {
          workspacePath: 'D:/workspace/demo',
          lastSelection: null,
        },
        (event) => {
          emittedEvents.push(event.type)
        },
      )

      await vi.advanceTimersByTimeAsync(12)

      await expect(submitPromise).resolves.toEqual({
        ok: true,
        sessionId: 'session-3',
      })
      expect(runtimeInstance.abort).not.toHaveBeenCalled()
      expect(emittedEvents).toEqual([
        'run_started',
        'text_delta',
        'thinking',
        'run_completed',
      ])
    } finally {
      vi.useRealTimers()
    }
  })

  it('收到首个进展后，较长静默不会立刻被短 watchdog 误杀', async () => {
    vi.useFakeTimers()
    let runtimeBridge: RuntimeHostBridge | null = null

    try {
      const runtimeInstance: RuntimeInstance = {
        submit: vi.fn(
          () =>
            new Promise<RuntimeTurnResult>((resolve) => {
              setTimeout(() => {
                runtimeBridge?.emit({
                  type: 'thinking',
                  timestamp: '2026-04-26T00:00:01.000Z',
                  sessionId: 'session-4',
                  payload: {
                    text: '正在整理方案',
                  },
                })
              }, 2)

              setTimeout(() => {
                resolve({
                  text: '方案整理完成',
                  thinking: '正在整理方案',
                  stopReason: 'end_turn',
                  llmCallCount: 1,
                  toolCallCount: 0,
                  usage: {
                    inputTokens: 10,
                    outputTokens: 12,
                    cacheReadTokens: 0,
                    cacheWriteTokens: 0,
                  },
                  aborted: false,
                  historyCompacted: false,
                  sessionId: 'session-4',
                })
              }, 20)
            }),
        ),
        abort: vi.fn(),
        dispose: vi.fn(async () => undefined),
        getSnapshot: vi.fn(() => ({
          sessionId: 'session-4',
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
        submitTimeoutMs: 5,
      })

      const submitPromise = service.submit(
        {
          text: '继续当前项目',
          projectPath: 'D:/workspace/demo',
          providerId: 'minimax',
          modelId: 'MiniMax-M2.7',
        },
        {
          workspacePath: 'D:/workspace/demo',
          lastSelection: null,
        },
        vi.fn(),
      )

      await vi.advanceTimersByTimeAsync(25)

      await expect(submitPromise).resolves.toEqual({
        ok: true,
        sessionId: 'session-4',
      })
      expect(runtimeInstance.abort).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('已有 run 在执行时再次 submit 直接被主进程拒绝，不会调用 createRuntimeFn', async () => {
    let firstSubmitStarted: (() => void) = () => {}
    let releaseFirstSubmit: (() => void) = () => {}
    const firstStartedPromise = new Promise<void>((resolve) => {
      firstSubmitStarted = resolve
    })

    const runtimeInstance: RuntimeInstance = {
      submit: vi.fn(
        () =>
          new Promise<RuntimeTurnResult>((resolveTurn) => {
            firstSubmitStarted()
            releaseFirstSubmit = () =>
              resolveTurn({
                text: 'done',
                thinking: '',
                stopReason: 'end_turn',
                llmCallCount: 1,
                toolCallCount: 0,
                usage: {
                  inputTokens: 10,
                  outputTokens: 5,
                  cacheReadTokens: 0,
                  cacheWriteTokens: 0,
                },
                aborted: false,
                historyCompacted: false,
                sessionId: 'session-busy',
              })
          }),
      ),
      abort: vi.fn(),
      dispose: vi.fn(async () => undefined),
      getSnapshot: vi.fn(() => ({
        sessionId: 'session-busy',
        isRunning: true,
        provider: 'openai',
        model: 'gpt-4.1-mini',
        warnings: [],
      })),
    }

    const createRuntimeFn = vi.fn(async () => runtimeInstance)
    const loadResolvedConfigFn = vi.fn(() => ({
      effective: {
        defaultProvider: 'openai',
        defaultModel: 'gpt-4.1-mini',
        providers: {},
      },
      source: {},
      warnings: [],
    }))

    const service = createStudioRuntimeService({
      createRuntimeFn,
      loadResolvedConfigFn,
    })

    const firstPromise = service.submit(
      { text: '第一问', projectPath: 'D:/workspace/demo' },
      { workspacePath: 'D:/workspace/demo', lastSelection: null },
      vi.fn(),
    )

    await firstStartedPromise

    const secondResult = await service.submit(
      { text: '第二问', projectPath: 'D:/workspace/demo' },
      { workspacePath: 'D:/workspace/demo', lastSelection: null },
      vi.fn(),
    )

    expect(secondResult).toEqual({
      ok: false,
      error: expect.stringContaining('当前已有 Agent run 正在执行'),
    })
    // 主进程门禁：第二次提交不应触发 createRuntime / runtimeInstance.submit
    expect(createRuntimeFn).toHaveBeenCalledTimes(1)
    expect(runtimeInstance.submit).toHaveBeenCalledTimes(1)

    releaseFirstSubmit()
    await firstPromise
  })
})
