// src/server/dashboard/agents-api.ts

/**
 * Agents REST API — Phase 3 Agent 管理接口
 *
 * 挂载到 Bridge Server 的 /api/agents 路径下：
 *
 * GET  /api/agents              — 列出所有 agent（builtin + user），支持 mode 过滤
 * GET  /api/agents/:id          — 获取单个 agent 详情；`?raw=true` 时附带原始内容
 * POST /api/agents              — 创建新用户 agent（从内容/从模板/从空白）
 * PUT  /api/agents/:id          — 更新用户 agent 内容
 * DELETE /api/agents/:id        — 删除用户 agent
 * GET  /api/agents/templates    — 获取可用模板列表
 * POST /api/agents/validate     — 校验 agent 内容（不保存）
 * GET  /api/agents/default      — 获取当前默认主 Agent
 * POST /api/agents/default      — 切换当前默认主 Agent（写回 user config）
 *
 * 重要约束：
 * - API / UI / runtime 必须共用 agentCatalog 作为单一事实源
 * - 删除后必须重建 catalog，避免 registry 残留“幽灵 agent”
 * - default agent 只允许引用 primary | all
 */

import { Hono } from 'hono'
import { BUILTIN_TEMPLATES } from '@tools/agent/agent-templates.js'
import { agentCatalog } from '@tools/agent/catalog.js'
import { parseAgentFile, AgentValidationError } from '@tools/agent/parser.js'
import { userAgentStore, UserAgentStoreError } from '@tools/agent/user-agent-store.js'
import { configManager, type AgentDefaults } from '@config/config-manager.js'
import { loadResolvedConfig } from '@config/resolver.js'
import type { LoadedAgentDefinitionV1 } from '@tools/agent/schema-v1.js'

interface AgentsDefaultResponse {
  defaultAgentId: string | null
  warnings: string[]
}

function buildDefaultAgentResponse(): AgentsDefaultResponse {
  const resolved = loadResolvedConfig(process.cwd())
  return {
    defaultAgentId: resolved.effective.agent?.default ?? null,
    warnings: resolved.warnings,
  }
}

function saveUserDefaultAgent(agentId: string | null): AgentsDefaultResponse {
  const current = configManager.load()
  const currentAgent: AgentDefaults | undefined = current.agent
  const nextAgent: AgentDefaults = { ...(currentAgent ?? {}) }

  if (agentId == null) {
    delete nextAgent.default
  } else {
    const validation = agentCatalog.validateDefaultAgent(agentId)
    if (!validation.valid) {
      throw new Error(validation.error ?? `默认 Agent "${agentId}" 非法`)
    }
    nextAgent.default = agentId
  }

  const nextConfig = { ...current }
  if (Object.keys(nextAgent).length > 0) {
    nextConfig.agent = nextAgent
  } else {
    delete nextConfig.agent
  }

  configManager.save(nextConfig)
  return buildDefaultAgentResponse()
}

function listAgents(filter: string | undefined): LoadedAgentDefinitionV1[] {
  agentCatalog.ensureInitialized()
  if (filter === 'primary') return agentCatalog.getPrimaryCandidates()
  if (filter === 'subagent') return agentCatalog.getSubagentCandidates()
  return agentCatalog.getAll()
}

export function createAgentsRoutes(): Hono {
  const agents = new Hono()

  agents.get('/templates', (c) => {
    return c.json({
      templates: BUILTIN_TEMPLATES.map(t => ({
        templateId: t.templateId,
        name: t.name,
        description: t.description,
        useCase: t.useCase,
      })),
    })
  })

  agents.get('/default', (c) => {
    try {
      return c.json(buildDefaultAgentResponse())
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500)
    }
  })

  agents.post('/default', async (c) => {
    let body: Record<string, unknown>
    try {
      body = await c.req.json() as Record<string, unknown>
    } catch {
      return c.json({ error: '请求体必须是合法 JSON' }, 400)
    }

    const rawAgentId = body.agentId
    if (rawAgentId !== null && rawAgentId !== undefined && typeof rawAgentId !== 'string') {
      return c.json({ error: 'agentId 必须是字符串或 null' }, 400)
    }

    try {
      const result = saveUserDefaultAgent(
        typeof rawAgentId === 'string' && rawAgentId.trim() ? rawAgentId.trim() : null,
      )
      return c.json(result)
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400)
    }
  })

  agents.post('/validate', async (c) => {
    let body: Record<string, unknown>
    try {
      body = await c.req.json() as Record<string, unknown>
    } catch {
      return c.json({ error: '请求体必须是合法 JSON' }, 400)
    }

    const content = body.content
    if (typeof content !== 'string') {
      return c.json({ error: 'content 字段必须是字符串' }, 400)
    }

    try {
      const { frontmatter } = parseAgentFile(content)
      return c.json({ valid: true, frontmatter })
    } catch (err) {
      if (err instanceof AgentValidationError) {
        return c.json({
          valid: false,
          error: err.message,
          field: err.field,
        })
      }
      return c.json({ valid: false, error: String(err) })
    }
  })

  agents.get('/', (c) => {
    try {
      const filter = c.req.query('filter')
      return c.json({
        agents: listAgents(filter),
        ...buildDefaultAgentResponse(),
      })
    } catch (err) {
      console.error('[agents-api] GET /api/agents error:', err)
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500)
    }
  })

  agents.get('/:id', (c) => {
    const id = c.req.param('id')
    const includeRaw = c.req.query('raw') === 'true'
    try {
      agentCatalog.ensureInitialized()
      const found = agentCatalog.getById(id)
      if (!found) {
        return c.json({ error: `agent "${id}" 不存在` }, 404)
      }
      const payload: Record<string, unknown> = { agent: found }
      if (includeRaw && found.source === 'user') {
        payload['rawContent'] = userAgentStore.loadRaw(id)
      }
      return c.json(payload)
    } catch (err) {
      if (err instanceof UserAgentStoreError) {
        return c.json({ error: err.message, code: err.code }, 400)
      }
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500)
    }
  })

  agents.post('/', async (c) => {
    let body: Record<string, unknown>
    try {
      body = await c.req.json() as Record<string, unknown>
    } catch {
      return c.json({ error: '请求体必须是合法 JSON' }, 400)
    }

    try {
      let saved: LoadedAgentDefinitionV1

      if (body.type === 'content') {
        if (typeof body.content !== 'string') {
          return c.json({ error: 'content 字段必须是字符串' }, 400)
        }
        saved = userAgentStore.save(body.content, { overwrite: false })
      } else if (body.type === 'template') {
        const { templateId, id, name, summary } = body
        if (
          typeof templateId !== 'string' ||
          typeof id !== 'string' ||
          typeof name !== 'string' ||
          typeof summary !== 'string'
        ) {
          return c.json({ error: 'templateId / id / name / summary 均为必填字符串字段' }, 400)
        }
        saved = userAgentStore.createFromTemplate(templateId, id, name, summary)
      } else if (body.type === 'blank') {
        const { id, name } = body
        if (typeof id !== 'string' || typeof name !== 'string') {
          return c.json({ error: 'id / name 均为必填字符串字段' }, 400)
        }
        saved = userAgentStore.createBlank(id, name)
      } else {
        return c.json({ error: 'type 字段必须是 content | template | blank' }, 400)
      }

      agentCatalog.reload()
      return c.json({ agent: saved }, 201)
    } catch (err) {
      if (err instanceof UserAgentStoreError) {
        const status = err.code === 'DUPLICATE_ID' ? 409 :
          err.code === 'INVALID_AGENT' ? 400 : 500
        return c.json({ error: err.message, code: err.code }, status)
      }
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500)
    }
  })

  agents.put('/:id', async (c) => {
    const id = c.req.param('id')
    let body: Record<string, unknown>
    try {
      body = await c.req.json() as Record<string, unknown>
    } catch {
      return c.json({ error: '请求体必须是合法 JSON' }, 400)
    }

    if (typeof body.content !== 'string') {
      return c.json({ error: 'content 字段必须是字符串' }, 400)
    }

    try {
      const parsed = parseAgentFile(body.content)
      if (parsed.frontmatter.id !== id) {
        return c.json({
          error: `content 中的 id "${parsed.frontmatter.id}" 与路由 id "${id}" 不一致`,
        }, 400)
      }
    } catch (err) {
      if (err instanceof AgentValidationError) {
        return c.json({ error: err.message, field: err.field }, 400)
      }
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400)
    }

    try {
      const saved = userAgentStore.save(body.content, { overwrite: true })
      agentCatalog.reload()
      return c.json({ agent: saved })
    } catch (err) {
      if (err instanceof UserAgentStoreError) {
        const status = err.code === 'NOT_FOUND' ? 404 :
          err.code === 'INVALID_AGENT' ? 400 : 500
        return c.json({ error: err.message, code: err.code }, status)
      }
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500)
    }
  })

  agents.delete('/:id', (c) => {
    const id = c.req.param('id')
    try {
      agentCatalog.ensureInitialized()
      const found = agentCatalog.getById(id)
      if (!found) {
        return c.json({ error: `agent "${id}" 不存在` }, 404)
      }
      if (found.source === 'builtin') {
        return c.json({ error: `agent "${id}" 是内置 agent，不支持删除` }, 403)
      }

      userAgentStore.delete(id)
      agentCatalog.reload()
      return c.json({ success: true })
    } catch (err) {
      if (err instanceof UserAgentStoreError) {
        const status = err.code === 'NOT_FOUND' ? 404 : 400
        return c.json({ error: err.message, code: err.code }, status)
      }
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500)
    }
  })

  return agents
}
