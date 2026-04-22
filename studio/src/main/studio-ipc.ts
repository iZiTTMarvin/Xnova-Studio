import type { MainLogger } from './logger'
import type { WorkspaceSelectionResult } from '../shared/studio-bridge-contract'
import {
  STUDIO_BRIDGE_CHANNELS,
  type OpenWorkspaceResponse,
  type RuntimeInspectRequest,
  type RuntimeInspectResult,
  type StudioHostState,
  type StudioRuntimeEvent,
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertNoPayload(payload: unknown, methodName: string): void {
  if (payload !== undefined) {
    throw new Error(`${methodName} 不接受参数。`)
  }
}

function parseRuntimeInspectPayload(payload: unknown): RuntimeInspectRequest {
  if (payload === undefined) {
    return {}
  }

  if (!isPlainObject(payload)) {
    throw new Error('studio.runtime.inspect 参数必须是对象。')
  }

  if (Object.keys(payload).some((key) => key !== 'refresh')) {
    throw new Error('studio.runtime.inspect 只允许 refresh 字段。')
  }

  if (payload.refresh !== undefined && typeof payload.refresh !== 'boolean') {
    throw new Error('studio.runtime.inspect.refresh 必须是布尔值。')
  }

  return payload.refresh === undefined ? {} : { refresh: payload.refresh }
}

function createRuntimeEvent(
  result: RuntimeInspectResult,
  request: RuntimeInspectRequest,
): StudioRuntimeEvent {
  if (result.ok) {
    return {
      type: 'runtime.snapshot',
      timestamp: new Date().toISOString(),
      payload: {
        refresh: Boolean(request.refresh),
        snapshot: result.snapshot,
        workspacePath: result.workspacePath,
        configWarnings: result.configWarnings,
      },
    }
  }

  return {
    type: 'runtime.error',
    timestamp: new Date().toISOString(),
    payload: {
      refresh: Boolean(request.refresh),
      message: result.error,
      workspacePath: result.workspacePath,
      configWarnings: result.configWarnings,
    },
  }
}

export interface RegisterStudioMainIpcHandlersOptions {
  ipcMainLike: StudioIpcMainLike
  inspectRuntime: (
    request: RuntimeInspectRequest,
    state: StudioHostState,
  ) => Promise<RuntimeInspectResult>
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
  let workspaceQueue: Promise<void> = Promise.resolve()

  function broadcast(channel: string, payload: unknown): void {
    options.mainWindowManager.getMainWindow()?.webContents?.send(channel, payload)
  }

  function enqueueWorkspaceSelection<T>(task: () => Promise<T>): Promise<T> {
    const nextTask = workspaceQueue.then(task, task)
    workspaceQueue = nextTask.then(
      () => undefined,
      () => undefined,
    )
    return nextTask
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

      return enqueueWorkspaceSelection(async () => {
        const selection = await options.selectWorkspaceDirectory()
        hostState = {
          workspacePath: selection.ok ? selection.path : hostState.workspacePath,
          lastSelection: selection,
        }

        broadcast(STUDIO_BRIDGE_CHANNELS.hostStateChanged, hostState)

        options.logger.info('host 状态已更新', {
          workspacePath: hostState.workspacePath,
          selectionCode: selection.code,
        })

        return {
          selection,
          state: hostState,
        }
      })
    },
  )

  options.ipcMainLike.handle(
    STUDIO_BRIDGE_CHANNELS.runtimeInspect,
    async (_event, payload): Promise<RuntimeInspectResult> => {
      const request = parseRuntimeInspectPayload(payload)

      try {
        const result = await options.inspectRuntime(request, hostState)
        broadcast(
          STUDIO_BRIDGE_CHANNELS.runtimeEvent,
          createRuntimeEvent(result, request),
        )
        options.logger.info('runtime inspect 已完成', {
          ok: result.ok,
          workspacePath: result.workspacePath,
        })
        return result
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const result: RuntimeInspectResult = {
          ok: false,
          error: `runtime inspect 失败: ${message}`,
          workspacePath: hostState.workspacePath,
          configWarnings: [],
        }
        broadcast(
          STUDIO_BRIDGE_CHANNELS.runtimeEvent,
          createRuntimeEvent(result, request),
        )
        options.logger.error('runtime inspect 失败', error)
        return result
      }
    },
  )
}
