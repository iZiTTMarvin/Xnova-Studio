// src/config/__tests__/config-manager.toml.test.ts
/**
 * Phase 2 · Task B — ConfigManager 双读 + 迁移集成测试
 *
 * 规范来源：.trellis/spec/backend/config-toml-migration.md
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ConfigManager } from '../config-manager.js'

function makeTempDir(): string {
  const dir = join(
    tmpdir(),
    `xnova-mgr-toml-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )
  mkdirSync(dir, { recursive: true })
  return dir
}

describe('ConfigManager.load() — TOML 双读契约', () => {
  let dir: string
  beforeEach(() => {
    dir = makeTempDir()
  })
  afterEach(() => {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
  })

  it('同时存在 config.toml / config.json 时优先读 TOML', () => {
    writeFileSync(
      join(dir, 'config.toml'),
      `default_provider = "from-toml"
default_model = "glm-4"

[providers.glm]
api_key = "k"
models = ["glm-4"]
`,
      'utf-8',
    )
    writeFileSync(
      join(dir, 'config.json'),
      JSON.stringify({
        defaultProvider: 'from-json',
        defaultModel: 'gpt-4o',
        providers: { openai: { apiKey: 'k2', models: ['gpt-4o'] } },
      }),
      'utf-8',
    )

    const mgr = new ConfigManager(dir)
    const cfg = mgr.load()
    expect(cfg.defaultProvider).toBe('from-toml')
    expect(cfg.defaultModel).toBe('glm-4')
    expect(cfg.providers['glm']?.apiKey).toBe('k')
    // 不得把 openai provider 误读进来
    expect(cfg.providers['openai']?.apiKey).not.toBe('k2')
  })

  it('仅有 config.json 时首次 load 触发迁移并保留 JSON', () => {
    writeFileSync(
      join(dir, 'config.json'),
      JSON.stringify({
        defaultProvider: 'anthropic',
        defaultModel: 'claude-sonnet-4-6',
        providers: {
          anthropic: { apiKey: 'sk-xxx', models: ['claude-sonnet-4-6'] },
        },
      }),
      'utf-8',
    )

    const mgr = new ConfigManager(dir)
    const cfg = mgr.load()

    expect(cfg.defaultProvider).toBe('anthropic')
    expect(cfg.providers['anthropic']?.apiKey).toBe('sk-xxx')
    // 迁移后 TOML 应被生成，JSON 原文件保留
    expect(existsSync(join(dir, 'config.toml'))).toBe(true)
    expect(existsSync(join(dir, 'config.json'))).toBe(true)
    const tomlText = readFileSync(join(dir, 'config.toml'), 'utf-8')
    expect(tomlText).toContain('default_provider = "anthropic"')
  })

  it('config.toml 损坏时不 silent reset：返回默认值并产生 warning', () => {
    writeFileSync(
      join(dir, 'config.toml'),
      `default_provider = \ninvalid line]`,
      'utf-8',
    )

    const mgr = new ConfigManager(dir)
    expect(() => mgr.load()).not.toThrow()
    const warnings = mgr.getLastWarnings()
    expect(warnings.join('\n')).toMatch(/toml/i)
    // 损坏的 TOML 不得被覆盖
    const after = readFileSync(join(dir, 'config.toml'), 'utf-8')
    expect(after).toContain('invalid line')
  })

  it('只存在 config.toml 时能正确加载（camelCase 运行时字段）', () => {
    writeFileSync(
      join(dir, 'config.toml'),
      `default_provider = "anthropic"
default_model = "claude-sonnet-4-6"
sub_agent_model = "claude-haiku-4-5-20251001"
status_bar = false

[providers.anthropic]
api_key = "sk"
base_url = "https://api.anthropic.com"
protocol = "anthropic"
models = ["claude-sonnet-4-6"]
vision_models = ["claude-sonnet-4-6"]

[memory]
enabled = true

[memory.embedding]
api_key = "sk-embed"
base_url = "https://api.example.com/v1"
dimension = 1536
`,
      'utf-8',
    )

    const mgr = new ConfigManager(dir)
    const cfg = mgr.load()
    expect(cfg.defaultProvider).toBe('anthropic')
    expect(cfg.subAgentModel).toBe('claude-haiku-4-5-20251001')
    expect(cfg.statusBar).toBe(false)
    expect(cfg.providers['anthropic']?.baseURL).toBe(
      'https://api.anthropic.com',
    )
    expect(cfg.providers['anthropic']?.visionModels).toEqual([
      'claude-sonnet-4-6',
    ])
    expect(cfg.memory?.embedding?.baseURL).toBe('https://api.example.com/v1')
    expect(cfg.memory?.embedding?.dimension).toBe(1536)
  })
})
