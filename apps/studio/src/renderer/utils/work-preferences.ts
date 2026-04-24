import type {
  StudioModeId,
  StudioProjectSessionSummary,
  StudioShellDefaults,
} from '../../shared/studio-bridge-contract'
import { resolveModeSelection } from './mode-resolver'

const WORK_PREFERENCE_STORAGE_KEY = 'xnova.studio.work-preferences.v1'
const LEGACY_MODE_STORAGE_KEY = 'xnova.studio.project-mode.v1'

interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

interface StoredPreferencePayload {
  projects?: Record<string, unknown>
}

export interface ProjectWorkPreference {
  sessionId: string | null
  mode: StudioModeId | null
  agentId: string | null
  modelId: string | null
}

export interface WorkPreferenceRestoreStatus {
  kind: 'restored' | 'fallback' | 'empty'
  message: string
}

export interface WorkPreferenceRestoreSources {
  session: 'stored' | 'startup' | 'project-first' | 'none'
  mode: 'stored' | 'project-default' | 'builtin'
  agent: 'stored' | 'project-default' | 'none'
  model: 'stored' | 'session' | 'project-default' | 'none'
}

export interface ResolvedWorkPreference {
  sessionId: string | null
  mode: StudioModeId
  agentId: string | null
  modelId: string | null
  status: WorkPreferenceRestoreStatus
  sources: WorkPreferenceRestoreSources
  projectDefaults: {
    mode: StudioModeId
    agentId: string | null
    modelId: string | null
  }
  canRestoreProjectDefaults: boolean
}

export interface ResolveWorkPreferenceRestoreInput {
  projectPath: string | null
  startupSessionId: string | null
  sessions: StudioProjectSessionSummary[]
  defaults: StudioShellDefaults | null
  storedPreference: ProjectWorkPreference | null
}

function getBrowserStorage(storage?: StorageLike): StorageLike | null {
  if (storage) {
    return storage
  }

  if (typeof window === 'undefined') {
    return null
  }

  return window.localStorage
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function normalizeModeId(value: unknown): StudioModeId | null {
  return value === 'standard' || value === 'xforge' ? value : null
}

function normalizeProjectWorkPreference(value: unknown): ProjectWorkPreference | null {
  if (!isPlainObject(value)) {
    return null
  }

  return {
    sessionId: normalizeNullableString(value.sessionId),
    mode: normalizeModeId(value.mode),
    agentId: normalizeNullableString(value.agentId),
    modelId: normalizeNullableString(value.modelId),
  }
}

function readWorkPreferencePayload(storage?: StorageLike): StoredPreferencePayload {
  const target = getBrowserStorage(storage)
  if (!target) {
    return {}
  }

  try {
    const raw = target.getItem(WORK_PREFERENCE_STORAGE_KEY)
    if (!raw) {
      return {}
    }

    const parsed = JSON.parse(raw) as unknown
    return isPlainObject(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function hasStoredProjectPreference(preference: ProjectWorkPreference): boolean {
  return (
    preference.sessionId !== null ||
    preference.mode !== null ||
    preference.agentId !== null ||
    preference.modelId !== null
  )
}

function writeWorkPreferencePayload(
  payload: StoredPreferencePayload,
  storage?: StorageLike,
): void {
  const target = getBrowserStorage(storage)
  if (!target) {
    return
  }

  try {
    target.setItem(WORK_PREFERENCE_STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // localStorage 写失败时只降级为不持久化，不影响当前会话
  }
}

function readLegacyModePreference(
  projectPath: string | null,
  storage?: StorageLike,
): StudioModeId | null {
  if (!projectPath) {
    return null
  }

  const target = getBrowserStorage(storage)
  if (!target) {
    return null
  }

  try {
    const raw = target.getItem(LEGACY_MODE_STORAGE_KEY)
    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw) as unknown
    if (!isPlainObject(parsed)) {
      return null
    }

    return normalizeModeId(parsed[projectPath])
  } catch {
    return null
  }
}

function writeLegacyModePreference(
  projectPath: string | null,
  mode: StudioModeId | null,
  storage?: StorageLike,
): void {
  if (!projectPath) {
    return
  }

  const target = getBrowserStorage(storage)
  if (!target) {
    return
  }

  try {
    const raw = target.getItem(LEGACY_MODE_STORAGE_KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : {}
    const next = isPlainObject(parsed) ? parsed : {}
    if (mode === null) {
      delete next[projectPath]
    } else {
      next[projectPath] = mode
    }
    target.setItem(LEGACY_MODE_STORAGE_KEY, JSON.stringify(next))
  } catch {
    // legacy key 仅作兼容，不影响主流程
  }
}

function isAllowedValue(
  value: string | null,
  candidates: string[] | undefined,
): value is string {
  if (!value) {
    return false
  }

  if (!candidates || candidates.length === 0) {
    return true
  }

  return candidates.includes(value)
}

function formatFallbackMessage(fallbackKeys: string[]): string {
  if (fallbackKeys.length === 0) {
    return '已恢复最近工作状态。'
  }

  return '最近工作偏好存在不可恢复项，已回退到项目推荐值。'
}

function resolveSessionSelection(
  startupSessionId: string | null,
  sessions: StudioProjectSessionSummary[],
  storedPreference: ProjectWorkPreference | null,
): {
  sessionId: string | null
  source: WorkPreferenceRestoreSources['session']
  hadFallback: boolean
} {
  const sessionIds = new Set(sessions.map((session) => session.sessionId))

  if (storedPreference?.sessionId) {
    if (sessionIds.has(storedPreference.sessionId)) {
      return {
        sessionId: storedPreference.sessionId,
        source: 'stored',
        hadFallback: false,
      }
    }

    return {
      sessionId:
        startupSessionId && sessionIds.has(startupSessionId)
          ? startupSessionId
          : (sessions[0]?.sessionId ?? null),
      source:
        startupSessionId && sessionIds.has(startupSessionId)
          ? 'startup'
          : sessions[0]
            ? 'project-first'
            : 'none',
      hadFallback: true,
    }
  }

  if (startupSessionId && sessionIds.has(startupSessionId)) {
    return {
      sessionId: startupSessionId,
      source: 'startup',
      hadFallback: false,
    }
  }

  if (sessions[0]) {
    return {
      sessionId: sessions[0].sessionId,
      source: 'project-first',
      hadFallback: false,
    }
  }

  return {
    sessionId: null,
    source: 'none',
    hadFallback: false,
  }
}

export function readProjectWorkPreference(
  projectPath: string | null,
  storage?: StorageLike,
): ProjectWorkPreference | null {
  if (!projectPath) {
    return null
  }

  const payload = readWorkPreferencePayload(storage)
  const projects = isPlainObject(payload.projects) ? payload.projects : {}
  const normalized = normalizeProjectWorkPreference(projects[projectPath])
  const legacyMode = readLegacyModePreference(projectPath, storage)

  if (!normalized && legacyMode === null) {
    return null
  }

  return {
    sessionId: normalized?.sessionId ?? null,
    mode: normalized?.mode ?? legacyMode,
    agentId: normalized?.agentId ?? null,
    modelId: normalized?.modelId ?? null,
  }
}

export function writeProjectWorkPreference(
  projectPath: string | null,
  updates: Partial<ProjectWorkPreference>,
  storage?: StorageLike,
): void {
  if (!projectPath) {
    return
  }

  const payload = readWorkPreferencePayload(storage)
  const projects = isPlainObject(payload.projects) ? payload.projects : {}
  const current =
    readProjectWorkPreference(projectPath, storage) ?? {
      sessionId: null,
      mode: null,
      agentId: null,
      modelId: null,
    }

  const next: ProjectWorkPreference = {
    sessionId:
      updates.sessionId === undefined
        ? current.sessionId
        : normalizeNullableString(updates.sessionId),
    mode:
      updates.mode === undefined
        ? current.mode
        : normalizeModeId(updates.mode),
    agentId:
      updates.agentId === undefined
        ? current.agentId
        : normalizeNullableString(updates.agentId),
    modelId:
      updates.modelId === undefined
        ? current.modelId
        : normalizeNullableString(updates.modelId),
  }

  if (hasStoredProjectPreference(next)) {
    projects[projectPath] = next
  } else {
    delete projects[projectPath]
  }

  writeWorkPreferencePayload({ projects }, storage)
  writeLegacyModePreference(projectPath, next.mode, storage)
}

export function clearProjectWorkPreference(
  projectPath: string | null,
  fields: Array<keyof ProjectWorkPreference>,
  storage?: StorageLike,
): void {
  const nextUpdates: Partial<ProjectWorkPreference> = {}

  for (const field of fields) {
    nextUpdates[field] = null
  }

  writeProjectWorkPreference(projectPath, nextUpdates, storage)
}

export function resolveWorkPreferenceRestore(
  input: ResolveWorkPreferenceRestoreInput,
): ResolvedWorkPreference {
  const allowedModes = input.defaults?.allowedModes ?? ['standard', 'xforge']
  const projectDefaultMode = resolveModeSelection({
    recentMode: null,
    recommendedMode: input.defaults?.recommendedMode ?? null,
    allowedModes,
  })
  const projectDefaultAgentId = input.defaults?.agentId ?? null
  const projectDefaultModelId = input.defaults?.modelId ?? null

  const sessionSelection = resolveSessionSelection(
    input.startupSessionId,
    input.sessions,
    input.storedPreference,
  )
  const activeSession =
    input.sessions.find((session) => session.sessionId === sessionSelection.sessionId) ??
    null

  const storedMode = input.storedPreference?.mode ?? null
  const mode = resolveModeSelection({
    recentMode: storedMode,
    recommendedMode: input.defaults?.recommendedMode ?? null,
    allowedModes,
  })
  const modeFallback = storedMode !== null && mode !== storedMode

  const storedAgentId = input.storedPreference?.agentId ?? null
  const agentId = isAllowedValue(
    storedAgentId,
    input.defaults?.availablePrimaryAgentIds,
  )
    ? storedAgentId
    : projectDefaultAgentId
  const agentFallback = storedAgentId !== null && agentId !== storedAgentId

  const storedModelId = input.storedPreference?.modelId ?? null
  let modelSource: WorkPreferenceRestoreSources['model'] = 'none'
  let modelId: string | null = null
  let modelFallback = false
  if (isAllowedValue(storedModelId, input.defaults?.availableModelIds)) {
    modelId = storedModelId
    modelSource = 'stored'
  } else if (storedModelId !== null) {
    modelFallback = true
  }

  if (modelId === null && activeSession?.modelId) {
    modelId = activeSession.modelId
    modelSource = 'session'
  }

  if (modelId === null && projectDefaultModelId) {
    modelId = projectDefaultModelId
    modelSource = 'project-default'
  }

  const fallbackKeys = [
    sessionSelection.hadFallback ? 'session' : null,
    modeFallback ? 'mode' : null,
    agentFallback ? 'agent' : null,
    modelFallback ? 'model' : null,
  ].filter((item): item is string => item !== null)

  const hasRestoredData =
    sessionSelection.source === 'stored' ||
    sessionSelection.source === 'startup' ||
    (input.storedPreference !== null &&
      hasStoredProjectPreference(input.storedPreference))

  const status: WorkPreferenceRestoreStatus =
    fallbackKeys.length > 0
      ? {
          kind: 'fallback',
          message: formatFallbackMessage(fallbackKeys),
        }
      : hasRestoredData
        ? {
            kind: 'restored',
            message: '已恢复最近工作状态。',
          }
        : {
            kind: 'empty',
            message: '当前没有可恢复的最近工作状态，已使用项目推荐值。',
          }

  const sources: WorkPreferenceRestoreSources = {
    session: sessionSelection.source,
    mode:
      input.storedPreference?.mode !== null && !modeFallback
        ? 'stored'
        : input.defaults?.recommendedMode
          ? 'project-default'
          : 'builtin',
    agent:
      input.storedPreference?.agentId !== null && !agentFallback
        ? 'stored'
        : projectDefaultAgentId
          ? 'project-default'
          : 'none',
    model: modelSource,
  }

  return {
    sessionId: sessionSelection.sessionId,
    mode,
    agentId,
    modelId,
    status,
    sources,
    projectDefaults: {
      mode: projectDefaultMode,
      agentId: projectDefaultAgentId,
      modelId: projectDefaultModelId,
    },
    canRestoreProjectDefaults:
      input.projectPath !== null &&
      (mode !== projectDefaultMode ||
        agentId !== projectDefaultAgentId ||
        modelId !== projectDefaultModelId),
  }
}
