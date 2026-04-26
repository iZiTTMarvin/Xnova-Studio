/**
 * Runtime 集成测试
 *
 * 目标：
 * - createRuntime().submit() 成为 REPL / Pipe Mode 共用的执行门面
 * - submit() 内部负责 bootstrap、session / token 观测、AgentLoop 驱动
 * - Host 仅消费 bridge 事件与 submit 结果
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRuntime } from '../create-runtime.js'
import type { RuntimeEvent, RuntimeHostBridge } from '../types.js'

const mocks = vi.hoisted(() => {
  const bootstrapAll = vi.fn(async () => ({ warnings: [] }))
  const registerMcpTools = vi.fn()
  const getRegistry = vi.fn(() => ({ name: 'registry' }))
  const getSystemPrompt = vi.fn(() => 'system prompt')
  const ensureMcpInitialized = vi.fn(async () => {})
  const ensureAgentCatalogInitialized = vi.fn()
  const resolvePrimaryAgent = vi.fn(() => ({
    agent: { getSystemPrompt: () => 'primary agent prompt' },
    warnings: [],
  }))

  const ensureSession = vi.fn(() => 'session-1')
  const setCwd = vi.fn()
  const logUserMessage = vi.fn()
  const logAssistantMessage = vi.fn()
  const consumeSessionEvent = vi.fn()
  const bindTokenMeter = vi.fn()
  const consumeTokenEvent = vi.fn()

  const prepareHistory = vi.fn(async (history: unknown, _provider?: unknown, _options?: unknown) => ({
    history,
    compacted: false,
  }))
  const historyStore: unknown[] = []
  const getHistoryRef = vi.fn(() => historyStore)
  const replaceHistory = vi.fn((history: unknown[]) => {
    historyStore.length = 0
    historyStore.push(...history)
  })
  const pushUser = vi.fn((content: string) => {
    historyStore.push({ role: 'user', content })
  })
  const pushUserContent = vi.fn((content: unknown[]) => {
    historyStore.push({ role: 'user', content })
  })
  const clearHistory = vi.fn(() => {
    historyStore.length = 0
  })
  const restoreHistory = vi.fn((history: unknown[]) => {
    historyStore.length = 0
    historyStore.push(...history)
  })
  const contextState = {
    usedPercentage: 0.42,
    lastInputTokens: 2048,
    effectiveWindow: 8192,
    level: 'normal',
  }

  const getOrCreateProvider = vi.fn(() => ({
    createSession: () => ({ dispose: vi.fn(), chat: vi.fn() }),
  }))

  const agentLoopRun = vi.fn()
  const AgentLoopMock = vi.fn(function AgentLoopMock() {
    return {
      run: agentLoopRun,
    }
  })

  return {
    bootstrapAll,
    registerMcpTools,
    getRegistry,
    getSystemPrompt,
    ensureMcpInitialized,
    ensureAgentCatalogInitialized,
    resolvePrimaryAgent,
    ensureSession,
    setCwd,
    logUserMessage,
    logAssistantMessage,
    consumeSessionEvent,
    bindTokenMeter,
    consumeTokenEvent,
    prepareHistory,
    historyStore,
    getHistoryRef,
    replaceHistory,
    pushUser,
    pushUserContent,
    clearHistory,
    restoreHistory,
    contextState,
    getOrCreateProvider,
    agentLoopRun,
    AgentLoopMock,
  }
})

vi.mock('@xnova/core', () => ({
  AgentLoop: mocks.AgentLoopMock,
  isAbortError: (error: unknown) => error instanceof Error && error.name === 'AbortError',
  bootstrapAll: mocks.bootstrapAll,
  getRegistry: mocks.getRegistry,
  registerMcpTools: mocks.registerMcpTools,
  getSystemPrompt: mocks.getSystemPrompt,
  ensureMcpInitialized: mocks.ensureMcpInitialized,
  hookManager: { name: 'hook-manager' },
  contextManager: {
    prepare: mocks.prepareHistory,
    replaceHistory: mocks.replaceHistory,
    pushUser: mocks.pushUser,
    pushUserContent: mocks.pushUserContent,
    clearHistory: mocks.clearHistory,
    restoreHistory: mocks.restoreHistory,
    getHistoryRef: mocks.getHistoryRef,
  },
  contextTracker: {
    getState: () => mocks.contextState,
  },
  sessionLogger: {
    setCwd: mocks.setCwd,
    ensureSession: mocks.ensureSession,
    logUserMessage: mocks.logUserMessage,
    logAssistantMessage: mocks.logAssistantMessage,
    consume: mocks.consumeSessionEvent,
    sessionId: 'session-1',
  },
  tokenMeter: {
    bind: mocks.bindTokenMeter,
    consume: mocks.consumeTokenEvent,
  },
}))

vi.mock('@tools/agent/catalog.js', () => ({
  agentCatalog: {
    ensureInitialized: mocks.ensureAgentCatalogInitialized,
    resolvePrimaryAgent: mocks.resolvePrimaryAgent,
  },
}))

vi.mock('@providers/registry.js', () => ({
  getOrCreateProvider: mocks.getOrCreateProvider,
}))

function makeConfig() {
  return {
    defaultProvider: 'anthropic',
    defaultModel: 'claude-sonnet-4-5',
    providers: {},
  }
}

describe('createRuntime() — 集成门面', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.historyStore.length = 0
    mocks.agentLoopRun.mockImplementation(async function* () {
      yield {
        type: 'llm_start',
        provider: 'openai',
        model: 'gpt-4o',
        messageCount: 1,
      }
      yield {
        type: 'llm_first_chunk',
        chunkType: 'text',
        elapsedMs: 50,
      }
      yield { type: 'text', text: 'Hello' }
      yield { type: 'tool_start', toolName: 'bash', toolCallId: 'tool-1', args: { command: 'pwd' } }
      yield {
        type: 'tool_done',
        toolName: 'bash',
        toolCallId: 'tool-1',
        durationMs: 12,
        success: true,
        resultSummary: 'done',
        resultFull: 'done',
      }
      yield {
        type: 'llm_done',
        inputTokens: 10,
        outputTokens: 20,
        cacheReadTokens: 3,
        cacheWriteTokens: 1,
        stopReason: 'end_turn',
        ttftMs: 50,
        e2eMs: 80,
        tps: 25,
      }
      yield { type: 'done', reason: 'complete' }
    })
  })

  it('submit() 负责 bootstrap、观测与事件桥接，并返回聚合结果', async () => {
    const emitted: RuntimeEvent[] = []
    const bridge: RuntimeHostBridge = {
      emit: (event) => emitted.push(event),
      requestPermission: async () => ({ allow: true }),
    }

    const runtime = await createRuntime({
      cwd: 'D:/workspace',
      config: makeConfig(),
      mode: 'standard',
    }, bridge)

    const result = await runtime.submit({
      text: '你好',
      provider: 'openai',
      model: 'gpt-4o',
      history: [{ role: 'user', content: '你好' }],
      loggedUserContent: '你好',
    })

    expect(mocks.bootstrapAll).toHaveBeenCalledWith('D:/workspace')
    expect(mocks.ensureSession).toHaveBeenCalledWith('openai', 'gpt-4o')
    expect(mocks.bindTokenMeter).toHaveBeenCalledWith('session-1', 'openai', 'gpt-4o')
    expect(mocks.logUserMessage).toHaveBeenCalledWith('你好')
    expect(mocks.logAssistantMessage).toHaveBeenCalledWith([
      {
        id: 'assistant-text-1',
        type: 'text',
        content: 'Hello',
      },
      {
        id: 'assistant-tool-2',
        type: 'tool',
        toolCallId: 'tool-1',
        toolName: 'bash',
        args: {
          command: 'pwd',
        },
        status: 'done',
        durationMs: 12,
        success: true,
        resultSummary: 'done',
        resultFull: 'done',
      },
    ], 'gpt-4o', 'openai', expect.objectContaining({
      usage: {
        inputTokens: 10,
        outputTokens: 20,
        cacheReadTokens: 3,
        cacheWriteTokens: 1,
      },
      stopReason: 'end_turn',
      llmCallCount: 1,
      toolCallCount: 1,
    }))
    expect(mocks.prepareHistory).toHaveBeenCalledWith(
      [{ role: 'user', content: '你好' }],
      expect.any(Object),
      expect.objectContaining({
        model: 'gpt-4o',
        systemPrompt: 'system prompt\n\nprimary agent prompt',
      }),
    )
    expect(mocks.registerMcpTools).toHaveBeenCalledWith(mocks.getRegistry.mock.results[0]!.value)
    expect(mocks.AgentLoopMock).toHaveBeenCalledTimes(1)
    expect(mocks.AgentLoopMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      expect.objectContaining({
        cwd: 'D:/workspace',
      }),
    )
    expect(result).toEqual(expect.objectContaining({
      text: 'Hello',
      thinking: '',
      stopReason: 'end_turn',
      llmCallCount: 1,
      toolCallCount: 1,
      aborted: false,
      sessionId: 'session-1',
    }))
    // timing_mark 属于非敏感性能阶段打点（dev/PERF 链路用），
    // 数量受 bootstrap 内部阶段数影响，断言时过滤掉以专注业务事件序列。
    expect(emitted.map(event => event.type).filter((type) => type !== 'timing_mark')).toEqual([
      'model_request_started',
      'model_first_chunk',
      'text_delta',
      'tool_start',
      'tool_end',
      'model_request_finished',
      'context_update',
      'turn_end',
    ])
  })

  it('pipe 模式可要求先等待 MCP 就绪', async () => {
    const bridge: RuntimeHostBridge = {
      emit: () => {},
      requestPermission: async () => ({ allow: true }),
    }

    const runtime = await createRuntime({
      cwd: 'D:/workspace',
      config: makeConfig(),
      mode: 'standard',
    }, bridge)

    await runtime.submit({
      text: 'hello',
      history: [{ role: 'user', content: 'hello' }],
      loggedUserContent: 'hello',
      waitForMcp: true,
    })

    expect(mocks.ensureMcpInitialized).toHaveBeenCalledTimes(1)
  })

  it('runtime 仍在运行时再次 submit 会返回 error turn result 并补发 error + turn_end 事件', async () => {
    // 用 ref 数组而非 let，避免 TS 把闭包内赋值的变量错误窄化为 never
    const releaseFirstRef: { current: (() => void) | null } = { current: null }
    const firstStarted = new Promise<void>((resolve) => {
      mocks.agentLoopRun.mockImplementationOnce(async function* () {
        resolve()
        await new Promise<void>((settle) => {
          releaseFirstRef.current = settle
        })
        yield {
          type: 'llm_done',
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          stopReason: 'end_turn',
          ttftMs: 1,
          e2eMs: 1,
          tps: 0,
        }
        yield { type: 'done', reason: 'complete' }
      })
    })

    const emitted: RuntimeEvent[] = []
    const bridge: RuntimeHostBridge = {
      emit: (event) => emitted.push(event),
      requestPermission: async () => ({ allow: true }),
    }

    const runtime = await createRuntime({
      cwd: 'D:/workspace',
      config: makeConfig(),
      mode: 'standard',
    }, bridge)

    const firstPromise = runtime.submit({
      text: '第一问',
      history: [{ role: 'user', content: '第一问' }],
      loggedUserContent: '第一问',
    })

    await firstStarted

    const concurrentResult = await runtime.submit({
      text: '第二问',
      loggedUserContent: '第二问',
    })

    expect(concurrentResult.error).toMatch(/runtime busy/i)
    expect(concurrentResult.stopReason).toBe('rejected')
    expect(concurrentResult.aborted).toBe(false)
    expect(emitted.some((event) => event.type === 'error')).toBe(true)
    expect(emitted.some((event) => event.type === 'turn_end' && event.payload?.['stopReason'] === 'rejected')).toBe(true)

    releaseFirstRef.current?.()
    await firstPromise
  })

  it('首轮显式 history 提交后，后续 submit 会把当前用户消息追加到同步后的上下文', async () => {
    mocks.agentLoopRun.mockImplementation(async function* (history: Array<{ role: string; content: unknown }>) {
      const lastUserMessage = [...history].reverse().find((message) => message.role === 'user')
      history.push({
        role: 'assistant',
        content: `reply:${String(lastUserMessage?.content ?? '')}`,
      })
      yield { type: 'text', text: 'Hello' }
      yield {
        type: 'llm_done',
        inputTokens: 10,
        outputTokens: 20,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        stopReason: 'end_turn',
        ttftMs: 50,
        e2eMs: 80,
        tps: 25,
      }
      yield { type: 'done', reason: 'complete' }
    })

    const bridge: RuntimeHostBridge = {
      emit: () => {},
      requestPermission: async () => ({ allow: true }),
    }

    const runtime = await createRuntime({
      cwd: 'D:/workspace',
      config: makeConfig(),
      mode: 'standard',
    }, bridge)

    await runtime.submit({
      text: '第一问',
      history: [{ role: 'user', content: '第一问' }],
      loggedUserContent: '第一问',
    })

    await runtime.submit({
      text: '第二问',
      loggedUserContent: '第二问',
    })

    expect(mocks.restoreHistory).toHaveBeenCalledWith([
      { role: 'user', content: '第一问' },
    ])
    expect(mocks.prepareHistory).toHaveBeenCalledTimes(2)
    const secondHistory = mocks.prepareHistory.mock.calls[1]?.[0] as Array<{
      role: string
      content: unknown
    }>
    const secondOptions = mocks.prepareHistory.mock.calls[1]?.[2]

    expect(secondHistory.slice(0, 3)).toEqual([
      { role: 'user', content: '第一问' },
      { role: 'assistant', content: 'reply:第一问' },
      { role: 'user', content: '第二问' },
    ])
    expect(secondOptions).toEqual(expect.objectContaining({
      model: 'claude-sonnet-4-5',
      systemPrompt: 'system prompt\n\nprimary agent prompt',
    }))
  })
})
