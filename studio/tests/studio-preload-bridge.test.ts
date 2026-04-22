import { describe, expect, it, vi } from 'vitest'
import { createStudioBridgeApi } from '../src/preload/studio-bridge-api'
import { STUDIO_BRIDGE_CHANNELS, type RuntimeInspectResult, type StudioHostState, type StudioRuntimeEvent } from '../src/shared/studio-bridge-contract'

class FakeIpcRenderer {
  readonly invoke = vi.fn(async (channel: string) => {
    if (channel === STUDIO_BRIDGE_CHANNELS.hostGetState) {
      return {
        workspacePath: null,
        lastSelection: null,
      }
    }

    if (channel === STUDIO_BRIDGE_CHANNELS.hostOpenWorkspace) {
      return {
        selection: {
          ok: true,
          code: 'selected',
          path: 'D:/workspace/demo',
        },
        state: {
          workspacePath: 'D:/workspace/demo',
          lastSelection: {
            ok: true,
            code: 'selected',
            path: 'D:/workspace/demo',
          },
        },
      }
    }

    throw new Error(`unexpected channel: ${channel}`)
  })

  private readonly listeners = new Map<string, Array<(_event: unknown, payload: unknown) => void>>()

  on(channel: string, listener: (_event: unknown, payload: unknown) => void): this {
    const existing = this.listeners.get(channel) ?? []
    existing.push(listener)
    this.listeners.set(channel, existing)
    return this
  }

  removeListener(channel: string, listener: (_event: unknown, payload: unknown) => void): this {
    const filtered = (this.listeners.get(channel) ?? []).filter((item) => item !== listener)
    this.listeners.set(channel, filtered)
    return this
  }

  emit(channel: string, payload: unknown): void {
    for (const listener of this.listeners.get(channel) ?? []) {
      listener({}, payload)
    }
  }
}

function createRuntimeGateway(result: RuntimeInspectResult) {
  const listeners = new Set<(event: StudioRuntimeEvent) => void>()

  return {
    inspect: vi.fn(async (_request, _state: StudioHostState) => result),
    onEvent(listener: (event: StudioRuntimeEvent) => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    emit(event: StudioRuntimeEvent) {
      for (const listener of listeners) {
        listener(event)
      }
    },
    dispose: vi.fn(async () => {}),
  }
}

describe('studio preload bridge', () => {
  it('通过 IPC 读取和更新 host state，并支持状态订阅清理', async () => {
    const ipcRenderer = new FakeIpcRenderer()
    const runtimeGateway = createRuntimeGateway({
      ok: true,
      snapshot: {
        sessionId: null,
        isRunning: false,
        provider: 'anthropic',
        model: 'claude-sonnet-4-6',
        warnings: [],
      },
      workspacePath: null,
      configWarnings: [],
    })
    const api = createStudioBridgeApi({
      ipcRenderer,
      runtimeGateway,
    })

    await expect(api.host.getState()).resolves.toEqual({
      workspacePath: null,
      lastSelection: null,
    })

    const listener = vi.fn()
    const unsubscribe = api.host.onStateChanged(listener)

    await expect(api.host.openWorkspace()).resolves.toEqual({
      selection: {
        ok: true,
        code: 'selected',
        path: 'D:/workspace/demo',
      },
      state: {
        workspacePath: 'D:/workspace/demo',
        lastSelection: {
          ok: true,
          code: 'selected',
          path: 'D:/workspace/demo',
        },
      },
    })
    expect(listener).toHaveBeenCalledTimes(1)

    ipcRenderer.emit(STUDIO_BRIDGE_CHANNELS.hostStateChanged, {
      workspacePath: 'D:/workspace/changed',
      lastSelection: null,
    })
    expect(listener).toHaveBeenCalledTimes(2)

    unsubscribe()
    ipcRenderer.emit(STUDIO_BRIDGE_CHANNELS.hostStateChanged, {
      workspacePath: 'D:/workspace/ignored',
      lastSelection: null,
    })
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('校验 runtime inspect 参数，并支持 runtime 事件订阅清理', async () => {
    const ipcRenderer = new FakeIpcRenderer()
    const runtimeGateway = createRuntimeGateway({
      ok: true,
      snapshot: {
        sessionId: null,
        isRunning: false,
        provider: 'anthropic',
        model: 'claude-sonnet-4-6',
        warnings: [],
      },
      workspacePath: null,
      configWarnings: [],
    })
    const api = createStudioBridgeApi({
      ipcRenderer,
      runtimeGateway,
    })

    await expect(api.runtime.inspect({ refresh: true })).resolves.toEqual({
      ok: true,
      snapshot: {
        sessionId: null,
        isRunning: false,
        provider: 'anthropic',
        model: 'claude-sonnet-4-6',
        warnings: [],
      },
      workspacePath: null,
      configWarnings: [],
    })

    await expect(
      (api.runtime.inspect as (payload: unknown) => Promise<unknown>)({
        refresh: 'bad',
      }),
    ).rejects.toThrow('runtime.inspect.refresh 必须是布尔值')

    const listener = vi.fn()
    const unsubscribe = api.runtime.onEvent(listener)
    runtimeGateway.emit({
      type: 'warning',
      timestamp: new Date().toISOString(),
      payload: {
        message: 'config warning',
      },
    })
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    runtimeGateway.emit({
      type: 'warning',
      timestamp: new Date().toISOString(),
      payload: {
        message: 'ignored',
      },
    })
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
