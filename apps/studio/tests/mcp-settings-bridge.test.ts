import { describe, expect, it, vi } from 'vitest'
import { createStudioBridgeApi } from '../src/preload/studio-bridge-api'
import {
  STUDIO_BRIDGE_CHANNELS,
  type StudioMcpOverviewSnapshot,
} from '../src/shared/studio-bridge-contract'

class FakeIpcRenderer {
  readonly invoke = vi.fn(async (channel: string) => {
    if (channel === STUDIO_BRIDGE_CHANNELS.mcpGetOverview) {
      return createMcpSnapshot()
    }

    if (channel === STUDIO_BRIDGE_CHANNELS.mcpAddServer) {
      return {
        success: true,
        message: 'MCP Server 已添加。',
        snapshot: createMcpSnapshot(),
      }
    }

    if (channel === STUDIO_BRIDGE_CHANNELS.mcpDeleteServer) {
      return {
        success: true,
        message: 'MCP Server 已删除。',
        snapshot: createMcpSnapshot(),
      }
    }

    throw new Error(`unexpected channel: ${channel}`)
  })

  on(): this {
    return this
  }

  removeListener(): this {
    return this
  }
}

function createMcpSnapshot(): StudioMcpOverviewSnapshot {
  return {
    status: 'failed',
    statusMessage: 'MCP 状态异常，至少一个 Server 连接失败。',
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
      {
        name: 'deepwiki',
        transport: 'http',
        status: 'failed',
        source: 'C:/Users/demo/.xnovacode/.mcp.json',
        writable: true,
        toolCount: 0,
        toolNames: [],
        error: 'connection refused',
      },
    ],
    warnings: [],
  }
}

describe('studio mcp preload bridge', () => {
  it('通过 IPC 读取 MCP 状态，并校验新增 / 删除请求与响应', async () => {
    const api = createStudioBridgeApi({
      ipcRenderer: new FakeIpcRenderer(),
    })

    await expect(api.mcp.getOverview()).resolves.toEqual(createMcpSnapshot())
    await expect(
      api.mcp.addServer({
        name: 'mysql',
        config: {
          transport: 'stdio',
          command: 'npx',
          args: ['-y', '@mcp/mysql'],
        },
      }),
    ).resolves.toEqual({
      success: true,
      message: 'MCP Server 已添加。',
      snapshot: createMcpSnapshot(),
    })
    await expect(api.mcp.deleteServer('mysql')).resolves.toEqual({
      success: true,
      message: 'MCP Server 已删除。',
      snapshot: createMcpSnapshot(),
    })
  })
})
