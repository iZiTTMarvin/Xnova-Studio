import type { StudioModeId } from '../../shared/studio-bridge-contract'

export interface ModeSelectionInput {
  recentMode: StudioModeId | null
  recommendedMode: StudioModeId | null
  allowedModes: StudioModeId[]
}

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
