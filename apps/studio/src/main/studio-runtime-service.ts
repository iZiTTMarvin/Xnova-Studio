import path from 'node:path'
import {
  loadResolvedConfig,
  type ResolvedConfigResult,
} from '@config/resolver.js'
import { getMessagePlainText } from '@persistence/index.js'
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
  RuntimeCancelRequest,
  RuntimeCancelResult,
  PermissionDialogRequest,
  PermissionDialogResponse,
  UserQuestionDialogRequest,
  UserQuestionDialogResponse,
  StudioHostState,
  StudioRuntimeEvent,
} from '../shared/studio-bridge-contract'
import { STUDIO_BRIDGE_CHANNELS } from '../shared/studio-bridge-contract'
import {
  createStudioSubmitTiming,
  isStudioSubmitTimingEnabled,
} from './studio-submit-timing'

export interface StudioRuntimeService {
  submit(
    request: RuntimeSubmitRequest,
    hostState: StudioHostState,
    emitRuntimeEvent: (event: StudioRuntimeEvent) => void,
  ): Promise<RuntimeSubmitResult>
  cancel(request: RuntimeCancelRequest): Promise<RuntimeCancelResult>
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
  firstChunkTimeoutMs?: number
  timingDebug?: boolean
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
const MODEL_FIRST_CHUNK_TIMEOUT_MESSAGE =
  '模型请求长时间没有返回首个响应，请检查网络、模型服务或稍后重试。'

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
    type: 'run_started' | 'run_completed' | 'run_failed' | 'run_cancelled'
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

function resolveRuntimeWorkspaceRoot(
  request: RuntimeSubmitRequest,
  hostState: StudioHostState,
  cwd: string,
): string {
  const explicitProjectPath = request.projectPath?.trim()
  if (explicitProjectPath) {
    return explicitProjectPath
  }
  return hostState.workspacePath?.trim() || cwd
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
        content: getMessagePlainText(message),
      }))
      .filter((message) => message.content.length > 0)

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
): SubmitActivityController {
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

interface SubmitActivityController {
  start(): void
  touch(): void
  suspend(): void
  resume(): void
  clear(): void
}

interface ActiveStudioRun {
  runId: string
  sessionId: string | null
  agentId: string | null
  runtimeInstance: RuntimeInstance
  runtimeEntry: StudioManagedRuntimeEntry
  emitRuntimeEvent: (event: StudioRuntimeEvent) => void
  startedAt: number
  lastProgressAt: number
  settled: boolean
  released: boolean
  submitActivity: SubmitActivityController | null
  timing: ReturnType<typeof createStudioSubmitTiming> | null
  firstChunkTimer: ReturnType<typeof setTimeout> | null
  pendingModelRequest:
    | {
        providerId?: string | null
        modelId?: string | null
        phase?: 'initial' | 'after_tool_result' | 'retry'
      }
    | null
  resolveSubmit?: (result: RuntimeTurnResult) => void
  rejectSubmit?: (error: Error) => void
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
  const firstChunkTimeoutMs = options.firstChunkTimeoutMs ?? 45_000
  const timingDebug = options.timingDebug ?? isStudioSubmitTimingEnabled()
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
  let currentRun: ActiveStudioRun | null = null

  function touchActiveRun(run: ActiveStudioRun, sessionId?: string): void {
    run.lastProgressAt = Date.now()
    if (sessionId?.trim()) {
      run.sessionId = sessionId
    }
  }

  function settleActiveRun(
    run: ActiveStudioRun,
    input: {
      type: 'run_completed' | 'run_failed' | 'run_cancelled'
      sessionId?: string | null
      payload: Record<string, unknown>
    },
  ): boolean {
    if (run.settled) {
      return false
    }

    run.settled = true
    run.sessionId = input.sessionId ?? run.sessionId
    emitRunLifecycleEvent(run.emitRuntimeEvent, {
      type: input.type,
      runId: run.runId,
      sessionId: run.sessionId,
      agentId: run.agentId,
      payload: input.payload,
    })
    return true
  }

  function clearFirstChunkGuard(run: ActiveStudioRun): void {
    if (run.firstChunkTimer) {
      clearTimeout(run.firstChunkTimer)
      run.firstChunkTimer = null
    }
    run.pendingModelRequest = null
  }

  function startFirstChunkGuard(
    run: ActiveStudioRun,
    payload?: Record<string, unknown>,
  ): void {
    clearFirstChunkGuard(run)
    run.pendingModelRequest = {
      ...(typeof payload?.providerId === 'string' || payload?.providerId === null
        ? { providerId: payload.providerId as string | null }
        : {}),
      ...(typeof payload?.modelId === 'string' || payload?.modelId === null
        ? { modelId: payload.modelId as string | null }
        : {}),
      ...(payload?.phase === 'initial' ||
      payload?.phase === 'after_tool_result' ||
      payload?.phase === 'retry'
        ? { phase: payload.phase }
        : {}),
    }

    if (firstChunkTimeoutMs <= 0) {
      return
    }

    run.firstChunkTimer = setTimeout(() => {
      if (currentRun?.runId !== run.runId || run.settled || run.released) {
        return
      }

      logger.warn('模型请求首包超时，调用 abort', {
        runId: run.runId,
        timeoutMs: firstChunkTimeoutMs,
        providerId: run.pendingModelRequest?.providerId ?? null,
        modelId: run.pendingModelRequest?.modelId ?? null,
        phase: run.pendingModelRequest?.phase ?? 'initial',
      })

      try {
        run.runtimeInstance.abort()
      } catch (error) {
        logger.warn('first chunk timeout 调用 abort 失败', {
          runId: run.runId,
          error: error instanceof Error ? error.message : String(error),
        })
      }

      cancelPendingRuntimeInteractions('first-chunk-timeout')
      run.emitRuntimeEvent({
        type: 'model_request_failed',
        timestamp: new Date().toISOString(),
        runId: run.runId,
        ...(run.sessionId ? { sessionId: run.sessionId } : {}),
        ...(run.agentId ? { agentId: run.agentId } : {}),
        payload: {
          ...(run.pendingModelRequest?.providerId !== undefined
            ? { providerId: run.pendingModelRequest.providerId }
            : {}),
          ...(run.pendingModelRequest?.modelId !== undefined
            ? { modelId: run.pendingModelRequest.modelId }
            : {}),
          ...(run.pendingModelRequest?.phase !== undefined
            ? { phase: run.pendingModelRequest.phase }
            : {}),
          elapsedMs: firstChunkTimeoutMs,
          message: MODEL_FIRST_CHUNK_TIMEOUT_MESSAGE,
        },
      })
      settleActiveRun(run, {
        type: 'run_failed',
        sessionId: run.sessionId,
        payload: {
          message: MODEL_FIRST_CHUNK_TIMEOUT_MESSAGE,
          timeoutMs: firstChunkTimeoutMs,
          reason: 'first-chunk-timeout',
        },
      })
      run.rejectSubmit?.(new Error(MODEL_FIRST_CHUNK_TIMEOUT_MESSAGE))
      releaseActiveRun(run)
    }, firstChunkTimeoutMs)
  }

  function releaseActiveRun(run: ActiveStudioRun): void {
    if (run.released) {
      return
    }

    run.released = true
    clearFirstChunkGuard(run)
    run.submitActivity?.clear()
    run.runtimeEntry.bridgeState.submitActivity = null
    runtimeManager.releaseRuntime(run.runtimeEntry)
    if (currentRun?.runId === run.runId) {
      currentRun = null
    }
  }

  function createSyntheticTurnResultFromEvent(
    run: ActiveStudioRun,
    event: StudioRuntimeEvent,
  ): RuntimeTurnResult {
    const payload = event.payload ?? {}
    const stopReason =
      typeof payload.stopReason === 'string' ? payload.stopReason : event.type
    const error =
      typeof payload.error === 'string'
        ? payload.error
        : typeof payload.message === 'string'
          ? payload.message
          : undefined

    return {
      text: '',
      thinking: '',
      stopReason,
      llmCallCount: 0,
      toolCallCount: 0,
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
      aborted: payload.aborted === true,
      historyCompacted: false,
      sessionId: event.sessionId ?? run.sessionId,
      ...(error ? { error } : {}),
    }
  }

  function settleRunFromRuntimeTerminalEvent(
    run: ActiveStudioRun,
    event: StudioRuntimeEvent,
  ): void {
    if (run.settled) {
      return
    }

    const result = createSyntheticTurnResultFromEvent(run, event)
    const message = result.error ?? (result.aborted ? '运行已中断。' : null)
    if (message) {
      settleActiveRun(run, {
        type: 'run_failed',
        sessionId: result.sessionId,
        payload: {
          message,
          stopReason: result.stopReason,
          aborted: result.aborted,
        },
      })
    } else {
      settleActiveRun(run, {
        type: 'run_completed',
        sessionId: result.sessionId,
        payload: {
          sessionId: result.sessionId,
          stopReason: result.stopReason,
          aborted: result.aborted,
        },
      })
    }
    run.resolveSubmit?.(result)
  }

  function cancelPendingRuntimeInteractions(reason: string): void {
    for (const [requestId, pending] of [...pendingPermissionRequests.entries()]) {
      clearTimeout(pending.timer)
      pendingPermissionRequests.delete(requestId)
      pending.resolve({
        allow: false,
        reason,
      })
    }
    for (const [requestId, pending] of [...pendingUserInputRequests.entries()]) {
      clearTimeout(pending.timer)
      pendingUserInputRequests.delete(requestId)
      pending.resolve({
        answers: {},
        cancelled: true,
      })
    }
  }

  const createRuntimeBridge = (
    bridgeState: StudioRuntimeBridgeState,
  ): RuntimeHostBridge => ({
    emit(event: RuntimeEvent) {
      const activeRun = currentRun
      if (!activeRun || activeRun.settled) {
        return
      }

      if (event.type === 'timing_mark') {
        activeRun.timing?.markRuntimeEvent({
          ...toStudioRuntimeEvent(event),
          runId: activeRun.runId,
        })
        // 同时透传给 renderer：让 UI 能根据 stage 翻译为"加载配置 / 索引文件 / 初始化插件"
        // 等中文步骤文案，弥补 bootstrap 阶段的 UI 反馈空白。
        // 不影响 submitActivity 续期（bootstrap 阶段不应被无进展 watchdog 误杀）。
        bridgeState.submitActivity?.touch()
        const studioTimingEvent: StudioRuntimeEvent = {
          ...toStudioRuntimeEvent(event),
          runId: activeRun.runId,
        }
        activeRun.emitRuntimeEvent(studioTimingEvent)
        return
      }

      if (event.type === 'model_request_started') {
        startFirstChunkGuard(
          activeRun,
          event.payload && typeof event.payload === 'object'
            ? event.payload
            : undefined,
        )
      } else if (
        event.type === 'model_first_chunk' ||
        event.type === 'model_request_finished' ||
        event.type === 'model_request_failed'
      ) {
        clearFirstChunkGuard(activeRun)
      }

      bridgeState.submitActivity?.touch()
      touchActiveRun(activeRun, event.sessionId)
      const studioEvent: StudioRuntimeEvent = {
        ...toStudioRuntimeEvent(event),
        runId: activeRun.runId,
      }
      activeRun.timing?.markRuntimeEvent(studioEvent)
      bridgeState.eventSink?.(studioEvent)
      if (
        (event.type === 'turn_end' || event.type === 'session_end')
      ) {
        settleRunFromRuntimeTerminalEvent(activeRun, studioEvent)
      }
    },
    async requestPermission(input) {
      bridgeState.submitActivity?.touch()
      const activeRun = currentRun
      if (activeRun) {
        touchActiveRun(activeRun, input.sessionId)
      }
      bridgeState.eventSink?.({
        type: 'permission.request',
        timestamp: new Date().toISOString(),
        ...(activeRun ? { runId: activeRun.runId } : {}),
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
      if (activeRun) {
        touchActiveRun(activeRun, input.sessionId)
      }
      bridgeState.eventSink?.({
        type: 'permission.decision',
        timestamp: new Date().toISOString(),
        ...(activeRun ? { runId: activeRun.runId } : {}),
        sessionId: input.sessionId,
        payload: toPermissionEventPayload(input, resolution),
      })

      return resolution
    },
    async requestUserInput(input) {
      bridgeState.submitActivity?.touch()
      const activeRun = currentRun
      if (activeRun) {
        touchActiveRun(activeRun, input.sessionId)
      }
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

    async cancel(request) {
      const requestedRunId = request.runId?.trim() || null
      const activeRun = currentRun
      if (
        !activeRun ||
        activeRun.settled ||
        (requestedRunId && activeRun.runId !== requestedRunId)
      ) {
        return {
          ok: false,
          error: '当前没有正在运行的 Agent run。',
        }
      }

      const reason = request.reason?.trim() || 'user-requested'
      cancelPendingRuntimeInteractions(reason)
      clearFirstChunkGuard(activeRun)
      try {
        activeRun.runtimeInstance.abort()
      } catch (error) {
        logger.warn('runtime cancel 调用 abort 失败', {
          runId: activeRun.runId,
          error: error instanceof Error ? error.message : String(error),
        })
      }

      settleActiveRun(activeRun, {
        type: 'run_cancelled',
        sessionId: activeRun.sessionId,
        payload: {
          message: '已停止当前运行',
          reason,
        },
      })
      activeRun.timing?.markFirst('runtime_submit_resolved_or_rejected')
      activeRun.timing?.finish('cancelled')
      activeRun.rejectSubmit?.(new Error('已停止当前运行。'))
      releaseActiveRun(activeRun)

      return {
        ok: true,
        runId: activeRun.runId,
      }
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

      // 主进程串行化兜底：renderer 已经有 isActiveRunStatus 门禁，
      // 但 IPC 重发 / 多窗口共享 runtime / 双提交竞争都可能让第二个 submit 进来。
      // 这里直接拒绝并给出明确错误，让 UI 不会出现"两次 run_started 但只有一次响应"。
      if (currentRun !== null) {
        return {
          ok: false,
          error: '当前已有 Agent run 正在执行，请等待结束后再发送下一条。',
        }
      }

      const submitTiming = createStudioSubmitTiming({
        enabled: timingDebug,
        logger,
        ...(request.timing === undefined ? {} : { clientMarks: request.timing }),
      })
      submitTiming.mark('runtime_service_submit_start')

      let runtimeEntry: StudioManagedRuntimeEntry | null = null
      let activeRun: ActiveStudioRun | null = null
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

        submitTiming.mark('config_load_start')
        const resolved = loadResolvedConfigFn(cwd)
        submitTiming.mark('config_load_done')
        const workspaceRoot = resolveRuntimeWorkspaceRoot(request, hostState, cwd)
        const permissionHostState: StudioHostState = {
          ...hostState,
          workspacePath: workspaceRoot,
        }
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
        submitTiming.mark('runtime_acquire_start')
        const runtimeHandle = await runtimeManager.acquireRuntime({
          selection,
          config: runtimeConfig,
          hostState: permissionHostState,
          emitRuntimeEvent,
          createRuntimeFn,
          createBridge: (bridgeState) => createRuntimeBridge(bridgeState),
        })
        submitTiming.mark('runtime_acquire_done')
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
        activeRun = {
          runId,
          sessionId: selection.sessionId,
          agentId: selection.agentId,
          runtimeInstance,
          runtimeEntry: runtimeHandle.entry,
          emitRuntimeEvent,
          startedAt: Date.now(),
          lastProgressAt: Date.now(),
          settled: false,
          released: false,
          submitActivity: null,
          timing: submitTiming,
          firstChunkTimer: null,
          pendingModelRequest: null,
        }
        currentRun = activeRun
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
        submitTiming.mark('runtime_instance_submit_start')
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
                const timeoutMessage =
                  `LLM 请求连续 ${timeoutMs / 1000} 秒没有新的运行进展，已自动中断。请检查网络连接、API Key、baseURL 配置，或稍后重试。`
                logger.warn('runtimeInstance.submit 长时间无进展，调用 abort', {
                  timeoutMs,
                  hasSeenProgress,
                  stage: hasSeenProgress ? 'post-progress' : 'initial',
                  cwd,
                  provider: request.providerId,
                  model: request.modelId,
                })
                runtimeInstance.abort()
                cancelPendingRuntimeInteractions('submit-timeout')
                if (activeRun) {
                  settleActiveRun(activeRun, {
                    type: 'run_failed',
                    sessionId: activeRun.sessionId,
                    payload: {
                      message: '长时间无运行进展，已自动中断。',
                      detail: timeoutMessage,
                      timeoutMs,
                      hasSeenProgress,
                    },
                  })
                  releaseActiveRun(activeRun)
                }
                finish(() => {
                  reject(new Error(timeoutMessage))
                })
              },
            })
            if (activeRun) {
              activeRun.submitActivity = submitActivity
              activeRun.resolveSubmit = (result) => {
                finish(() => {
                  resolve(result)
                })
              }
              activeRun.rejectSubmit = (error) => {
                finish(() => {
                  reject(error)
                })
              }
            }
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
        submitTiming.mark('runtime_submit_resolved_or_rejected')

        if (turnResult.error) {
          if (!activeRun?.settled) {
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
            if (activeRun) {
              activeRun.settled = true
            }
          }
          submitTiming.finish('failed')
          return {
            ok: false,
            error: turnResult.error,
          }
        }

        runtimeManager.commitSession(runtimeHandle.entry, turnResult.sessionId)
        if (!activeRun?.settled) {
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
          if (activeRun) {
            activeRun.settled = true
          }
        }

        logger.info('runtime submit 完成', {
          cwd,
          sessionId: turnResult.sessionId,
        })
        submitTiming.finish('completed')

        return {
          ok: true,
          sessionId: turnResult.sessionId,
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        logger.error('runtime submit 执行失败', error)
        submitTiming.markFirst('runtime_submit_resolved_or_rejected')
        if (!hasEmittedRunFailed && !activeRun?.settled) {
          emitRunLifecycleEvent(emitRuntimeEvent, {
            type: 'run_failed',
            runId,
            sessionId: request.sessionId ?? null,
            agentId: request.agentId ?? null,
            payload: {
              message: `runtime submit 失败: ${message}`,
            },
          })
          if (activeRun) {
            activeRun.settled = true
          }
        }
        submitTiming.finish('failed')
        return {
          ok: false,
          error:
            message === MODEL_FIRST_CHUNK_TIMEOUT_MESSAGE
              ? message
              : `runtime submit 失败: ${message}`,
        }
      } finally {
        if (activeRun) {
          releaseActiveRun(activeRun)
        } else if (runtimeEntry) {
          runtimeManager.releaseRuntime(runtimeEntry)
        }
      }
    },

    async dispose() {
      const activeRun = currentRun
      if (activeRun && !activeRun.released) {
        cancelPendingRuntimeInteractions('runtime-disposed')
        clearFirstChunkGuard(activeRun)
        try {
          activeRun.runtimeInstance.abort()
        } catch (error) {
          logger.warn('runtime dispose 调用 abort 失败', {
            runId: activeRun.runId,
            error: error instanceof Error ? error.message : String(error),
          })
        }
        settleActiveRun(activeRun, {
          type: 'run_cancelled',
          sessionId: activeRun.sessionId,
          payload: {
            message: '应用正在退出，已停止当前运行。',
            reason: 'runtime-disposed',
          },
        })
        activeRun.timing?.markFirst('runtime_submit_resolved_or_rejected')
        activeRun.timing?.finish('cancelled')
        activeRun.rejectSubmit?.(new Error('应用正在退出，已停止当前运行。'))
        releaseActiveRun(activeRun)
      }

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
