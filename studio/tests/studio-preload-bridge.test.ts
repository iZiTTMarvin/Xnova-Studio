import { describe, expect, it, vi } from 'vitest'
import { createStudioBridgeApi } from '../src/preload/studio-bridge-api'
import { STUDIO_BRIDGE_CHANNELS } from '../src/shared/studio-bridge-contract'

class FakeIpcRenderer {
  readonly invoke = vi.fn(async (channel: string, payload?: unknown) => {
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

    if (channel === STUDIO_BRIDGE_CHANNELS.runtimeInspect) {
      return {
        ok: true,
        status: 'ready',
        snapshot: {
          sessionId: null,
          isRunning: false,
          provider: 'anthropic',
          model: 'claude-sonnet-4-6',
          warnings: [],
        },
        workspacePath: 'D:/workspace/demo',
        configWarnings: [],
        issues: [],
        echoRefresh: payload,
      }
    }

    if (channel === STUDIO_BRIDGE_CHANNELS.shellGetSnapshot) {
      return {
        startup: {
          recentProject: null,
          recentSession: null,
        },
        recentProjects: [],
        projectSessions: [],
        scratchpadEntries: [],
        defaults: {
          projectPath: null,
          branch: null,
          agentId: 'general',
          modelId: 'claude-sonnet-4-6',
          providerId: 'anthropic',
          recommendedMode: null,
          allowedModes: ['standard', 'xforge'],
        },
        issues: [],
        warnings: [],
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

describe('studio preload bridge', () => {
  it('通过 IPC 读取和更新 host state，并支持状态订阅清理', async () => {
    const ipcRenderer = new FakeIpcRenderer()
    const api = createStudioBridgeApi({
      ipcRenderer,
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
    const api = createStudioBridgeApi({
      ipcRenderer,
    })

    await expect(api.runtime.inspect({ refresh: true })).resolves.toEqual({
      ok: true,
      status: 'ready',
      snapshot: {
        sessionId: null,
        isRunning: false,
        provider: 'anthropic',
        model: 'claude-sonnet-4-6',
        warnings: [],
      },
      workspacePath: 'D:/workspace/demo',
      configWarnings: [],
      issues: [],
    })
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(
      STUDIO_BRIDGE_CHANNELS.runtimeInspect,
      { refresh: true },
    )

    await expect(
      (api.runtime.inspect as (payload: unknown) => Promise<unknown>)({
        refresh: 'bad',
      }),
    ).rejects.toThrow('runtime.inspect.refresh 必须是布尔值')

    const listener = vi.fn()
    const unsubscribe = api.runtime.onEvent(listener)
    ipcRenderer.emit(STUDIO_BRIDGE_CHANNELS.runtimeEvent, {
      type: 'warning',
      timestamp: new Date().toISOString(),
      payload: {
        message: 'config warning',
      },
    })
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    ipcRenderer.emit(STUDIO_BRIDGE_CHANNELS.runtimeEvent, {
      type: 'warning',
      timestamp: new Date().toISOString(),
      payload: {
        message: 'ignored',
      },
    })
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('通过 IPC 读取 shell snapshot，并校验请求参数', async () => {
    const ipcRenderer = new FakeIpcRenderer()
    const api = createStudioBridgeApi({
      ipcRenderer,
    })

    await expect(
      api.shell.getSnapshot({
        projectPath: 'D:/workspace/demo',
      }),
    ).resolves.toEqual({
      startup: {
        recentProject: null,
        recentSession: null,
      },
      recentProjects: [],
      projectSessions: [],
      scratchpadEntries: [],
      defaults: {
        projectPath: null,
        branch: null,
        agentId: 'general',
        modelId: 'claude-sonnet-4-6',
        providerId: 'anthropic',
        recommendedMode: null,
        allowedModes: ['standard', 'xforge'],
      },
      issues: [],
      warnings: [],
    })

    expect(ipcRenderer.invoke).toHaveBeenCalledWith(
      STUDIO_BRIDGE_CHANNELS.shellGetSnapshot,
      { projectPath: 'D:/workspace/demo' },
    )

    await expect(
      (api.shell.getSnapshot as (payload: unknown) => Promise<unknown>)({
        projectPath: 123,
      }),
    ).rejects.toThrow('shell.getSnapshot.projectPath 必须是字符串或 null')
  })
})
