import type {
  RuntimeInspectRequest,
  RuntimeInspectResult,
  RuntimeCancelRequest,
  RuntimeCancelResult,
  RuntimeSubmitRequest,
  RuntimeSubmitResult,
  StudioRuntimeEvent,
} from '../shared/studio-bridge-contract'
import { STUDIO_BRIDGE_CHANNELS, type StudioIpcRendererLike } from './studio-ipc-contract'
import {
  parseStudioRuntimeEvent,
  parseStudioRuntimeCancelRequest,
  parseStudioRuntimeCancelResult,
  parseStudioRuntimeInspectResult,
  parseStudioRuntimeSubmitRequest,
  parseStudioRuntimeSubmitResult,
} from './studio-validators'

export interface StudioRuntimeGateway {
  inspect(request: RuntimeInspectRequest): Promise<RuntimeInspectResult>
  submit(request: RuntimeSubmitRequest): Promise<RuntimeSubmitResult>
  cancel(request?: RuntimeCancelRequest): Promise<RuntimeCancelResult>
  onEvent(listener: (event: StudioRuntimeEvent) => void): () => void
  dispose(): Promise<void>
}

export interface CreateStudioRuntimeGatewayOptions {
  ipcRenderer: StudioIpcRendererLike
}

export function createStudioRuntimeGateway(
  options: CreateStudioRuntimeGatewayOptions,
): StudioRuntimeGateway {
  const listeners = new Set<(event: StudioRuntimeEvent) => void>()
  const handleRuntimeEvent = (_event: unknown, payload: unknown) => {
    const runtimeEvent = parseStudioRuntimeEvent(payload)
    for (const listener of listeners) {
      listener(runtimeEvent)
    }
  }

  options.ipcRenderer.on(STUDIO_BRIDGE_CHANNELS.runtimeEvent, handleRuntimeEvent)

  return {
    async inspect(request) {
      const payload = await options.ipcRenderer.invoke(
        STUDIO_BRIDGE_CHANNELS.runtimeInspect,
        request,
      )
      return parseStudioRuntimeInspectResult(payload)
    },
    async submit(request) {
      const safeRequest = parseStudioRuntimeSubmitRequest(request)
      const payload = await options.ipcRenderer.invoke(
        STUDIO_BRIDGE_CHANNELS.runtimeSubmit,
        safeRequest,
      )
      return parseStudioRuntimeSubmitResult(payload)
    },
    async cancel(request) {
      const safeRequest = parseStudioRuntimeCancelRequest(request)
      const payload = await options.ipcRenderer.invoke(
        STUDIO_BRIDGE_CHANNELS.runtimeCancel,
        safeRequest,
      )
      return parseStudioRuntimeCancelResult(payload)
    },
    onEvent(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    async dispose() {
      listeners.clear()
      options.ipcRenderer.removeListener(
        STUDIO_BRIDGE_CHANNELS.runtimeEvent,
        handleRuntimeEvent,
      )
    },
  }
}
