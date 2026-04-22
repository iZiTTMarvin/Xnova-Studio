// src/config/__tests__/resolver.test.ts
/**
 * Phase 2 · Task C — `loadResolvedConfig` 契约测试
 *
 * 规范来源：.trellis/spec/backend/config-toml-migration.md
 *
 * 关键契约：
 * - 优先级：project > user > builtin
 * - 合并规则：标量覆盖、对象按 key merge、数组整组覆盖
 * - project.toml 缺失 → 只用 user + builtin（无 warning）
 * - project.toml 损坏或字段错误 → 必须 warning 并带路径，不得吞错
 * - ResolvedConfig.effective 字段形状等价 CCodeConfig（Phase 2 不扩展）
 * - project-only 字段（agent/features/modes）暴露在 projectExtras，供后续 runtime 消费
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadResolvedConfig } from '../resolver.js'
import { ConfigManager } from '../config-manager.js'

function makeWorkspace(): {
  root: string
  userDir: string
  projectDir: string
} {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const root = join(tmpdir(), `xnova-resolver-test-${stamp}`)
  const userDir = join(root, 'home', '.xnovacode')
  const projectDir = join(root, 'project')
  mkdirSync(userDir, { recursive: true })
  mkdirSync(join(projectDir, '.xnovacode'), { recursive: true })
  return { root, userDir, projectDir }
}

describe('loadResolvedConfig — 优先级', () => {
  let ws: ReturnType<typeof makeWorkspace>
  beforeEach(() => {
    ws = makeWorkspace()
  })
  afterEach(() => {
    if (existsSync(ws.root)) rmSync(ws.root, { recursive: true, force: true })
  })

  it('无 user、无 project → 使用 builtin 默认值', () => {
    const result = loadResolvedConfig(ws.projectDir, {
      configManager: new ConfigManager(ws.userDir),
    })
    expect(result.effective.defaultProvider).toBe('anthropic')
    expect(result.source.userToml).toBeDefined() // builtin 会生成默认 user toml
    expect(result.source.projectToml).toBeUndefined()
    expect(result.warnings).toEqual([])
  })

  it('仅 user：effective 反映 user 字段', () => {
    writeFileSync(
      join(ws.userDir, 'config.toml'),
      `default_provider = "glm"
default_model = "glm-4"

[providers.glm]
api_key = "k"
models = ["glm-4"]
`,
      'utf-8',
    )
    const result = loadResolvedConfig(ws.projectDir, {
      configManager: new ConfigManager(ws.userDir),
    })
    expect(result.effective.defaultProvider).toBe('glm')
    expect(result.effective.defaultModel).toBe('glm-4')
    expect(result.effective.providers['glm']?.apiKey).toBe('k')
    expect(result.source.projectToml).toBeUndefined()
  })
})

describe('loadResolvedConfig — merge 规则', () => {
  let ws: ReturnType<typeof makeWorkspace>
  beforeEach(() => {
    ws = makeWorkspace()
  })
  afterEach(() => {
    if (existsSync(ws.root)) rmSync(ws.root, { recursive: true, force: true })
  })

  it('project 的标量字段（通过 projectExtras）不影响 user defaultProvider', () => {
    writeFileSync(
      join(ws.userDir, 'config.toml'),
      `default_provider = "anthropic"
default_model = "claude-sonnet-4-6"
`,
      'utf-8',
    )
    writeFileSync(
      join(ws.projectDir, '.xnovacode', 'project.toml'),
      `[agent]
default = "coder"
max_parallel_subagents = 3
`,
      'utf-8',
    )
    const result = loadResolvedConfig(ws.projectDir, {
      configManager: new ConfigManager(ws.userDir),
    })
    // effective 仍然是 user 的默认（project.toml Phase 2 只含 agent/features/modes）
    expect(result.effective.defaultProvider).toBe('anthropic')
    // 但 projectExtras 要暴露 project.toml 内容供 runtime / UI 消费
    expect(result.projectExtras?.agent?.default).toBe('coder')
    expect(result.projectExtras?.agent?.max_parallel_subagents).toBe(3)
    expect(result.source.projectToml).toBe(
      join(ws.projectDir, '.xnovacode', 'project.toml'),
    )
  })

  it('project.toml 的 modes 与 features 被透传到 projectExtras', () => {
    writeFileSync(
      join(ws.projectDir, '.xnovacode', 'project.toml'),
      `[modes]
allowed = ["standard", "xforge"]
recommended = "xforge"

[features]
enabled = ["rag", "web"]
`,
      'utf-8',
    )
    const result = loadResolvedConfig(ws.projectDir, {
      configManager: new ConfigManager(ws.userDir),
    })
    expect(result.projectExtras?.modes?.allowed).toEqual([
      'standard',
      'xforge',
    ])
    expect(result.projectExtras?.modes?.recommended).toBe('xforge')
    expect(result.projectExtras?.features?.enabled).toEqual(['rag', 'web'])
  })
})

describe('loadResolvedConfig — 损坏 / 类型错误不得吞错', () => {
  let ws: ReturnType<typeof makeWorkspace>
  beforeEach(() => {
    ws = makeWorkspace()
  })
  afterEach(() => {
    if (existsSync(ws.root)) rmSync(ws.root, { recursive: true, force: true })
  })

  it('project.toml 解析失败时：warning 带行号且 projectExtras 为 undefined', () => {
    writeFileSync(
      join(ws.projectDir, '.xnovacode', 'project.toml'),
      `[agent\ndefault = "x"`,
      'utf-8',
    )
    const result = loadResolvedConfig(ws.projectDir, {
      configManager: new ConfigManager(ws.userDir),
    })
    expect(result.projectExtras).toBeUndefined()
    expect(result.warnings.join('\n')).toMatch(/project\.toml/i)
    expect(result.warnings.join('\n')).toMatch(/line \d+/i)
  })

  it('project.toml 字段类型错误时：warning 带 path', () => {
    writeFileSync(
      join(ws.projectDir, '.xnovacode', 'project.toml'),
      `[agent]\nmax_parallel_subagents = -1\n`,
      'utf-8',
    )
    const result = loadResolvedConfig(ws.projectDir, {
      configManager: new ConfigManager(ws.userDir),
    })
    expect(result.projectExtras).toBeUndefined()
    expect(result.warnings.join('\n')).toMatch(/agent\.max_parallel_subagents/)
  })

  it('project.toml 不存在时：warnings 中不含 project 相关降级', () => {
    const result = loadResolvedConfig(ws.projectDir, {
      configManager: new ConfigManager(ws.userDir),
    })
    expect(result.warnings.filter(w => /project/i.test(w))).toEqual([])
  })
})

describe('loadResolvedConfig — source 路径契约', () => {
  let ws: ReturnType<typeof makeWorkspace>
  beforeEach(() => {
    ws = makeWorkspace()
  })
  afterEach(() => {
    if (existsSync(ws.root)) rmSync(ws.root, { recursive: true, force: true })
  })

  it('user TOML + project TOML 同时存在时 source 同时暴露两个路径', () => {
    writeFileSync(
      join(ws.userDir, 'config.toml'),
      `default_provider = "anthropic"\ndefault_model = "claude-sonnet-4-6"\n`,
      'utf-8',
    )
    writeFileSync(
      join(ws.projectDir, '.xnovacode', 'project.toml'),
      `[agent]\ndefault = "coder"\n`,
      'utf-8',
    )
    const result = loadResolvedConfig(ws.projectDir, {
      configManager: new ConfigManager(ws.userDir),
    })
    expect(result.source.userToml).toBe(join(ws.userDir, 'config.toml'))
    expect(result.source.projectToml).toBe(
      join(ws.projectDir, '.xnovacode', 'project.toml'),
    )
  })

  it('仅 legacy JSON 时 source.legacyJson 暴露路径', () => {
    writeFileSync(
      join(ws.userDir, 'config.json'),
      JSON.stringify({ defaultProvider: 'openai', defaultModel: 'gpt-4o' }),
      'utf-8',
    )
    // 注意：ConfigManager 会触发 legacy migration 生成 TOML
    const result = loadResolvedConfig(ws.projectDir, {
      configManager: new ConfigManager(ws.userDir),
    })
    expect(result.source.legacyJson).toBe(join(ws.userDir, 'config.json'))
  })
})
