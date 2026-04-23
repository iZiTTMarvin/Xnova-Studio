import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  addMcpServer,
  deleteMcpServer,
  readMcpOverview,
} from '../status-service.js'

function makeWorkspace(): {
  root: string
  writablePath: string
  claudePath: string
  globalPath: string
} {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const root = join(tmpdir(), `xnova-mcp-status-${stamp}`)
  const writableDir = join(root, 'home', '.xnovacode')
  mkdirSync(writableDir, { recursive: true })
  return {
    root,
    writablePath: join(writableDir, '.mcp.json'),
    claudePath: join(root, 'home', '.claude.json'),
    globalPath: join(root, 'home', '.mcp.json'),
  }
}

describe('mcp status service', () => {
  let ws: ReturnType<typeof makeWorkspace>

  beforeEach(() => {
    ws = makeWorkspace()
  })

  afterEach(() => {
    if (existsSync(ws.root)) {
      rmSync(ws.root, { recursive: true, force: true })
    }
  })

  it('未配置时返回 unconfigured 状态与可写配置路径', async () => {
    const snapshot = await readMcpOverview({
      configPaths: [ws.writablePath, ws.claudePath, ws.globalPath],
      createManager: vi.fn(),
    })

    expect(snapshot.status).toBe('unconfigured')
    expect(snapshot.writableConfigPath).toBe(ws.writablePath)
    expect(snapshot.servers).toEqual([])
  })

  it('合并连接成功 / 失败状态，并显式暴露错误信息', async () => {
    writeFileSync(
      ws.writablePath,
      JSON.stringify({
        mcpServers: {
          mysql: {
            command: 'npx',
            args: ['-y', '@mcp/mysql'],
          },
          deepwiki: {
            type: 'http',
            url: 'https://mcp.deepwiki.com/mcp',
          },
        },
      }),
      'utf-8',
    )

    const disconnectAll = vi.fn(async () => {})
    const createManager = vi.fn(() => ({
      connectAll: vi.fn(async () => {}),
      getStatus: () => [
        {
          name: 'mysql',
          status: 'connected' as const,
          source: ws.writablePath,
          toolCount: 4,
          toolNames: ['query', 'schema'],
        },
        {
          name: 'deepwiki',
          status: 'failed' as const,
          source: ws.writablePath,
          toolCount: 0,
          toolNames: [],
          error: 'connection refused',
        },
      ],
      disconnectAll,
    }))

    const snapshot = await readMcpOverview({
      configPaths: [ws.writablePath, ws.claudePath, ws.globalPath],
      createManager,
    })

    expect(snapshot.status).toBe('failed')
    expect(snapshot.statusMessage).toContain('连接失败')
    expect(snapshot.servers).toEqual([
      expect.objectContaining({
        name: 'mysql',
        status: 'connected',
        writable: true,
      }),
      expect.objectContaining({
        name: 'deepwiki',
        status: 'failed',
        error: 'connection refused',
      }),
    ])
    expect(disconnectAll).toHaveBeenCalledTimes(1)
  })

  it('支持新增与删除 MCP Server，并写回可写配置文件', async () => {
    const addResult = await addMcpServer(
      {
        name: 'mysql',
        config: {
          transport: 'stdio',
          command: 'npx',
          args: ['-y', '@mcp/mysql'],
        },
      },
      {
        configPaths: [ws.writablePath, ws.claudePath, ws.globalPath],
        createManager: vi.fn(() => ({
          connectAll: vi.fn(async () => {}),
          getStatus: () => [],
          disconnectAll: vi.fn(async () => {}),
        })),
      },
    )

    expect(addResult.success).toBe(true)
    expect(readFileSync(ws.writablePath, 'utf-8')).toContain('"mysql"')

    const deleteResult = await deleteMcpServer('mysql', {
      configPaths: [ws.writablePath, ws.claudePath, ws.globalPath],
      createManager: vi.fn(() => ({
        connectAll: vi.fn(async () => {}),
        getStatus: () => [],
        disconnectAll: vi.fn(async () => {}),
      })),
    })

    expect(deleteResult.success).toBe(true)
    expect(readFileSync(ws.writablePath, 'utf-8')).not.toContain('"mysql"')
  })
})
