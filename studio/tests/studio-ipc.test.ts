import { describe, expect, it, vi } from 'vitest'
import { registerStudioMainIpcHandlers } from '../src/main/studio-ipc'
import { STUDIO_BRIDGE_CHANNELS, type WorkspaceSelectionResult } from '../src/shared/studio-bridge-contract'

function createLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
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
})
