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

  const ensureSession = vi.fn(() => 'session-1')
  const logUserMessage = vi.fn()
  const logAssistantMessage = vi.fn()
  const consumeSessionEvent = vi.fn()
  const bindTokenMeter = vi.fn()
  const consumeTokenEvent = vi.fn()

  const prepareHistory = vi.fn(async (history: unknown) => ({ history, compacted: false }))
  const getHistoryRef = vi.fn(() => [])
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
    ensureSession,
    logUserMessage,
    logAssistantMessage,
    consumeSessionEvent,
    bindTokenMeter,
    consumeTokenEvent,
    prepareHistory,
    getHistoryRef,
    contextState,
    getOrCreateProvider,
    agentLoopRun,
    AgentLoopMock,
  }
})

vi.mock('../../core/bootstrap.js', () => ({
  bootstrapAll: mocks.bootstrapAll,
  getRegistry: mocks.getRegistry,
  registerMcpTools: mocks.registerMcpTools,
  getSystemPrompt: mocks.getSystemPrompt,
  ensureMcpInitialized: mocks.ensureMcpInitialized,
  hookManager: { name: 'hook-manager' },
  sessionLogger: {
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

vi.mock('../../providers/registry.js', () => ({
  getOrCreateProvider: mocks.getOrCreateProvider,
}))

vi.mock('../../core/context-manager.js', () => ({
  contextManager: {
    prepare: mocks.prepareHistory,
    getHistoryRef: mocks.getHistoryRef,
  },
}))

vi.mock('../../core/context-tracker.js', () => ({
  contextTracker: {
    getState: () => mocks.contextState,
  },
}))

vi.mock('../../core/agent-loop.js', () => ({
  AgentLoop: mocks.AgentLoopMock,
  isAbortError: (error: unknown) => error instanceof Error && error.name === 'AbortError',
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
    mocks.agentLoopRun.mockImplementation(async function* () {
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

    expect(mocks.bootstrapAll).toHaveBeenCalledTimes(1)
    expect(mocks.ensureSession).toHaveBeenCalledWith('openai', 'gpt-4o')
    expect(mocks.bindTokenMeter).toHaveBeenCalledWith('session-1', 'openai', 'gpt-4o')
    expect(mocks.logUserMessage).toHaveBeenCalledWith('你好')
    expect(mocks.logAssistantMessage).toHaveBeenCalledWith('Hello', 'gpt-4o', 'openai', expect.objectContaining({
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
      expect.objectContaining({ model: 'gpt-4o', systemPrompt: 'system prompt' }),
    )
    expect(mocks.registerMcpTools).toHaveBeenCalledWith(mocks.getRegistry.mock.results[0]!.value)
    expect(mocks.AgentLoopMock).toHaveBeenCalledTimes(1)
    expect(result).toEqual(expect.objectContaining({
      text: 'Hello',
      thinking: '',
      stopReason: 'end_turn',
      llmCallCount: 1,
      toolCallCount: 1,
      aborted: false,
      sessionId: 'session-1',
    }))
    expect(emitted.map(event => event.type)).toEqual(['text_delta', 'tool_start', 'tool_end', 'context_update', 'turn_end'])
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
})
