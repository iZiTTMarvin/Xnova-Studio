// src/tools/agent/__tests__/catalog.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { AgentCatalogService } from '../catalog.js'
import { AgentDefinitionRegistry } from '../definition-registry.js'
import { createUserAgentStore } from '../user-agent-store.js'
import { getBuiltInAgentDefinitions } from '../built-in.js'

function makeAgentContent(
  id: string,
  options: {
    name?: string
    mode?: 'primary' | 'subagent' | 'all'
    inherits?: string
    extraBlock?: string
    body?: string
  } = {},
): string {
  const name = options.name ?? id
  const mode = options.mode ?? 'all'
  const inherits = options.inherits ? `\ninherits = "${options.inherits}"` : ''
  const extraBlock = options.extraBlock ? `\n\n[extra]\n${options.extraBlock}` : ''
  const body = options.body ?? '自定义提示词'
  return `---
id = "${id}"
name = "${name}"
summary = "测试 ${name}"
mode = "${mode}"
${inherits}
when_to_use = "用于测试"

[tool_policy]
mode = "exclude"
tools = []${extraBlock}
---

${body}
`
}

describe('AgentCatalogService', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'xnova-agent-catalog-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('reload 时会把现有 user agent 一起加载进产品视图和 runtime registry', () => {
    const store = createUserAgentStore(tmpDir)
    store.save(makeAgentContent('writer', { mode: 'primary', extraBlock: 'team = "qa"' }), { overwrite: false })
    const registry = new AgentDefinitionRegistry()
    const catalog = new AgentCatalogService({
      registry,
      userStore: store,
      builtins: getBuiltInAgentDefinitions,
    })

    catalog.reload()

    expect(catalog.getById('writer')?.source).toBe('user')
    expect(catalog.getById('writer')?.frontmatter.extra).toEqual({ team: 'qa' })
    expect(registry.get('writer')?.source).toBe('user')
    expect(catalog.getPrimaryCandidates().map(a => a.frontmatter.id)).toContain('writer')
  })

  it('reload 后删除文件再 reload，会同步从 runtime registry 与产品视图移除 user agent', () => {
    const store = createUserAgentStore(tmpDir)
    store.save(makeAgentContent('to-delete', { mode: 'all' }), { overwrite: false })
    const registry = new AgentDefinitionRegistry()
    const catalog = new AgentCatalogService({
      registry,
      userStore: store,
      builtins: getBuiltInAgentDefinitions,
    })

    catalog.reload()
    expect(registry.get('to-delete')).toBeDefined()

    store.delete('to-delete')
    catalog.reload()

    expect(catalog.getById('to-delete')).toBeUndefined()
    expect(registry.get('to-delete')).toBeUndefined()
    expect(registry.get('general')).toBeDefined()
  })

  it('SubAgent 候选池类型名只返回 subagent | all', () => {
    const store = createUserAgentStore(tmpDir)
    store.save(makeAgentContent('primary-only', { mode: 'primary' }), { overwrite: false })
    store.save(makeAgentContent('sub-only', { mode: 'subagent' }), { overwrite: false })
    store.save(makeAgentContent('all-roles', { mode: 'all' }), { overwrite: false })
    const catalog = new AgentCatalogService({
      registry: new AgentDefinitionRegistry(),
      userStore: store,
      builtins: getBuiltInAgentDefinitions,
    })

    catalog.reload()

    const ids = catalog.getSubagentTypeNames()
    expect(ids).toContain('sub-only')
    expect(ids).toContain('all-roles')
    expect(ids).not.toContain('primary-only')
  })

  it('用户 agent 的 inherits 解析不受文件排序影响', () => {
    const store = createUserAgentStore(tmpDir)
    store.save(makeAgentContent('z-parent', {
      body: '父级提示词',
    }), { overwrite: false })
    store.save(makeAgentContent('a-child', {
      inherits: 'z-parent',
      body: '',
    }), { overwrite: false })
    const registry = new AgentDefinitionRegistry()
    const catalog = new AgentCatalogService({
      registry,
      userStore: store,
      builtins: getBuiltInAgentDefinitions,
    })

    catalog.reload()

    expect(registry.get('a-child')?.inherits).toBe('z-parent')
    expect(registry.get('a-child')?.getSystemPrompt()).toBe('父级提示词')
  })

  it('当 user 覆盖 builtin 同名 agent 时，inherits 优先解析到 user 版本', () => {
    const store = createUserAgentStore(tmpDir)
    store.save(makeAgentContent('general', {
      name: 'Custom General',
      body: '用户覆盖的 general 提示词',
    }), { overwrite: false })
    store.save(makeAgentContent('a-child', {
      inherits: 'general',
      body: '',
    }), { overwrite: false })
    const registry = new AgentDefinitionRegistry()
    const catalog = new AgentCatalogService({
      registry,
      userStore: store,
      builtins: getBuiltInAgentDefinitions,
    })

    catalog.reload()

    expect(registry.get('general')?.source).toBe('user')
    expect(registry.get('a-child')?.getSystemPrompt()).toBe('用户覆盖的 general 提示词')
  })
})
