/**
 * Warmup UI Bridge Contract 测试
 *
 * 覆盖范围：
 * 1. preload 校验：合法/非法 status、error 截断、敏感字段拒绝
 * 2. preload bridge：warmup 事件订阅与分发
 * 3. main IPC：workspace 变更后触发 warmup 广播
 * 4. shared contract：类型和常量正确性
 */

import { describe, expect, it, vi } from 'vitest'
import {
  parseStudioWarmupPrepareRequest,
  parseStudioWarmupPrepareResult,
  parseStudioWarmupStatusChangedEvent,
  StudioBridgeValidationError,
} from '../src/preload/studio-validators'
import { createStudioBridgeApi } from '../src/preload/studio-bridge-api'
import {
  STUDIO_BRIDGE_CHANNELS,
  VALID_WARMUP_STATUSES,
  WARMUP_STATUS_LABELS,
  type RuntimeWarmupStatus,
} from '../src/shared/studio-bridge-contract'

// ═══ Preload 校验测试 ═══

describe('parseStudioWarmupStatusChangedEvent', () => {
  it('合法 warming 事件通过校验', () => {
    const result = parseStudioWarmupStatusChangedEvent({
      status: 'warming',
    })
    expect(result).toEqual({ status: 'warming' })
  })

  it('合法 ready 事件带 durationMs 通过校验', () => {
    const result = parseStudioWarmupStatusChangedEvent({
      status: 'ready',
      durationMs: 1234,
    })
    expect(result).toEqual({ status: 'ready', durationMs: 1234 })
  })

  it('合法事件可携带 selectionKey 供 renderer 过滤当前选择', () => {
    const result = parseStudioWarmupStatusChangedEvent({
      status: 'ready',
      selectionKey: 'selection-1',
      durationMs: 1234,
    })
    expect(result).toEqual({
      status: 'ready',
      selectionKey: 'selection-1',
      durationMs: 1234,
    })
  })

  it('合法 failed 事件带 error 通过校验', () => {
    const result = parseStudioWarmupStatusChangedEvent({
      status: 'failed',
      error: 'bootstrap timeout',
    })
    expect(result).toEqual({ status: 'failed', error: 'bootstrap timeout' })
  })

  it('合法 stale 事件通过校验', () => {
    const result = parseStudioWarmupStatusChangedEvent({
      status: 'stale',
      durationMs: 0,
    })
    expect(result).toEqual({ status: 'stale', durationMs: 0 })
  })

  it('合法 idle 事件通过校验', () => {
    const result = parseStudioWarmupStatusChangedEvent({
      status: 'idle',
    })
    expect(result).toEqual({ status: 'idle' })
  })

  it('所有合法 status 值都能通过校验', () => {
    for (const status of VALID_WARMUP_STATUSES) {
      const result = parseStudioWarmupStatusChangedEvent({ status })
      expect(result.status).toBe(status)
    }
  })

  // ── 非法 status ──

  it('非法 status 被拒绝', () => {
    expect(() =>
      parseStudioWarmupStatusChangedEvent({ status: 'unknown' }),
    ).toThrow(StudioBridgeValidationError)
  })

  it('空字符串 status 被拒绝', () => {
    expect(() =>
      parseStudioWarmupStatusChangedEvent({ status: '' }),
    ).toThrow(StudioBridgeValidationError)
  })

  it('数字 status 被拒绝', () => {
    expect(() =>
      parseStudioWarmupStatusChangedEvent({ status: 42 }),
    ).toThrow(StudioBridgeValidationError)
  })

  it('缺少 status 被拒绝', () => {
    expect(() =>
      parseStudioWarmupStatusChangedEvent({}),
    ).toThrow(StudioBridgeValidationError)
  })

  it('非对象 payload 被拒绝', () => {
    expect(() =>
      parseStudioWarmupStatusChangedEvent('warming'),
    ).toThrow(StudioBridgeValidationError)
  })

  // ── error 截断 ──

  it('error 超过 500 字符被截断', () => {
    const longError = 'x'.repeat(600)
    const result = parseStudioWarmupStatusChangedEvent({
      status: 'failed',
      error: longError,
    })
    expect(result.error).toHaveLength(500)
  })

  it('error 为非字符串被拒绝', () => {
    expect(() =>
      parseStudioWarmupStatusChangedEvent({
        status: 'failed',
        error: { stack: 'Error at ...' },
      }),
    ).toThrow(StudioBridgeValidationError)
  })

  // ── durationMs 校验 ──

  it('负数 durationMs 被拒绝', () => {
    expect(() =>
      parseStudioWarmupStatusChangedEvent({
        status: 'ready',
        durationMs: -1,
      }),
    ).toThrow(StudioBridgeValidationError)
  })

  it('NaN durationMs 被拒绝', () => {
    expect(() =>
      parseStudioWarmupStatusChangedEvent({
        status: 'ready',
        durationMs: NaN,
      }),
    ).toThrow(StudioBridgeValidationError)
  })

  // ── 敏感字段拒绝 ──

  it('包含 cwd 字段被拒绝', () => {
    expect(() =>
      parseStudioWarmupStatusChangedEvent({
        status: 'warming',
        cwd: 'D:/workspace/project',
      }),
    ).toThrow(StudioBridgeValidationError)
  })

  it('包含 cacheKey 字段被拒绝', () => {
    expect(() =>
      parseStudioWarmupStatusChangedEvent({
        status: 'warming',
        cacheKey: 'warmup::D:/workspace::...',
      }),
    ).toThrow(StudioBridgeValidationError)
  })

  it('包含 systemPrompt 字段被拒绝', () => {
    expect(() =>
      parseStudioWarmupStatusChangedEvent({
        status: 'ready',
        systemPrompt: 'You are an AI assistant...',
      }),
    ).toThrow(StudioBridgeValidationError)
  })

  it('包含 toolDefinitions 字段被拒绝', () => {
    expect(() =>
      parseStudioWarmupStatusChangedEvent({
        status: 'ready',
        toolDefinitions: [{ name: 'write_file' }],
      }),
    ).toThrow(StudioBridgeValidationError)
  })

  it('包含 toolRegistry 字段被拒绝', () => {
    expect(() =>
      parseStudioWarmupStatusChangedEvent({
        status: 'ready',
        toolRegistry: {},
      }),
    ).toThrow(StudioBridgeValidationError)
  })

  it('包含 apiKey 字段被拒绝', () => {
    expect(() =>
      parseStudioWarmupStatusChangedEvent({
        status: 'ready',
        apiKey: 'sk-xxx',
      }),
    ).toThrow(StudioBridgeValidationError)
  })

  it('包含 config 字段被拒绝', () => {
    expect(() =>
      parseStudioWarmupStatusChangedEvent({
        status: 'ready',
        config: { provider: 'anthropic' },
      }),
    ).toThrow(StudioBridgeValidationError)
  })

  it('包含 workspaceRoot 字段被拒绝', () => {
    expect(() =>
      parseStudioWarmupStatusChangedEvent({
        status: 'ready',
        workspaceRoot: 'D:/workspace',
      }),
    ).toThrow(StudioBridgeValidationError)
  })
})

// ═══ Shared Contract 常量测试 ═══

describe('warmup shared contract', () => {
  it('VALID_WARMUP_STATUSES 包含所有合法状态', () => {
    const expected: RuntimeWarmupStatus[] = ['idle', 'warming', 'ready', 'stale', 'failed']
    for (const status of expected) {
      expect(VALID_WARMUP_STATUSES.has(status)).toBe(true)
    }
    expect(VALID_WARMUP_STATUSES.size).toBe(5)
  })

  it('WARMUP_STATUS_LABELS 为每个非 idle 状态提供文案', () => {
    expect(WARMUP_STATUS_LABELS.warming).toBe('正在准备运行时...')
    expect(WARMUP_STATUS_LABELS.ready).toBe('运行时已就绪')
    expect(WARMUP_STATUS_LABELS.stale).toBe('运行时配置变化，正在重新准备...')
    expect(WARMUP_STATUS_LABELS.failed).toBe('运行时准备失败，将在提交时重试')
    expect(WARMUP_STATUS_LABELS.idle).toBe('')
  })

  it('warmup channel 存在于 STUDIO_BRIDGE_CHANNELS', () => {
    expect(STUDIO_BRIDGE_CHANNELS.runtimeWarmupStatusChanged).toBe(
      'studio:runtime:warmup-status-changed',
    )
  })

  it('warmup prepare channel 存在于 STUDIO_BRIDGE_CHANNELS', () => {
    expect(STUDIO_BRIDGE_CHANNELS.runtimeWarmupPrepare).toBe(
      'studio:runtime:warmup-prepare',
    )
  })
})

describe('warmup prepare preload validators', () => {
  it('合法当前选择 prepare 请求通过校验', () => {
    expect(
      parseStudioWarmupPrepareRequest({
        projectPath: 'D:/workspace/demo',
        agentId: 'general',
        providerId: 'minimax',
        modelId: 'MiniMax-M2.7',
        mode: 'standard',
      }),
    ).toEqual({
      projectPath: 'D:/workspace/demo',
      agentId: 'general',
      providerId: 'minimax',
      modelId: 'MiniMax-M2.7',
      mode: 'standard',
    })
  })

  it('prepare 请求不允许空 projectPath', () => {
    expect(() =>
      parseStudioWarmupPrepareRequest({
        projectPath: '   ',
      }),
    ).toThrow(StudioBridgeValidationError)
  })

  it('prepare 请求拒绝未知字段，避免敏感配置穿透', () => {
    expect(() =>
      parseStudioWarmupPrepareRequest({
        projectPath: 'D:/workspace/demo',
        apiKey: 'sk-test',
      }),
    ).toThrow(StudioBridgeValidationError)
  })

  it('合法 prepare 结果通过校验', () => {
    expect(
      parseStudioWarmupPrepareResult({
        ok: true,
        status: 'warming',
        selectionKey: 'selection-1',
      }),
    ).toEqual({
      ok: true,
      status: 'warming',
      selectionKey: 'selection-1',
    })
  })
})

// ═══ Preload Bridge 订阅测试 ═══

describe('preload bridge warmup subscription', () => {
  class FakeIpcRenderer {
    private listeners = new Map<string, Array<(_event: unknown, payload: unknown) => void>>()
    readonly invoke = vi.fn(async (channel: string, _payload?: unknown) => {
      if (channel === STUDIO_BRIDGE_CHANNELS.hostGetState) {
        return { workspacePath: null, lastSelection: null }
      }
      if (channel === STUDIO_BRIDGE_CHANNELS.runtimeWarmupPrepare) {
        return {
          ok: true,
          status: 'warming',
          selectionKey: 'selection-1',
        }
      }
      return {}
    })

    on(channel: string, listener: (_event: unknown, payload: unknown) => void) {
      const list = this.listeners.get(channel) ?? []
      list.push(listener)
      this.listeners.set(channel, list)
      return this
    }

    removeListener(channel: string, listener: (_event: unknown, payload: unknown) => void) {
      const list = this.listeners.get(channel) ?? []
      const index = list.indexOf(listener)
      if (index >= 0) list.splice(index, 1)
      return this
    }

    /** 模拟 main 发送事件 */
    emit(channel: string, payload: unknown) {
      const list = this.listeners.get(channel) ?? []
      for (const listener of list) {
        listener({}, payload)
      }
    }
  }

  it('合法 warmup 事件能到达 renderer listener', () => {
    const ipcRenderer = new FakeIpcRenderer()
    const api = createStudioBridgeApi({ ipcRenderer })
    const received: unknown[] = []

    api.warmup.onStatusChanged((event) => {
      received.push(event)
    })

    ipcRenderer.emit(STUDIO_BRIDGE_CHANNELS.runtimeWarmupStatusChanged, {
      status: 'warming',
    })

    expect(received).toEqual([{ status: 'warming' }])
  })

  it('warmup.prepare 会通过 IPC 请求当前选择并解析结果', async () => {
    const ipcRenderer = new FakeIpcRenderer()
    const api = createStudioBridgeApi({ ipcRenderer })

    await expect(
      api.warmup.prepare({
        projectPath: 'D:/workspace/demo',
        agentId: 'general',
        providerId: 'minimax',
        modelId: 'MiniMax-M2.7',
        mode: 'standard',
      }),
    ).resolves.toEqual({
      ok: true,
      status: 'warming',
      selectionKey: 'selection-1',
    })

    expect(ipcRenderer.invoke).toHaveBeenCalledWith(
      STUDIO_BRIDGE_CHANNELS.runtimeWarmupPrepare,
      {
        projectPath: 'D:/workspace/demo',
        agentId: 'general',
        providerId: 'minimax',
        modelId: 'MiniMax-M2.7',
        mode: 'standard',
      },
    )
  })

  it('非法 warmup 事件被静默丢弃', () => {
    const ipcRenderer = new FakeIpcRenderer()
    const api = createStudioBridgeApi({ ipcRenderer })
    const received: unknown[] = []

    api.warmup.onStatusChanged((event) => {
      received.push(event)
    })

    // 非法 status
    ipcRenderer.emit(STUDIO_BRIDGE_CHANNELS.runtimeWarmupStatusChanged, {
      status: 'invalid-status',
    })

    expect(received).toEqual([])
  })

  it('包含敏感字段的 warmup 事件被静默丢弃', () => {
    const ipcRenderer = new FakeIpcRenderer()
    const api = createStudioBridgeApi({ ipcRenderer })
    const received: unknown[] = []

    api.warmup.onStatusChanged((event) => {
      received.push(event)
    })

    ipcRenderer.emit(STUDIO_BRIDGE_CHANNELS.runtimeWarmupStatusChanged, {
      status: 'ready',
      cwd: 'D:/workspace/secret',
    })

    expect(received).toEqual([])
  })

  it('取消订阅后不再收到事件', () => {
    const ipcRenderer = new FakeIpcRenderer()
    const api = createStudioBridgeApi({ ipcRenderer })
    const received: unknown[] = []

    const unsubscribe = api.warmup.onStatusChanged((event) => {
      received.push(event)
    })

    ipcRenderer.emit(STUDIO_BRIDGE_CHANNELS.runtimeWarmupStatusChanged, {
      status: 'warming',
    })
    expect(received).toHaveLength(1)

    unsubscribe()

    ipcRenderer.emit(STUDIO_BRIDGE_CHANNELS.runtimeWarmupStatusChanged, {
      status: 'ready',
    })
    expect(received).toHaveLength(1)
  })

  it('多个 listener 都能收到事件', () => {
    const ipcRenderer = new FakeIpcRenderer()
    const api = createStudioBridgeApi({ ipcRenderer })
    const received1: unknown[] = []
    const received2: unknown[] = []

    api.warmup.onStatusChanged((event) => received1.push(event))
    api.warmup.onStatusChanged((event) => received2.push(event))

    ipcRenderer.emit(STUDIO_BRIDGE_CHANNELS.runtimeWarmupStatusChanged, {
      status: 'ready',
      durationMs: 500,
    })

    expect(received1).toEqual([{ status: 'ready', durationMs: 500 }])
    expect(received2).toEqual([{ status: 'ready', durationMs: 500 }])
  })
})
