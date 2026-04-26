import { describe, expect, it, vi } from 'vitest'
import {
  createStudioSubmitTiming,
  isStudioSubmitTimingEnabled,
} from '../src/main/studio-submit-timing'

describe('studio submit timing', () => {
  it('输出 submit timing summary，且不会包含 API Key 或 Authorization', () => {
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }
    const timing = createStudioSubmitTiming({
      enabled: true,
      logger,
      now: vi
        .fn()
        .mockReturnValueOnce(1_000)
        .mockReturnValueOnce(1_008)
        .mockReturnValueOnce(1_020)
        .mockReturnValueOnce(1_140)
        .mockReturnValueOnce(1_200)
        .mockReturnValueOnce(1_990)
        .mockReturnValueOnce(8_800)
        .mockReturnValueOnce(9_100),
      clientMarks: {
        userSubmitClickedAt: 990,
        rendererRuntimeSubmitInvokedAt: 1_000,
      },
    })

    timing.mark('ipc_runtime_submit_received', {
      Authorization: 'Bearer sk-sensitive-token',
      apiKey: 'sk-sensitive-api-key',
      prompt: '请完整打印这个 prompt',
    })
    timing.mark('runtime_service_submit_start')
    timing.mark('runtime_acquire_start')
    timing.mark('runtime_acquire_done')
    timing.mark('context_build_start')
    timing.mark('context_build_done')
    timing.mark('model_first_chunk', {
      providerId: 'minimax',
      modelId: 'MiniMax-M2.7',
      headers: {
        Authorization: 'Bearer nested-secret',
      },
    })
    timing.mark('text_delta', {
      content: '完整模型输出不应该进入 timing summary',
    })
    timing.finish('completed')

    expect(logger.info).toHaveBeenCalledTimes(1)
    const serializedLog = JSON.stringify(logger.info.mock.calls)
    expect(serializedLog).toContain('Submit timing')
    expect(serializedLog).toContain('renderer submit -> main received')
    expect(serializedLog).toContain('context build')
    expect(serializedLog).not.toContain('sk-sensitive')
    expect(serializedLog).not.toContain('Authorization')
    expect(serializedLog).not.toContain('apiKey')
    expect(serializedLog).not.toContain('完整模型输出')
    expect(serializedLog).not.toContain('prompt')
  })

  it('默认只在开发模式或 XNOVA_TIMING_DEBUG=1 时打开', () => {
    expect(isStudioSubmitTimingEnabled({ NODE_ENV: 'test' })).toBe(false)
    expect(isStudioSubmitTimingEnabled({ NODE_ENV: 'development' })).toBe(true)
    expect(isStudioSubmitTimingEnabled({ XNOVA_TIMING_DEBUG: '1' })).toBe(true)
  })
})
