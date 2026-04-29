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

  it('bootstrap 子阶段 timing_mark 事件能出现在 summary 中', () => {
    const logger = { info: vi.fn() }
    let tick = 1_000
    const timing = createStudioSubmitTiming({
      enabled: true,
      logger,
      now: () => ++tick,
      clientMarks: {
        rendererRuntimeSubmitInvokedAt: 1_000,
      },
    })

    // 模拟 runtime 发出的 bootstrap 子阶段 timing_mark 事件
    const bootstrapStages = [
      'bootstrap.skills',
      'bootstrap.instructions',
      'bootstrap.hooks',
      'bootstrap.sessionStartHooks',
      'bootstrap.fileIndex',
      'bootstrap.plugins',
      'bootstrap.memory',
      'bootstrap.shellSnapshot',
      'bootstrap.gitContext',
      'bootstrap.systemPrompt',
      'bootstrap.total',
    ]

    // 先发 runtime_bootstrap_start
    timing.markRuntimeEvent({
      type: 'timing_mark',
      timestamp: new Date().toISOString(),
      payload: { stage: 'runtime_bootstrap_start' },
    })

    // 逐个发 bootstrap 子阶段
    for (const stage of bootstrapStages) {
      timing.markRuntimeEvent({
        type: 'timing_mark',
        timestamp: new Date().toISOString(),
        payload: { stage, elapsedMs: 42 },
      })
    }

    // 发 runtime_bootstrap_done
    timing.markRuntimeEvent({
      type: 'timing_mark',
      timestamp: new Date().toISOString(),
      payload: { stage: 'runtime_bootstrap_done' },
    })

    timing.finish('completed')

    expect(logger.info).toHaveBeenCalledTimes(1)
    const output = JSON.stringify(logger.info.mock.calls)

    // 验证 bootstrap 子阶段出现在 summary 中
    expect(output).toContain('bootstrap sub-stages')
    expect(output).toContain('skills')
    expect(output).toContain('instructions')
    expect(output).toContain('hooks')
    expect(output).toContain('fileIndex')
    expect(output).toContain('plugins')
    expect(output).toContain('memory')
    expect(output).toContain('shellSnapshot')
    expect(output).toContain('gitContext')
    expect(output).toContain('systemPrompt')
    expect(output).toContain('total')
  })

  it('bootstrap 子阶段超过阈值时标记为 slow', () => {
    const logger = { info: vi.fn() }
    let tick = 1_000
    const timing = createStudioSubmitTiming({
      enabled: true,
      logger,
      now: () => ++tick,
      clientMarks: {
        rendererRuntimeSubmitInvokedAt: 1_000,
      },
    })

    // fileIndex 超过 500ms 阈值
    timing.markRuntimeEvent({
      type: 'timing_mark',
      timestamp: new Date().toISOString(),
      payload: { stage: 'bootstrap.fileIndex', elapsedMs: 1200 },
    })
    // skills 低于阈值
    timing.markRuntimeEvent({
      type: 'timing_mark',
      timestamp: new Date().toISOString(),
      payload: { stage: 'bootstrap.skills', elapsedMs: 30 },
    })
    // total 不标记 slow（即使超过阈值）
    timing.markRuntimeEvent({
      type: 'timing_mark',
      timestamp: new Date().toISOString(),
      payload: { stage: 'bootstrap.total', elapsedMs: 2000 },
    })

    timing.finish('completed')

    const output = JSON.stringify(logger.info.mock.calls)
    expect(output).toContain('fileIndex: 1.2s ⚠ slow')
    expect(output).toContain('skills: 30ms')
    expect(output).not.toContain('total: 2s ⚠ slow')
    expect(output).toContain('slow stages: fileIndex')
  })

  it('多轮 model_request 按 phase 聚合统计', () => {
    const logger = { info: vi.fn() }
    let tick = 1_000
    const timing = createStudioSubmitTiming({
      enabled: true,
      logger,
      now: () => tick++,
      clientMarks: {
        rendererRuntimeSubmitInvokedAt: 1_000,
      },
    })

    // 第一轮：initial
    timing.markRuntimeEvent({
      type: 'model_request_started',
      timestamp: new Date().toISOString(),
      payload: { phase: 'initial', providerId: 'openai', modelId: 'gpt-4' },
    })
    // 模拟 100ms 后完成
    tick += 100
    timing.markRuntimeEvent({
      type: 'model_request_finished',
      timestamp: new Date().toISOString(),
      payload: { phase: 'initial' },
    })

    // 第二轮：after_tool_result
    timing.markRuntimeEvent({
      type: 'model_request_started',
      timestamp: new Date().toISOString(),
      payload: { phase: 'after_tool_result', providerId: 'openai', modelId: 'gpt-4' },
    })
    tick += 200
    timing.markRuntimeEvent({
      type: 'model_request_finished',
      timestamp: new Date().toISOString(),
      payload: { phase: 'after_tool_result' },
    })

    // 第三轮：after_tool_result（第二次）
    timing.markRuntimeEvent({
      type: 'model_request_started',
      timestamp: new Date().toISOString(),
      payload: { phase: 'after_tool_result', providerId: 'openai', modelId: 'gpt-4' },
    })
    tick += 150
    timing.markRuntimeEvent({
      type: 'model_request_finished',
      timestamp: new Date().toISOString(),
      payload: { phase: 'after_tool_result' },
    })

    timing.finish('completed')

    expect(logger.info).toHaveBeenCalledTimes(1)
    const output = JSON.stringify(logger.info.mock.calls)

    // 验证多轮聚合
    expect(output).toContain('model requests')
    expect(output).toContain('initial: 1x')
    expect(output).toContain('after_tool_result: 2x')
    expect(output).toContain('total rounds: 3')
  })

  it('model_request_failed 也被记录到聚合统计', () => {
    const logger = { info: vi.fn() }
    let tick = 1_000
    const timing = createStudioSubmitTiming({
      enabled: true,
      logger,
      now: () => tick++,
      clientMarks: {
        rendererRuntimeSubmitInvokedAt: 1_000,
      },
    })

    // 第一轮：initial，失败
    timing.markRuntimeEvent({
      type: 'model_request_started',
      timestamp: new Date().toISOString(),
      payload: { phase: 'initial', providerId: 'openai', modelId: 'gpt-4' },
    })
    tick += 50
    timing.markRuntimeEvent({
      type: 'model_request_failed',
      timestamp: new Date().toISOString(),
      payload: { phase: 'initial', message: 'rate limit' },
    })

    // 第二轮：retry，成功
    timing.markRuntimeEvent({
      type: 'model_request_started',
      timestamp: new Date().toISOString(),
      payload: { phase: 'retry', providerId: 'openai', modelId: 'gpt-4' },
    })
    tick += 100
    timing.markRuntimeEvent({
      type: 'model_request_finished',
      timestamp: new Date().toISOString(),
      payload: { phase: 'retry' },
    })

    timing.finish('completed')

    const output = JSON.stringify(logger.info.mock.calls)
    expect(output).toContain('initial: 1x')
    expect(output).toContain('retry: 1x')
    expect(output).toContain('total rounds: 2')
  })

  it('bootstrap 子阶段 timing_mark 不泄漏敏感字段', () => {
    const logger = { info: vi.fn() }
    let tick = 1_000
    const timing = createStudioSubmitTiming({
      enabled: true,
      logger,
      now: () => ++tick,
      clientMarks: {
        rendererRuntimeSubmitInvokedAt: 1_000,
      },
    })

    // 模拟带有敏感字段的 timing_mark
    timing.markRuntimeEvent({
      type: 'timing_mark',
      timestamp: new Date().toISOString(),
      payload: {
        stage: 'bootstrap.skills',
        elapsedMs: 42,
        apiKey: 'sk-secret-key',
        content: '不应该出现的内容',
        authorization: 'Bearer token',
      },
    })

    timing.finish('completed')

    const output = JSON.stringify(logger.info.mock.calls)
    expect(output).not.toContain('sk-secret-key')
    expect(output).not.toContain('不应该出现的内容')
    expect(output).not.toContain('Bearer token')
    // elapsedMs 是安全字段，应该保留
    expect(output).toContain('42')
  })

  it('AgentLoop guard 会进入 timing summary 且只记录脱敏计数', () => {
    const logger = { info: vi.fn() }
    let tick = 1_000
    const timing = createStudioSubmitTiming({
      enabled: true,
      logger,
      now: () => ++tick,
      clientMarks: {
        rendererRuntimeSubmitInvokedAt: 1_000,
      },
    })

    timing.markRuntimeEvent({
      type: 'timing_mark',
      timestamp: new Date().toISOString(),
      payload: {
        stage: 'agent_loop.guard',
        reason: 'budget_exceeded',
        level: 'stopped',
        modelRequestCount: 9,
        afterToolResultCount: 8,
        lowProgressRounds: 5,
        recentTools: 'read_file,grep',
        prompt: 'should-not-leak',
        messages: 'should-not-leak',
      },
    })

    timing.finish('completed')

    const output = JSON.stringify(logger.info.mock.calls)
    expect(output).toContain('agent loop guard')
    expect(output).toContain('stopped/budget_exceeded')
    expect(output).toContain('model requests 9')
    expect(output).toContain('recent tools read_file,grep')
    expect(output).not.toContain('should-not-leak')
  })

  it('单轮 model request 不输出 modelRequestRounds 元数据', () => {
    const logger = { info: vi.fn() }
    let tick = 1_000
    const timing = createStudioSubmitTiming({
      enabled: true,
      logger,
      now: () => tick++,
      clientMarks: {
        rendererRuntimeSubmitInvokedAt: 1_000,
      },
    })

    timing.markRuntimeEvent({
      type: 'model_request_started',
      timestamp: new Date().toISOString(),
      payload: { phase: 'initial' },
    })
    tick += 100
    timing.markRuntimeEvent({
      type: 'model_request_finished',
      timestamp: new Date().toISOString(),
      payload: { phase: 'initial' },
    })

    timing.finish('completed')

    const call = logger.info.mock.calls[0]
    const meta = call?.[1] as Record<string, unknown> | undefined
    // 单轮不输出 modelRequestRounds
    expect(meta?.modelRequestRounds).toBeUndefined()
  })

  it('多轮 model request 输出 modelRequestRounds 元数据', () => {
    const logger = { info: vi.fn() }
    let tick = 1_000
    const timing = createStudioSubmitTiming({
      enabled: true,
      logger,
      now: () => tick++,
      clientMarks: {
        rendererRuntimeSubmitInvokedAt: 1_000,
      },
    })

    // 两轮
    timing.markRuntimeEvent({
      type: 'model_request_started',
      timestamp: new Date().toISOString(),
      payload: { phase: 'initial' },
    })
    tick += 100
    timing.markRuntimeEvent({
      type: 'model_request_finished',
      timestamp: new Date().toISOString(),
      payload: {},
    })
    timing.markRuntimeEvent({
      type: 'model_request_started',
      timestamp: new Date().toISOString(),
      payload: { phase: 'after_tool_result' },
    })
    tick += 100
    timing.markRuntimeEvent({
      type: 'model_request_finished',
      timestamp: new Date().toISOString(),
      payload: {},
    })

    timing.finish('completed')

    const call = logger.info.mock.calls[0]
    const meta = call?.[1] as Record<string, unknown> | undefined
    expect(meta?.modelRequestRounds).toBe(2)
  })
})
