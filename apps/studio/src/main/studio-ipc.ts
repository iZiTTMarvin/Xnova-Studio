import type { MainLogger } from './logger'
import type {
  BindWorkspaceRequest,
  WorkspaceSelectionResult,
} from '../shared/studio-bridge-contract'
import {
  STUDIO_BRIDGE_CHANNELS,
  type StudioSkillsPluginsOverviewSnapshot,
  type StudioMcpMutationResult,
  type StudioMcpOverviewSnapshot,
  type StudioMcpServerMutationInput,
  type StudioMemoryOverviewSnapshot,
  type StudioMemoryRebuildResult,
  type OpenWorkspaceResponse,
  type StudioProviderConnectionTestRequest,
  type StudioProviderConnectionTestResult,
  type StudioProviderSettingsSaveInput,
  type StudioProviderSettingsSaveResult,
  type StudioProviderSettingsSnapshot,
  type RuntimeInspectRequest,
  type RuntimeInspectResult,
  type RuntimeCancelRequest,
  type RuntimeCancelResult,
  type RuntimeSubmitRequest,
  type RuntimeSubmitResult,
  type PermissionDialogResponse,
  type UserQuestionDialogResponse,
  type StudioHostState,
  type StudioShellSnapshot,
  type StudioShellSnapshotRequest,
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

function parseBindWorkspacePayload(payload: unknown): BindWorkspaceRequest {
  if (!isPlainObject(payload)) {
    throw new Error('studio.host.bindWorkspace 参数必须是对象。')
  }
  if (Object.keys(payload).some((key) => key !== 'workspacePath')) {
    throw new Error('studio.host.bindWorkspace 只允许 workspacePath 字段。')
  }
  if (typeof payload.workspacePath !== 'string') {
    throw new Error('studio.host.bindWorkspace.workspacePath 必须是字符串。')
  }

  const workspacePath = payload.workspacePath.trim()
  if (!workspacePath) {
    throw new Error('studio.host.bindWorkspace.workspacePath 不能为空。')
  }

  return { workspacePath }
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

function parseRuntimeSubmitPayload(payload: unknown): RuntimeSubmitRequest {
  if (!isPlainObject(payload)) {
    throw new Error('studio.runtime.submit 参数必须是对象。')
  }

  if (
    Object.keys(payload).some(
      (key) =>
        key !== 'text' &&
        key !== 'projectPath' &&
        key !== 'sessionId' &&
        key !== 'agentId' &&
        key !== 'providerId' &&
        key !== 'modelId' &&
        key !== 'timing',
    )
  ) {
    throw new Error(
      'studio.runtime.submit 只允许 text/projectPath/sessionId/agentId/providerId/modelId/timing 字段。',
    )
  }

  if (typeof payload.text !== 'string') {
    throw new Error('studio.runtime.submit.text 必须是字符串。')
  }
  const text = payload.text.trim()
  if (!text) {
    throw new Error('studio.runtime.submit.text 不能为空。')
  }

  const parseNullableField = (
    value: unknown,
    subject: string,
  ): string | null | undefined => {
    if (value === undefined) {
      return undefined
    }
    if (value === null) {
      return null
    }
    if (typeof value !== 'string') {
      throw new Error(`${subject} 必须是字符串或 null。`)
    }
    const normalized = value.trim()
    return normalized ? normalized : null
  }

  const projectPath = parseNullableField(
    payload.projectPath,
    'studio.runtime.submit.projectPath',
  )
  const sessionId = parseNullableField(
    payload.sessionId,
    'studio.runtime.submit.sessionId',
  )
  const agentId = parseNullableField(payload.agentId, 'studio.runtime.submit.agentId')
  const providerId = parseNullableField(
    payload.providerId,
    'studio.runtime.submit.providerId',
  )
  const modelId = parseNullableField(payload.modelId, 'studio.runtime.submit.modelId')
  const timing = parseRuntimeSubmitTimingPayload(payload.timing)

  return {
    text,
    ...(projectPath === undefined ? {} : { projectPath }),
    ...(sessionId === undefined ? {} : { sessionId }),
    ...(agentId === undefined ? {} : { agentId }),
    ...(providerId === undefined ? {} : { providerId }),
    ...(modelId === undefined ? {} : { modelId }),
    ...(timing === undefined ? {} : { timing }),
  }
}

function parseRuntimeSubmitTimingPayload(
  payload: unknown,
): RuntimeSubmitRequest['timing'] | undefined {
  if (payload === undefined) {
    return undefined
  }

  if (!isPlainObject(payload)) {
    throw new Error('studio.runtime.submit.timing 必须是对象。')
  }

  if (
    Object.keys(payload).some(
      (key) =>
        key !== 'userSubmitClickedAt' &&
        key !== 'rendererRuntimeSubmitInvokedAt' &&
        key !== 'ipcRuntimeSubmitReceivedAt',
    )
  ) {
    throw new Error(
      'studio.runtime.submit.timing 只允许 userSubmitClickedAt/rendererRuntimeSubmitInvokedAt/ipcRuntimeSubmitReceivedAt 字段。',
    )
  }

  const parseOptionalTimestamp = (
    value: unknown,
    subject: string,
  ): number | undefined => {
    if (value === undefined) {
      return undefined
    }
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      throw new Error(`${subject} 必须是正数时间戳。`)
    }
    return value
  }

  const userSubmitClickedAt = parseOptionalTimestamp(
    payload.userSubmitClickedAt,
    'studio.runtime.submit.timing.userSubmitClickedAt',
  )
  const rendererRuntimeSubmitInvokedAt = parseOptionalTimestamp(
    payload.rendererRuntimeSubmitInvokedAt,
    'studio.runtime.submit.timing.rendererRuntimeSubmitInvokedAt',
  )
  const ipcRuntimeSubmitReceivedAt = parseOptionalTimestamp(
    payload.ipcRuntimeSubmitReceivedAt,
    'studio.runtime.submit.timing.ipcRuntimeSubmitReceivedAt',
  )

  const timing = {
    ...(userSubmitClickedAt === undefined ? {} : { userSubmitClickedAt }),
    ...(rendererRuntimeSubmitInvokedAt === undefined
      ? {}
      : { rendererRuntimeSubmitInvokedAt }),
    ...(ipcRuntimeSubmitReceivedAt === undefined
      ? {}
      : { ipcRuntimeSubmitReceivedAt }),
  }

  return Object.keys(timing).length > 0 ? timing : undefined
}

function parseRuntimeCancelPayload(payload: unknown): RuntimeCancelRequest {
  if (payload === undefined) {
    return {}
  }

  if (!isPlainObject(payload)) {
    throw new Error('studio.runtime.cancel 参数必须是对象。')
  }

  if (Object.keys(payload).some((key) => key !== 'runId' && key !== 'reason')) {
    throw new Error('studio.runtime.cancel 只允许 runId/reason 字段。')
  }

  const parseNullableString = (
    value: unknown,
    subject: string,
  ): string | null | undefined => {
    if (value === undefined) {
      return undefined
    }
    if (value === null) {
      return null
    }
    if (typeof value !== 'string') {
      throw new Error(`${subject} 必须是字符串或 null。`)
    }
    const normalized = value.trim()
    return normalized ? normalized : null
  }

  if (payload.reason !== undefined && typeof payload.reason !== 'string') {
    throw new Error('studio.runtime.cancel.reason 必须是字符串。')
  }

  const runId = parseNullableString(payload.runId, 'studio.runtime.cancel.runId')
  const reason = typeof payload.reason === 'string' ? payload.reason.trim() : undefined

  return {
    ...(runId === undefined ? {} : { runId }),
    ...(reason ? { reason } : {}),
  }
}

function parsePermissionDialogResponsePayload(
  payload: unknown,
): PermissionDialogResponse {
  if (!isPlainObject(payload)) {
    throw new Error('studio.permission.respond 参数必须是对象。')
  }

  if (
    Object.keys(payload).some(
      (key) => key !== 'requestId' && key !== 'allow' && key !== 'remember',
    )
  ) {
    throw new Error('studio.permission.respond 只允许 requestId/allow/remember 字段。')
  }
  if (typeof payload.requestId !== 'string' || payload.requestId.trim().length === 0) {
    throw new Error('studio.permission.respond.requestId 必须是非空字符串。')
  }
  if (typeof payload.allow !== 'boolean') {
    throw new Error('studio.permission.respond.allow 必须是布尔值。')
  }
  if (typeof payload.remember !== 'boolean') {
    throw new Error('studio.permission.respond.remember 必须是布尔值。')
  }

  return {
    requestId: payload.requestId.trim(),
    allow: payload.allow,
    remember: payload.remember,
  }
}

function parseUserQuestionDialogResponsePayload(
  payload: unknown,
): UserQuestionDialogResponse {
  if (!isPlainObject(payload)) {
    throw new Error('studio.userInput.respond 参数必须是对象。')
  }

  if (
    Object.keys(payload).some(
      (key) => key !== 'requestId' && key !== 'cancelled' && key !== 'answers',
    )
  ) {
    throw new Error(
      'studio.userInput.respond 只允许 requestId/cancelled/answers 字段。',
    )
  }
  if (typeof payload.requestId !== 'string' || payload.requestId.trim().length === 0) {
    throw new Error('studio.userInput.respond.requestId 必须是非空字符串。')
  }
  if (typeof payload.cancelled !== 'boolean') {
    throw new Error('studio.userInput.respond.cancelled 必须是布尔值。')
  }
  if (!isPlainObject(payload.answers)) {
    throw new Error('studio.userInput.respond.answers 必须是对象。')
  }

  const answers = Object.fromEntries(
    Object.entries(payload.answers).map(([key, value]) => {
      if (typeof value === 'string') {
        return [key, value]
      }
      if (Array.isArray(value)) {
        return [
          key,
          value.map((item, index) => {
            if (typeof item !== 'string') {
              throw new Error(
                `studio.userInput.respond.answers.${key}[${index}] 必须是字符串。`,
              )
            }
            return item
          }),
        ]
      }
      throw new Error(
        `studio.userInput.respond.answers.${key} 必须是字符串或字符串数组。`,
      )
    }),
  ) as Record<string, string | string[]>

  return {
    requestId: payload.requestId.trim(),
    cancelled: payload.cancelled,
    answers,
  }
}

function parseShellSnapshotPayload(
  payload: unknown,
): StudioShellSnapshotRequest {
  if (payload === undefined) {
    return {}
  }

  if (!isPlainObject(payload)) {
    throw new Error('studio.shell.getSnapshot 参数必须是对象。')
  }

  if (Object.keys(payload).some((key) => key !== 'projectPath' && key !== 'sessionId')) {
    throw new Error('studio.shell.getSnapshot 只允许 projectPath/sessionId 字段。')
  }

  if (
    payload.projectPath !== undefined &&
    payload.projectPath !== null &&
    typeof payload.projectPath !== 'string'
  ) {
    throw new Error('studio.shell.getSnapshot.projectPath 必须是字符串或 null。')
  }
  if (
    payload.sessionId !== undefined &&
    payload.sessionId !== null &&
    typeof payload.sessionId !== 'string'
  ) {
    throw new Error('studio.shell.getSnapshot.sessionId 必须是字符串或 null。')
  }

  return {
    ...(payload.projectPath === undefined
      ? {}
      : { projectPath: payload.projectPath as string | null }),
    ...(payload.sessionId === undefined
      ? {}
      : { sessionId: payload.sessionId as string | null }),
  }
}

function parseProviderSettingsEntry(
  payload: unknown,
  subject: string,
): StudioProviderSettingsSaveInput['providers'][number] {
  if (!isPlainObject(payload)) {
    throw new Error(`${subject} 必须是对象。`)
  }
  if (typeof payload.id !== 'string') {
    throw new Error(`${subject}.id 必须是字符串。`)
  }
  if (typeof payload.apiKey !== 'string') {
    throw new Error(`${subject}.apiKey 必须是字符串。`)
  }
  if (
    payload.baseURL !== undefined &&
    payload.baseURL !== null &&
    typeof payload.baseURL !== 'string'
  ) {
    throw new Error(`${subject}.baseURL 必须是字符串或 null。`)
  }
  if (payload.protocol !== 'anthropic' && payload.protocol !== 'openai') {
    throw new Error(`${subject}.protocol 必须是 anthropic 或 openai。`)
  }
  if (!Array.isArray(payload.models) || payload.models.some((item) => typeof item !== 'string')) {
    throw new Error(`${subject}.models 必须是字符串数组。`)
  }
  if (
    payload.visionModels !== undefined &&
    (!Array.isArray(payload.visionModels) || payload.visionModels.some((item) => typeof item !== 'string'))
  ) {
    throw new Error(`${subject}.visionModels 必须是字符串数组。`)
  }

  return {
    id: payload.id,
    apiKey: payload.apiKey,
    baseURL:
      payload.baseURL === undefined ? null : (payload.baseURL as string | null),
    protocol: payload.protocol as 'anthropic' | 'openai',
    models: [...payload.models],
    visionModels:
      payload.visionModels === undefined ? [] : [...payload.visionModels],
  }
}

function parseProviderSettingsSavePayload(
  payload: unknown,
): StudioProviderSettingsSaveInput {
  if (!isPlainObject(payload)) {
    throw new Error('studio.settings.saveProviderSettings 参数必须是对象。')
  }
  if (typeof payload.defaultProvider !== 'string') {
    throw new Error('studio.settings.saveProviderSettings.defaultProvider 必须是字符串。')
  }
  if (typeof payload.defaultModel !== 'string') {
    throw new Error('studio.settings.saveProviderSettings.defaultModel 必须是字符串。')
  }
  if (
    payload.subAgentModel !== undefined &&
    payload.subAgentModel !== null &&
    typeof payload.subAgentModel !== 'string'
  ) {
    throw new Error('studio.settings.saveProviderSettings.subAgentModel 必须是字符串或 null。')
  }
  if (!Array.isArray(payload.providers)) {
    throw new Error('studio.settings.saveProviderSettings.providers 必须是数组。')
  }

  return {
    defaultProvider: payload.defaultProvider,
    defaultModel: payload.defaultModel,
    subAgentModel:
      payload.subAgentModel === undefined
        ? null
        : (payload.subAgentModel as string | null),
    providers: payload.providers.map((item, index) =>
      parseProviderSettingsEntry(
        item,
        `studio.settings.saveProviderSettings.providers[${index}]`,
      ),
    ),
  }
}

function parseProviderConnectionTestPayload(
  payload: unknown,
): StudioProviderConnectionTestRequest {
  if (!isPlainObject(payload)) {
    throw new Error('studio.settings.testProviderConnection 参数必须是对象。')
  }
  if (typeof payload.providerId !== 'string') {
    throw new Error('studio.settings.testProviderConnection.providerId 必须是字符串。')
  }

  return {
    providerId: payload.providerId,
    config: parseProviderSettingsEntry(
      payload.config,
      'studio.settings.testProviderConnection.config',
    ),
    ...(payload.model === undefined || payload.model === null
      ? {}
      : { model: payload.model as string }),
  }
}

function parseMcpServerConfig(
  payload: unknown,
  subject: string,
): StudioMcpServerMutationInput['config'] {
  if (!isPlainObject(payload)) {
    throw new Error(`${subject} 必须是对象。`)
  }
  if (
    payload.transport !== 'stdio' &&
    payload.transport !== 'sse' &&
    payload.transport !== 'streamable-http' &&
    payload.transport !== 'http'
  ) {
    throw new Error(`${subject}.transport 非法。`)
  }
  if (payload.command !== undefined && typeof payload.command !== 'string') {
    throw new Error(`${subject}.command 必须是字符串。`)
  }
  if (
    payload.args !== undefined &&
    (!Array.isArray(payload.args) || payload.args.some((item) => typeof item !== 'string'))
  ) {
    throw new Error(`${subject}.args 必须是字符串数组。`)
  }
  if (
    payload.url !== undefined &&
    payload.url !== null &&
    typeof payload.url !== 'string'
  ) {
    throw new Error(`${subject}.url 必须是字符串或 null。`)
  }
  if (
    payload.headers !== undefined &&
    !isPlainObject(payload.headers)
  ) {
    throw new Error(`${subject}.headers 必须是对象。`)
  }

  const headers = payload.headers
    ? Object.fromEntries(
        Object.entries(payload.headers).map(([key, value]) => {
          if (typeof value !== 'string') {
            throw new Error(`${subject}.headers.${key} 必须是字符串。`)
          }
          return [key, value]
        }),
      )
    : undefined

  return {
    transport: payload.transport,
    ...(typeof payload.command === 'string' ? { command: payload.command } : {}),
    ...(Array.isArray(payload.args) ? { args: [...payload.args] } : {}),
    ...(payload.url === undefined ? {} : { url: payload.url as string | null }),
    ...(headers ? { headers } : {}),
  }
}

function parseMcpMutationPayload(
  payload: unknown,
): StudioMcpServerMutationInput {
  if (!isPlainObject(payload)) {
    throw new Error('studio.mcp.addServer 参数必须是对象。')
  }
  if (typeof payload.name !== 'string') {
    throw new Error('studio.mcp.addServer.name 必须是字符串。')
  }
  return {
    name: payload.name,
    config: parseMcpServerConfig(payload.config, 'studio.mcp.addServer.config'),
  }
}

function parseMcpDeletePayload(payload: unknown): string {
  if (!isPlainObject(payload)) {
    throw new Error('studio.mcp.deleteServer 参数必须是对象。')
  }
  if (typeof payload.name !== 'string') {
    throw new Error('studio.mcp.deleteServer.name 必须是字符串。')
  }
  return payload.name
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
        status: result.status,
        snapshot: result.snapshot,
        workspacePath: result.workspacePath,
        configWarnings: result.configWarnings,
        issues: result.issues,
      },
    }
  }

  return {
    type: 'runtime.error',
    timestamp: new Date().toISOString(),
    payload: {
      refresh: Boolean(request.refresh),
      status: result.status,
      message: result.error,
      workspacePath: result.workspacePath,
      configWarnings: result.configWarnings,
      issues: result.issues,
    },
  }
}

export interface RegisterStudioMainIpcHandlersOptions {
  ipcMainLike: StudioIpcMainLike
  inspectRuntime: (
    request: RuntimeInspectRequest,
    state: StudioHostState,
  ) => Promise<RuntimeInspectResult>
  submitRuntime?: (
    request: RuntimeSubmitRequest,
    state: StudioHostState,
    emitRuntimeEvent: (event: StudioRuntimeEvent) => void,
  ) => Promise<RuntimeSubmitResult>
  cancelRuntime?: (
    request: RuntimeCancelRequest,
    state: StudioHostState,
  ) => Promise<RuntimeCancelResult> | RuntimeCancelResult
  respondPermission?: (response: PermissionDialogResponse) => boolean
  respondUserInput?: (response: UserQuestionDialogResponse) => boolean
  inspectShell: (
    request: StudioShellSnapshotRequest,
    state: StudioHostState,
  ) => Promise<StudioShellSnapshot>
  getProviderSettings?: (
    state: StudioHostState,
  ) => Promise<StudioProviderSettingsSnapshot>
  saveProviderSettings?: (
    input: StudioProviderSettingsSaveInput,
    state: StudioHostState,
  ) => Promise<StudioProviderSettingsSaveResult>
  testProviderConnection?: (
    input: StudioProviderConnectionTestRequest,
    state: StudioHostState,
  ) => Promise<StudioProviderConnectionTestResult>
  getMemoryOverview?: (
    state: StudioHostState,
  ) => Promise<StudioMemoryOverviewSnapshot>
  rebuildMemory?: (
    state: StudioHostState,
  ) => Promise<StudioMemoryRebuildResult>
  getMcpOverview?: (
    state: StudioHostState,
  ) => Promise<StudioMcpOverviewSnapshot>
  addMcpServer?: (
    input: StudioMcpServerMutationInput,
    state: StudioHostState,
  ) => Promise<StudioMcpMutationResult>
  deleteMcpServer?: (
    name: string,
    state: StudioHostState,
  ) => Promise<StudioMcpMutationResult>
  getSkillsPluginsOverview?: (
    state: StudioHostState,
  ) => Promise<StudioSkillsPluginsOverviewSnapshot>
  selectWorkspaceDirectory: () => Promise<WorkspaceSelectionResult>
  /** workspace 变更后的回调（用于触发 warmup 等后续动作） */
  onWorkspaceChanged?: (workspacePath: string) => void
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

        // workspace 变更后触发 warmup
        if (selection.ok && selection.path) {
          options.onWorkspaceChanged?.(selection.path)
        }

        return {
          selection,
          state: hostState,
        }
      })
    },
  )

  options.ipcMainLike.handle(
    STUDIO_BRIDGE_CHANNELS.hostBindWorkspace,
    async (_event, payload): Promise<StudioHostState> => {
      const request = parseBindWorkspacePayload(payload)

      return enqueueWorkspaceSelection(async () => {
        const selection: WorkspaceSelectionResult = {
          ok: true,
          code: 'selected',
          path: request.workspacePath,
        }
        hostState = {
          workspacePath: request.workspacePath,
          lastSelection: selection,
        }

        broadcast(STUDIO_BRIDGE_CHANNELS.hostStateChanged, hostState)
        options.logger.info('host workspace 已绑定', {
          workspacePath: hostState.workspacePath,
        })

        // workspace 绑定后触发 warmup
        options.onWorkspaceChanged?.(request.workspacePath)

        return hostState
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
          status: 'error',
          error: `runtime inspect 失败: ${message}`,
          workspacePath: hostState.workspacePath,
          configWarnings: [],
          issues: [],
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

  options.ipcMainLike.handle(
    STUDIO_BRIDGE_CHANNELS.runtimeSubmit,
    async (_event, payload): Promise<RuntimeSubmitResult> => {
      const ipcRuntimeSubmitReceivedAt = Date.now()
      const request = parseRuntimeSubmitPayload(payload)
      const requestWithTiming: RuntimeSubmitRequest = {
        ...request,
        timing: {
          ...(request.timing ?? {}),
          ipcRuntimeSubmitReceivedAt,
        },
      }

      if (!options.submitRuntime) {
        throw new Error('studio.runtime.submit 尚未实现。')
      }

      try {
        const result = await options.submitRuntime(
          requestWithTiming,
          hostState,
          (event) => {
            broadcast(STUDIO_BRIDGE_CHANNELS.runtimeEvent, event)
          },
        )

        options.logger.info('runtime submit 已完成', {
          ok: result.ok,
          workspacePath: hostState.workspacePath,
        })
        return result
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const result: RuntimeSubmitResult = {
          ok: false,
          error: `runtime submit 失败: ${message}`,
        }
        broadcast(STUDIO_BRIDGE_CHANNELS.runtimeEvent, {
          type: 'run_failed',
          timestamp: new Date().toISOString(),
          payload: {
            message: result.error,
          },
        })
        options.logger.error('runtime submit 失败', error)
        return result
      }
    },
  )

  options.ipcMainLike.handle(
    STUDIO_BRIDGE_CHANNELS.runtimeCancel,
    async (_event, payload): Promise<RuntimeCancelResult> => {
      const request = parseRuntimeCancelPayload(payload)

      if (!options.cancelRuntime) {
        throw new Error('studio.runtime.cancel 尚未实现。')
      }

      try {
        const result = await options.cancelRuntime(request, hostState)
        options.logger.info('runtime cancel 已完成', {
          ok: result.ok,
          workspacePath: hostState.workspacePath,
        })
        return result
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const result: RuntimeCancelResult = {
          ok: false,
          error: `runtime cancel 失败: ${message}`,
        }
        options.logger.error('runtime cancel 失败', error)
        return result
      }
    },
  )

  options.ipcMainLike.handle(
    STUDIO_BRIDGE_CHANNELS.permissionRespond,
    async (_event, payload): Promise<{ ok: boolean }> => {
      const response = parsePermissionDialogResponsePayload(payload)
      if (!options.respondPermission) {
        throw new Error('studio.permission.respond 尚未实现。')
      }

      return {
        ok: options.respondPermission(response),
      }
    },
  )

  options.ipcMainLike.handle(
    STUDIO_BRIDGE_CHANNELS.userInputRespond,
    async (_event, payload): Promise<{ ok: boolean }> => {
      const response = parseUserQuestionDialogResponsePayload(payload)
      if (!options.respondUserInput) {
        throw new Error('studio.userInput.respond 尚未实现。')
      }

      return {
        ok: options.respondUserInput(response),
      }
    },
  )

  options.ipcMainLike.handle(
    STUDIO_BRIDGE_CHANNELS.shellGetSnapshot,
    async (_event, payload): Promise<StudioShellSnapshot> => {
      const request = parseShellSnapshotPayload(payload)
      return options.inspectShell(request, hostState)
    },
  )

  options.ipcMainLike.handle(
    STUDIO_BRIDGE_CHANNELS.settingsGetProviderSettings,
    async (_event, payload): Promise<StudioProviderSettingsSnapshot> => {
      assertNoPayload(payload, 'studio.settings.getProviderSettings')
      if (!options.getProviderSettings) {
        throw new Error('studio.settings.getProviderSettings 尚未实现。')
      }
      return options.getProviderSettings(hostState)
    },
  )

  options.ipcMainLike.handle(
    STUDIO_BRIDGE_CHANNELS.settingsSaveProviderSettings,
    async (_event, payload): Promise<StudioProviderSettingsSaveResult> => {
      const request = parseProviderSettingsSavePayload(payload)
      if (!options.saveProviderSettings) {
        throw new Error('studio.settings.saveProviderSettings 尚未实现。')
      }
      return options.saveProviderSettings(request, hostState)
    },
  )

  options.ipcMainLike.handle(
    STUDIO_BRIDGE_CHANNELS.settingsTestProviderConnection,
    async (_event, payload): Promise<StudioProviderConnectionTestResult> => {
      const request = parseProviderConnectionTestPayload(payload)
      if (!options.testProviderConnection) {
        throw new Error('studio.settings.testProviderConnection 尚未实现。')
      }
      return options.testProviderConnection(request, hostState)
    },
  )

  options.ipcMainLike.handle(
    STUDIO_BRIDGE_CHANNELS.memoryGetOverview,
    async (_event, payload): Promise<StudioMemoryOverviewSnapshot> => {
      assertNoPayload(payload, 'studio.memory.getOverview')
      if (!options.getMemoryOverview) {
        throw new Error('studio.memory.getOverview 尚未实现。')
      }
      return options.getMemoryOverview(hostState)
    },
  )

  options.ipcMainLike.handle(
    STUDIO_BRIDGE_CHANNELS.memoryRebuild,
    async (_event, payload): Promise<StudioMemoryRebuildResult> => {
      assertNoPayload(payload, 'studio.memory.rebuild')
      if (!options.rebuildMemory) {
        throw new Error('studio.memory.rebuild 尚未实现。')
      }
      return options.rebuildMemory(hostState)
    },
  )

  options.ipcMainLike.handle(
    STUDIO_BRIDGE_CHANNELS.mcpGetOverview,
    async (_event, payload): Promise<StudioMcpOverviewSnapshot> => {
      assertNoPayload(payload, 'studio.mcp.getOverview')
      if (!options.getMcpOverview) {
        throw new Error('studio.mcp.getOverview 尚未实现。')
      }
      return options.getMcpOverview(hostState)
    },
  )

  options.ipcMainLike.handle(
    STUDIO_BRIDGE_CHANNELS.mcpAddServer,
    async (_event, payload): Promise<StudioMcpMutationResult> => {
      const request = parseMcpMutationPayload(payload)
      if (!options.addMcpServer) {
        throw new Error('studio.mcp.addServer 尚未实现。')
      }
      return options.addMcpServer(request, hostState)
    },
  )

  options.ipcMainLike.handle(
    STUDIO_BRIDGE_CHANNELS.mcpDeleteServer,
    async (_event, payload): Promise<StudioMcpMutationResult> => {
      const name = parseMcpDeletePayload(payload)
      if (!options.deleteMcpServer) {
        throw new Error('studio.mcp.deleteServer 尚未实现。')
      }
      return options.deleteMcpServer(name, hostState)
    },
  )

  options.ipcMainLike.handle(
    STUDIO_BRIDGE_CHANNELS.skillsPluginsGetOverview,
    async (_event, payload): Promise<StudioSkillsPluginsOverviewSnapshot> => {
      assertNoPayload(payload, 'studio.skillsPlugins.getOverview')
      if (!options.getSkillsPluginsOverview) {
        throw new Error('studio.skillsPlugins.getOverview 尚未实现。')
      }
      return options.getSkillsPluginsOverview(hostState)
    },
  )
}
