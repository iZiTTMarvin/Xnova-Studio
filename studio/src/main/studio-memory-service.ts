import { ConfigManager } from '../../../cli/src/config/config-manager.js'
import type {
  MemoryOverviewSnapshot,
  MemoryRebuildResult,
} from '../../../cli/src/memory/overview-service.js'
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
  configManager?: ConfigManager
  readMemoryOverviewFn?: (
    projectPath: string | null,
    options: { configManager: ConfigManager },
  ) => Promise<MemoryOverviewSnapshot>
  rebuildMemoryIndexFn?: (
    projectPath: string | null,
    options: { configManager: ConfigManager },
  ) => Promise<MemoryRebuildResult>
}

export function createStudioMemoryService(
  options: CreateStudioMemoryServiceOptions = {},
): StudioMemoryService {
  const configManager = options.configManager ?? new ConfigManager()

  return {
    async getOverview(hostState) {
      const readOverview =
        options.readMemoryOverviewFn ??
        (async (projectPath: string | null, nextOptions: { configManager: ConfigManager }) => {
          const module = await import('../../../cli/src/memory/overview-service.js')
          return module.readMemoryOverview(projectPath, nextOptions)
        })
      return toOverviewSnapshot(
        await readOverview(hostState.workspacePath, {
          configManager,
        }),
      )
    },
    async rebuild(hostState) {
      const rebuildIndex =
        options.rebuildMemoryIndexFn ??
        (async (projectPath: string | null, nextOptions: { configManager: ConfigManager }) => {
          const module = await import('../../../cli/src/memory/overview-service.js')
          return module.rebuildMemoryIndex(projectPath, nextOptions)
        })
      return toRebuildResult(
        await rebuildIndex(hostState.workspacePath, {
          configManager,
        }),
      )
    },
  }
}
