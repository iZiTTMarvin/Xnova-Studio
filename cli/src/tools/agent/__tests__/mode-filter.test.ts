// src/tools/agent/__tests__/mode-filter.test.ts
/**
 * Agent 模式过滤规则测试
 *
 * 测试覆盖：
 * - canBePrimary / canBeSubagent / canBeDefaultAgent 基础规则
 * - filterForPrimarySelector / filterForSubagentPool 候选池过滤
 * - validateDefaultAgent 校验
 *
 * 规范来源：.trellis/spec/backend/agent-schema-v1.md §3 运行时契约
 */

import { describe, it, expect } from 'vitest'
import {
  canBePrimary,
  canBeSubagent,
  canBeDefaultAgent,
  filterForPrimarySelector,
  filterForSubagentPool,
  validateDefaultAgent,
} from '../mode-filter.js'
import type { LoadedAgentDefinitionV1 } from '../schema-v1.js'

// ─── 测试辅助 ────────────────────────────────────────────────────────────────

function makeAgent(id: string, mode: 'primary' | 'subagent' | 'all'): LoadedAgentDefinitionV1 {
  return {
    source: 'builtin',
    frontmatter: {
      id,
      name: id,
      summary: `${id} agent`,
      mode,
      when_to_use: `use ${id}`,
      tool_policy: { mode: 'exclude', tools: [] },
    },
    body: '',
    filePath: '',
  }
}

// ─── 基础判断函数 ─────────────────────────────────────────────────────────────

describe('canBePrimary', () => {
  it('primary → true', () => { expect(canBePrimary('primary')).toBe(true) })
  it('all → true', () => { expect(canBePrimary('all')).toBe(true) })
  it('subagent → false', () => { expect(canBePrimary('subagent')).toBe(false) })
})

describe('canBeSubagent', () => {
  it('subagent → true', () => { expect(canBeSubagent('subagent')).toBe(true) })
  it('all → true', () => { expect(canBeSubagent('all')).toBe(true) })
  it('primary → false', () => { expect(canBeSubagent('primary')).toBe(false) })
})

describe('canBeDefaultAgent', () => {
  it('primary → true', () => { expect(canBeDefaultAgent('primary')).toBe(true) })
  it('all → true', () => { expect(canBeDefaultAgent('all')).toBe(true) })
  it('subagent → false（不允许 subagent 作为 default_agent）', () => {
    expect(canBeDefaultAgent('subagent')).toBe(false)
  })
})

// ─── 候选池过滤 ───────────────────────────────────────────────────────────────

describe('filterForPrimarySelector', () => {
  const agents = [
    makeAgent('primary-only', 'primary'),
    makeAgent('subagent-only', 'subagent'),
    makeAgent('universal', 'all'),
  ]

  it('仅返回 primary | all 的 agent', () => {
    const result = filterForPrimarySelector(agents)
    const ids = result.map(a => a.frontmatter.id)
    expect(ids).toContain('primary-only')
    expect(ids).toContain('universal')
    expect(ids).not.toContain('subagent-only')
  })

  it('空列表返回空列表', () => {
    expect(filterForPrimarySelector([])).toHaveLength(0)
  })
})

describe('filterForSubagentPool', () => {
  const agents = [
    makeAgent('primary-only', 'primary'),
    makeAgent('subagent-only', 'subagent'),
    makeAgent('universal', 'all'),
  ]

  it('仅返回 subagent | all 的 agent', () => {
    const result = filterForSubagentPool(agents)
    const ids = result.map(a => a.frontmatter.id)
    expect(ids).toContain('subagent-only')
    expect(ids).toContain('universal')
    expect(ids).not.toContain('primary-only')
  })

  it('空列表返回空列表', () => {
    expect(filterForSubagentPool([])).toHaveLength(0)
  })
})

// ─── validateDefaultAgent ─────────────────────────────────────────────────────

describe('validateDefaultAgent', () => {
  const agents = [
    makeAgent('general', 'all'),
    makeAgent('explore', 'all'),
    makeAgent('writer', 'primary'),
    makeAgent('sub-task', 'subagent'),
  ]

  it('mode=all 的 agent 可以作为 default_agent', () => {
    const result = validateDefaultAgent('general', agents)
    expect(result.valid).toBe(true)
    expect(result.error).toBeUndefined()
  })

  it('mode=primary 的 agent 可以作为 default_agent', () => {
    const result = validateDefaultAgent('writer', agents)
    expect(result.valid).toBe(true)
  })

  it('mode=subagent 的 agent 不能作为 default_agent', () => {
    const result = validateDefaultAgent('sub-task', agents)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('sub-task')
    expect(result.error).toContain('subagent')
  })

  it('不存在的 agent id 返回失败', () => {
    const result = validateDefaultAgent('nonexistent', agents)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('nonexistent')
  })

  it('空列表时任何 id 都返回失败', () => {
    const result = validateDefaultAgent('general', [])
    expect(result.valid).toBe(false)
  })
})
