import type {
  OpenWorkspaceResponse,
  RuntimeInspectRequest,
  StudioBridgeApi,
  StudioHostState,
  StudioShellSnapshot,
  StudioShellSnapshotRequest,
  StudioRuntimeEvent,
} from '../shared/studio-bridge-contract'
import { STUDIO_BRIDGE_CHANNELS, type StudioIpcRendererLike } from './studio-ipc-contract'
import {
  assertStudioNoPayload,
  parseStudioHostState,
  parseStudioOpenWorkspaceResponse,
  parseStudioShellSnapshot,
  parseStudioShellSnapshotRequest,
  parseStudioRuntimeInspectRequest,
} from './studio-validators'
import {
  createStudioRuntimeGateway,
  type StudioRuntimeGateway,
} from './studio-runtime-gateway'

export interface CreateStudioBridgeApiOptions {
  ipcRenderer: StudioIpcRendererLike
  runtimeGateway?: StudioRuntimeGateway
}

export function createStudioBridgeApi(
  options: CreateStudioBridgeApiOptions,
): StudioBridgeApi {
  let hostState: StudioHostState = {
    workspacePath: null,
    lastSelection: null,
  }

  const hostListeners = new Set<(state: StudioHostState) => void>()
  const runtimeGateway =
    options.runtimeGateway ?? createStudioRuntimeGateway({
      ipcRenderer: options.ipcRenderer,
    })

  options.ipcRenderer.on(
    STUDIO_BRIDGE_CHANNELS.hostStateChanged,
    (_event, payload) => {
      const nextState = parseStudioHostState(payload)
      hostState = nextState
      for (const listener of hostListeners) {
        listener(nextState)
      }
    },
  )

  async function getState(): Promise<StudioHostState> {
    const payload = await options.ipcRenderer.invoke(
      STUDIO_BRIDGE_CHANNELS.hostGetState,
    )
    const state = parseStudioHostState(payload)
    hostState = state
    return state
  }

  async function openWorkspace(): Promise<OpenWorkspaceResponse> {
    const payload = await options.ipcRenderer.invoke(
      STUDIO_BRIDGE_CHANNELS.hostOpenWorkspace,
    )
    const response = parseStudioOpenWorkspaceResponse(payload)
    hostState = response.state
    for (const listener of hostListeners) {
      listener(response.state)
    }
    return response
  }

  async function getShellSnapshot(
    input?: StudioShellSnapshotRequest,
  ): Promise<StudioShellSnapshot> {
    const request = parseStudioShellSnapshotRequest(input)
    const payload = await options.ipcRenderer.invoke(
      STUDIO_BRIDGE_CHANNELS.shellGetSnapshot,
      request,
    )
    return parseStudioShellSnapshot(payload)
  }

  return {
    host: {
      async getState(...args: unknown[]) {
        assertStudioNoPayload(args[0], 'studio.host.getState')
        return getState()
      },
      async openWorkspace(...args: unknown[]) {
        assertStudioNoPayload(args[0], 'studio.host.openWorkspace')
        return openWorkspace()
      },
      onStateChanged(listener) {
        hostListeners.add(listener)
        return () => {
          hostListeners.delete(listener)
        }
      },
    },
    runtime: {
      async inspect(input?: RuntimeInspectRequest) {
        const request = parseStudioRuntimeInspectRequest(input)
        return runtimeGateway.inspect(request)
      },
      onEvent(listener: (event: StudioRuntimeEvent) => void) {
        return runtimeGateway.onEvent(listener)
      },
    },
    shell: {
      async getSnapshot(input?: StudioShellSnapshotRequest) {
        return getShellSnapshot(input)
      },
    },
  }
}
