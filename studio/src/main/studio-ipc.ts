import type { MainLogger } from './logger'
import type { WorkspaceSelectionResult } from '../shared/studio-bridge-contract'
import {
  STUDIO_BRIDGE_CHANNELS,
  type OpenWorkspaceResponse,
  type StudioHostState,
} from '../shared/studio-bridge-contract'

export interface StudioIpcMainLike {
  handle(
    channel: string,
    handler: (_event: unknown, payload: unknown) => Promise<unknown> | unknown,
  ): void
}

interface HostStateWindowLike {
  webContents?: {
    send(channel: string, payload: unknown): void
  }
}

function assertNoPayload(payload: unknown, methodName: string): void {
  if (payload !== undefined) {
    throw new Error(`${methodName} 不接受参数。`)
  }
}

export interface RegisterStudioMainIpcHandlersOptions {
  ipcMainLike: StudioIpcMainLike
  selectWorkspaceDirectory: () => Promise<WorkspaceSelectionResult>
  mainWindowManager: {
    getMainWindow(): HostStateWindowLike | null
  }
  logger: Pick<MainLogger, 'info' | 'error'>
}

export function registerStudioMainIpcHandlers(
  options: RegisterStudioMainIpcHandlersOptions,
): void {
  let hostState: StudioHostState = {
    workspacePath: null,
    lastSelection: null,
  }

  options.ipcMainLike.handle(
    STUDIO_BRIDGE_CHANNELS.hostGetState,
    async (_event, payload) => {
      assertNoPayload(payload, 'studio.host.getState')
      return hostState
    },
  )

  options.ipcMainLike.handle(
    STUDIO_BRIDGE_CHANNELS.hostOpenWorkspace,
    async (_event, payload): Promise<OpenWorkspaceResponse> => {
      assertNoPayload(payload, 'studio.host.openWorkspace')

      const selection = await options.selectWorkspaceDirectory()
      hostState = {
        workspacePath: selection.ok ? selection.path : hostState.workspacePath,
        lastSelection: selection,
      }

      options.mainWindowManager
        .getMainWindow()
        ?.webContents?.send(STUDIO_BRIDGE_CHANNELS.hostStateChanged, hostState)

      options.logger.info('host 状态已更新', {
        workspacePath: hostState.workspacePath,
        selectionCode: selection.code,
      })

      return {
        selection,
        state: hostState,
      }
    },
  )
}
