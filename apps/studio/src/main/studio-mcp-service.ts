import {
  addMcpServer,
  deleteMcpServer,
  readMcpOverview,
  type McpMutationResult,
  type McpOverviewSnapshot,
  type McpServerConfigInput,
} from '@mcp/status-service.js'
import type {
  StudioHostState,
  StudioMcpMutationResult,
  StudioMcpOverviewSnapshot,
  StudioMcpServerMutationInput,
} from '../shared/studio-bridge-contract'
import type { EngineServiceApi } from '@xnova/runtime'

function toOverviewSnapshot(
  snapshot: McpOverviewSnapshot,
): StudioMcpOverviewSnapshot {
  return snapshot
}

function toMutationResult(
  result: McpMutationResult,
): StudioMcpMutationResult {
  return {
    success: result.success,
    message: result.message,
    ...(result.snapshot ? { snapshot: toOverviewSnapshot(result.snapshot) } : {}),
  }
}

export interface StudioMcpService {
  getOverview(hostState: StudioHostState): Promise<StudioMcpOverviewSnapshot>
  addServer(
    input: StudioMcpServerMutationInput,
    hostState: StudioHostState,
  ): Promise<StudioMcpMutationResult>
  deleteServer(
    name: string,
    hostState: StudioHostState,
  ): Promise<StudioMcpMutationResult>
}

export interface CreateStudioMcpServiceOptions {
  engineServiceApi?: Pick<EngineServiceApi, 'mcpService'>
  resolveEngineServiceApi?: (
    hostState: StudioHostState,
  ) => Pick<EngineServiceApi, 'mcpService'> | undefined
  readMcpOverviewFn?: typeof readMcpOverview
  addMcpServerFn?: typeof addMcpServer
  deleteMcpServerFn?: typeof deleteMcpServer
}

export function createStudioMcpService(
  options: CreateStudioMcpServiceOptions = {},
): StudioMcpService {
  const readOverview = options.readMcpOverviewFn ?? readMcpOverview
  const addServer = options.addMcpServerFn ?? addMcpServer
  const deleteServer = options.deleteMcpServerFn ?? deleteMcpServer

  return {
    async getOverview(hostState) {
      const engineServiceApi =
        options.resolveEngineServiceApi?.(hostState) ?? options.engineServiceApi
      if (engineServiceApi) {
        return toOverviewSnapshot(await engineServiceApi.mcpService.getOverview())
      }
      return toOverviewSnapshot(await readOverview())
    },
    async addServer(input, hostState) {
      const engineServiceApi =
        options.resolveEngineServiceApi?.(hostState) ?? options.engineServiceApi
      if (engineServiceApi) {
        return toMutationResult(
          await engineServiceApi.mcpService.addServer({
            name: input.name,
            config: input.config as McpServerConfigInput,
          }),
        )
      }
      return toMutationResult(
        await addServer({
          name: input.name,
          config: input.config as McpServerConfigInput,
        }),
      )
    },
    async deleteServer(name, hostState) {
      const engineServiceApi =
        options.resolveEngineServiceApi?.(hostState) ?? options.engineServiceApi
      if (engineServiceApi) {
        return toMutationResult(await engineServiceApi.mcpService.deleteServer(name))
      }
      return toMutationResult(await deleteServer(name))
    },
  }
}
