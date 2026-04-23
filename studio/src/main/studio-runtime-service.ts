import {
  loadResolvedConfig,
  type ResolvedConfigResult,
} from '../../../cli/src/config/resolver.js'
import type {
  RuntimeConfigInput,
  RuntimeEvent,
  RuntimeHostBridge,
  RuntimeInstance,
} from '../../../cli/src/runtime/types.js'
import type { MainLogger } from './logger'
import type {
  RuntimeSubmitRequest,
  RuntimeSubmitResult,
  StudioHostState,
  StudioRuntimeEvent,
} from '../shared/studio-bridge-contract'

export interface StudioRuntimeService {
  submit(
    request: RuntimeSubmitRequest,
    hostState: StudioHostState,
    emitRuntimeEvent: (event: StudioRuntimeEvent) => void,
  ): Promise<RuntimeSubmitResult>
  dispose(): Promise<void>
}

export interface CreateStudioRuntimeServiceOptions {
  createRuntimeFn?: (
    input: RuntimeConfigInput,
    bridge: RuntimeHostBridge,
  ) => Promise<RuntimeInstance>
  loadResolvedConfigFn?: (cwd: string) => ResolvedConfigResult
  fallbackCwd?: string
  logger?: Pick<MainLogger, 'info' | 'warn' | 'error'>
}

function toStudioRuntimeEvent(event: RuntimeEvent): StudioRuntimeEvent {
  return {
    type: event.type,
    timestamp: event.timestamp,
    ...(event.sessionId ? { sessionId: event.sessionId } : {}),
    ...(event.agentId ? { agentId: event.agentId } : {}),
    ...(event.payload ? { payload: event.payload } : {}),
  }
}

function resolveRuntimeCwd(
  request: RuntimeSubmitRequest,
  hostState: StudioHostState,
  fallbackCwd: string,
): string {
  const explicitProjectPath = request.projectPath?.trim()
  if (explicitProjectPath) {
    return explicitProjectPath
  }
  if (hostState.workspacePath?.trim()) {
    return hostState.workspacePath
  }
  return fallbackCwd
}

export function createStudioRuntimeService(
  options: CreateStudioRuntimeServiceOptions = {},
): StudioRuntimeService {
  const createRuntimeFn =
    options.createRuntimeFn ??
    (async (input: RuntimeConfigInput, bridge: RuntimeHostBridge) => {
      const runtimeModule = await import('../../../cli/src/runtime/create-runtime.js')
      return runtimeModule.createRuntime(input, bridge)
    })
  const loadResolvedConfigFn = options.loadResolvedConfigFn ?? loadResolvedConfig
  const fallbackCwd = options.fallbackCwd ?? process.cwd()
  const logger = options.logger ?? {
    info() {
      return undefined
    },
    warn() {
      return undefined
    },
    error() {
      return undefined
    },
  }
  let runtimeInstance: RuntimeInstance | null = null
  let runtimeEventSink: ((event: StudioRuntimeEvent) => void) | null = null

  const runtimeBridge: RuntimeHostBridge = {
    emit(event: RuntimeEvent) {
      runtimeEventSink?.(toStudioRuntimeEvent(event))
    },
    async requestPermission(_input) {
      return {
        allow: true,
      }
    },
    async requestUserInput(_input) {
      return {
        answers: {},
        cancelled: true,
      }
    },
  }

  return {
    async submit(request, hostState, emitRuntimeEvent) {
      const text = request.text.trim()
      if (!text) {
        return {
          ok: false,
          error: 'runtime.submit.text 不能为空。',
        }
      }

      const cwd = resolveRuntimeCwd(request, hostState, fallbackCwd)

      try {
        runtimeEventSink = emitRuntimeEvent
        await runtimeInstance?.dispose()
        runtimeInstance = null

        const resolved = loadResolvedConfigFn(cwd)
        const runtimeConfig = {
          ...resolved.effective,
          ...(request.agentId
            ? {
                agent: {
                  ...(resolved.effective.agent ?? {}),
                  default: request.agentId,
                },
              }
            : {}),
        }
        runtimeInstance = await createRuntimeFn(
          {
            cwd,
            workspaceRoot: hostState.workspacePath ?? cwd,
            config: runtimeConfig,
            mode: 'standard',
          },
          runtimeBridge,
        )

        for (const warning of resolved.warnings) {
          emitRuntimeEvent({
            type: 'warning',
            timestamp: new Date().toISOString(),
            payload: {
              message: warning,
            },
          })
        }

        const turnResult = await runtimeInstance.submit({
          text,
          ...(request.modelId ? { model: request.modelId } : {}),
        })

        if (turnResult.error) {
          return {
            ok: false,
            error: turnResult.error,
          }
        }

        logger.info('runtime submit 完成', {
          cwd,
          sessionId: turnResult.sessionId,
        })

        return {
          ok: true,
          sessionId: turnResult.sessionId,
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        logger.error('runtime submit 执行失败', error)
        return {
          ok: false,
          error: `runtime submit 失败: ${message}`,
        }
      } finally {
        runtimeEventSink = null
      }
    },

    async dispose() {
      await runtimeInstance?.dispose()
      runtimeInstance = null
      runtimeEventSink = null
    },
  }
}
