// src/tools/agent/__tests__/compat-loader.test.ts

import { describe, it, expect } from 'vitest'
import { AgentDefinitionRegistry } from '../definition-registry.js'
import { adaptV1ToRuntime } from '../compat-loader.js'
import type { AgentDefinition } from '../types.js'
import type { LoadedAgentDefinitionV1 } from '../schema-v1.js'

function makeParent(agentType: string): AgentDefinition {
  return {
    agentType,
    source: 'builtin',
    displayName: 'Parent Agent',
    whenToUse: 'parent agent',
    summary: 'parent summary',
    mode: 'all',
    toolPolicy: { mode: 'include', tools: ['read_file'] },
    maxTurns: 88,
    modelHint: 'strong',
    contextPolicy: { mode: 'trimmed', maxMessages: 10, maxTokenEstimate: 2048 },
    minTurns: 3,
    timeoutMs: 1234,
    getSystemPrompt: () => 'parent prompt',
  }
}

function makeChild(body: string = 'child prompt'): LoadedAgentDefinitionV1 {
  return {
    source: 'user',
    filePath: '/tmp/child.md',
    body,
    frontmatter: {
      id: 'child-agent',
      name: 'Child Agent',
      summary: 'child summary',
      mode: 'primary',
      inherits: 'parent-agent',
      when_to_use: 'child use',
      tool_policy: { mode: 'exclude', tools: ['bash'] },
      extra: { owner: 'qa' },
    },
  }
}

describe('adaptV1ToRuntime — inherits resolution', () => {
  it('继承 runtime-only 默认值，但显式 schema 字段仍以子级为准', () => {
    const registry = new AgentDefinitionRegistry()
    registry.register(makeParent('parent-agent'))

    const runtime = adaptV1ToRuntime(makeChild(), registry)

    expect(runtime.agentType).toBe('child-agent')
    expect(runtime.displayName).toBe('Child Agent')
    expect(runtime.mode).toBe('primary')
    expect(runtime.inherits).toBe('parent-agent')
    expect(runtime.summary).toBe('child summary')
    expect(runtime.extra).toEqual({ owner: 'qa' })
    expect(runtime.toolPolicy).toEqual({ mode: 'exclude', tools: ['bash'] })
    expect(runtime.maxTurns).toBe(88)
    expect(runtime.modelHint).toBe('strong')
    expect(runtime.contextPolicy).toEqual({ mode: 'trimmed', maxMessages: 10, maxTokenEstimate: 2048 })
    expect(runtime.minTurns).toBe(3)
    expect(runtime.timeoutMs).toBe(1234)
    expect(runtime.getSystemPrompt()).toBe('child prompt')
  })

  it('子级正文为空时回退到父级 system prompt', () => {
    const registry = new AgentDefinitionRegistry()
    registry.register(makeParent('parent-agent'))

    const runtime = adaptV1ToRuntime(makeChild(''), registry)

    expect(runtime.getSystemPrompt()).toBe('parent prompt')
  })

  it('inherits 指向不存在的 agent 时抛错', () => {
    const registry = new AgentDefinitionRegistry()

    expect(() => adaptV1ToRuntime(makeChild(), registry)).toThrow(/inherits/)
  })
})
