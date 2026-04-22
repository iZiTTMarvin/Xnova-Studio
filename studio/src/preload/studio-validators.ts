import type {
  OpenWorkspaceResponse,
  RuntimeInspectRequest,
  RuntimeInspectResult,
  RuntimeSnapshotView,
  StudioHostState,
  StudioModeId,
  StudioProjectSessionSummary,
  StudioRecentProjectSummary,
  StudioScratchpadEntry,
  StudioShellDefaults,
  StudioShellSnapshot,
  StudioShellSnapshotRequest,
  StudioStartupProjectCandidate,
  StudioStartupSessionCandidate,
  StudioRuntimeEvent,
  WorkspaceSelectionResult,
} from '../shared/studio-bridge-contract'

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

export function assertStudioNoPayload(
  payload: unknown,
  methodName: string,
): void {
  if (payload !== undefined) {
    throw new StudioBridgeValidationError(`${methodName} 不接受参数。`)
  }
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

export function parseStudioShellSnapshotRequest(
  payload: unknown,
): StudioShellSnapshotRequest {
  if (payload === undefined) {
    return {}
  }

  const value = assertPlainObject(payload, 'shell.getSnapshot 参数')
  if (Object.keys(value).some((key) => key !== 'projectPath')) {
    throw new StudioBridgeValidationError('shell.getSnapshot 只允许 projectPath 字段。')
  }
  if (
    value.projectPath !== undefined &&
    value.projectPath !== null &&
    typeof value.projectPath !== 'string'
  ) {
    throw new StudioBridgeValidationError('shell.getSnapshot.projectPath 必须是字符串或 null。')
  }

  return value.projectPath === undefined ? {} : { projectPath: value.projectPath as string | null }
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
  if (value.workspacePath !== null && value.workspacePath !== undefined && typeof value.workspacePath !== 'string') {
    throw new StudioBridgeValidationError('runtime.workspacePath 必须是字符串或 null。')
  }
  const workspacePath =
    value.workspacePath === undefined ? null : (value.workspacePath as string | null)
  const configWarnings =
    value.configWarnings === undefined
      ? []
      : parseStringArray(value.configWarnings, 'runtime.configWarnings')

  if (value.ok === true) {
    return {
      ok: true,
      snapshot: parseRuntimeSnapshotView(value.snapshot),
      workspacePath,
      configWarnings,
    }
  }

  if (value.ok === false && typeof value.error === 'string') {
    return {
      ok: false,
      error: value.error,
      workspacePath,
      configWarnings,
    }
  }

  throw new StudioBridgeValidationError('runtime inspect 响应格式不合法。')
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
  if (
    value.payload !== undefined &&
    !isPlainObject(value.payload)
  ) {
    throw new StudioBridgeValidationError('runtime.event.payload 必须是对象。')
  }

  return {
    type: value.type,
    timestamp: value.timestamp,
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
    subagents: value.subagents.map((subagent) => {
      const subagentValue = assertPlainObject(subagent, 'subagent 项')
      if (typeof subagentValue.agentId !== 'string') {
        throw new StudioBridgeValidationError('subagent.agentId 必须是字符串。')
      }
      if (typeof subagentValue.description !== 'string') {
        throw new StudioBridgeValidationError('subagent.description 必须是字符串。')
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
      }
    }),
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
    scratchpadEntries: value.scratchpadEntries.map((item) => parseScratchpadEntry(item)),
    defaults: parseShellDefaults(value.defaults),
    warnings:
      value.warnings === undefined
        ? []
        : parseStringArray(value.warnings, 'shell.warnings'),
  }
}
