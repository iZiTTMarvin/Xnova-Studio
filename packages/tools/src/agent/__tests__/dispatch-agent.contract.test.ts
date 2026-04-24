// src/tools/agent/__tests__/dispatch-agent.contract.test.ts

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const testDir = dirname(fileURLToPath(import.meta.url))

const dispatchAgentSource = readFileSync(
  resolve(testDir, '../dispatch-agent.ts'),
  'utf-8',
)

describe('DispatchAgentTool contract', () => {
  it('subagent_type 参数枚举来自 agentCatalog.getSubagentTypeNames()', () => {
    expect(dispatchAgentSource).toContain('enum: agentCatalog.getSubagentTypeNames()')
  })

  it('运行时包含 SubAgent 候选池二次校验', () => {
    expect(dispatchAgentSource).toContain('const allowedTypes = new Set(agentCatalog.getSubagentTypeNames())')
    expect(dispatchAgentSource).toContain('if (!allowedTypes.has(subagentType))')
  })
})
