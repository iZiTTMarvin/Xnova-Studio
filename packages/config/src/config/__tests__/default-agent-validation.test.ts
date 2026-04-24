// src/config/__tests__/default-agent-validation.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ConfigManager } from '../config-manager.js'
import { loadResolvedConfig } from '../resolver.js'
import { buildSettingsSaveResponse } from '../settings-contract.js'

function makeWorkspace(): { root: string; userDir: string; projectDir: string } {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const root = join(tmpdir(), `xnova-default-agent-${stamp}`)
  const userDir = join(root, 'home', '.xnovacode')
  const projectDir = join(root, 'project')
  mkdirSync(userDir, { recursive: true })
  mkdirSync(join(projectDir, '.xnovacode'), { recursive: true })
  return { root, userDir, projectDir }
}

describe('default agent validation', () => {
  let ws: ReturnType<typeof makeWorkspace>

  beforeEach(() => {
    ws = makeWorkspace()
  })

  afterEach(() => {
    if (existsSync(ws.root)) rmSync(ws.root, { recursive: true, force: true })
  })

  it('loadResolvedConfig 遇到非法 default agent 时写 warning 并回退到 runtime fallback', () => {
    writeFileSync(
      join(ws.userDir, 'config.toml'),
      `default_provider = "anthropic"
default_model = "claude-sonnet-4-6"

[agent]
default = "sub-only"
`,
      'utf-8',
    )

    const result = loadResolvedConfig(ws.projectDir, {
      configManager: new ConfigManager(ws.userDir),
      defaultAgentValidator: {
        validateDefaultAgent: () => ({
          valid: false,
          error: 'default_agent "sub-only" 的 mode 为 "subagent"',
        }),
      },
    })

    expect(result.effective.agent?.default).toBeUndefined()
    expect(result.warnings.join('\n')).toContain('default_agent "sub-only"')
  })

  it('settings-save 在 default agent 非法时拒绝写入', () => {
    const manager = new ConfigManager(ws.userDir)
    const current = manager.load()

    const response = buildSettingsSaveResponse(manager, {
      ...current,
      agent: {
        default: 'sub-only',
      },
    })

    expect(response.success).toBe(false)
    expect(response.error).toMatch(/default/i)
  })
})
