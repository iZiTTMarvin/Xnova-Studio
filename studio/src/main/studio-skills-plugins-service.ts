import {
  readSkillsPluginsOverview,
  type SkillsPluginsOverviewSnapshot,
} from '../../../cli/src/skills/plugins-overview-service.js'
import type {
  StudioHostState,
  StudioSkillsPluginsOverviewSnapshot,
} from '../shared/studio-bridge-contract'

function toOverview(
  snapshot: SkillsPluginsOverviewSnapshot,
): StudioSkillsPluginsOverviewSnapshot {
  return snapshot
}

export interface StudioSkillsPluginsService {
  getOverview(hostState: StudioHostState): Promise<StudioSkillsPluginsOverviewSnapshot>
}

export interface CreateStudioSkillsPluginsServiceOptions {
  readSkillsPluginsOverviewFn?: typeof readSkillsPluginsOverview
}

export function createStudioSkillsPluginsService(
  options: CreateStudioSkillsPluginsServiceOptions = {},
): StudioSkillsPluginsService {
  const readOverview = options.readSkillsPluginsOverviewFn ?? readSkillsPluginsOverview

  return {
    async getOverview() {
      return toOverview(await readOverview())
    },
  }
}
