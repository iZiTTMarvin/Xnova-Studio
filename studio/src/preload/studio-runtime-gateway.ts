import { ConfigManager, type CCodeConfig } from '../../../cli/src/config/config-manager.js'
import { inspectRuntimeConfig, type RuntimeInspectSnapshot } from '../../../cli/src/runtime/inspect.js'
import type {
  RuntimeInspectRequest,
  RuntimeInspectResult,
  StudioHostState,
  StudioRuntimeEvent,
} from '../shared/studio-bridge-contract'

export interface StudioRuntimeGateway {
  inspect(
    request: RuntimeInspectRequest,
    hostState: StudioHostState,
  ): Promise<RuntimeInspectResult>
  onEvent(listener: (event: StudioRuntimeEvent) => void): () => void
  dispose(): Promise<void>
}

export interface CreateStudioRuntimeGatewayOptions {
  configManager?: Pick<ConfigManager, 'load'>
  inspectRuntimeConfig?: (input: { config: CCodeConfig }) => RuntimeInspectSnapshot
}

export function createStudioRuntimeGateway(
  options: CreateStudioRuntimeGatewayOptions = {},
): StudioRuntimeGateway {
  const listeners = new Set<(event: StudioRuntimeEvent) => void>()
  const configManager = options.configManager ?? new ConfigManager()
  const runtimeInspector = options.inspectRuntimeConfig ?? inspectRuntimeConfig

  return {
    async inspect(request, hostState) {
      try {
        const snapshot = runtimeInspector({
          config: configManager.load(),
        })

        const event: StudioRuntimeEvent = {
          type: 'runtime.snapshot',
          timestamp: new Date().toISOString(),
          payload: {
            snapshot,
            refresh: Boolean(request.refresh),
          },
        }
        for (const listener of listeners) {
          listener(event)
        }

        return {
          ok: true,
          snapshot: {
            sessionId: snapshot.sessionId,
            isRunning: snapshot.isRunning,
            provider: snapshot.provider,
            model: snapshot.model,
            warnings: [...snapshot.warnings],
          },
          workspacePath: hostState.workspacePath,
          configWarnings: [],
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const event: StudioRuntimeEvent = {
          type: 'runtime.error',
          timestamp: new Date().toISOString(),
          payload: {
            message,
          },
        }
        for (const listener of listeners) {
          listener(event)
        }

        return {
          ok: false,
          error: `runtime inspect 失败: ${message}`,
          workspacePath: hostState.workspacePath,
          configWarnings: [],
        }
      }
    },
    onEvent(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    async dispose() {
      return Promise.resolve()
    },
  }
}
