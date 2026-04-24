import { describe, expect, it, vi } from 'vitest'
import { createStudioRuntimeService } from '../src/main/studio-runtime-service'
import type {
  RuntimeHostBridge,
  RuntimeInstance,
} from '@xnova/runtime'

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
        type: 'text_delta',
        sessionId: 'session-1',
      }),
    ])
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
})
