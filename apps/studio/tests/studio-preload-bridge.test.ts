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

    if (channel === STUDIO_BRIDGE_CHANNELS.runtimeSubmit) {
      return {
        ok: true,
        sessionId: 'session-2',
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

    if (channel === STUDIO_BRIDGE_CHANNELS.permissionRespond) {
      return {
        ok: true,
      }
    }

    if (channel === STUDIO_BRIDGE_CHANNELS.userInputRespond) {
      return {
        ok: true,
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

  it('通过 IPC 提交 runtime prompt，并校验 submit 参数', async () => {
    const ipcRenderer = new FakeIpcRenderer()
    const api = createStudioBridgeApi({
      ipcRenderer,
    })

    await expect(
      api.runtime.submit({
        text: '  分析当前项目  ',
        projectPath: 'D:/workspace/demo',
        agentId: 'general',
        modelId: 'claude-sonnet-4-6',
      }),
    ).resolves.toEqual({
      ok: true,
      sessionId: 'session-2',
    })

    expect(ipcRenderer.invoke).toHaveBeenCalledWith(
      STUDIO_BRIDGE_CHANNELS.runtimeSubmit,
      {
        text: '分析当前项目',
        projectPath: 'D:/workspace/demo',
        agentId: 'general',
        modelId: 'claude-sonnet-4-6',
      },
    )

    await expect(
      (api.runtime.submit as (payload: unknown) => Promise<unknown>)({
        text: '   ',
      }),
    ).rejects.toThrow('runtime.submit.text 不能为空')
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

  it('订阅权限请求并通过 IPC 回传用户决策', async () => {
    const ipcRenderer = new FakeIpcRenderer()
    const api = createStudioBridgeApi({
      ipcRenderer,
    })

    const listener = vi.fn()
    const unsubscribe = api.permission.onRequest(listener)
    ipcRenderer.emit(STUDIO_BRIDGE_CHANNELS.permissionRequest, {
      requestId: 'permission-1',
      toolName: 'bash',
      args: {
        command: 'pnpm test',
      },
      description: 'bash 将执行命令: pnpm test',
    })

    expect(listener).toHaveBeenCalledWith({
      requestId: 'permission-1',
      toolName: 'bash',
      args: {
        command: 'pnpm test',
      },
      description: 'bash 将执行命令: pnpm test',
    })

    await expect(
      api.permission.respond({
        requestId: 'permission-1',
        allow: true,
        remember: true,
      }),
    ).resolves.toBeUndefined()
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(
      STUDIO_BRIDGE_CHANNELS.permissionRespond,
      {
        requestId: 'permission-1',
        allow: true,
        remember: true,
      },
    )

    unsubscribe()
    ipcRenderer.emit(STUDIO_BRIDGE_CHANNELS.permissionRequest, {
      requestId: 'permission-2',
      toolName: 'bash',
      args: {
        command: 'pnpm typecheck',
      },
      description: 'bash 将执行命令: pnpm typecheck',
    })
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('权限桥接会拒绝非法请求与响应', async () => {
    const ipcRenderer = new FakeIpcRenderer()
    const api = createStudioBridgeApi({
      ipcRenderer,
    })

    const listener = vi.fn()
    api.permission.onRequest(listener)

    expect(() => {
      ipcRenderer.emit(STUDIO_BRIDGE_CHANNELS.permissionRequest, {
        requestId: 'permission-1',
        toolName: 'bash',
        args: [],
        description: 'bad',
      })
    }).toThrow('permission.request.args 必须是对象')
    expect(listener).not.toHaveBeenCalled()

    await expect(
      (api.permission.respond as (payload: unknown) => Promise<void>)({
        requestId: 'permission-1',
        allow: true,
      }),
    ).rejects.toThrow('permission.respond.remember 必须是布尔值')
  })

  it('订阅用户问题请求并通过 IPC 回传回答', async () => {
    const ipcRenderer = new FakeIpcRenderer()
    const api = createStudioBridgeApi({
      ipcRenderer,
    })

    const listener = vi.fn()
    const unsubscribe = api.userInput.onRequest(listener)
    ipcRenderer.emit(STUDIO_BRIDGE_CHANNELS.userInputRequest, {
      requestId: 'question-1',
      sessionId: 'session-1',
      questions: [
        {
          key: 'focus',
          title: '本次优先修哪一层？',
          type: 'select',
          options: [
            { label: 'renderer' },
            { label: 'main', description: '处理主进程链路' },
          ],
        },
        {
          key: 'tasks',
          title: '还要补哪些内容？',
          type: 'multiselect',
          options: [
            { label: 'dialog' },
            { label: 'ipc' },
          ],
        },
      ],
    })

    expect(listener).toHaveBeenCalledWith({
      requestId: 'question-1',
      sessionId: 'session-1',
      questions: [
        {
          key: 'focus',
          title: '本次优先修哪一层？',
          type: 'select',
          options: [
            { label: 'renderer' },
            { label: 'main', description: '处理主进程链路' },
          ],
        },
        {
          key: 'tasks',
          title: '还要补哪些内容？',
          type: 'multiselect',
          options: [
            { label: 'dialog' },
            { label: 'ipc' },
          ],
        },
      ],
    })

    await expect(
      api.userInput.respond({
        requestId: 'question-1',
        cancelled: false,
        answers: {
          focus: 'renderer',
          tasks: ['dialog', 'ipc'],
        },
      }),
    ).resolves.toBeUndefined()
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(
      STUDIO_BRIDGE_CHANNELS.userInputRespond,
      {
        requestId: 'question-1',
        cancelled: false,
        answers: {
          focus: 'renderer',
          tasks: ['dialog', 'ipc'],
        },
      },
    )

    unsubscribe()
    ipcRenderer.emit(STUDIO_BRIDGE_CHANNELS.userInputRequest, {
      requestId: 'question-2',
      sessionId: 'session-1',
      questions: [
        {
          key: 'details',
          title: '补充说明',
          type: 'text',
        },
      ],
    })
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('用户问题桥接会拒绝非法请求与响应', async () => {
    const ipcRenderer = new FakeIpcRenderer()
    const api = createStudioBridgeApi({
      ipcRenderer,
    })

    const listener = vi.fn()
    api.userInput.onRequest(listener)

    expect(() => {
      ipcRenderer.emit(STUDIO_BRIDGE_CHANNELS.userInputRequest, {
        requestId: 'question-1',
        sessionId: 'session-1',
        questions: [
          {
            key: 'focus',
            title: '本次优先修哪一层？',
            type: 'select',
            options: [],
          },
        ],
      })
    }).toThrow('userInput.request.questions[0].options 不能为空')
    expect(listener).not.toHaveBeenCalled()

    await expect(
      (api.userInput.respond as (payload: unknown) => Promise<void>)({
        requestId: 'question-1',
        cancelled: false,
        answers: {
          focus: [1],
        },
      }),
    ).rejects.toThrow('userInput.respond.answers.focus[0] 必须是字符串')
  })
})
