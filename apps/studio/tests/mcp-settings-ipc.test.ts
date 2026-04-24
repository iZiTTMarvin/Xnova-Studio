import { describe, expect, it, vi } from 'vitest'
import { registerStudioMainIpcHandlers } from '../src/main/studio-ipc'
import {
  STUDIO_BRIDGE_CHANNELS,
  type StudioMcpOverviewSnapshot,
} from '../src/shared/studio-bridge-contract'

function createLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }
}

function createMcpSnapshot(): StudioMcpOverviewSnapshot {
  return {
    status: 'connected',
    statusMessage: '全部 MCP Server 已连接。',
    writableConfigPath: 'C:/Users/demo/.xnovacode/.mcp.json',
    servers: [
      {
        name: 'mysql',
        transport: 'stdio',
        status: 'connected',
        source: 'C:/Users/demo/.xnovacode/.mcp.json',
        writable: true,
        toolCount: 4,
        toolNames: ['query', 'schema'],
      },
    ],
    warnings: [],
  }
}

describe('studio mcp main ipc handlers', () => {
  it('通过 main process 委托 MCP 概览与管理动作', async () => {
    const handlers = new Map<string, (_event: unknown, payload: unknown) => unknown>()
    const getMcpOverview = vi.fn(async () => createMcpSnapshot())
    const addMcpServer = vi.fn(async () => ({
      success: true,
      message: 'MCP Server 已添加。',
      snapshot: createMcpSnapshot(),
    }))
    const deleteMcpServer = vi.fn(async () => ({
      success: true,
      message: 'MCP Server 已删除。',
      snapshot: createMcpSnapshot(),
    }))

    registerStudioMainIpcHandlers({
      ipcMainLike: {
        handle(channel, handler) {
          handlers.set(channel, handler)
        },
      },
      selectWorkspaceDirectory: vi.fn(async () => ({
        ok: false as const,
        code: 'cancelled' as const,
        message: '用户取消了 workspace 目录选择',
      })),
      mainWindowManager: {
        getMainWindow: () => null,
      },
      inspectRuntime: vi.fn(),
      inspectShell: vi.fn(),
      getProviderSettings: vi.fn(),
      saveProviderSettings: vi.fn(),
      testProviderConnection: vi.fn(),
      getMemoryOverview: vi.fn(),
      rebuildMemory: vi.fn(),
      getMcpOverview,
      addMcpServer,
      deleteMcpServer,
      logger: createLogger(),
    })

    await expect(
      Promise.resolve(
        handlers.get(STUDIO_BRIDGE_CHANNELS.mcpGetOverview)?.({}, undefined),
      ),
    ).resolves.toEqual(createMcpSnapshot())

    await expect(
      Promise.resolve(
        handlers.get(STUDIO_BRIDGE_CHANNELS.mcpAddServer)?.({}, {
          name: 'mysql',
          config: {
            transport: 'stdio',
            command: 'npx',
            args: ['-y', '@mcp/mysql'],
          },
        }),
      ),
    ).resolves.toEqual({
      success: true,
      message: 'MCP Server 已添加。',
      snapshot: createMcpSnapshot(),
    })

    await expect(
      Promise.resolve(
        handlers.get(STUDIO_BRIDGE_CHANNELS.mcpDeleteServer)?.({}, {
          name: 'mysql',
        }),
      ),
    ).resolves.toEqual({
      success: true,
      message: 'MCP Server 已删除。',
      snapshot: createMcpSnapshot(),
    })
  })
})
