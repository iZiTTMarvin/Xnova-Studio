import path from 'node:path'
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
  RuntimeTurnResult,
  UserQuestionRequest,
  UserQuestionResult,
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
  PermissionDialogRequest,
  PermissionDialogResponse,
  UserQuestionDialogRequest,
  UserQuestionDialogResponse,
  StudioHostState,
  StudioRuntimeEvent,
} from '../shared/studio-bridge-contract'
import { STUDIO_BRIDGE_CHANNELS } from '../shared/studio-bridge-contract'

export interface StudioRuntimeService {
  submit(
    request: RuntimeSubmitRequest,
    hostState: StudioHostState,
    emitRuntimeEvent: (event: StudioRuntimeEvent) => void,
  ): Promise<RuntimeSubmitResult>
  respondToPermissionRequest(response: PermissionDialogResponse): boolean
  respondToUserInputRequest(response: UserQuestionDialogResponse): boolean
  dispose(): Promise<void>
}

interface PermissionWindowLike {
  webContents?: {
    send(channel: string, payload: unknown): void
  }
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
  submitTimeoutMs?: number
  permissionRequestTimeoutMs?: number
  userInputRequestTimeoutMs?: number
  mainWindowManager?: {
    getMainWindow(): PermissionWindowLike | null
  }
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

const WORKSPACE_PATH_MUTATION_TOOL_NAMES = new Set([
  'write_file',
  'edit_file',
])

const TRUSTED_MUTATION_TOOL_NAMES = new Set([
  'todo_write',
  'verify_code',
  'dispatch_agent',
  'control_agent',
  'memory_write',
  'memory_delete',
])

const INTERACTIVE_PERMISSION_TOOL_NAMES = new Set([
  'bash',
  'git',
  'kill_shell',
])

let permissionRequestSequence = 0
let userInputRequestSequence = 0
let runtimeRunSequence = 0

function toStudioRuntimeEvent(event: RuntimeEvent): StudioRuntimeEvent {
  return {
    type: event.type,
    timestamp: event.timestamp,
    ...(event.sessionId ? { sessionId: event.sessionId } : {}),
    ...(event.agentId ? { agentId: event.agentId } : {}),
    ...(event.payload ? { payload: event.payload } : {}),
  }
}

function createRuntimeRunId(): string {
  runtimeRunSequence += 1
  return `run-${Date.now()}-${runtimeRunSequence}`
}

function emitRunLifecycleEvent(
  emitRuntimeEvent: (event: StudioRuntimeEvent) => void,
  input: {
    type: 'run_started' | 'run_completed' | 'run_failed'
    runId: string
    sessionId?: string | null
    agentId?: string | null
    payload?: Record<string, unknown>
  },
): void {
  emitRuntimeEvent({
    type: input.type,
    timestamp: new Date().toISOString(),
    runId: input.runId,
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    ...(input.agentId ? { agentId: input.agentId } : {}),
    ...(input.payload ? { payload: input.payload } : {}),
  })
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

function createPermissionRequestId(): string {
  permissionRequestSequence += 1
  return `permission-${Date.now()}-${permissionRequestSequence}`
}

function createUserInputRequestId(): string {
  userInputRequestSequence += 1
  return `user-question-${Date.now()}-${userInputRequestSequence}`
}

function createSubmitActivityWatchdog(
  input: {
    initialTimeoutMs: number
    postProgressTimeoutMs: number
    onTimeout(state: {
      timeoutMs: number
      hasSeenProgress: boolean
    }): void
  },
): {
  start(): void
  touch(): void
  suspend(): void
  resume(): void
  clear(): void
} {
  const initialTimeoutMs = Math.max(0, input.initialTimeoutMs)
  const postProgressTimeoutMs = Math.max(initialTimeoutMs, input.postProgressTimeoutMs)

  if (initialTimeoutMs <= 0 && postProgressTimeoutMs <= 0) {
    return {
      start() {
        return undefined
      },
      touch() {
        return undefined
      },
      suspend() {
        return undefined
      },
      resume() {
        return undefined
      },
      clear() {
        return undefined
      },
    }
  }

  let timer: ReturnType<typeof setTimeout> | null = null
  let suspended = false
  let hasSeenProgress = false

  const getTimeoutMs = () =>
    hasSeenProgress ? postProgressTimeoutMs : initialTimeoutMs

  const schedule = () => {
    if (suspended) {
      return
    }

    const timeoutMs = getTimeoutMs()
    if (timeoutMs <= 0) {
      return
    }

    if (timer) {
      clearTimeout(timer)
    }
    timer = setTimeout(() => {
      timer = null
      input.onTimeout({
        timeoutMs,
        hasSeenProgress,
      })
    }, timeoutMs)
  }

  return {
    start() {
      schedule()
    },
    touch() {
      hasSeenProgress = true
      schedule()
    },
    suspend() {
      suspended = true
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
    },
    resume() {
      suspended = false
      schedule()
    },
    clear() {
      suspended = true
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
    },
  }
}

function createPermissionMemoryKey(
  input: PermissionRequest,
  hostState: StudioHostState,
): string {
  return `${hostState.workspacePath ?? 'no-workspace'}:${input.toolName}`
}

function isPathInsideWorkspace(rawPath: unknown, workspacePath: string): boolean {
  if (typeof rawPath !== 'string' || rawPath.trim().length === 0) {
    return false
  }

  const workspaceRoot = path.resolve(workspacePath)
  const targetPath = path.resolve(workspaceRoot, rawPath)
  const relativePath = path.relative(workspaceRoot, targetPath)

  return (
    relativePath === '' ||
    (!relativePath.startsWith('..') && !path.isAbsolute(relativePath))
  )
}

function isWorkspaceScopedMutation(
  input: PermissionRequest,
  workspacePath: string,
): boolean {
  if (!WORKSPACE_PATH_MUTATION_TOOL_NAMES.has(input.toolName)) {
    return false
  }

  return isPathInsideWorkspace(input.args['path'], workspacePath)
}

function buildPermissionDescription(input: PermissionRequest): string {
  const command = typeof input.args['command'] === 'string'
    ? input.args['command']
    : null
  const cwd = typeof input.args['cwd'] === 'string' ? input.args['cwd'] : null
  const pid = typeof input.args['pid'] === 'number' ? input.args['pid'] : null

  switch (input.toolName) {
    case 'bash':
      return command
        ? `bash 将执行命令: ${command}${cwd ? `（cwd: ${cwd}）` : ''}`
        : 'bash 请求执行 shell 命令。'
    case 'git':
      return command
        ? `git 将执行命令: ${command}`
        : 'git 请求执行版本控制操作。'
    case 'kill_shell':
      return pid === null
        ? 'kill_shell 请求查看或终止后台 shell 进程。'
        : `kill_shell 将终止后台进程: ${pid}`
    default:
      return `${input.toolName} 请求执行。`
  }
}

function toUserQuestionDialogRequest(
  input: UserQuestionRequest,
): UserQuestionDialogRequest {
  return {
    requestId: createUserInputRequestId(),
    sessionId: input.sessionId,
    questions: input.questions.map((question) => ({
      key: question.key,
      title: question.title,
      type: question.type,
      ...(question.options
        ? {
            options: question.options.map((option) => ({
              label: option.label,
              ...(option.description
                ? { description: option.description }
                : {}),
            })),
          }
        : {}),
      ...(question.placeholder
        ? { placeholder: question.placeholder }
        : {}),
    })),
  }
}

interface DefaultPermissionContext {
  rememberedPermissions: Map<string, PermissionResolution & { reason?: string }>
  requestPermissionFromRenderer(
    request: PermissionDialogRequest,
    memoryKey: string,
  ): Promise<PermissionResolution & { reason?: string }>
}

interface PendingPermissionRequest {
  memoryKey: string
  timer: ReturnType<typeof setTimeout>
  resolve(resolution: PermissionResolution & { reason?: string }): void
}

interface PendingUserInputRequest {
  timer: ReturnType<typeof setTimeout>
  resolve(result: UserQuestionResult): void
}

async function defaultResolvePermission(
  input: PermissionRequest,
  hostState: StudioHostState,
  context: DefaultPermissionContext,
): Promise<PermissionResolution & { reason?: string }> {
  if (!hostState.workspacePath?.trim()) {
    return {
      allow: false,
      reason: 'workspace-not-ready',
    }
  }

  if (SAFE_READ_TOOL_NAMES.has(input.toolName)) {
    return {
      allow: true,
      remember: true,
      reason: 'safe-read-tool',
    }
  }

  if (isWorkspaceScopedMutation(input, hostState.workspacePath)) {
    return {
      allow: true,
      remember: true,
      reason: 'workspace-scoped-tool',
    }
  }

  if (WORKSPACE_PATH_MUTATION_TOOL_NAMES.has(input.toolName)) {
    return {
      allow: false,
      reason: 'outside-workspace',
    }
  }

  if (TRUSTED_MUTATION_TOOL_NAMES.has(input.toolName)) {
    return {
      allow: true,
      remember: true,
      reason: 'workspace-scoped-tool',
    }
  }

  if (INTERACTIVE_PERMISSION_TOOL_NAMES.has(input.toolName)) {
    const memoryKey = createPermissionMemoryKey(input, hostState)
    const remembered = context.rememberedPermissions.get(memoryKey)
    if (remembered) {
      return {
        ...remembered,
        reason: 'remembered-permission',
      }
    }

    return context.requestPermissionFromRenderer(
      {
        requestId: createPermissionRequestId(),
        toolName: input.toolName,
        args: input.args,
        description: buildPermissionDescription(input),
      },
      memoryKey,
    )
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
  const submitTimeoutMs = options.submitTimeoutMs ?? 60_000
  const submitPostProgressTimeoutMs = Math.max(submitTimeoutMs, 10 * 60_000)
  const permissionRequestTimeoutMs = options.permissionRequestTimeoutMs ?? 30_000
  const userInputRequestTimeoutMs = options.userInputRequestTimeoutMs ?? 60_000
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
  const rememberedPermissions = new Map<
    string,
    PermissionResolution & { reason?: string }
  >()
  const pendingPermissionRequests = new Map<string, PendingPermissionRequest>()
  const pendingUserInputRequests = new Map<string, PendingUserInputRequest>()

  function requestPermissionFromRenderer(
    request: PermissionDialogRequest,
    memoryKey: string,
  ): Promise<PermissionResolution & { reason?: string }> {
    const webContents = options.mainWindowManager?.getMainWindow()?.webContents
    if (!webContents?.send) {
      return Promise.resolve({
        allow: false,
        reason: 'permission-ui-unavailable',
      })
    }

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        pendingPermissionRequests.delete(request.requestId)
        logger.warn('权限请求等待超时，已自动拒绝', {
          requestId: request.requestId,
          toolName: request.toolName,
          timeoutMs: permissionRequestTimeoutMs,
        })
        resolve({
          allow: false,
          reason: 'permission-timeout',
        })
      }, permissionRequestTimeoutMs)

      pendingPermissionRequests.set(request.requestId, {
        memoryKey,
        timer,
        resolve,
      })
      webContents.send(
        STUDIO_BRIDGE_CHANNELS.permissionRequest,
        request,
      )
    })
  }

  function requestUserInputFromRenderer(
    request: UserQuestionDialogRequest,
  ): Promise<UserQuestionResult> {
    const windowInstance = options.mainWindowManager?.getMainWindow()
    const webContents = windowInstance?.webContents
    if (!webContents || typeof webContents.send !== 'function') {
      return Promise.resolve({
        answers: {},
        cancelled: true,
      })
    }
    const sendUserInputRequest = webContents.send.bind(webContents)

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        pendingUserInputRequests.delete(request.requestId)
        logger.warn('用户提问等待超时，已自动取消', {
          requestId: request.requestId,
          sessionId: request.sessionId,
          timeoutMs: userInputRequestTimeoutMs,
        })
        resolve({
          answers: {},
          cancelled: true,
        })
      }, userInputRequestTimeoutMs)

      pendingUserInputRequests.set(request.requestId, {
        timer,
        resolve,
      })
      sendUserInputRequest(
        STUDIO_BRIDGE_CHANNELS.userInputRequest,
        request,
      )
    })
  }

  const resolvePermissionFn =
    options.resolvePermissionFn ??
    ((input: PermissionRequest, hostState: StudioHostState) =>
      defaultResolvePermission(input, hostState, {
        rememberedPermissions,
        requestPermissionFromRenderer,
      }))
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
      bridgeState.submitActivity?.touch()
      bridgeState.eventSink?.(toStudioRuntimeEvent(event))
    },
    async requestPermission(input) {
      bridgeState.submitActivity?.touch()
      bridgeState.eventSink?.({
        type: 'permission.request',
        timestamp: new Date().toISOString(),
        sessionId: input.sessionId,
        payload: toPermissionEventPayload(input),
      })

      bridgeState.submitActivity?.suspend()
      let resolution: PermissionResolution & { reason?: string }
      try {
        resolution = await resolvePermissionFn(input, bridgeState.hostState)
      } finally {
        bridgeState.submitActivity?.resume()
      }

      bridgeState.submitActivity?.touch()
      bridgeState.eventSink?.({
        type: 'permission.decision',
        timestamp: new Date().toISOString(),
        sessionId: input.sessionId,
        payload: toPermissionEventPayload(input, resolution),
      })

      return resolution
    },
    async requestUserInput(input) {
      bridgeState.submitActivity?.touch()
      bridgeState.submitActivity?.suspend()
      try {
        return await requestUserInputFromRenderer(toUserQuestionDialogRequest(input))
      } finally {
        bridgeState.submitActivity?.resume()
      }
    },
  })

  return {
    respondToPermissionRequest(response) {
      const pending = pendingPermissionRequests.get(response.requestId)
      if (!pending) {
        return false
      }

      clearTimeout(pending.timer)
      pendingPermissionRequests.delete(response.requestId)

      const resolution: PermissionResolution & { reason?: string } = {
        allow: response.allow,
        remember: response.remember,
        reason: response.allow ? 'renderer-approved' : 'renderer-denied',
      }
      if (response.remember) {
        rememberedPermissions.set(pending.memoryKey, resolution)
      }
      pending.resolve(resolution)
      return true
    },

    respondToUserInputRequest(response) {
      const pending = pendingUserInputRequests.get(response.requestId)
      if (!pending) {
        return false
      }

      clearTimeout(pending.timer)
      pendingUserInputRequests.delete(response.requestId)
      pending.resolve({
        answers: response.answers,
        cancelled: response.cancelled,
      })
      return true
    },

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
      const runId = createRuntimeRunId()
      let hasEmittedRunFailed = false

      try {
        emitRunLifecycleEvent(emitRuntimeEvent, {
          type: 'run_started',
          runId,
          sessionId: request.sessionId ?? null,
          agentId: request.agentId ?? null,
          payload: {
            projectPath: cwd,
            providerId: request.providerId ?? null,
            modelId: request.modelId ?? null,
            status: 'running',
          },
        })

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

        // 防止 LLM 或启动链路无限挂起，避免 IPC 一直等待。
        logger.info('runtimeInstance.submit 开始', {
          provider: request.providerId,
          model: request.modelId,
          cwd,
        })
        let turnResult: RuntimeTurnResult
        try {
          turnResult = await new Promise<RuntimeTurnResult>((resolve, reject) => {
            let settled = false
            const finish = (callback: () => void) => {
              if (settled) {
                return
              }
              settled = true
              runtimeHandle.entry.bridgeState.submitActivity = null
              submitActivity.clear()
              callback()
            }
            const submitActivity = createSubmitActivityWatchdog({
              initialTimeoutMs: submitTimeoutMs,
              postProgressTimeoutMs: submitPostProgressTimeoutMs,
              onTimeout: ({ timeoutMs, hasSeenProgress }) => {
                logger.warn('runtimeInstance.submit 长时间无进展，调用 abort', {
                  timeoutMs,
                  hasSeenProgress,
                  stage: hasSeenProgress ? 'post-progress' : 'initial',
                  cwd,
                  provider: request.providerId,
                  model: request.modelId,
                })
                runtimeInstance.abort()
                finish(() => {
                  reject(
                    new Error(
                      `LLM 请求连续 ${timeoutMs / 1000} 秒没有新的运行进展，已自动中断。请检查网络连接、API Key、baseURL 配置，或稍后重试。`,
                    ),
                  )
                })
              },
            })
            runtimeHandle.entry.bridgeState.submitActivity = submitActivity
            submitActivity.start()
            let submitPromise: Promise<RuntimeTurnResult>
            try {
              submitPromise = runtimeInstance.submit(runtimeSubmitInput)
            } catch (error) {
              finish(() => {
                reject(error)
              })
              return
            }
            submitPromise
              .then((result) => {
                finish(() => {
                  resolve(result)
                })
              })
              .catch((err) => {
                finish(() => {
                  reject(err)
                })
              })
          })
        } catch (error) {
          logger.error('runtimeInstance.submit 异常或超时', error)
          throw error
        }

        logger.info('runtimeInstance.submit 返回', { hasError: Boolean(turnResult.error) })

        if (turnResult.error) {
          hasEmittedRunFailed = true
          emitRunLifecycleEvent(emitRuntimeEvent, {
            type: 'run_failed',
            runId,
            sessionId: turnResult.sessionId,
            agentId: request.agentId ?? null,
            payload: {
              message: turnResult.error,
              stopReason: turnResult.stopReason,
              aborted: turnResult.aborted,
            },
          })
          return {
            ok: false,
            error: turnResult.error,
          }
        }

        runtimeManager.commitSession(runtimeHandle.entry, turnResult.sessionId)
        emitRunLifecycleEvent(emitRuntimeEvent, {
          type: 'run_completed',
          runId,
          sessionId: turnResult.sessionId,
          agentId: request.agentId ?? null,
          payload: {
            sessionId: turnResult.sessionId,
            stopReason: turnResult.stopReason,
            llmCallCount: turnResult.llmCallCount,
            toolCallCount: turnResult.toolCallCount,
            aborted: turnResult.aborted,
          },
        })

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
        if (!hasEmittedRunFailed) {
          emitRunLifecycleEvent(emitRuntimeEvent, {
            type: 'run_failed',
            runId,
            sessionId: request.sessionId ?? null,
            agentId: request.agentId ?? null,
            payload: {
              message: `runtime submit 失败: ${message}`,
            },
          })
        }
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
      for (const [requestId, pending] of pendingPermissionRequests) {
        clearTimeout(pending.timer)
        pending.resolve({
          allow: false,
          reason: 'runtime-disposed',
        })
        pendingPermissionRequests.delete(requestId)
      }
      for (const [requestId, pending] of pendingUserInputRequests) {
        clearTimeout(pending.timer)
        pending.resolve({
          answers: {},
          cancelled: true,
        })
        pendingUserInputRequests.delete(requestId)
      }
      await runtimeManager.dispose()
    },
  }
}
