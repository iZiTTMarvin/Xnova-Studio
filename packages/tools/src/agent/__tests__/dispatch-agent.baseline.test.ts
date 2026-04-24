// src/tools/agent/__tests__/dispatch-agent.baseline.test.ts
/**
 * dispatch_agent 基线测试
 *
 * 测试范围：AgentDefinitionRegistry 的分派主路径（general / explore / plan）。
 * 不启动真实 AgentLoop / LLM，只验证注册表查找与定义结构的正确性。
 * 这是后续 Phase 3 agent schema 迁移的行为锚点。
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { AgentDefinitionRegistry } from '../definition-registry.js'
import type { AgentDefinition, ToolPolicy } from '../types.js'

// ── 测试用内置 Agent 定义工厂（Phase 3：source 已更新为 v1 枚举） ────────────
function makeBuiltIn(agentType: string, toolPolicy: ToolPolicy = { mode: 'exclude', tools: [] }): AgentDefinition {
  return {
    agentType,
    source: 'builtin',
    whenToUse: `${agentType} agent`,
    toolPolicy,
    maxTurns: 50,
    getSystemPrompt: () => `system prompt for ${agentType}`,
  }
}

describe('AgentDefinitionRegistry — 分派主路径基线', () => {
  let registry: AgentDefinitionRegistry

  beforeEach(() => {
    registry = new AgentDefinitionRegistry()
  })

  // ── 主路径：三种内置类型均可注册并查找 ────────────────────────────────
  it('注册 general / explore / plan 后均可按类型查找', () => {
    registry.register(makeBuiltIn('general'))
    registry.register(makeBuiltIn('explore'))
    registry.register(makeBuiltIn('plan'))

    expect(registry.get('general')).toBeDefined()
    expect(registry.get('explore')).toBeDefined()
    expect(registry.get('plan')).toBeDefined()
  })

  it('查找不存在的类型返回 undefined', () => {
    expect(registry.get('nonexistent')).toBeUndefined()
  })

  // ── 主路径：定义结构完整性 ─────────────────────────────────────────────
  it('general 定义包含必要字段', () => {
    const def = makeBuiltIn('general')
    registry.register(def)
    const found = registry.get('general')!

    expect(found.agentType).toBe('general')
    expect(found.source).toBe('builtin')
    expect(typeof found.whenToUse).toBe('string')
    expect(found.whenToUse.length).toBeGreaterThan(0)
    expect(typeof found.maxTurns).toBe('number')
    expect(found.maxTurns).toBeGreaterThan(0)
    expect(typeof found.getSystemPrompt).toBe('function')
    expect(typeof found.getSystemPrompt()).toBe('string')
    expect(found.toolPolicy).toBeDefined()
    expect(['include', 'exclude']).toContain(found.toolPolicy.mode)
  })

  // ── 主路径：user 覆盖 builtin（优先级） ──────────────────────────────
  it('同名 user 定义覆盖 builtin 定义（Phase 3 v1 source 升级）', () => {
    registry.register(makeBuiltIn('general'))
    const userAgent: AgentDefinition = {
      ...makeBuiltIn('general'),
      source: 'user',
      whenToUse: 'user override for general',
    }
    registry.register(userAgent)

    const found = registry.get('general')!
    expect(found.source).toBe('user')
    expect(found.whenToUse).toBe('user override for general')
  })

  // ── 主路径：getTypeNames 返回所有注册类型 ─────────────────────────────
  it('getTypeNames 返回所有已注册类型', () => {
    registry.register(makeBuiltIn('general'))
    registry.register(makeBuiltIn('explore'))
    registry.register(makeBuiltIn('plan'))

    const names = registry.getTypeNames()
    expect(names).toContain('general')
    expect(names).toContain('explore')
    expect(names).toContain('plan')
    expect(names).toHaveLength(3)
  })

  // ── 主路径：buildTypeDescriptions 生成可读文本 ────────────────────────
  it('buildTypeDescriptions 为每个类型生成描述行', () => {
    registry.register(makeBuiltIn('general'))
    registry.register(makeBuiltIn('explore'))

    const desc = registry.buildTypeDescriptions()
    expect(desc).toContain('general')
    expect(desc).toContain('explore')
  })

  // ── 失败路径：toolPolicy 结构验证 ─────────────────────────────────────
  it('include 模式的 toolPolicy 结构正确', () => {
    const def = makeBuiltIn('explore', { mode: 'include', tools: ['read_file', 'search_files'] })
    registry.register(def)

    const found = registry.get('explore')!
    expect(found.toolPolicy.mode).toBe('include')
    expect(found.toolPolicy.tools).toContain('read_file')
    expect(found.toolPolicy.tools).toContain('search_files')
  })
})
