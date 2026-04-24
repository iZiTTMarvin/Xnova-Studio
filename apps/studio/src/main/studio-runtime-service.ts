import {
  loadResolvedConfig,
  type ResolvedConfigResult,
} from '@config/resolver.js'
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

interface ActiveRuntimeHandle {
  instance: RuntimeInstance
  sessionId: string | null
  cwd: string
  workspaceRoot: string
  agentId: string | null
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

function shouldReuseRuntime(
  runtimeHandle: ActiveRuntimeHandle | null,
  request: RuntimeSubmitRequest,
  cwd: string,
  workspaceRoot: string,
): boolean {
  if (!runtimeHandle) {
    return false
  }

  if (runtimeHandle.cwd !== cwd || runtimeHandle.workspaceRoot !== workspaceRoot) {
    return false
  }

  const nextAgentId = request.agentId?.trim() || null
  if (runtimeHandle.agentId !== nextAgentId) {
    return false
  }

  if (
    request.sessionId &&
    runtimeHandle.sessionId &&
    request.sessionId !== runtimeHandle.sessionId
  ) {
    return false
  }

  return true
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
  const engineServiceApi = options.engineServiceApi
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
  let activeRuntime: ActiveRuntimeHandle | null = null
  let runtimeEventSink: ((event: StudioRuntimeEvent) => void) | null = null
  let runtimeHostState: StudioHostState = {
    workspacePath: null,
    lastSelection: null,
  }

  const runtimeBridge: RuntimeHostBridge = {
    emit(event: RuntimeEvent) {
      runtimeEventSink?.(toStudioRuntimeEvent(event))
    },
    async requestPermission(input) {
      runtimeEventSink?.({
        type: 'permission.request',
        timestamp: new Date().toISOString(),
        sessionId: input.sessionId,
        payload: toPermissionEventPayload(input),
      })

      const resolution = await resolvePermissionFn(input, runtimeHostState)

      runtimeEventSink?.({
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

      const cwd = resolveRuntimeCwd(request, hostState)
      if (!cwd) {
        return {
          ok: false,
          error: '当前尚未绑定 Workspace，无法开始项目会话。',
        }
      }

      try {
        runtimeEventSink = emitRuntimeEvent
        runtimeHostState = hostState

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

        if (engineServiceApi && request.providerId && request.modelId) {
          engineServiceApi.runtime.setModel({
            provider: request.providerId,
            model: request.modelId,
          })
        }

        const workspaceRoot = hostState.workspacePath ?? cwd
        const reuseRuntime = shouldReuseRuntime(activeRuntime, request, cwd, workspaceRoot)

        if (!reuseRuntime) {
          await activeRuntime?.instance.dispose()
          const nextInstance = await createRuntimeFn(
            {
              cwd,
              workspaceRoot,
              config: runtimeConfig,
              mode: 'standard',
            },
            runtimeBridge,
          )
          activeRuntime = {
            instance: nextInstance,
            sessionId: request.sessionId ?? null,
            cwd,
            workspaceRoot,
            agentId: request.agentId?.trim() || null,
          }
        }

        for (const warning of resolved.warnings) {
          emitRuntimeEvent({
            type: 'warning',
            timestamp: new Date().toISOString(),
            payload: {
              message: warning,
            },
          })
        }

        const restoredHistory = !reuseRuntime
          ? buildResumeHistory(text, request, engineServiceApi, logger)
          : undefined

        const runtimeInstance = activeRuntime!.instance
        const turnResult = await runtimeInstance.submit({
          text,
          ...(reuseRuntime
            ? {}
            : {
                history: restoredHistory ?? buildStudioRuntimeHistory(text),
              }),
          loggedUserContent: text,
          ...(request.providerId ? { provider: request.providerId } : {}),
          ...(request.modelId ? { model: request.modelId } : {}),
        })

        if (turnResult.error) {
          return {
            ok: false,
            error: turnResult.error,
          }
        }

        if (activeRuntime) {
          activeRuntime.sessionId = turnResult.sessionId ?? activeRuntime.sessionId
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
      await activeRuntime?.instance.dispose()
      activeRuntime = null
      runtimeEventSink = null
    },
  }
}
