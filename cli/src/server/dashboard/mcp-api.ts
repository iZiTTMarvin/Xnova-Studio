// src/server/dashboard/mcp-api.ts

/**
 * MCP Server 管理 API
 *
 * GET  /api/mcp/servers      — 已配置的 MCP Server 列表（合并多层来源）
 * POST /api/mcp/servers/add  — 添加 MCP Server（写入 ~/.xnovacode/.mcp.json）
 * POST /api/mcp/servers/delete — 删除 MCP Server
 */

import { Hono } from 'hono'
import { loadMcpConfigWithSources, MCP_CONFIG_PATHS } from '@config/mcp-config.js'
import {
  addMcpServer,
  deleteMcpServer,
} from '@mcp/status-service.js'

export function createMcpRoutes(): Hono {
  const api = new Hono()

  // ═══ MCP Server 列表 ═══
  api.get('/servers', (c) => {
    try {
      const merged = loadMcpConfigWithSources()
      const writablePath = MCP_CONFIG_PATHS[0]!
      const servers = Object.entries(merged.mcpServers).map(([name, config]) => ({
        name,
        config,
        source: merged.serverSources[name] ?? 'unknown',
        writable: merged.serverSources[name] === writablePath,
      }))
      return c.json({ servers })
    } catch (err) {
      return c.json({ error: String(err) }, 500)
    }
  })

  // ═══ 添加 MCP Server ═══
  api.post('/servers/add', async (c) => {
    try {
      const body = await c.req.json() as {
        name: string
        config: {
          command?: string
          args?: string[]
          type?: string
          url?: string
          headers?: Record<string, string>
        }
      }
      const result = await addMcpServer({
        name: body.name,
        config: body.config.command
          ? {
              transport: 'stdio',
              command: body.config.command,
              args: body.config.args ?? [],
            }
          : (() => {
              const config = {
                transport:
                  body.config.type === 'sse'
                    ? 'sse'
                    : body.config.type === 'streamable-http'
                      ? 'streamable-http'
                      : 'http',
                url: body.config.url ?? null,
              } as const
              return body.config.headers
                ? { ...config, headers: body.config.headers }
                : config
            })(),
      })
      return c.json(result, result.success ? 200 : 400)
    } catch (err) {
      return c.json({ error: String(err) }, 500)
    }
  })

  // ═══ 删除 MCP Server ═══
  api.post('/servers/delete', async (c) => {
    try {
      const body = await c.req.json() as { name: string }
      const result = await deleteMcpServer(body.name)
      return c.json(result, result.success ? 200 : 400)
    } catch (err) {
      return c.json({ error: String(err) }, 500)
    }
  })

  return api
}
