import {
  loadResolvedConfig,
  type ResolvedConfigResult,
} from '@config/resolver.js'
import { createEngineServiceApi } from '@xnova/runtime'
import type {
  EngineServiceApi,
  PermissionRequest,
  PermissionResolution,
  RuntimeConfigInput,
  RuntimeEvent,
  RuntimeHostBridge,
  RuntimeInstance,
  RuntimeSubmitInput,
} from '@xnova/runtime'
import type { MainLogger } from './logger'
import {
  createStudioRuntimeManager,
  type StudioRuntimeBridgeState,
  type StudioManagedRuntimeEntry,
  type StudioRuntimeManager,
  type StudioRuntimeSelection,
} from './studio-runtime-manager'
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
  engineServiceApi?: Pick<EngineServiceApi, 'runtime'> &
    Partial<Pick<EngineServiceApi, 'sessionService'>>
  runtimeManager?: StudioRuntimeManager
  createRuntimeFn?: (
    input: RuntimeConfigInput,
    bridge: RuntimeHostBridge,
  ) => Promise<RuntimeInstance>
  loadResolvedConfigFn?: (cwd: string) => ResolvedConfigResult
  resolvePermissionFn?: (
    input: PermissionRequest,
    hostState: StudioHostState,
  ) => Promise<PermissionResolution & { reason?: string }>
  fallbackCwd?: string
  logger?: Pick<MainLogger, 'info' | 'warn' | 'error'>
}

const SAFE_READ_TOOL_NAMES = new Set([
  'read_file',
  'glob',
  'grep',
  'task_output',
  'skill',
  'memory_search',
  'ask_user_question',
])

const WORKSPACE_MUTATION_TOOL_NAMES = new Set([
  'write_file',
  'edit_file',
  'todo_write',
  'verify_code',
  'dispatch_agent',
  'control_agent',
  'memory_write',
  'memory_delete',
])

const RESTRICTED_TOOL_NAMES = new Set([
  'bash',
  'git',
  'kill_shell',
])

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
): string | null {
  const explicitProjectPath = request.projectPath?.trim()
  if (explicitProjectPath) {
    return explicitProjectPath
  }
  if (hostState.workspacePath?.trim()) {
    return hostState.workspacePath
  }
  return null
}

function buildStudioRuntimeHistory(
  text: string,
): NonNullable<RuntimeSubmitInput['history']> {
  return [
    {
      role: 'user',
      content: text,
    },
  ]
}

function buildResumeHistory(
  text: string,
  request: RuntimeSubmitRequest,
  engineServiceApi:
    | (Pick<EngineServiceApi, 'runtime'> & Partial<Pick<EngineServiceApi, 'sessionService'>>)
    | undefined,
  logger: Pick<MainLogger, 'warn'>,
): NonNullable<RuntimeSubmitInput['history']> | undefined {
  if (!request.sessionId || !engineServiceApi?.sessionService) {
    return undefined
  }

  try {
    const snapshot = engineServiceApi.sessionService.loadSession(request.sessionId)
    const restoredHistory = snapshot.messages
      .filter(
        (message) =>
          message.role === 'user' ||
          message.role === 'assistant' ||
          message.role === 'system',
      )
      .map((message) => ({
        role: message.role,
        content: message.content,
      }))

    return [
      ...restoredHistory,
      {
        role: 'user',
        content: text,
      },
    ]
  } catch (error) {
    logger.warn('恢复历史失败，已回退到单轮 history', {
      sessionId: request.sessionId,
      error: error instanceof Error ? error.message : String(error),
    })
    return undefined
  }
}

function toPermissionEventPayload(
  input: PermissionRequest,
  resolution?: PermissionResolution & { reason?: string },
): Record<string, unknown> {
  return {
    toolName: input.toolName,
    args: input.args,
    ...(resolution
      ? {
          allow: resolution.allow,
          ...(resolution.remember !== undefined ? { remember: resolution.remember } : {}),
          ...(resolution.reason ? { reason: resolution.reason } : {}),
        }
      : {}),
  }
}

async function defaultResolvePermission(
  input: PermissionRequest,
  hostState: StudioHostState,
): Promise<PermissionResolution & { reason?: string }> {
  if (!hostState.workspacePath?.trim()) {
    return {
      allow: false,
      reason: 'workspace-not-ready',
    }
  }

  if (RESTRICTED_TOOL_NAMES.has(input.toolName)) {
    return {
      allow: false,
      reason: 'restricted-tool',
    }
  }

  if (SAFE_READ_TOOL_NAMES.has(input.toolName)) {
    return {
      allow: true,
      remember: true,
      reason: 'safe-read-tool',
    }
  }

  if (WORKSPACE_MUTATION_TOOL_NAMES.has(input.toolName)) {
    return {
      allow: true,
      remember: true,
      reason: 'workspace-scoped-tool',
    }
  }

  return {
    allow: false,
    reason: 'unknown-tool',
  }
}

export function createStudioRuntimeService(
  options: CreateStudioRuntimeServiceOptions = {},
): StudioRuntimeService {
  const createRuntimeFn =
    options.createRuntimeFn ??
    (async (input: RuntimeConfigInput, bridge: RuntimeHostBridge) => {
      const runtimeModule = await import('@xnova/runtime')
      return runtimeModule.createRuntime(input, bridge)
    })
  const loadResolvedConfigFn = options.loadResolvedConfigFn ?? loadResolvedConfig
  const resolvePermissionFn = options.resolvePermissionFn ?? defaultResolvePermission
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
  const runtimeManager =
    options.runtimeManager ??
    createStudioRuntimeManager({
      createEngineServiceApiFn: (workspaceRoot) =>
        (options.engineServiceApi as EngineServiceApi | undefined) ??
        createEngineServiceApi({ cwd: workspaceRoot }),
    })

  const createRuntimeBridge = (
    bridgeState: StudioRuntimeBridgeState,
  ): RuntimeHostBridge => ({
    emit(event: RuntimeEvent) {
      bridgeState.eventSink?.(toStudioRuntimeEvent(event))
    },
    async requestPermission(input) {
      bridgeState.eventSink?.({
        type: 'permission.request',
        timestamp: new Date().toISOString(),
        sessionId: input.sessionId,
        payload: toPermissionEventPayload(input),
      })

      const resolution = await resolvePermissionFn(input, bridgeState.hostState)

      bridgeState.eventSink?.({
        type: 'permission.decision',
        timestamp: new Date().toISOString(),
        sessionId: input.sessionId,
        payload: toPermissionEventPayload(input, resolution),
      })

      return resolution
    },
    async requestUserInput(_input) {
      return {
        answers: {},
        cancelled: true,
      }
    },
  })

  return {
    async submit(request, hostState, emitRuntimeEvent) {
      const text = request.text.trim()
      if (!text) {
        return {
          ok: false,
          error: 'runtime.submit.text 不能为空。',
        }
      }

      const cwd = resolveRuntimeCwd(request, hostState)
      if (!cwd) {
        return {
          ok: false,
          error: '当前尚未绑定 Workspace，无法开始项目会话。',
        }
      }

      let runtimeEntry: StudioManagedRuntimeEntry | null = null

      try {
        const resolved = loadResolvedConfigFn(cwd)
        const workspaceRoot = hostState.workspacePath ?? cwd
        const engineServiceApi = runtimeManager.getEngineServiceApi(workspaceRoot)
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

        if (request.providerId && request.modelId) {
          engineServiceApi.runtime.setModel({
            provider: request.providerId,
            model: request.modelId,
          })
        }

        const selection: StudioRuntimeSelection = {
          cwd,
          workspaceRoot,
          sessionId: request.sessionId?.trim() || null,
          agentId: request.agentId?.trim() || null,
        }
        const runtimeHandle = await runtimeManager.acquireRuntime({
          selection,
          config: runtimeConfig,
          hostState,
          emitRuntimeEvent,
          createRuntimeFn,
          createBridge: (bridgeState) => createRuntimeBridge(bridgeState),
        })
        runtimeEntry = runtimeHandle.entry

        for (const warning of resolved.warnings) {
          emitRuntimeEvent({
            type: 'warning',
            timestamp: new Date().toISOString(),
            payload: {
              message: warning,
            },
          })
        }

        const shouldHydrateHistory =
          !runtimeHandle.reused || runtimeHandle.reactivated
        const restoredHistory = shouldHydrateHistory
          ? buildResumeHistory(text, request, engineServiceApi, logger)
          : undefined

        const runtimeInstance = runtimeHandle.entry.instance
        const runtimeSubmitInput: RuntimeSubmitInput = {
          text,
          ...(shouldHydrateHistory
            ? {
                history: restoredHistory ?? buildStudioRuntimeHistory(text),
              }
            : {}),
          loggedUserContent: text,
          ...(request.providerId ? { provider: request.providerId } : {}),
          ...(request.modelId ? { model: request.modelId } : {}),
        }
        const turnResult = await runtimeInstance.submit(runtimeSubmitInput)

        if (turnResult.error) {
          return {
            ok: false,
            error: turnResult.error,
          }
        }

        runtimeManager.commitSession(runtimeHandle.entry, turnResult.sessionId)

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
        if (runtimeEntry) {
          runtimeManager.releaseRuntime(runtimeEntry)
        }
      }
    },

    async dispose() {
      await runtimeManager.dispose()
    },
  }
}
