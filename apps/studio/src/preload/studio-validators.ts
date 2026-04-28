import type {
  StudioSkillsPluginsOverviewSnapshot,
  StudioMcpMutationResult,
  StudioMcpOverviewSnapshot,
  StudioMcpServerMutationInput,
  BindWorkspaceRequest,
  OpenWorkspaceResponse,
  StudioMemoryOverviewSnapshot,
  StudioMemoryRebuildResult,
  StudioProviderConnectionTestRequest,
  StudioProviderConnectionTestResult,
  StudioProviderSettingsEntry,
  StudioProviderSettingsSaveInput,
  StudioProviderSettingsSaveResult,
  StudioProviderSettingsSnapshot,
  RuntimeInspectRequest,
  RuntimeInspectResult,
  RuntimeCancelRequest,
  RuntimeCancelResult,
  RuntimeSubmitRequest,
  RuntimeSubmitResult,
  RuntimeSnapshotView,
  StudioHostState,
  StudioModeId,
  StudioStatusIssue,
  StudioProjectSessionSummary,
  StudioRecentProjectSummary,
  StudioScratchpadEntry,
  StudioShellDefaults,
  StudioShellSnapshot,
  StudioShellSnapshotRequest,
  StudioStartupProjectCandidate,
  StudioStartupSessionCandidate,
  StudioRuntimeEvent,
  PermissionDialogRequest,
  PermissionDialogResponse,
  UserQuestionDialogQuestion,
  UserQuestionDialogRequest,
  UserQuestionDialogResponse,
  WorkspaceSelectionResult,
  RuntimeWarmupStatusChangedEvent,
} from '../shared/studio-bridge-contract'
import { VALID_WARMUP_STATUSES } from '../shared/studio-bridge-contract'

export class StudioBridgeValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StudioBridgeValidationError'
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertPlainObject(
  value: unknown,
  subject: string,
): Record<string, unknown> {
  if (!isPlainObject(value)) {
    throw new StudioBridgeValidationError(`${subject} 必须是对象。`)
  }

  return value
}

function parseOptionalString(
  value: unknown,
  subject: string,
): string | undefined {
  if (value === undefined) {
    return undefined
  }

  if (typeof value !== 'string') {
    throw new StudioBridgeValidationError(`${subject} 必须是字符串。`)
  }

  return value
}

function parseStringArray(value: unknown, subject: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new StudioBridgeValidationError(`${subject} 必须是字符串数组。`)
  }

  return [...value]
}

function parseStatusIssue(payload: unknown, subject: string): StudioStatusIssue {
  const value = assertPlainObject(payload, subject)
  if (
    value.code !== 'runtime-not-ready' &&
    value.code !== 'workspace-missing' &&
    value.code !== 'project-config-error'
  ) {
    throw new StudioBridgeValidationError(`${subject}.code 非法。`)
  }
  if (value.severity !== 'warning' && value.severity !== 'error') {
    throw new StudioBridgeValidationError(`${subject}.severity 非法。`)
  }
  if (typeof value.message !== 'string') {
    throw new StudioBridgeValidationError(`${subject}.message 必须是字符串。`)
  }

  return {
    code: value.code,
    severity: value.severity,
    message: value.message,
  }
}

export function assertStudioNoPayload(
  payload: unknown,
  methodName: string,
): void {
  if (payload !== undefined) {
    throw new StudioBridgeValidationError(`${methodName} 不接受参数。`)
  }
}

export function parseStudioBindWorkspaceRequest(
  payload: unknown,
): BindWorkspaceRequest {
  const value = assertPlainObject(payload, 'host.bindWorkspace 参数')
  if (Object.keys(value).some((key) => key !== 'workspacePath')) {
    throw new StudioBridgeValidationError(
      'host.bindWorkspace 只允许 workspacePath 字段。',
    )
  }
  if (typeof value.workspacePath !== 'string') {
    throw new StudioBridgeValidationError(
      'studio.host.bindWorkspace.workspacePath 必须是字符串。',
    )
  }

  const workspacePath = value.workspacePath.trim()
  if (!workspacePath) {
    throw new StudioBridgeValidationError(
      'studio.host.bindWorkspace.workspacePath 不能为空。',
    )
  }

  return { workspacePath }
}

export function parseStudioRuntimeInspectRequest(
  payload: unknown,
): RuntimeInspectRequest {
  if (payload === undefined) {
    return {}
  }

  const value = assertPlainObject(payload, 'runtime.inspect 参数')
  if (Object.keys(value).some((key) => key !== 'refresh')) {
    throw new StudioBridgeValidationError('runtime.inspect 只允许 refresh 字段。')
  }
  if (value.refresh !== undefined && typeof value.refresh !== 'boolean') {
    throw new StudioBridgeValidationError('runtime.inspect.refresh 必须是布尔值。')
  }

  return value.refresh === undefined ? {} : { refresh: value.refresh }
}

export function parseStudioRuntimeSubmitRequest(
  payload: unknown,
): RuntimeSubmitRequest {
  const value = assertPlainObject(payload, 'runtime.submit 参数')
  if (
    Object.keys(value).some(
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
    throw new StudioBridgeValidationError(
      'runtime.submit 只允许 text/projectPath/sessionId/agentId/providerId/modelId/timing 字段。',
    )
  }
  if (typeof value.text !== 'string') {
    throw new StudioBridgeValidationError('runtime.submit.text 必须是字符串。')
  }

  const text = value.text.trim()
  if (!text) {
    throw new StudioBridgeValidationError('runtime.submit.text 不能为空。')
  }

  const parseNullableField = (
    field: unknown,
    subject: string,
  ): string | null | undefined => {
    if (field === undefined) {
      return undefined
    }
    if (field === null) {
      return null
    }
    if (typeof field !== 'string') {
      throw new StudioBridgeValidationError(`${subject} 必须是字符串或 null。`)
    }
    const normalized = field.trim()
    return normalized ? normalized : null
  }

  const projectPath = parseNullableField(
    value.projectPath,
    'runtime.submit.projectPath',
  )
  const sessionId = parseNullableField(value.sessionId, 'runtime.submit.sessionId')
  const agentId = parseNullableField(value.agentId, 'runtime.submit.agentId')
  const providerId = parseNullableField(
    value.providerId,
    'runtime.submit.providerId',
  )
  const modelId = parseNullableField(value.modelId, 'runtime.submit.modelId')
  const timing = parseRuntimeSubmitTimingMarks(value.timing)

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

function parseRuntimeSubmitTimingMarks(
  payload: unknown,
): RuntimeSubmitRequest['timing'] | undefined {
  if (payload === undefined) {
    return undefined
  }

  const value = assertPlainObject(payload, 'runtime.submit.timing')
  if (
    Object.keys(value).some(
      (key) =>
        key !== 'userSubmitClickedAt' &&
        key !== 'rendererRuntimeSubmitInvokedAt' &&
        key !== 'ipcRuntimeSubmitReceivedAt',
    )
  ) {
    throw new StudioBridgeValidationError(
      'runtime.submit.timing 只允许 userSubmitClickedAt/rendererRuntimeSubmitInvokedAt/ipcRuntimeSubmitReceivedAt 字段。',
    )
  }

  const parseOptionalTimestamp = (
    field: unknown,
    subject: string,
  ): number | undefined => {
    if (field === undefined) {
      return undefined
    }
    if (typeof field !== 'number' || !Number.isFinite(field) || field <= 0) {
      throw new StudioBridgeValidationError(`${subject} 必须是正数时间戳。`)
    }
    return field
  }

  const userSubmitClickedAt = parseOptionalTimestamp(
    value.userSubmitClickedAt,
    'runtime.submit.timing.userSubmitClickedAt',
  )
  const rendererRuntimeSubmitInvokedAt = parseOptionalTimestamp(
    value.rendererRuntimeSubmitInvokedAt,
    'runtime.submit.timing.rendererRuntimeSubmitInvokedAt',
  )
  const ipcRuntimeSubmitReceivedAt = parseOptionalTimestamp(
    value.ipcRuntimeSubmitReceivedAt,
    'runtime.submit.timing.ipcRuntimeSubmitReceivedAt',
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

export function parseStudioRuntimeCancelRequest(
  payload: unknown,
): RuntimeCancelRequest {
  if (payload === undefined) {
    return {}
  }

  const value = assertPlainObject(payload, 'runtime.cancel 参数')
  if (Object.keys(value).some((key) => key !== 'runId' && key !== 'reason')) {
    throw new StudioBridgeValidationError(
      'runtime.cancel 只允许 runId/reason 字段。',
    )
  }

  const parseNullableString = (
    field: unknown,
    subject: string,
  ): string | null | undefined => {
    if (field === undefined) {
      return undefined
    }
    if (field === null) {
      return null
    }
    if (typeof field !== 'string') {
      throw new StudioBridgeValidationError(`${subject} 必须是字符串或 null。`)
    }
    const normalized = field.trim()
    return normalized ? normalized : null
  }

  if (value.reason !== undefined && typeof value.reason !== 'string') {
    throw new StudioBridgeValidationError('runtime.cancel.reason 必须是字符串。')
  }
  const reason = typeof value.reason === 'string' ? value.reason.trim() : undefined
  const runId = parseNullableString(value.runId, 'runtime.cancel.runId')

  return {
    ...(runId === undefined ? {} : { runId }),
    ...(reason ? { reason } : {}),
  }
}

export function parseStudioPermissionDialogRequest(
  payload: unknown,
): PermissionDialogRequest {
  const value = assertPlainObject(payload, 'permission.request')
  if (
    Object.keys(value).some(
      (key) =>
        key !== 'requestId' &&
        key !== 'toolName' &&
        key !== 'args' &&
        key !== 'description',
    )
  ) {
    throw new StudioBridgeValidationError(
      'permission.request 只允许 requestId/toolName/args/description 字段。',
    )
  }
  if (typeof value.requestId !== 'string' || value.requestId.trim().length === 0) {
    throw new StudioBridgeValidationError('permission.request.requestId 必须是非空字符串。')
  }
  if (typeof value.toolName !== 'string' || value.toolName.trim().length === 0) {
    throw new StudioBridgeValidationError('permission.request.toolName 必须是非空字符串。')
  }
  if (!isPlainObject(value.args)) {
    throw new StudioBridgeValidationError('permission.request.args 必须是对象。')
  }
  if (typeof value.description !== 'string') {
    throw new StudioBridgeValidationError('permission.request.description 必须是字符串。')
  }

  return {
    requestId: value.requestId.trim(),
    toolName: value.toolName.trim(),
    args: value.args,
    description: value.description,
  }
}

export function parseStudioPermissionDialogResponse(
  payload: unknown,
): PermissionDialogResponse {
  const value = assertPlainObject(payload, 'permission.respond')
  if (
    Object.keys(value).some(
      (key) => key !== 'requestId' && key !== 'allow' && key !== 'remember',
    )
  ) {
    throw new StudioBridgeValidationError(
      'permission.respond 只允许 requestId/allow/remember 字段。',
    )
  }
  if (typeof value.requestId !== 'string' || value.requestId.trim().length === 0) {
    throw new StudioBridgeValidationError('permission.respond.requestId 必须是非空字符串。')
  }
  if (typeof value.allow !== 'boolean') {
    throw new StudioBridgeValidationError('permission.respond.allow 必须是布尔值。')
  }
  if (typeof value.remember !== 'boolean') {
    throw new StudioBridgeValidationError('permission.respond.remember 必须是布尔值。')
  }

  return {
    requestId: value.requestId.trim(),
    allow: value.allow,
    remember: value.remember,
  }
}

function parseUserQuestionOption(
  payload: unknown,
  subject: string,
) {
  const value = assertPlainObject(payload, subject)
  if (typeof value.label !== 'string' || value.label.trim().length === 0) {
    throw new StudioBridgeValidationError(`${subject}.label 必须是非空字符串。`)
  }
  if (
    value.description !== undefined &&
    value.description !== null &&
    typeof value.description !== 'string'
  ) {
    throw new StudioBridgeValidationError(`${subject}.description 必须是字符串或 null。`)
  }

  return {
    label: value.label.trim(),
    ...(typeof value.description === 'string'
      ? { description: value.description }
      : {}),
  }
}

function parseUserQuestion(
  payload: unknown,
  subject: string,
): UserQuestionDialogQuestion {
  const value = assertPlainObject(payload, subject)
  if (typeof value.key !== 'string' || value.key.trim().length === 0) {
    throw new StudioBridgeValidationError(`${subject}.key 必须是非空字符串。`)
  }
  if (typeof value.title !== 'string' || value.title.trim().length === 0) {
    throw new StudioBridgeValidationError(`${subject}.title 必须是非空字符串。`)
  }
  let questionType: UserQuestionDialogQuestion['type']
  switch (value.type) {
    case 'select':
    case 'multiselect':
    case 'text':
      questionType = value.type
      break
    default:
      throw new StudioBridgeValidationError(`${subject}.type 非法。`)
  }
  if (
    value.placeholder !== undefined &&
    value.placeholder !== null &&
    typeof value.placeholder !== 'string'
  ) {
    throw new StudioBridgeValidationError(`${subject}.placeholder 必须是字符串或 null。`)
  }
  if (value.options !== undefined && !Array.isArray(value.options)) {
    throw new StudioBridgeValidationError(`${subject}.options 必须是数组。`)
  }

  const options =
    value.options === undefined
      ? undefined
      : value.options.map((option, index) =>
          parseUserQuestionOption(option, `${subject}.options[${index}]`),
        )

  if (
    (questionType === 'select' || questionType === 'multiselect') &&
    (!options || options.length === 0)
  ) {
    throw new StudioBridgeValidationError(`${subject}.options 不能为空。`)
  }

  return {
    key: value.key.trim(),
    title: value.title.trim(),
    type: questionType,
    ...(options ? { options } : {}),
    ...(typeof value.placeholder === 'string'
      ? { placeholder: value.placeholder }
      : {}),
  }
}

export function parseStudioUserQuestionDialogRequest(
  payload: unknown,
): UserQuestionDialogRequest {
  const value = assertPlainObject(payload, 'userInput.request')
  if (
    Object.keys(value).some(
      (key) => key !== 'requestId' && key !== 'sessionId' && key !== 'questions',
    )
  ) {
    throw new StudioBridgeValidationError(
      'userInput.request 只允许 requestId/sessionId/questions 字段。',
    )
  }
  if (typeof value.requestId !== 'string' || value.requestId.trim().length === 0) {
    throw new StudioBridgeValidationError('userInput.request.requestId 必须是非空字符串。')
  }
  if (typeof value.sessionId !== 'string' || value.sessionId.trim().length === 0) {
    throw new StudioBridgeValidationError('userInput.request.sessionId 必须是非空字符串。')
  }
  if (!Array.isArray(value.questions) || value.questions.length === 0) {
    throw new StudioBridgeValidationError('userInput.request.questions 必须是非空数组。')
  }

  const questions: UserQuestionDialogRequest['questions'] = value.questions.map(
    (question, index) =>
      parseUserQuestion(question, `userInput.request.questions[${index}]`),
  )

  return {
    requestId: value.requestId.trim(),
    sessionId: value.sessionId.trim(),
    questions,
  }
}

export function parseStudioUserQuestionDialogResponse(
  payload: unknown,
): UserQuestionDialogResponse {
  const value = assertPlainObject(payload, 'userInput.respond')
  if (
    Object.keys(value).some(
      (key) => key !== 'requestId' && key !== 'cancelled' && key !== 'answers',
    )
  ) {
    throw new StudioBridgeValidationError(
      'userInput.respond 只允许 requestId/cancelled/answers 字段。',
    )
  }
  if (typeof value.requestId !== 'string' || value.requestId.trim().length === 0) {
    throw new StudioBridgeValidationError('userInput.respond.requestId 必须是非空字符串。')
  }
  if (typeof value.cancelled !== 'boolean') {
    throw new StudioBridgeValidationError('userInput.respond.cancelled 必须是布尔值。')
  }

  const answers = assertPlainObject(value.answers, 'userInput.respond.answers')
  const normalizedAnswers = Object.fromEntries(
    Object.entries(answers).map(([key, answer]) => {
      if (typeof answer === 'string') {
        return [key, answer]
      }
      if (Array.isArray(answer)) {
        const normalized = answer.map((item, index) => {
          if (typeof item !== 'string') {
            throw new StudioBridgeValidationError(
              `userInput.respond.answers.${key}[${index}] 必须是字符串。`,
            )
          }
          return item
        })
        return [key, normalized]
      }
      throw new StudioBridgeValidationError(
        `userInput.respond.answers.${key} 必须是字符串或字符串数组。`,
      )
    }),
  ) as Record<string, string | string[]>

  return {
    requestId: value.requestId.trim(),
    cancelled: value.cancelled,
    answers: normalizedAnswers,
  }
}

export function parseStudioShellSnapshotRequest(
  payload: unknown,
): StudioShellSnapshotRequest {
  if (payload === undefined) {
    return {}
  }

  const value = assertPlainObject(payload, 'shell.getSnapshot 参数')
  if (Object.keys(value).some((key) => key !== 'projectPath' && key !== 'sessionId')) {
    throw new StudioBridgeValidationError('shell.getSnapshot 只允许 projectPath/sessionId 字段。')
  }
  if (
    value.projectPath !== undefined &&
    value.projectPath !== null &&
    typeof value.projectPath !== 'string'
  ) {
    throw new StudioBridgeValidationError('shell.getSnapshot.projectPath 必须是字符串或 null。')
  }
  if (
    value.sessionId !== undefined &&
    value.sessionId !== null &&
    typeof value.sessionId !== 'string'
  ) {
    throw new StudioBridgeValidationError('shell.getSnapshot.sessionId 必须是字符串或 null。')
  }

  return {
    ...(value.projectPath === undefined ? {} : { projectPath: value.projectPath as string | null }),
    ...(value.sessionId === undefined ? {} : { sessionId: value.sessionId as string | null }),
  }
}

function parseProviderSettingsEntry(
  payload: unknown,
  subject: string,
): StudioProviderSettingsEntry {
  const value = assertPlainObject(payload, subject)
  if (typeof value.id !== 'string') {
    throw new StudioBridgeValidationError(`${subject}.id 必须是字符串。`)
  }
  if (typeof value.apiKey !== 'string') {
    throw new StudioBridgeValidationError(`${subject}.apiKey 必须是字符串。`)
  }
  if (
    value.baseURL !== null &&
    value.baseURL !== undefined &&
    typeof value.baseURL !== 'string'
  ) {
    throw new StudioBridgeValidationError(`${subject}.baseURL 必须是字符串或 null。`)
  }
  if (value.protocol !== 'anthropic' && value.protocol !== 'openai') {
    throw new StudioBridgeValidationError(`${subject}.protocol 必须是 anthropic 或 openai。`)
  }

  return {
    id: value.id,
    apiKey: value.apiKey,
    baseURL: value.baseURL === undefined ? null : (value.baseURL as string | null),
    protocol: value.protocol,
    models: parseStringArray(value.models, `${subject}.models`),
    visionModels:
      value.visionModels === undefined
        ? []
        : parseStringArray(value.visionModels, `${subject}.visionModels`),
  }
}

export function parseStudioProviderSettingsSaveInput(
  payload: unknown,
): StudioProviderSettingsSaveInput {
  const value = assertPlainObject(payload, 'settings.saveProviderSettings')
  if (typeof value.defaultProvider !== 'string') {
    throw new StudioBridgeValidationError('settings.saveProviderSettings.defaultProvider 必须是字符串。')
  }
  if (typeof value.defaultModel !== 'string') {
    throw new StudioBridgeValidationError('settings.saveProviderSettings.defaultModel 必须是字符串。')
  }
  if (
    value.subAgentModel !== undefined &&
    value.subAgentModel !== null &&
    typeof value.subAgentModel !== 'string'
  ) {
    throw new StudioBridgeValidationError('settings.saveProviderSettings.subAgentModel 必须是字符串或 null。')
  }
  if (!Array.isArray(value.providers)) {
    throw new StudioBridgeValidationError('settings.saveProviderSettings.providers 必须是数组。')
  }

  return {
    defaultProvider: value.defaultProvider,
    defaultModel: value.defaultModel,
    subAgentModel:
      value.subAgentModel === undefined
        ? null
        : (value.subAgentModel as string | null),
    providers: value.providers.map((item, index) =>
      parseProviderSettingsEntry(item, `settings.saveProviderSettings.providers[${index}]`),
    ),
  }
}

function parseProviderSettingsSource(
  payload: unknown,
): StudioProviderSettingsSnapshot['source'] {
  const value = assertPlainObject(payload, 'settings.source')
  return {
    ...(parseOptionalString(value.userToml, 'settings.source.userToml')
      ? { userToml: value.userToml as string }
      : {}),
    ...(parseOptionalString(value.projectToml, 'settings.source.projectToml')
      ? { projectToml: value.projectToml as string }
      : {}),
    ...(parseOptionalString(value.legacyJson, 'settings.source.legacyJson')
      ? { legacyJson: value.legacyJson as string }
      : {}),
  }
}

export function parseStudioProviderSettingsSnapshot(
  payload: unknown,
): StudioProviderSettingsSnapshot {
  const value = assertPlainObject(payload, 'settings.getProviderSettings 响应')
  const editableConfig = assertPlainObject(
    value.editableConfig,
    'settings.editableConfig',
  )
  const effectiveDefaults = assertPlainObject(
    value.effectiveDefaults,
    'settings.effectiveDefaults',
  )

  if (typeof editableConfig.defaultProvider !== 'string') {
    throw new StudioBridgeValidationError('settings.editableConfig.defaultProvider 必须是字符串。')
  }
  if (typeof editableConfig.defaultModel !== 'string') {
    throw new StudioBridgeValidationError('settings.editableConfig.defaultModel 必须是字符串。')
  }
  if (
    editableConfig.subAgentModel !== null &&
    editableConfig.subAgentModel !== undefined &&
    typeof editableConfig.subAgentModel !== 'string'
  ) {
    throw new StudioBridgeValidationError('settings.editableConfig.subAgentModel 必须是字符串或 null。')
  }
  if (!Array.isArray(editableConfig.providers)) {
    throw new StudioBridgeValidationError('settings.editableConfig.providers 必须是数组。')
  }
  if (typeof effectiveDefaults.defaultProvider !== 'string') {
    throw new StudioBridgeValidationError('settings.effectiveDefaults.defaultProvider 必须是字符串。')
  }
  if (typeof effectiveDefaults.defaultModel !== 'string') {
    throw new StudioBridgeValidationError('settings.effectiveDefaults.defaultModel 必须是字符串。')
  }

  return {
    editableConfig: {
      defaultProvider: editableConfig.defaultProvider,
      defaultModel: editableConfig.defaultModel,
      subAgentModel:
        editableConfig.subAgentModel === undefined
          ? null
          : (editableConfig.subAgentModel as string | null),
      providers: editableConfig.providers.map((item, index) =>
        parseProviderSettingsEntry(item, `settings.editableConfig.providers[${index}]`),
      ),
    },
    effectiveDefaults: {
      defaultProvider: effectiveDefaults.defaultProvider,
      defaultModel: effectiveDefaults.defaultModel,
    },
    source: parseProviderSettingsSource(value.source),
    warnings:
      value.warnings === undefined
        ? []
        : parseStringArray(value.warnings, 'settings.warnings'),
  }
}

export function parseStudioProviderSettingsSaveResult(
  payload: unknown,
): StudioProviderSettingsSaveResult {
  const value = assertPlainObject(payload, 'settings.saveProviderSettings 响应')
  if (typeof value.success !== 'boolean') {
    throw new StudioBridgeValidationError('settings.saveProviderSettings.success 必须是布尔值。')
  }

  if (value.success) {
    return {
      success: true,
      snapshot: parseStudioProviderSettingsSnapshot(value.snapshot),
    }
  }

  if (typeof value.error !== 'string') {
    throw new StudioBridgeValidationError('settings.saveProviderSettings.error 必须是字符串。')
  }

  return {
    success: false,
    error: value.error,
  }
}

export function parseStudioProviderConnectionTestRequest(
  payload: unknown,
): StudioProviderConnectionTestRequest {
  const value = assertPlainObject(payload, 'settings.testProviderConnection')
  if (typeof value.providerId !== 'string') {
    throw new StudioBridgeValidationError('settings.testProviderConnection.providerId 必须是字符串。')
  }

  return {
    providerId: value.providerId,
    config: parseProviderSettingsEntry(
      value.config,
      'settings.testProviderConnection.config',
    ),
    ...(value.model === undefined || value.model === null
      ? {}
      : {
          model: parseOptionalString(
            value.model,
            'settings.testProviderConnection.model',
          ) as string,
        }),
  }
}

export function parseStudioProviderConnectionTestResult(
  payload: unknown,
): StudioProviderConnectionTestResult {
  const value = assertPlainObject(payload, 'settings.testProviderConnection 响应')
  if (typeof value.success !== 'boolean') {
    throw new StudioBridgeValidationError('settings.testProviderConnection.success 必须是布尔值。')
  }
  if (typeof value.providerId !== 'string') {
    throw new StudioBridgeValidationError('settings.testProviderConnection.providerId 必须是字符串。')
  }

  if (value.success) {
    if (typeof value.model !== 'string') {
      throw new StudioBridgeValidationError('settings.testProviderConnection.model 必须是字符串。')
    }
    if (typeof value.durationMs !== 'number') {
      throw new StudioBridgeValidationError('settings.testProviderConnection.durationMs 必须是数字。')
    }
    return {
      success: true,
      providerId: value.providerId,
      model: value.model,
      durationMs: value.durationMs,
    }
  }

  if (typeof value.error !== 'string') {
    throw new StudioBridgeValidationError('settings.testProviderConnection.error 必须是字符串。')
  }

  return {
    success: false,
    providerId: value.providerId,
    ...(typeof value.model === 'string' ? { model: value.model } : {}),
    error: value.error,
  }
}

export function parseStudioMemoryOverviewSnapshot(
  payload: unknown,
): StudioMemoryOverviewSnapshot {
  const value = assertPlainObject(payload, 'memory.getOverview 响应')
  const embedding = assertPlainObject(value.embedding, 'memory.embedding')
  const overview = assertPlainObject(value.overview, 'memory.overview')
  const source = assertPlainObject(value.source, 'memory.source')

  if (typeof value.enabled !== 'boolean') {
    throw new StudioBridgeValidationError('memory.enabled 必须是布尔值。')
  }
  if (
    value.status !== 'disabled' &&
    value.status !== 'bm25' &&
    value.status !== 'ready' &&
    value.status !== 'degraded'
  ) {
    throw new StudioBridgeValidationError('memory.status 非法。')
  }
  if (typeof value.statusMessage !== 'string') {
    throw new StudioBridgeValidationError('memory.statusMessage 必须是字符串。')
  }
  if (typeof embedding.configured !== 'boolean') {
    throw new StudioBridgeValidationError('memory.embedding.configured 必须是布尔值。')
  }
  if (
    embedding.dimension !== null &&
    embedding.dimension !== undefined &&
    typeof embedding.dimension !== 'number'
  ) {
    throw new StudioBridgeValidationError('memory.embedding.dimension 必须是数字或 null。')
  }
  if (typeof overview.globalEntries !== 'number') {
    throw new StudioBridgeValidationError('memory.overview.globalEntries 必须是数字。')
  }
  if (typeof overview.projectEntries !== 'number') {
    throw new StudioBridgeValidationError('memory.overview.projectEntries 必须是数字。')
  }
  if (typeof overview.vectorChunks !== 'number') {
    throw new StudioBridgeValidationError('memory.overview.vectorChunks 必须是数字。')
  }
  if (
    overview.projectPath !== null &&
    overview.projectPath !== undefined &&
    typeof overview.projectPath !== 'string'
  ) {
    throw new StudioBridgeValidationError('memory.overview.projectPath 必须是字符串或 null。')
  }

  return {
    enabled: value.enabled,
    status: value.status,
    statusMessage: value.statusMessage,
    embedding: {
      configured: embedding.configured,
      dimension:
        embedding.dimension === undefined
          ? null
          : (embedding.dimension as number | null),
      missingFields:
        embedding.missingFields === undefined
          ? []
          : parseStringArray(embedding.missingFields, 'memory.embedding.missingFields'),
    },
    overview: {
      projectPath:
        overview.projectPath === undefined
          ? null
          : (overview.projectPath as string | null),
      globalEntries: overview.globalEntries,
      projectEntries: overview.projectEntries,
      vectorChunks: overview.vectorChunks,
    },
    source: {
      ...(parseOptionalString(source.userToml, 'memory.source.userToml')
        ? { userToml: source.userToml as string }
        : {}),
      ...(parseOptionalString(source.projectToml, 'memory.source.projectToml')
        ? { projectToml: source.projectToml as string }
        : {}),
      ...(parseOptionalString(source.legacyJson, 'memory.source.legacyJson')
        ? { legacyJson: source.legacyJson as string }
        : {}),
    },
    warnings:
      value.warnings === undefined
        ? []
        : parseStringArray(value.warnings, 'memory.warnings'),
  }
}

export function parseStudioMemoryRebuildResult(
  payload: unknown,
): StudioMemoryRebuildResult {
  const value = assertPlainObject(payload, 'memory.rebuild 响应')
  if (typeof value.success !== 'boolean') {
    throw new StudioBridgeValidationError('memory.rebuild.success 必须是布尔值。')
  }
  if (typeof value.message !== 'string') {
    throw new StudioBridgeValidationError('memory.rebuild.message 必须是字符串。')
  }

  return {
    success: value.success,
    message: value.message,
    ...(value.snapshot ? { snapshot: parseStudioMemoryOverviewSnapshot(value.snapshot) } : {}),
  }
}

function parseMcpServerConfigInput(
  payload: unknown,
  subject: string,
): StudioMcpServerMutationInput['config'] {
  const value = assertPlainObject(payload, subject)
  if (
    value.transport !== 'stdio' &&
    value.transport !== 'sse' &&
    value.transport !== 'streamable-http' &&
    value.transport !== 'http'
  ) {
    throw new StudioBridgeValidationError(`${subject}.transport 非法。`)
  }
  if (value.command !== undefined && typeof value.command !== 'string') {
    throw new StudioBridgeValidationError(`${subject}.command 必须是字符串。`)
  }
  if (
    value.url !== undefined &&
    value.url !== null &&
    typeof value.url !== 'string'
  ) {
    throw new StudioBridgeValidationError(`${subject}.url 必须是字符串或 null。`)
  }
  if (
    value.args !== undefined &&
    (!Array.isArray(value.args) || value.args.some((item) => typeof item !== 'string'))
  ) {
    throw new StudioBridgeValidationError(`${subject}.args 必须是字符串数组。`)
  }
  if (
    value.headers !== undefined &&
    !isPlainObject(value.headers)
  ) {
    throw new StudioBridgeValidationError(`${subject}.headers 必须是对象。`)
  }

  const headers = value.headers
    ? Object.fromEntries(
        Object.entries(value.headers).map(([key, item]) => {
          if (typeof item !== 'string') {
            throw new StudioBridgeValidationError(`${subject}.headers.${key} 必须是字符串。`)
          }
          return [key, item]
        }),
      )
    : undefined

  return {
    transport: value.transport,
    ...(typeof value.command === 'string' ? { command: value.command } : {}),
    ...(Array.isArray(value.args) ? { args: [...value.args] } : {}),
    ...(value.url === undefined ? {} : { url: value.url as string | null }),
    ...(headers ? { headers } : {}),
  }
}

export function parseStudioMcpServerMutationInput(
  payload: unknown,
): StudioMcpServerMutationInput {
  const value = assertPlainObject(payload, 'mcp.mutation')
  if (typeof value.name !== 'string') {
    throw new StudioBridgeValidationError('mcp.mutation.name 必须是字符串。')
  }

  return {
    name: value.name,
    config: parseMcpServerConfigInput(value.config, 'mcp.mutation.config'),
  }
}

function parseMcpOverviewServer(
  payload: unknown,
  subject: string,
): StudioMcpOverviewSnapshot['servers'][number] {
  const value = assertPlainObject(payload, subject)
  if (typeof value.name !== 'string') {
    throw new StudioBridgeValidationError(`${subject}.name 必须是字符串。`)
  }
  if (
    value.transport !== 'stdio' &&
    value.transport !== 'sse' &&
    value.transport !== 'streamable-http' &&
    value.transport !== 'http'
  ) {
    throw new StudioBridgeValidationError(`${subject}.transport 非法。`)
  }
  if (value.status !== 'connected' && value.status !== 'failed') {
    throw new StudioBridgeValidationError(`${subject}.status 非法。`)
  }
  if (typeof value.source !== 'string') {
    throw new StudioBridgeValidationError(`${subject}.source 必须是字符串。`)
  }
  if (typeof value.writable !== 'boolean') {
    throw new StudioBridgeValidationError(`${subject}.writable 必须是布尔值。`)
  }
  if (typeof value.toolCount !== 'number') {
    throw new StudioBridgeValidationError(`${subject}.toolCount 必须是数字。`)
  }

  return {
    name: value.name,
    transport: value.transport,
    status: value.status,
    source: value.source,
    writable: value.writable,
    toolCount: value.toolCount,
    toolNames:
      value.toolNames === undefined
        ? []
        : parseStringArray(value.toolNames, `${subject}.toolNames`),
    ...(typeof value.error === 'string' ? { error: value.error } : {}),
  }
}

export function parseStudioMcpOverviewSnapshot(
  payload: unknown,
): StudioMcpOverviewSnapshot {
  const value = assertPlainObject(payload, 'mcp.getOverview 响应')
  if (
    value.status !== 'unconfigured' &&
    value.status !== 'connected' &&
    value.status !== 'failed'
  ) {
    throw new StudioBridgeValidationError('mcp.status 非法。')
  }
  if (typeof value.statusMessage !== 'string') {
    throw new StudioBridgeValidationError('mcp.statusMessage 必须是字符串。')
  }
  if (typeof value.writableConfigPath !== 'string') {
    throw new StudioBridgeValidationError('mcp.writableConfigPath 必须是字符串。')
  }
  if (!Array.isArray(value.servers)) {
    throw new StudioBridgeValidationError('mcp.servers 必须是数组。')
  }

  return {
    status: value.status,
    statusMessage: value.statusMessage,
    writableConfigPath: value.writableConfigPath,
    servers: value.servers.map((item, index) =>
      parseMcpOverviewServer(item, `mcp.servers[${index}]`),
    ),
    warnings:
      value.warnings === undefined
        ? []
        : parseStringArray(value.warnings, 'mcp.warnings'),
  }
}

export function parseStudioMcpMutationResult(
  payload: unknown,
): StudioMcpMutationResult {
  const value = assertPlainObject(payload, 'mcp.mutation 响应')
  if (typeof value.success !== 'boolean') {
    throw new StudioBridgeValidationError('mcp.mutation.success 必须是布尔值。')
  }
  if (typeof value.message !== 'string') {
    throw new StudioBridgeValidationError('mcp.mutation.message 必须是字符串。')
  }

  return {
    success: value.success,
    message: value.message,
    ...(value.snapshot ? { snapshot: parseStudioMcpOverviewSnapshot(value.snapshot) } : {}),
  }
}

export function parseStudioSkillsPluginsOverviewSnapshot(
  payload: unknown,
): StudioSkillsPluginsOverviewSnapshot {
  const value = assertPlainObject(payload, 'skillsPlugins.getOverview 响应')
  if (
    value.status !== 'ready' &&
    value.status !== 'empty' &&
    value.status !== 'error'
  ) {
    throw new StudioBridgeValidationError('skillsPlugins.status 非法。')
  }
  if (typeof value.statusMessage !== 'string') {
    throw new StudioBridgeValidationError('skillsPlugins.statusMessage 必须是字符串。')
  }
  if (!Array.isArray(value.sourceDistribution)) {
    throw new StudioBridgeValidationError('skillsPlugins.sourceDistribution 必须是数组。')
  }
  if (!Array.isArray(value.recentSkills)) {
    throw new StudioBridgeValidationError('skillsPlugins.recentSkills 必须是数组。')
  }
  if (!Array.isArray(value.frequentSkills)) {
    throw new StudioBridgeValidationError('skillsPlugins.frequentSkills 必须是数组。')
  }
  if (!Array.isArray(value.plugins)) {
    throw new StudioBridgeValidationError('skillsPlugins.plugins 必须是数组。')
  }

  return {
    status: value.status,
    statusMessage: value.statusMessage,
    sourceDistribution: value.sourceDistribution.map((item, index) => {
      const entry = assertPlainObject(item, `skillsPlugins.sourceDistribution[${index}]`)
      if (
        entry.source !== 'builtin' &&
        entry.source !== 'plugin' &&
        entry.source !== 'user' &&
        entry.source !== 'project'
      ) {
        throw new StudioBridgeValidationError(`skillsPlugins.sourceDistribution[${index}].source 非法。`)
      }
      if (typeof entry.count !== 'number') {
        throw new StudioBridgeValidationError(`skillsPlugins.sourceDistribution[${index}].count 必须是数字。`)
      }
      return {
        source: entry.source,
        count: entry.count,
      }
    }),
    recentSkills: value.recentSkills.map((item, index) => {
      const entry = assertPlainObject(item, `skillsPlugins.recentSkills[${index}]`)
      if (typeof entry.name !== 'string' || typeof entry.lastUsedAt !== 'string') {
        throw new StudioBridgeValidationError(`skillsPlugins.recentSkills[${index}] 字段不合法。`)
      }
      if (
        entry.source !== 'builtin' &&
        entry.source !== 'plugin' &&
        entry.source !== 'user' &&
        entry.source !== 'project'
      ) {
        throw new StudioBridgeValidationError(`skillsPlugins.recentSkills[${index}].source 非法。`)
      }
      return {
        name: entry.name,
        source: entry.source,
        lastUsedAt: entry.lastUsedAt,
      }
    }),
    frequentSkills: value.frequentSkills.map((item, index) => {
      const entry = assertPlainObject(item, `skillsPlugins.frequentSkills[${index}]`)
      if (typeof entry.name !== 'string' || typeof entry.useCount !== 'number') {
        throw new StudioBridgeValidationError(`skillsPlugins.frequentSkills[${index}] 字段不合法。`)
      }
      if (
        entry.source !== 'builtin' &&
        entry.source !== 'plugin' &&
        entry.source !== 'user' &&
        entry.source !== 'project'
      ) {
        throw new StudioBridgeValidationError(`skillsPlugins.frequentSkills[${index}].source 非法。`)
      }
      return {
        name: entry.name,
        source: entry.source,
        useCount: entry.useCount,
      }
    }),
    plugins: value.plugins.map((item, index) => {
      const entry = assertPlainObject(item, `skillsPlugins.plugins[${index}]`)
      if (
        entry.source !== 'xnova' &&
        entry.source !== 'claude-code' &&
        entry.source !== 'manual'
      ) {
        throw new StudioBridgeValidationError(`skillsPlugins.plugins[${index}].source 非法。`)
      }
      if (
        typeof entry.name !== 'string' ||
        typeof entry.version !== 'string' ||
        typeof entry.skillCount !== 'number' ||
        typeof entry.hasHooks !== 'boolean'
      ) {
        throw new StudioBridgeValidationError(`skillsPlugins.plugins[${index}] 字段不合法。`)
      }
      return {
        name: entry.name,
        source: entry.source,
        version: entry.version,
        skillCount: entry.skillCount,
        hasHooks: entry.hasHooks,
        ...(typeof entry.description === 'string' ? { description: entry.description } : {}),
      }
    }),
    warnings:
      value.warnings === undefined
        ? []
        : parseStringArray(value.warnings, 'skillsPlugins.warnings'),
  }
}

function parseWorkspaceSelectionResult(
  payload: unknown,
): WorkspaceSelectionResult {
  const value = assertPlainObject(payload, 'workspace 选择结果')

  if (value.ok === true) {
    if (value.code !== 'selected' || typeof value.path !== 'string') {
      throw new StudioBridgeValidationError('workspace 成功结果格式不合法。')
    }

    return {
      ok: true,
      code: 'selected',
      path: value.path,
    }
  }

  if (
    value.ok === false &&
    typeof value.code === 'string' &&
    ['cancelled', 'empty', 'invalid', 'error'].includes(value.code) &&
    typeof value.message === 'string'
  ) {
    return {
      ok: false,
      code: value.code as 'cancelled' | 'empty' | 'invalid' | 'error',
      message: value.message,
    }
  }

  throw new StudioBridgeValidationError('workspace 结果格式不合法。')
}

export function parseStudioHostState(payload: unknown): StudioHostState {
  const value = assertPlainObject(payload, 'host state')
  if (
    value.workspacePath !== null &&
    value.workspacePath !== undefined &&
    typeof value.workspacePath !== 'string'
  ) {
    throw new StudioBridgeValidationError('hostState.workspacePath 必须是字符串或 null。')
  }

  return {
    workspacePath:
      value.workspacePath === undefined ? null : (value.workspacePath as string | null),
    lastSelection:
      value.lastSelection === undefined || value.lastSelection === null
        ? null
        : parseWorkspaceSelectionResult(value.lastSelection),
  }
}

export function parseStudioOpenWorkspaceResponse(
  payload: unknown,
): OpenWorkspaceResponse {
  const value = assertPlainObject(payload, 'openWorkspace 响应')
  return {
    selection: parseWorkspaceSelectionResult(value.selection),
    state: parseStudioHostState(value.state),
  }
}

function parseRuntimeSnapshotView(payload: unknown): RuntimeSnapshotView {
  const value = assertPlainObject(payload, 'runtime snapshot')
  if (value.sessionId !== null && value.sessionId !== undefined && typeof value.sessionId !== 'string') {
    throw new StudioBridgeValidationError('runtime.snapshot.sessionId 必须是字符串或 null。')
  }
  if (typeof value.isRunning !== 'boolean') {
    throw new StudioBridgeValidationError('runtime.snapshot.isRunning 必须是布尔值。')
  }
  if (typeof value.provider !== 'string') {
    throw new StudioBridgeValidationError('runtime.snapshot.provider 必须是字符串。')
  }
  if (typeof value.model !== 'string') {
    throw new StudioBridgeValidationError('runtime.snapshot.model 必须是字符串。')
  }

  return {
    sessionId:
      value.sessionId === undefined ? null : (value.sessionId as string | null),
    isRunning: value.isRunning,
    provider: value.provider,
    model: value.model,
    warnings:
      value.warnings === undefined
        ? []
        : parseStringArray(value.warnings, 'runtime.snapshot.warnings'),
  }
}

export function parseStudioRuntimeInspectResult(
  payload: unknown,
): RuntimeInspectResult {
  const value = assertPlainObject(payload, 'runtime inspect 响应')
  if (
    value.status !== 'ready' &&
    value.status !== 'not-ready' &&
    value.status !== 'error'
  ) {
    throw new StudioBridgeValidationError('runtime.status 非法。')
  }
  if (value.workspacePath !== null && value.workspacePath !== undefined && typeof value.workspacePath !== 'string') {
    throw new StudioBridgeValidationError('runtime.workspacePath 必须是字符串或 null。')
  }
  const workspacePath =
    value.workspacePath === undefined ? null : (value.workspacePath as string | null)
  const configWarnings =
    value.configWarnings === undefined
      ? []
      : parseStringArray(value.configWarnings, 'runtime.configWarnings')
  if (value.issues !== undefined && !Array.isArray(value.issues)) {
    throw new StudioBridgeValidationError('runtime.issues 必须是数组。')
  }
  const issues =
    value.issues === undefined
      ? []
      : value.issues.map((item, index) =>
          parseStatusIssue(item, `runtime.issues[${index}]`),
        )

  if (value.ok === true) {
    if (value.status === 'error') {
      throw new StudioBridgeValidationError('runtime.ok=true 时 status 不能是 error。')
    }
    return {
      ok: true,
      status: value.status,
      snapshot: parseRuntimeSnapshotView(value.snapshot),
      workspacePath,
      configWarnings,
      issues,
    }
  }

  if (value.ok === false && typeof value.error === 'string') {
    return {
      ok: false,
      status: 'error',
      error: value.error,
      workspacePath,
      configWarnings,
      issues,
    }
  }

  throw new StudioBridgeValidationError('runtime inspect 响应格式不合法。')
}

export function parseStudioRuntimeSubmitResult(
  payload: unknown,
): RuntimeSubmitResult {
  const value = assertPlainObject(payload, 'runtime submit 响应')
  if (value.ok === true) {
    if (
      value.sessionId !== undefined &&
      value.sessionId !== null &&
      typeof value.sessionId !== 'string'
    ) {
      throw new StudioBridgeValidationError(
        'runtime.submit.sessionId 必须是字符串或 null。',
      )
    }

    return {
      ok: true,
      sessionId:
        value.sessionId === undefined ? null : (value.sessionId as string | null),
      ...(typeof value.runId === 'string' ? { runId: value.runId } : {}),
    }
  }

  if (value.ok === false && typeof value.error === 'string') {
    return {
      ok: false,
      error: value.error,
      ...(typeof value.runId === 'string' ? { runId: value.runId } : {}),
    }
  }

  throw new StudioBridgeValidationError('runtime submit 响应格式不合法。')
}

export function parseStudioRuntimeCancelResult(
  payload: unknown,
): RuntimeCancelResult {
  const value = assertPlainObject(payload, 'runtime cancel 响应')
  if (value.ok === true) {
    if (
      value.runId !== undefined &&
      value.runId !== null &&
      typeof value.runId !== 'string'
    ) {
      throw new StudioBridgeValidationError(
        'runtime.cancel.runId 必须是字符串或 null。',
      )
    }

    return {
      ok: true,
      ...(value.runId === undefined ? {} : { runId: value.runId as string | null }),
    }
  }

  if (value.ok === false && typeof value.error === 'string') {
    return {
      ok: false,
      error: value.error,
    }
  }

  throw new StudioBridgeValidationError('runtime cancel 响应格式不合法。')
}

export function parseStudioRuntimeEvent(payload: unknown): StudioRuntimeEvent {
  const value = assertPlainObject(payload, 'runtime event')
  if (typeof value.type !== 'string') {
    throw new StudioBridgeValidationError('runtime.event.type 必须是字符串。')
  }
  if (typeof value.timestamp !== 'string') {
    throw new StudioBridgeValidationError('runtime.event.timestamp 必须是字符串。')
  }

  const sessionId = parseOptionalString(value.sessionId, 'runtime.event.sessionId')
  const agentId = parseOptionalString(value.agentId, 'runtime.event.agentId')
  const runId = parseOptionalString(value.runId, 'runtime.event.runId')
  if (
    value.payload !== undefined &&
    !isPlainObject(value.payload)
  ) {
    throw new StudioBridgeValidationError('runtime.event.payload 必须是对象。')
  }

  return {
    type: value.type,
    timestamp: value.timestamp,
    ...(runId ? { runId } : {}),
    ...(sessionId ? { sessionId } : {}),
    ...(agentId ? { agentId } : {}),
    ...(value.payload ? { payload: value.payload } : {}),
  }
}

function parseStartupProjectCandidate(
  payload: unknown,
): StudioStartupProjectCandidate {
  const value = assertPlainObject(payload, 'startup.recentProject')
  if (typeof value.path !== 'string') {
    throw new StudioBridgeValidationError('startup.recentProject.path 必须是字符串。')
  }
  if (typeof value.lastActiveAt !== 'number') {
    throw new StudioBridgeValidationError('startup.recentProject.lastActiveAt 必须是数字。')
  }
  if (typeof value.exists !== 'boolean') {
    throw new StudioBridgeValidationError('startup.recentProject.exists 必须是布尔值。')
  }

  return {
    path: value.path,
    lastActiveAt: value.lastActiveAt,
    exists: value.exists,
  }
}

function parseStartupSessionCandidate(
  payload: unknown,
): StudioStartupSessionCandidate {
  const value = assertPlainObject(payload, 'startup.recentSession')
  if (typeof value.projectPath !== 'string') {
    throw new StudioBridgeValidationError('startup.recentSession.projectPath 必须是字符串。')
  }
  if (typeof value.sessionId !== 'string') {
    throw new StudioBridgeValidationError('startup.recentSession.sessionId 必须是字符串。')
  }
  if (typeof value.valid !== 'boolean') {
    throw new StudioBridgeValidationError('startup.recentSession.valid 必须是布尔值。')
  }

  return {
    projectPath: value.projectPath,
    sessionId: value.sessionId,
    valid: value.valid,
  }
}

function parseModeId(value: unknown, subject: string): StudioModeId {
  if (value !== 'standard' && value !== 'xforge') {
    throw new StudioBridgeValidationError(`${subject} 必须是 standard 或 xforge。`)
  }

  return value
}

function parseRecentProjectSummary(
  payload: unknown,
): StudioRecentProjectSummary {
  const value = assertPlainObject(payload, 'recentProjects 项')
  if (typeof value.path !== 'string') {
    throw new StudioBridgeValidationError('recentProjects.path 必须是字符串。')
  }
  if (typeof value.name !== 'string') {
    throw new StudioBridgeValidationError('recentProjects.name 必须是字符串。')
  }
  if (typeof value.lastActiveAt !== 'number') {
    throw new StudioBridgeValidationError('recentProjects.lastActiveAt 必须是数字。')
  }
  if (typeof value.exists !== 'boolean') {
    throw new StudioBridgeValidationError('recentProjects.exists 必须是布尔值。')
  }
  if (value.gitBranch !== null && value.gitBranch !== undefined && typeof value.gitBranch !== 'string') {
    throw new StudioBridgeValidationError('recentProjects.gitBranch 必须是字符串或 null。')
  }

  return {
    path: value.path,
    name: value.name,
    lastActiveAt: value.lastActiveAt,
    exists: value.exists,
    gitBranch: value.gitBranch === undefined ? null : (value.gitBranch as string | null),
  }
}

function parseProjectSessionSummary(
  payload: unknown,
): StudioProjectSessionSummary {
  const value = assertPlainObject(payload, 'projectSessions 项')
  if (typeof value.sessionId !== 'string') {
    throw new StudioBridgeValidationError('projectSessions.sessionId 必须是字符串。')
  }
  if (typeof value.projectPath !== 'string') {
    throw new StudioBridgeValidationError('projectSessions.projectPath 必须是字符串。')
  }
  if (typeof value.title !== 'string') {
    throw new StudioBridgeValidationError('projectSessions.title 必须是字符串。')
  }
  if (typeof value.updatedAt !== 'string') {
    throw new StudioBridgeValidationError('projectSessions.updatedAt 必须是字符串。')
  }
  if (value.gitBranch !== null && value.gitBranch !== undefined && typeof value.gitBranch !== 'string') {
    throw new StudioBridgeValidationError('projectSessions.gitBranch 必须是字符串或 null。')
  }
  if (typeof value.messageCount !== 'number') {
    throw new StudioBridgeValidationError('projectSessions.messageCount 必须是数字。')
  }
  if (
    value.providerId !== null &&
    value.providerId !== undefined &&
    typeof value.providerId !== 'string'
  ) {
    throw new StudioBridgeValidationError('projectSessions.providerId 必须是字符串或 null。')
  }
  if (
    value.modelId !== null &&
    value.modelId !== undefined &&
    typeof value.modelId !== 'string'
  ) {
    throw new StudioBridgeValidationError('projectSessions.modelId 必须是字符串或 null。')
  }
  if (!Array.isArray(value.subagents)) {
    throw new StudioBridgeValidationError('projectSessions.subagents 必须是数组。')
  }

  return {
    sessionId: value.sessionId,
    projectPath: value.projectPath,
    title: value.title,
    updatedAt: value.updatedAt,
    gitBranch: value.gitBranch === undefined ? null : (value.gitBranch as string | null),
    messageCount: value.messageCount,
    ...(value.providerId === undefined
      ? {}
      : { providerId: value.providerId as string | null }),
    ...(value.modelId === undefined
      ? {}
      : { modelId: value.modelId as string | null }),
    subagents: value.subagents.map((subagent) => {
      const subagentValue = assertPlainObject(subagent, 'subagent 项')
      if (typeof subagentValue.agentId !== 'string') {
        throw new StudioBridgeValidationError('subagent.agentId 必须是字符串。')
      }
      if (typeof subagentValue.description !== 'string') {
        throw new StudioBridgeValidationError('subagent.description 必须是字符串。')
      }
      if (
        subagentValue.stateMessage !== undefined &&
        subagentValue.stateMessage !== null &&
        typeof subagentValue.stateMessage !== 'string'
      ) {
        throw new StudioBridgeValidationError('subagent.stateMessage 必须是字符串或 null。')
      }
      if (
        subagentValue.partialResult !== undefined &&
        subagentValue.partialResult !== null &&
        typeof subagentValue.partialResult !== 'string'
      ) {
        throw new StudioBridgeValidationError('subagent.partialResult 必须是字符串或 null。')
      }
      if (
        typeof subagentValue.status !== 'string' ||
        !['running', 'stopping', 'stopped', 'done', 'error'].includes(
          subagentValue.status,
        )
      ) {
        throw new StudioBridgeValidationError('subagent.status 非法。')
      }
      return {
        agentId: subagentValue.agentId,
        description: subagentValue.description,
        status: subagentValue.status as StudioProjectSessionSummary['subagents'][number]['status'],
        ...(subagentValue.stateMessage === undefined
          ? {}
          : { stateMessage: subagentValue.stateMessage as string | null }),
        ...(subagentValue.partialResult === undefined
          ? {}
          : { partialResult: subagentValue.partialResult as string | null }),
      }
    }),
  }
}

function parseConversationBlock(
  payload: unknown,
  subject: string,
) {
  const value = assertPlainObject(payload, subject)
  if (typeof value.id !== 'string') {
    throw new StudioBridgeValidationError(`${subject}.id 必须是字符串。`)
  }
  if (
    typeof value.type !== 'string' ||
    !['text', 'thinking', 'tool', 'status', 'system'].includes(value.type)
  ) {
    throw new StudioBridgeValidationError(`${subject}.type 非法。`)
  }

  switch (value.type) {
    case 'text':
    case 'thinking':
    case 'status':
      if (typeof value.content !== 'string') {
        throw new StudioBridgeValidationError(`${subject}.content 必须是字符串。`)
      }
      return {
        id: value.id,
        type: value.type,
        content: value.content,
      }
    case 'system':
      if (typeof value.content !== 'string') {
        throw new StudioBridgeValidationError(`${subject}.content 必须是字符串。`)
      }
      if (
        typeof value.level !== 'string' ||
        !['info', 'warning', 'error'].includes(value.level)
      ) {
        throw new StudioBridgeValidationError(`${subject}.level 非法。`)
      }
      return {
        id: value.id,
        type: 'system' as const,
        content: value.content,
        level: value.level as 'info' | 'warning' | 'error',
      }
    case 'tool':
      if (typeof value.toolCallId !== 'string') {
        throw new StudioBridgeValidationError(`${subject}.toolCallId 必须是字符串。`)
      }
      if (typeof value.toolName !== 'string') {
        throw new StudioBridgeValidationError(`${subject}.toolName 必须是字符串。`)
      }
      if (!isPlainObject(value.args)) {
        throw new StudioBridgeValidationError(`${subject}.args 必须是对象。`)
      }
      if (
        typeof value.status !== 'string' ||
        !['running', 'done', 'error'].includes(value.status)
      ) {
        throw new StudioBridgeValidationError(`${subject}.status 非法。`)
      }
      if (
        value.durationMs !== undefined &&
        value.durationMs !== null &&
        typeof value.durationMs !== 'number'
      ) {
        throw new StudioBridgeValidationError(`${subject}.durationMs 必须是数字或 null。`)
      }
      if (
        value.success !== undefined &&
        value.success !== null &&
        typeof value.success !== 'boolean'
      ) {
        throw new StudioBridgeValidationError(`${subject}.success 必须是布尔值或 null。`)
      }
      if (
        value.resultSummary !== undefined &&
        value.resultSummary !== null &&
        typeof value.resultSummary !== 'string'
      ) {
        throw new StudioBridgeValidationError(`${subject}.resultSummary 必须是字符串或 null。`)
      }
      if (
        value.resultFull !== undefined &&
        value.resultFull !== null &&
        typeof value.resultFull !== 'string'
      ) {
        throw new StudioBridgeValidationError(`${subject}.resultFull 必须是字符串或 null。`)
      }
      if (
        value.agentId !== undefined &&
        value.agentId !== null &&
        typeof value.agentId !== 'string'
      ) {
        throw new StudioBridgeValidationError(`${subject}.agentId 必须是字符串或 null。`)
      }
      return {
        id: value.id,
        type: 'tool' as const,
        toolCallId: value.toolCallId,
        toolName: value.toolName,
        args: value.args as Record<string, unknown>,
        status: value.status as 'running' | 'done' | 'error',
        ...(typeof value.durationMs === 'number' ? { durationMs: value.durationMs } : {}),
        ...(typeof value.success === 'boolean' ? { success: value.success } : {}),
        ...(typeof value.resultSummary === 'string'
          ? { resultSummary: value.resultSummary }
          : {}),
        ...(typeof value.resultFull === 'string' ? { resultFull: value.resultFull } : {}),
        ...(typeof value.agentId === 'string' ? { agentId: value.agentId } : {}),
      }
  }

  throw new StudioBridgeValidationError(`${subject}.type 非法。`)
}

function parseConversationUsage(
  payload: unknown,
  subject: string,
) {
  const value = assertPlainObject(payload, subject)
  const keys = [
    'inputTokens',
    'outputTokens',
    'cacheReadTokens',
    'cacheWriteTokens',
  ] as const

  for (const key of keys) {
    if (typeof value[key] !== 'number') {
      throw new StudioBridgeValidationError(`${subject}.${key} 必须是数字。`)
    }
  }

  return {
    inputTokens: value.inputTokens as number,
    outputTokens: value.outputTokens as number,
    cacheReadTokens: value.cacheReadTokens as number,
    cacheWriteTokens: value.cacheWriteTokens as number,
  }
}

function parseConversationMessage(
  payload: unknown,
  subject: string,
) {
  const value = assertPlainObject(payload, subject)
  if (typeof value.id !== 'string') {
    throw new StudioBridgeValidationError(`${subject}.id 必须是字符串。`)
  }
  if (
    typeof value.role !== 'string' ||
    !['user', 'assistant', 'system'].includes(value.role)
  ) {
    throw new StudioBridgeValidationError(`${subject}.role 非法。`)
  }
  if (!Array.isArray(value.blocks)) {
    throw new StudioBridgeValidationError(`${subject}.blocks 必须是数组。`)
  }
  if (
    value.providerId !== undefined &&
    value.providerId !== null &&
    typeof value.providerId !== 'string'
  ) {
    throw new StudioBridgeValidationError(`${subject}.providerId 必须是字符串或 null。`)
  }
  if (
    value.modelId !== undefined &&
    value.modelId !== null &&
    typeof value.modelId !== 'string'
  ) {
    throw new StudioBridgeValidationError(`${subject}.modelId 必须是字符串或 null。`)
  }
  if (
    value.usage !== undefined &&
    value.usage !== null &&
    !isPlainObject(value.usage)
  ) {
    throw new StudioBridgeValidationError(`${subject}.usage 必须是对象或 null。`)
  }
  if (
    value.llmCallCount !== undefined &&
    value.llmCallCount !== null &&
    typeof value.llmCallCount !== 'number'
  ) {
    throw new StudioBridgeValidationError(`${subject}.llmCallCount 必须是数字或 null。`)
  }
  if (
    value.toolCallCount !== undefined &&
    value.toolCallCount !== null &&
    typeof value.toolCallCount !== 'number'
  ) {
    throw new StudioBridgeValidationError(`${subject}.toolCallCount 必须是数字或 null。`)
  }

  return {
    id: value.id,
    role: value.role as 'user' | 'assistant' | 'system',
    blocks: value.blocks.map((item, index) =>
      parseConversationBlock(item, `${subject}.blocks[${index}]`),
    ),
    ...(value.providerId === undefined ? {} : { providerId: value.providerId as string | null }),
    ...(value.modelId === undefined ? {} : { modelId: value.modelId as string | null }),
    ...(value.usage === undefined || value.usage === null
      ? {}
      : { usage: parseConversationUsage(value.usage, `${subject}.usage`) }),
    ...(typeof value.llmCallCount === 'number'
      ? { llmCallCount: value.llmCallCount }
      : {}),
    ...(typeof value.toolCallCount === 'number'
      ? { toolCallCount: value.toolCallCount }
      : {}),
  }
}

function parseActiveSessionDetail(payload: unknown) {
  const summary = parseProjectSessionSummary(payload)
  const value = assertPlainObject(payload, 'shell.activeSession')
  if (
    value.leafEventUuid !== undefined &&
    value.leafEventUuid !== null &&
    typeof value.leafEventUuid !== 'string'
  ) {
    throw new StudioBridgeValidationError('shell.activeSession.leafEventUuid 必须是字符串或 null。')
  }
  if (!Array.isArray(value.messages)) {
    throw new StudioBridgeValidationError('shell.activeSession.messages 必须是数组。')
  }

  return {
    ...summary,
    leafEventUuid:
      value.leafEventUuid === undefined ? null : (value.leafEventUuid as string | null),
    messages: value.messages.map((item, index) =>
      parseConversationMessage(item, `shell.activeSession.messages[${index}]`),
    ),
  }
}

function parseScratchpadEntry(payload: unknown): StudioScratchpadEntry {
  const value = assertPlainObject(payload, 'scratchpadEntries 项')
  if (typeof value.id !== 'string') {
    throw new StudioBridgeValidationError('scratchpadEntries.id 必须是字符串。')
  }
  if (typeof value.title !== 'string') {
    throw new StudioBridgeValidationError('scratchpadEntries.title 必须是字符串。')
  }
  if (value.updatedAt !== null && value.updatedAt !== undefined && typeof value.updatedAt !== 'string') {
    throw new StudioBridgeValidationError('scratchpadEntries.updatedAt 必须是字符串或 null。')
  }

  return {
    id: value.id,
    title: value.title,
    updatedAt: value.updatedAt === undefined ? null : (value.updatedAt as string | null),
  }
}

function parseShellDefaults(payload: unknown): StudioShellDefaults {
  const value = assertPlainObject(payload, 'shell.defaults')
  const parseNullableString = (field: unknown, subject: string): string | null => {
    if (field === null || field === undefined) {
      return null
    }
    if (typeof field !== 'string') {
      throw new StudioBridgeValidationError(`${subject} 必须是字符串或 null。`)
    }
    return field
  }

  if (!Array.isArray(value.allowedModes)) {
    throw new StudioBridgeValidationError('shell.defaults.allowedModes 必须是数组。')
  }
  if (
    value.availablePrimaryAgentIds !== undefined &&
    !Array.isArray(value.availablePrimaryAgentIds)
  ) {
    throw new StudioBridgeValidationError(
      'shell.defaults.availablePrimaryAgentIds 必须是字符串数组。',
    )
  }
  if (
    value.availableModelIds !== undefined &&
    !Array.isArray(value.availableModelIds)
  ) {
    throw new StudioBridgeValidationError(
      'shell.defaults.availableModelIds 必须是字符串数组。',
    )
  }

  return {
    projectPath: parseNullableString(value.projectPath, 'shell.defaults.projectPath'),
    branch: parseNullableString(value.branch, 'shell.defaults.branch'),
    agentId: parseNullableString(value.agentId, 'shell.defaults.agentId'),
    modelId: parseNullableString(value.modelId, 'shell.defaults.modelId'),
    providerId: parseNullableString(value.providerId, 'shell.defaults.providerId'),
    recommendedMode:
      value.recommendedMode === undefined || value.recommendedMode === null
        ? null
        : parseModeId(value.recommendedMode, 'shell.defaults.recommendedMode'),
    allowedModes: value.allowedModes.map((mode) =>
      parseModeId(mode, 'shell.defaults.allowedModes'),
    ),
    ...(value.availablePrimaryAgentIds === undefined
      ? {}
      : {
          availablePrimaryAgentIds: parseStringArray(
            value.availablePrimaryAgentIds,
            'shell.defaults.availablePrimaryAgentIds',
          ),
        }),
    ...(value.availableModelIds === undefined
      ? {}
      : {
          availableModelIds: parseStringArray(
            value.availableModelIds,
            'shell.defaults.availableModelIds',
          ),
        }),
  }
}

export function parseStudioShellSnapshot(
  payload: unknown,
): StudioShellSnapshot {
  const value = assertPlainObject(payload, 'shell.getSnapshot 响应')
  const startup = assertPlainObject(value.startup, 'shell.startup')

  if (!Array.isArray(value.recentProjects)) {
    throw new StudioBridgeValidationError('shell.recentProjects 必须是数组。')
  }
  if (!Array.isArray(value.projectSessions)) {
    throw new StudioBridgeValidationError('shell.projectSessions 必须是数组。')
  }
  if (!Array.isArray(value.scratchpadEntries)) {
    throw new StudioBridgeValidationError('shell.scratchpadEntries 必须是数组。')
  }
  if (
    value.activeSession !== undefined &&
    value.activeSession !== null &&
    !isPlainObject(value.activeSession)
  ) {
    throw new StudioBridgeValidationError('shell.activeSession 必须是对象或 null。')
  }
  if (value.issues !== undefined && !Array.isArray(value.issues)) {
    throw new StudioBridgeValidationError('shell.issues 必须是数组。')
  }

  return {
    startup: {
      recentProject:
        startup.recentProject === undefined || startup.recentProject === null
          ? null
          : parseStartupProjectCandidate(startup.recentProject),
      recentSession:
        startup.recentSession === undefined || startup.recentSession === null
          ? null
          : parseStartupSessionCandidate(startup.recentSession),
    },
    recentProjects: value.recentProjects.map((item) => parseRecentProjectSummary(item)),
    projectSessions: value.projectSessions.map((item) => parseProjectSessionSummary(item)),
    ...(value.activeSession === undefined
      ? {}
      : {
          activeSession:
            value.activeSession === null ? null : parseActiveSessionDetail(value.activeSession),
        }),
    scratchpadEntries: value.scratchpadEntries.map((item) => parseScratchpadEntry(item)),
    defaults: parseShellDefaults(value.defaults),
    issues:
      value.issues === undefined
        ? []
        : value.issues.map((item, index) =>
            parseStatusIssue(item, `shell.issues[${index}]`),
          ),
    warnings:
      value.warnings === undefined
        ? []
        : parseStringArray(value.warnings, 'shell.warnings'),
  }
}

// ═══ Warmup 状态事件校验 ═══

/**
 * 校验 warmup status changed 事件。
 *
 * 安全约束：
 * - status 必须是合法枚举值
 * - error 只允许字符串摘要（截断到 500 字符），不透出堆栈或敏感配置
 * - 不允许 cwd、cacheKey、systemPrompt、toolDefinitions、apiKey 等敏感字段穿透
 */
export function parseStudioWarmupStatusChangedEvent(
  payload: unknown,
): RuntimeWarmupStatusChangedEvent {
  const value = assertPlainObject(payload, 'warmup.statusChanged')

  // status 枚举校验
  if (typeof value.status !== 'string' || !VALID_WARMUP_STATUSES.has(value.status)) {
    throw new StudioBridgeValidationError(
      `warmup.statusChanged.status 非法: ${String(value.status)}`,
    )
  }

  // durationMs 可选正数
  if (
    value.durationMs !== undefined &&
    (typeof value.durationMs !== 'number' || !Number.isFinite(value.durationMs) || value.durationMs < 0)
  ) {
    throw new StudioBridgeValidationError(
      'warmup.statusChanged.durationMs 必须是非负数。',
    )
  }

  // error 只允许字符串摘要，截断到 500 字符
  let error: string | undefined
  if (value.error !== undefined) {
    if (typeof value.error !== 'string') {
      throw new StudioBridgeValidationError(
        'warmup.statusChanged.error 必须是字符串。',
      )
    }
    error = value.error.length > 500 ? value.error.slice(0, 500) : value.error
  }

  // 拒绝敏感字段穿透
  const sensitiveFields = [
    'cwd', 'cacheKey', 'systemPrompt', 'toolDefinitions',
    'toolRegistry', 'apiKey', 'config', 'workspaceRoot',
  ]
  for (const field of sensitiveFields) {
    if (field in value) {
      throw new StudioBridgeValidationError(
        `warmup.statusChanged 不允许包含 ${field} 字段。`,
      )
    }
  }

  return {
    status: value.status as RuntimeWarmupStatusChangedEvent['status'],
    ...(value.durationMs !== undefined ? { durationMs: value.durationMs as number } : {}),
    ...(error !== undefined ? { error } : {}),
  }
}
