import {
  readSkillsPluginsOverview,
  type SkillsPluginsOverviewSnapshot,
} from '@skills/plugins-overview-service.js'
import type { EngineServiceApi } from '@xnova/runtime'
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
  engineServiceApi?: Pick<EngineServiceApi, 'skillsService'>
  resolveEngineServiceApi?: (
    hostState: StudioHostState,
  ) => Pick<EngineServiceApi, 'skillsService'> | undefined
  readSkillsPluginsOverviewFn?: typeof readSkillsPluginsOverview
}

export function createStudioSkillsPluginsService(
  options: CreateStudioSkillsPluginsServiceOptions = {},
): StudioSkillsPluginsService {
  const readOverview = options.readSkillsPluginsOverviewFn ?? readSkillsPluginsOverview

  return {
    async getOverview(hostState) {
      const engineServiceApi =
        options.resolveEngineServiceApi?.(hostState) ?? options.engineServiceApi
      if (engineServiceApi) {
        return toOverview(await engineServiceApi.skillsService.getOverview())
      }
      return toOverview(await readOverview())
    },
  }
}
