import { describe, expect, it, vi } from 'vitest'
import { createStudioRuntimeService } from '../src/main/studio-runtime-service'
import type {
  RuntimeHostBridge,
  RuntimeInstance,
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
        vi.fn(),
      ),
    ).resolves.toEqual({
      ok: false,
      error: expect.stringContaining('LLM 请求超过 0.005 秒未响应'),
    })

    expect(runtimeInstance.abort).toHaveBeenCalledTimes(1)
  })
})
