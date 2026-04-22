// src/config/__tests__/config-migration.integration.test.ts
/**
 * Phase 2 · Task E — 配置迁移链路集成回归
 *
 * 目标：
 * 1. 旧用户 `config.json` 升级后 Provider apiKey 绝对不丢
 * 2. 设置页写回（contract）→ ConfigManager 再次 load 值与 UI 一致
 * 3. `project.toml` 覆盖不污染 user config；resolver 链路端到端正确
 *
 * 规范来源：
 * - .trellis/spec/backend/config-toml-migration.md
 * - docs/implement/phase2-config-migration.md 完成标准
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ConfigManager } from '../config-manager.js'
import {
  buildSettingsReadResponse,
  buildSettingsSaveResponse,
} from '../settings-contract.js'
import { loadResolvedConfig } from '../resolver.js'
import { parseToml } from '../toml/index.js'

function makeWorkspace(): {
  root: string
  userDir: string
  projectDir: string
} {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const root = join(tmpdir(), `xnova-phase2-integration-${stamp}`)
  const userDir = join(root, 'home', '.xnovacode')
  const projectDir = join(root, 'project')
  mkdirSync(userDir, { recursive: true })
  mkdirSync(join(projectDir, '.xnovacode'), { recursive: true })
  return { root, userDir, projectDir }
}

describe('Phase 2 集成回归 · 旧用户升级路径', () => {
  let ws: ReturnType<typeof makeWorkspace>
  beforeEach(() => {
    ws = makeWorkspace()
  })
  afterEach(() => {
    if (existsSync(ws.root)) rmSync(ws.root, { recursive: true, force: true })
  })

  it('旧 config.json 含 providers.anthropic.apiKey → 迁移后 TOML 保留该 apiKey 且 load 语义一致', () => {
    const legacyApiKey = 'sk-legacy-apikey-xxx'
    writeFileSync(
      join(ws.userDir, 'config.json'),
      JSON.stringify({
        defaultProvider: 'anthropic',
        defaultModel: 'claude-sonnet-4-6',
        subAgentModel: 'claude-haiku-4-5-20251001',
        statusBar: false,
        providers: {
          anthropic: {
            apiKey: legacyApiKey,
            protocol: 'anthropic',
            models: ['claude-opus-4-6', 'claude-sonnet-4-6'],
            visionModels: ['claude-sonnet-4-6'],
          },
        },
        memory: {
          enabled: true,
          embedding: {
            apiKey: 'sk-embed',
            baseURL: 'https://api.example.com/v1',
            dimension: 1536,
          },
        },
      }),
      'utf-8',
    )

    const mgr = new ConfigManager(ws.userDir)
    const cfg = mgr.load()

    // 关键断言：apiKey 不丢
    expect(cfg.providers['anthropic']?.apiKey).toBe(legacyApiKey)
    expect(cfg.subAgentModel).toBe('claude-haiku-4-5-20251001')
    expect(cfg.statusBar).toBe(false)
    expect(cfg.memory?.embedding?.apiKey).toBe('sk-embed')
    expect(cfg.memory?.embedding?.dimension).toBe(1536)

    // TOML 已生成，JSON 未被删除
    expect(existsSync(join(ws.userDir, 'config.toml'))).toBe(true)
    expect(existsSync(join(ws.userDir, 'config.json'))).toBe(true)

    // TOML 内容包含 apiKey（验证 TOML 本体确实承载了敏感字段）
    const tomlText = readFileSync(join(ws.userDir, 'config.toml'), 'utf-8')
    const parsed = parseToml(tomlText) as Record<string, unknown>
    const providers = parsed.providers as Record<string, Record<string, unknown>>
    expect(providers.anthropic?.api_key).toBe(legacyApiKey)
  })

  it('损坏的 config.json 不会生成 TOML 也不改写原文件', () => {
    writeFileSync(join(ws.userDir, 'config.json'), '{ broken', 'utf-8')
    const mgr = new ConfigManager(ws.userDir)
    const cfg = mgr.load()
    expect(cfg.defaultProvider).toBe('anthropic') // 默认值
    // 不自动写 TOML（因为 JSON 解析失败，没有可迁移数据）
    expect(existsSync(join(ws.userDir, 'config.toml'))).toBe(false)
    // 原 JSON 保持原样
    expect(readFileSync(join(ws.userDir, 'config.json'), 'utf-8')).toBe(
      '{ broken',
    )
    // warning 能看到
    expect(mgr.getLastWarnings().join('\n')).toMatch(/json|migration/i)
  })
})

describe('Phase 2 集成回归 · 设置页写回 → CLI 读取一致', () => {
  let ws: ReturnType<typeof makeWorkspace>
  beforeEach(() => {
    ws = makeWorkspace()
  })
  afterEach(() => {
    if (existsSync(ws.root)) rmSync(ws.root, { recursive: true, force: true })
  })

  it('settings-contract 保存后：再 load 得到相同的 provider / apiKey / memory 设置', () => {
    const mgr = new ConfigManager(ws.userDir)
    mgr.load() // 初始化

    const nextConfig = {
      defaultProvider: 'openai',
      defaultModel: 'gpt-4o',
      statusBar: true,
      providers: {
        openai: {
          apiKey: 'sk-openai-written-by-ui',
          baseURL: 'https://api.openai.com/v1',
          protocol: 'openai' as const,
          models: ['gpt-4o', 'gpt-4o-mini'],
          visionModels: ['gpt-4o'],
        },
      },
      memory: {
        enabled: true,
        embedding: {
          apiKey: 'sk-emb-ui',
          baseURL: 'https://api.example.com/v1',
          model: 'text-embedding-3-small',
          dimension: 1536,
        },
      },
    }
    const saveRes = buildSettingsSaveResponse(mgr, nextConfig)
    expect(saveRes.success).toBe(true)
    expect(saveRes.source.userToml).toBe(join(ws.userDir, 'config.toml'))

    // 使用一个独立 ConfigManager 实例绕过内部缓存，模拟下次启动
    const mgr2 = new ConfigManager(ws.userDir)
    const readRes = buildSettingsReadResponse(mgr2)
    expect(readRes.config.defaultProvider).toBe('openai')
    expect(readRes.config.defaultModel).toBe('gpt-4o')
    expect(readRes.config.providers['openai']?.apiKey).toBe(
      'sk-openai-written-by-ui',
    )
    expect(readRes.config.providers['openai']?.visionModels).toEqual(['gpt-4o'])
    expect(readRes.config.memory?.embedding?.dimension).toBe(1536)
  })
})

describe('Phase 2 集成回归 · resolver 端到端', () => {
  let ws: ReturnType<typeof makeWorkspace>
  beforeEach(() => {
    ws = makeWorkspace()
  })
  afterEach(() => {
    if (existsSync(ws.root)) rmSync(ws.root, { recursive: true, force: true })
  })

  it('user TOML + project TOML 同时存在：effective=user；projectExtras 暴露 agent/features/modes', () => {
    writeFileSync(
      join(ws.userDir, 'config.toml'),
      `default_provider = "anthropic"
default_model = "claude-sonnet-4-6"

[providers.anthropic]
api_key = "sk-user"
models = ["claude-sonnet-4-6"]
`,
      'utf-8',
    )
    writeFileSync(
      join(ws.projectDir, '.xnovacode', 'project.toml'),
      `[agent]
default = "plan"
max_parallel_subagents = 4

[features]
enabled = ["rag"]

[modes]
allowed = ["standard", "xforge"]
recommended = "xforge"
`,
      'utf-8',
    )

    const result = loadResolvedConfig(ws.projectDir, {
      configManager: new ConfigManager(ws.userDir),
    })

    // Phase 2 的 effective 仍然是 user 值（CCodeConfig 形状）
    expect(result.effective.defaultProvider).toBe('anthropic')
    expect(result.effective.providers['anthropic']?.apiKey).toBe('sk-user')

    // project-only 字段必须透传
    expect(result.projectExtras?.agent?.default).toBe('plan')
    expect(result.projectExtras?.agent?.max_parallel_subagents).toBe(4)
    expect(result.projectExtras?.features?.enabled).toEqual(['rag'])
    expect(result.projectExtras?.modes?.recommended).toBe('xforge')

    // source 暴露两个路径
    expect(result.source.userToml).toBe(join(ws.userDir, 'config.toml'))
    expect(result.source.projectToml).toBe(
      join(ws.projectDir, '.xnovacode', 'project.toml'),
    )

    // 没有 warning（TOML 与 project.toml 都合法）
    expect(result.warnings).toEqual([])
  })
})
