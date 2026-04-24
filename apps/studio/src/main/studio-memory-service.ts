import { ConfigManager } from '@config/config-manager.js'
import type {
  MemoryOverviewSnapshot,
  MemoryRebuildResult,
} from '@memory/overview-service.js'
import {
  readMemoryOverview,
  rebuildMemoryIndex,
} from '@memory/overview-service.js'
import type { EngineServiceApi } from '@xnova/runtime'
import type {
  StudioHostState,
  StudioMemoryOverviewSnapshot,
  StudioMemoryRebuildResult,
} from '../shared/studio-bridge-contract'

function toOverviewSnapshot(
  snapshot: MemoryOverviewSnapshot,
): StudioMemoryOverviewSnapshot {
  return snapshot
}

function toRebuildResult(
  result: MemoryRebuildResult,
): StudioMemoryRebuildResult {
  return {
    success: result.success,
    message: result.message,
    ...(result.snapshot ? { snapshot: toOverviewSnapshot(result.snapshot) } : {}),
  }
}

export interface StudioMemoryService {
  getOverview(hostState: StudioHostState): Promise<StudioMemoryOverviewSnapshot>
  rebuild(hostState: StudioHostState): Promise<StudioMemoryRebuildResult>
}

export interface CreateStudioMemoryServiceOptions {
  engineServiceApi?: Pick<EngineServiceApi, 'memoryService'>
  resolveEngineServiceApi?: (
    hostState: StudioHostState,
  ) => Pick<EngineServiceApi, 'memoryService'> | undefined
  configManager?: ConfigManager
  readMemoryOverviewFn?: typeof readMemoryOverview
  rebuildMemoryIndexFn?: typeof rebuildMemoryIndex
}

export function createStudioMemoryService(
  options: CreateStudioMemoryServiceOptions = {},
): StudioMemoryService {
  const engineServiceApi = options.engineServiceApi
  const configManager = options.configManager ?? new ConfigManager()

  return {
    async getOverview(hostState) {
      const engineServiceApi =
        options.resolveEngineServiceApi?.(hostState) ?? options.engineServiceApi
      if (engineServiceApi) {
        return toOverviewSnapshot(
          await engineServiceApi.memoryService.getOverview(hostState.workspacePath),
        )
      }
      const readOverview =
        options.readMemoryOverviewFn ??
        readMemoryOverview
      return toOverviewSnapshot(
        await readOverview(hostState.workspacePath, {
          configManager,
        }),
      )
    },
    async rebuild(hostState) {
      const engineServiceApi =
        options.resolveEngineServiceApi?.(hostState) ?? options.engineServiceApi
      if (engineServiceApi) {
        return toRebuildResult(
          await engineServiceApi.memoryService.rebuildIndex(hostState.workspacePath),
        )
      }
      const rebuildIndex =
        options.rebuildMemoryIndexFn ??
        rebuildMemoryIndex
      return toRebuildResult(
        await rebuildIndex(hostState.workspacePath, {
          configManager,
        }),
      )
    },
  }
}
