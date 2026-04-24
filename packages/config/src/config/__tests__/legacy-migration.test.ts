// src/config/__tests__/legacy-migration.test.ts
/**
 * Phase 2 · Task B — legacy JSON → TOML 安全迁移契约测试
 *
 * 规范来源：.trellis/spec/backend/config-toml-migration.md
 *
 * 关键约束：
 * - config.toml 已存在 → 绝不被 config.json 覆盖
 * - 迁移失败或写入失败 → 原 config.json 必须保留
 * - 任一路径不得 silent reset 或 silent overwrite
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { migrateLegacyJsonToToml } from '../legacy-migration.js'
import { parseToml } from '../toml/index.js'

function makeTempDir(): string {
  const dir = join(
    tmpdir(),
    `xnova-migration-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )
  mkdirSync(dir, { recursive: true })
  return dir
}

describe('migrateLegacyJsonToToml — 成功路径', () => {
  let dir: string
  beforeEach(() => {
    dir = makeTempDir()
  })
  afterEach(() => {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
  })

  it('仅有 config.json 时：生成 config.toml 并保留 JSON', () => {
    const legacy = {
      defaultProvider: 'anthropic',
      defaultModel: 'claude-sonnet-4-6',
      subAgentModel: 'claude-haiku-4-5-20251001',
      statusBar: true,
      providers: {
        anthropic: {
          apiKey: 'sk-xxx',
          protocol: 'anthropic' as const,
          models: ['claude-sonnet-4-6'],
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
    }
    writeFileSync(
      join(dir, 'config.json'),
      JSON.stringify(legacy, null, 2),
      'utf-8',
    )

    const result = migrateLegacyJsonToToml(dir)
    expect(result.success).toBe(true)
    expect(result.writtenPath).toBe(join(dir, 'config.toml'))
    expect(result.keptLegacyPath).toBe(join(dir, 'config.json'))
    expect(result.error).toBeUndefined()

    // TOML 已产生
    const tomlText = readFileSync(join(dir, 'config.toml'), 'utf-8')
    const parsed = parseToml(tomlText) as Record<string, unknown>
    expect(parsed.default_provider).toBe('anthropic')
    const providers = parsed.providers as Record<string, Record<string, unknown>>
    expect(providers.anthropic?.api_key).toBe('sk-xxx')
    expect(providers.anthropic?.vision_models).toEqual([
      'claude-sonnet-4-6',
    ])

    // legacy 原文件原样保留
    expect(existsSync(join(dir, 'config.json'))).toBe(true)
    const legacyAfter = JSON.parse(
      readFileSync(join(dir, 'config.json'), 'utf-8'),
    )
    expect(legacyAfter.providers.anthropic.apiKey).toBe('sk-xxx')
  })
})

describe('migrateLegacyJsonToToml — no-op / 拒绝路径', () => {
  let dir: string
  beforeEach(() => {
    dir = makeTempDir()
  })
  afterEach(() => {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
  })

  it('config.toml 已存在时：不动任何文件并返回 fallback', () => {
    const tomlOriginal = `default_provider = "from-toml"\n`
    writeFileSync(join(dir, 'config.toml'), tomlOriginal, 'utf-8')
    writeFileSync(
      join(dir, 'config.json'),
      JSON.stringify({ defaultProvider: 'from-json' }),
      'utf-8',
    )

    const result = migrateLegacyJsonToToml(dir)
    expect(result.success).toBe(false)
    expect(result.fallback).toMatch(/toml already exists/i)
    expect(result.writtenPath).toBeUndefined()
    // TOML 内容保持原样
    expect(readFileSync(join(dir, 'config.toml'), 'utf-8')).toBe(tomlOriginal)
  })

  it('两个文件都不存在时：返回 success=false 且无副作用', () => {
    const result = migrateLegacyJsonToToml(dir)
    expect(result.success).toBe(false)
    expect(result.fallback).toMatch(/no legacy json/i)
    expect(existsSync(join(dir, 'config.toml'))).toBe(false)
    expect(existsSync(join(dir, 'config.json'))).toBe(false)
  })
})

describe('migrateLegacyJsonToToml — 失败路径（保留 legacy）', () => {
  let dir: string
  beforeEach(() => {
    dir = makeTempDir()
  })
  afterEach(() => {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
  })

  it('JSON 无法解析时：返回错误并保留原 JSON，不写任何 TOML', () => {
    writeFileSync(join(dir, 'config.json'), '{ invalid json !!!', 'utf-8')

    const result = migrateLegacyJsonToToml(dir)
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/json/i)
    expect(result.fallback).toMatch(/kept legacy json untouched/i)

    // 原 JSON 未被重写
    expect(readFileSync(join(dir, 'config.json'), 'utf-8')).toBe(
      '{ invalid json !!!',
    )
    // 绝不生成一份"默认 TOML"
    expect(existsSync(join(dir, 'config.toml'))).toBe(false)
  })
})
