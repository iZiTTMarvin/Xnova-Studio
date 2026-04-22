import type { StudioModeId } from '../../shared/studio-bridge-contract'

export interface ModeSelectionInput {
  recentMode: StudioModeId | null
  recommendedMode: StudioModeId | null
  allowedModes: StudioModeId[]
}

const PROJECT_MODE_STORAGE_KEY = 'xnova.studio.project-mode.v1'

function isAllowedMode(
  value: StudioModeId | null,
  allowedModes: StudioModeId[],
): value is StudioModeId {
  return value !== null && allowedModes.includes(value)
}

export function resolveModeSelection(input: ModeSelectionInput): StudioModeId {
  if (isAllowedMode(input.recentMode, input.allowedModes)) {
    return input.recentMode
  }

  if (isAllowedMode(input.recommendedMode, input.allowedModes)) {
    return input.recommendedMode
  }

  if (input.allowedModes.includes('standard')) {
    return 'standard'
  }

  return input.allowedModes[0] ?? 'standard'
}

export function readProjectModePreference(
  projectPath: string | null,
): StudioModeId | null {
  if (!projectPath || typeof window === 'undefined') {
    return null
  }

  try {
    const raw = window.localStorage.getItem(PROJECT_MODE_STORAGE_KEY)
    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw) as Record<string, unknown>
    const value = parsed[projectPath]
    return value === 'standard' || value === 'xforge' ? value : null
  } catch {
    return null
  }
}

export function writeProjectModePreference(
  projectPath: string | null,
  mode: StudioModeId,
): void {
  if (!projectPath || typeof window === 'undefined') {
    return
  }

  try {
    const raw = window.localStorage.getItem(PROJECT_MODE_STORAGE_KEY)
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
    parsed[projectPath] = mode
    window.localStorage.setItem(PROJECT_MODE_STORAGE_KEY, JSON.stringify(parsed))
  } catch {
    // localStorage 写失败时只降级为不持久化，不影响当前会话
  }
}
