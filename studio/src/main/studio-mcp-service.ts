import {
  addMcpServer,
  deleteMcpServer,
  readMcpOverview,
  type McpMutationResult,
  type McpOverviewSnapshot,
  type McpServerConfigInput,
} from '../../../cli/src/mcp/status-service.js'
import type {
  StudioHostState,
  StudioMcpMutationResult,
  StudioMcpOverviewSnapshot,
  StudioMcpServerMutationInput,
} from '../shared/studio-bridge-contract'

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
    async getOverview() {
      return toOverviewSnapshot(await readOverview())
    },
    async addServer(input) {
      return toMutationResult(
        await addServer({
          name: input.name,
          config: input.config as McpServerConfigInput,
        }),
      )
    },
    async deleteServer(name) {
      return toMutationResult(await deleteServer(name))
    },
  }
}
