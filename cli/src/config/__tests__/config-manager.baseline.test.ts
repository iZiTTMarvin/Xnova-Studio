// src/config/__tests__/config-manager.baseline.test.ts
/**
 * ConfigManager 基线测试
 * 固化 load() 对合法 / 缺失 / 损坏 JSON 的当前行为。
 * 不锁日志格式、UUID、时间戳等易变输出。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ConfigManager } from '../config-manager.js'

// 每个测试用独立临时目录，避免互相污染
function makeTempDir(): string {
  const dir = join(tmpdir(), `xnova-config-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

describe('ConfigManager.load() — 基线行为', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = makeTempDir()
  })

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  // ── 主路径：config.json 不存在 ──────────────────────────────────────────
  it('config.json 不存在时返回默认配置并写入文件', () => {
    const mgr = new ConfigManager(tempDir)
    const cfg = mgr.load()

    // 默认值断言（只锁关键字段，不锁全量）
    expect(cfg.defaultProvider).toBe('anthropic')
    expect(typeof cfg.defaultModel).toBe('string')
    expect(cfg.defaultModel.length).toBeGreaterThan(0)
    expect(cfg.providers).toBeDefined()
    expect(typeof cfg.providers).toBe('object')

    // 文件应被写入
    expect(existsSync(join(tempDir, 'config.json'))).toBe(true)
  })

  // ── 主路径：合法 config.json ────────────────────────────────────────────
  it('合法 config.json 能被正确加载', () => {
    const customConfig = {
      defaultProvider: 'openai',
      defaultModel: 'gpt-4o',
      providers: {
        openai: {
          apiKey: 'test-key',
          models: ['gpt-4o'],
        },
      },
    }
    writeFileSync(join(tempDir, 'config.json'), JSON.stringify(customConfig, null, 2), 'utf-8')

    const mgr = new ConfigManager(tempDir)
    const cfg = mgr.load()

    expect(cfg.defaultProvider).toBe('openai')
    expect(cfg.defaultModel).toBe('gpt-4o')
    expect(cfg.providers['openai']?.apiKey).toBe('test-key')
  })

  // ── 主路径：缺失字段自动补默认值（向前兼容） ───────────────────────────
  it('config.json 缺失字段时自动合并默认值', () => {
    // 只写 defaultProvider，其余字段缺失
    writeFileSync(join(tempDir, 'config.json'), JSON.stringify({ defaultProvider: 'glm' }), 'utf-8')

    const mgr = new ConfigManager(tempDir)
    const cfg = mgr.load()

    expect(cfg.defaultProvider).toBe('glm')
    // 缺失的 defaultModel 应被默认值填充
    expect(typeof cfg.defaultModel).toBe('string')
    expect(cfg.defaultModel.length).toBeGreaterThan(0)
    // providers 也应被补全
    expect(cfg.providers).toBeDefined()
  })

  // ── 失败路径：损坏的 JSON ───────────────────────────────────────────────
  it('config.json 内容损坏时降级返回默认配置（不抛出）', () => {
    writeFileSync(join(tempDir, 'config.json'), '{ invalid json !!!', 'utf-8')

    const mgr = new ConfigManager(tempDir)

    // 不应抛出
    expect(() => mgr.load()).not.toThrow()

    const cfg = mgr.load()
    // 降级到默认值
    expect(cfg.defaultProvider).toBe('anthropic')
    expect(cfg.providers).toBeDefined()
  })

  // ── 失败路径：空文件 ────────────────────────────────────────────────────
  it('config.json 为空文件时降级返回默认配置（不抛出）', () => {
    writeFileSync(join(tempDir, 'config.json'), '', 'utf-8')

    const mgr = new ConfigManager(tempDir)
    expect(() => mgr.load()).not.toThrow()

    const cfg = mgr.load()
    expect(cfg.defaultProvider).toBe('anthropic')
  })

  // ── 缓存行为：连续两次 load() 返回同一对象引用 ─────────────────────────
  it('mtime 未变时连续 load() 返回缓存（同一引用）', () => {
    const mgr = new ConfigManager(tempDir)
    mgr.load() // 触发写入

    const first = mgr.load()
    const second = mgr.load()
    expect(first).toBe(second)
  })
})
