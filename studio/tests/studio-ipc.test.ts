import { describe, expect, it, vi } from 'vitest'
import { registerStudioMainIpcHandlers } from '../src/main/studio-ipc'
import {
  STUDIO_BRIDGE_CHANNELS,
  type StudioShellSnapshot,
  type WorkspaceSelectionResult,
} from '../src/shared/studio-bridge-contract'

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })

  return {
    promise,
    resolve,
    reject,
  }
}

function createLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }
}

function createShellSnapshot(): StudioShellSnapshot {
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

describe('studio main ipc handlers', () => {
  it('host.getState 返回初始 host state，且不接受参数', async () => {
    const handlers = new Map<string, (_event: unknown, payload: unknown) => unknown>()

    registerStudioMainIpcHandlers({
      ipcMainLike: {
        handle(channel, handler) {
          handlers.set(channel, handler)
        },
      },
      selectWorkspaceDirectory: vi.fn(async () => ({
        ok: false as const,
        code: 'cancelled' as const,
        message: '用户取消了 workspace 目录选择',
      })),
      mainWindowManager: {
        getMainWindow: () => null,
      },
      inspectRuntime: vi.fn(),
      inspectShell: vi.fn(async () => createShellSnapshot()),
      logger: createLogger(),
    })

    const getStateHandler = handlers.get(STUDIO_BRIDGE_CHANNELS.hostGetState)
    await expect(
      Promise.resolve(getStateHandler?.({}, undefined)),
    ).resolves.toEqual({
      workspacePath: null,
      lastSelection: null,
    })
  })

  it('host.openWorkspace 更新 state 并广播给主窗口', async () => {
    const handlers = new Map<string, (_event: unknown, payload: unknown) => unknown>()
    const send = vi.fn()
    const logger = createLogger()
    const selection: WorkspaceSelectionResult = {
      ok: true,
      code: 'selected',
      path: 'D:/workspace/demo',
    }

    registerStudioMainIpcHandlers({
      ipcMainLike: {
        handle(channel, handler) {
          handlers.set(channel, handler)
        },
      },
      selectWorkspaceDirectory: vi.fn(async () => selection),
      mainWindowManager: {
        getMainWindow: () => ({
          webContents: {
            send,
          },
        }),
      },
      inspectRuntime: vi.fn(),
      inspectShell: vi.fn(async () => createShellSnapshot()),
      logger,
    })

    const openWorkspaceHandler = handlers.get(STUDIO_BRIDGE_CHANNELS.hostOpenWorkspace)
    await expect(
      Promise.resolve(openWorkspaceHandler?.({}, undefined)),
    ).resolves.toEqual({
      selection,
      state: {
        workspacePath: 'D:/workspace/demo',
        lastSelection: selection,
      },
    })
    expect(send).toHaveBeenCalledWith(
      STUDIO_BRIDGE_CHANNELS.hostStateChanged,
      {
        workspacePath: 'D:/workspace/demo',
        lastSelection: selection,
      },
    )
  })

  it('runtime.inspect 通过 main process 委托 shared runtime，并广播 runtime 事件', async () => {
    const handlers = new Map<string, (_event: unknown, payload: unknown) => unknown>()
    const send = vi.fn()
    const inspectRuntime = vi.fn(async (_request, state) => ({
      ok: true as const,
      status: 'ready' as const,
      snapshot: {
        sessionId: null,
        isRunning: false,
        provider: 'anthropic',
        model: 'claude-sonnet-4-6',
        warnings: [],
      },
      workspacePath: state.workspacePath,
      configWarnings: ['legacy migration failed'],
      issues: [],
    }))

    registerStudioMainIpcHandlers({
      ipcMainLike: {
        handle(channel, handler) {
          handlers.set(channel, handler)
        },
      },
      selectWorkspaceDirectory: vi.fn(async () => ({
        ok: true as const,
        code: 'selected' as const,
        path: 'D:/workspace/demo',
      })),
      mainWindowManager: {
        getMainWindow: () => ({
          webContents: {
            send,
          },
        }),
      },
      inspectRuntime,
      inspectShell: vi.fn(async () => createShellSnapshot()),
      logger: createLogger(),
    })

    const openWorkspaceHandler = handlers.get(STUDIO_BRIDGE_CHANNELS.hostOpenWorkspace)
    await Promise.resolve(openWorkspaceHandler?.({}, undefined))

    const runtimeInspectHandler = handlers.get(STUDIO_BRIDGE_CHANNELS.runtimeInspect)
    await expect(
      Promise.resolve(runtimeInspectHandler?.({}, { refresh: true })),
    ).resolves.toEqual({
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
      configWarnings: ['legacy migration failed'],
      issues: [],
    })
    expect(inspectRuntime).toHaveBeenCalledWith(
      { refresh: true },
      {
        workspacePath: 'D:/workspace/demo',
        lastSelection: {
          ok: true,
          code: 'selected',
          path: 'D:/workspace/demo',
        },
      },
    )
    expect(send).toHaveBeenCalledWith(
      STUDIO_BRIDGE_CHANNELS.runtimeEvent,
      expect.objectContaining({
        type: 'runtime.snapshot',
      }),
    )
  })

  it('openWorkspace 会串行处理，避免并发对话框竞争共享 host state', async () => {
    const handlers = new Map<string, (_event: unknown, payload: unknown) => unknown>()
    const firstSelection = createDeferred<WorkspaceSelectionResult>()
    const secondSelection = createDeferred<WorkspaceSelectionResult>()
    const selectWorkspaceDirectory = vi
      .fn<() => Promise<WorkspaceSelectionResult>>()
      .mockImplementationOnce(() => firstSelection.promise)
      .mockImplementationOnce(() => secondSelection.promise)

    registerStudioMainIpcHandlers({
      ipcMainLike: {
        handle(channel, handler) {
          handlers.set(channel, handler)
        },
      },
      selectWorkspaceDirectory,
      mainWindowManager: {
        getMainWindow: () => null,
      },
      inspectRuntime: vi.fn(),
      inspectShell: vi.fn(async () => createShellSnapshot()),
      logger: createLogger(),
    })

    const openWorkspaceHandler = handlers.get(STUDIO_BRIDGE_CHANNELS.hostOpenWorkspace)
    const firstCall = Promise.resolve(openWorkspaceHandler?.({}, undefined))
    const secondCall = Promise.resolve(openWorkspaceHandler?.({}, undefined))

    await Promise.resolve()
    expect(selectWorkspaceDirectory).toHaveBeenCalledTimes(1)

    firstSelection.resolve({
      ok: true,
      code: 'selected',
      path: 'D:/workspace/first',
    })

    await firstCall
    await Promise.resolve()
    expect(selectWorkspaceDirectory).toHaveBeenCalledTimes(2)

    secondSelection.resolve({
      ok: true,
      code: 'selected',
      path: 'D:/workspace/second',
    })

    await expect(firstCall).resolves.toEqual({
      selection: {
        ok: true,
        code: 'selected',
        path: 'D:/workspace/first',
      },
      state: {
        workspacePath: 'D:/workspace/first',
        lastSelection: {
          ok: true,
          code: 'selected',
          path: 'D:/workspace/first',
        },
      },
    })

    await expect(secondCall).resolves.toEqual({
      selection: {
        ok: true,
        code: 'selected',
        path: 'D:/workspace/second',
      },
      state: {
        workspacePath: 'D:/workspace/second',
        lastSelection: {
          ok: true,
          code: 'selected',
          path: 'D:/workspace/second',
        },
      },
    })
  })

  it('shell.getSnapshot 通过 main process 委托 project-aware inspector', async () => {
    const handlers = new Map<string, (_event: unknown, payload: unknown) => unknown>()
    const inspectShell = vi.fn(async (_request, state) => ({
      ...createShellSnapshot(),
      defaults: {
        ...createShellSnapshot().defaults,
        projectPath: state.workspacePath,
      },
    }))

    registerStudioMainIpcHandlers({
      ipcMainLike: {
        handle(channel, handler) {
          handlers.set(channel, handler)
        },
      },
      selectWorkspaceDirectory: vi.fn(async () => ({
        ok: true as const,
        code: 'selected' as const,
        path: 'D:/workspace/demo',
      })),
      mainWindowManager: {
        getMainWindow: () => null,
      },
      inspectRuntime: vi.fn(),
      inspectShell,
      logger: createLogger(),
    })

    const openWorkspaceHandler = handlers.get(STUDIO_BRIDGE_CHANNELS.hostOpenWorkspace)
    await Promise.resolve(openWorkspaceHandler?.({}, undefined))

    const shellGetSnapshotHandler = handlers.get(STUDIO_BRIDGE_CHANNELS.shellGetSnapshot)
    await expect(
      Promise.resolve(
        shellGetSnapshotHandler?.({}, {
          projectPath: 'D:/workspace/demo',
        }),
      ),
    ).resolves.toEqual({
      ...createShellSnapshot(),
      defaults: {
        ...createShellSnapshot().defaults,
        projectPath: 'D:/workspace/demo',
      },
    })
    expect(inspectShell).toHaveBeenCalledWith(
      { projectPath: 'D:/workspace/demo' },
      {
        workspacePath: 'D:/workspace/demo',
        lastSelection: {
          ok: true,
          code: 'selected',
          path: 'D:/workspace/demo',
        },
      },
    )
  })

  it('shell.getSnapshot 拒绝非法参数', async () => {
    const handlers = new Map<string, (_event: unknown, payload: unknown) => unknown>()

    registerStudioMainIpcHandlers({
      ipcMainLike: {
        handle(channel, handler) {
          handlers.set(channel, handler)
        },
      },
      selectWorkspaceDirectory: vi.fn(async () => ({
        ok: false as const,
        code: 'cancelled' as const,
        message: '用户取消了 workspace 目录选择',
      })),
      mainWindowManager: {
        getMainWindow: () => null,
      },
      inspectRuntime: vi.fn(),
      inspectShell: vi.fn(async () => createShellSnapshot()),
      logger: createLogger(),
    })

    const shellGetSnapshotHandler = handlers.get(STUDIO_BRIDGE_CHANNELS.shellGetSnapshot)
    await expect(
      Promise.resolve(shellGetSnapshotHandler?.({}, { projectPath: 123 })),
    ).rejects.toThrow('studio.shell.getSnapshot.projectPath 必须是字符串或 null')
  })
})
