// src/config/__tests__/settings-contract.test.ts
/**
 * Phase 2 · Task D — 设置页 API 响应契约测试
 *
 * 规范来源：
 * - .trellis/spec/backend/config-toml-migration.md（source + fallback 语义）
 * - .trellis/spec/frontend/quality-guidelines.md（错误态与保存反馈可见）
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ConfigManager } from '../config-manager.js'
import {
  buildSettingsReadResponse,
  buildSettingsSaveResponse,
} from '../settings-contract.js'

function makeTempDir(): string {
  const dir = join(
    tmpdir(),
    `xnova-settings-contract-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )
  mkdirSync(dir, { recursive: true })
  return dir
}

describe('buildSettingsReadResponse — shape 契约', () => {
  let dir: string
  beforeEach(() => {
    dir = makeTempDir()
  })
  afterEach(() => {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
  })

  it('TOML 主路径下：source.userToml 指向 config.toml，warnings 为空', () => {
    writeFileSync(
      join(dir, 'config.toml'),
      `default_provider = "anthropic"
default_model = "claude-sonnet-4-6"

[providers.anthropic]
api_key = "sk"
models = ["claude-sonnet-4-6"]
`,
      'utf-8',
    )
    const mgr = new ConfigManager(dir)
    const res = buildSettingsReadResponse(mgr)
    expect(res.config.defaultProvider).toBe('anthropic')
    expect(res.source.userToml).toBe(join(dir, 'config.toml'))
    expect(res.source.legacyJson).toBeUndefined()
    expect(res.warnings).toEqual([])
  })

  it('仅 legacy JSON：source 同时暴露 legacyJson 与迁移后的 userToml', () => {
    writeFileSync(
      join(dir, 'config.json'),
      JSON.stringify({
        defaultProvider: 'openai',
        defaultModel: 'gpt-4o',
        providers: { openai: { apiKey: 'k', models: ['gpt-4o'] } },
      }),
      'utf-8',
    )
    const mgr = new ConfigManager(dir)
    const res = buildSettingsReadResponse(mgr)
    // 第一次 load 会触发迁移 → TOML 存在，JSON 也保留
    expect(res.source.userToml).toBe(join(dir, 'config.toml'))
    expect(res.source.legacyJson).toBe(join(dir, 'config.json'))
  })

  it('TOML 损坏：config 降级为默认值，warnings 带诊断信息', () => {
    writeFileSync(
      join(dir, 'config.toml'),
      `default_provider = \ninvalid]`,
      'utf-8',
    )
    const mgr = new ConfigManager(dir)
    const res = buildSettingsReadResponse(mgr)
    expect(res.warnings.length).toBeGreaterThan(0)
    expect(res.warnings.join('\n')).toMatch(/toml/i)
    // 损坏 TOML 绝不被覆盖
    expect(existsSync(join(dir, 'config.toml'))).toBe(true)
  })
})

describe('buildSettingsSaveResponse — shape 契约', () => {
  let dir: string
  beforeEach(() => {
    dir = makeTempDir()
  })
  afterEach(() => {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
  })

  it('保存成功返回 success=true 与 source/warnings', () => {
    const mgr = new ConfigManager(dir)
    const current = mgr.load() // 触发默认值
    const res = buildSettingsSaveResponse(mgr, {
      ...current,
      defaultProvider: 'openai',
      defaultModel: 'gpt-4o',
      providers: {
        ...current.providers,
        openai: { apiKey: 'k2', models: ['gpt-4o'] },
      },
    })
    expect(res.success).toBe(true)
    expect(res.provider).toBe('openai')
    expect(res.model).toBe('gpt-4o')
    expect(res.source.userToml).toBe(join(dir, 'config.toml'))
    expect(res.error).toBeUndefined()
  })

  it('保存失败返回 success=false 与 error 字符串', () => {
    const mgr = new ConfigManager(join(dir, 'definitely-not-writable'))
    // 构造一个目录写入失败：父目录是一个普通文件
    writeFileSync(join(dir, 'definitely-not-writable'), 'blocked', 'utf-8')
    const res = buildSettingsSaveResponse(mgr, {
      defaultProvider: 'anthropic',
      defaultModel: 'claude-sonnet-4-6',
      providers: {},
    })
    expect(res.success).toBe(false)
    expect(res.error).toBeTruthy()
  })
})
