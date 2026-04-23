/**
 * PipeRunner 回归测试
 *
 * 目标：Pipe Mode 必须通过 runtime 门面执行，不能再直接 new AgentLoop。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runPipe } from '../pipe-runner.js'

const mocks = vi.hoisted(() => ({
  createRuntime: vi.fn(),
  closeDb: vi.fn(),
}))

vi.mock('../../runtime/index.js', () => ({
  createRuntime: mocks.createRuntime,
  makeEvent: vi.fn(),
}))

// Phase 2 fix-A：pipe-runner 主链路改走 `loadEffectiveRuntimeConfig`（resolver），
// mock 点必须跟着变，否则 ConfigManager 会去读真实 HOME 目录。
vi.mock('../../config/resolver.js', () => ({
  loadEffectiveRuntimeConfig: () => ({
    defaultProvider: 'anthropic',
    defaultModel: 'claude-sonnet-4-5',
    providers: {},
  }),
}))

vi.mock('../../persistence/db.js', () => ({
  closeDb: mocks.closeDb,
}))

describe('runPipe() — runtime 路径', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('通过 createRuntime() 执行单次提问，并把流式文本写到 stdout', async () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)

    mocks.createRuntime.mockImplementation(async (_input, bridge) => ({
      submit: async () => {
        bridge.emit({
          type: 'text_delta',
          timestamp: new Date().toISOString(),
          sessionId: 'session-1',
          payload: { text: 'pipe response' },
        })
        return {
          text: 'pipe response',
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
          sessionId: 'session-1',
        }
      },
      abort: vi.fn(),
      dispose: vi.fn(),
      getSnapshot: vi.fn(() => ({
        sessionId: 'session-1',
        isRunning: false,
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
        warnings: [],
      })),
    }))

    await runPipe({
      prompt: '分析这个错误',
      provider: 'openai',
      model: 'gpt-4o',
    })

    expect(mocks.createRuntime).toHaveBeenCalledTimes(1)
    expect(stdoutSpy).toHaveBeenCalledWith('pipe response')
    expect(mocks.closeDb).toHaveBeenCalledTimes(1)
    expect(exitSpy).toHaveBeenCalledWith(0)

    stdoutSpy.mockRestore()
    exitSpy.mockRestore()
  })
})
