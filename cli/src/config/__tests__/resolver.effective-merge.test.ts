// src/config/__tests__/resolver.effective-merge.test.ts
/**
 * Phase 2 fix-A — resolver.effective 真正承担 project > user > builtin
 *
 * 规范来源：
 * - .trellis/spec/backend/config-toml-migration.md · §3 merge 规则
 * - docs/implement/phase2-config-migration.md · 完成标准 #3（project.toml 可以影响运行时默认值）
 *
 * 关键契约：
 * - merge 规则：标量覆盖、对象按 key merge、数组整组覆盖
 * - Phase 2 的 project.toml schema 只含 agent / features / modes，因此这些字段必须
 *   出现在 ResolvedConfigResult.effective 上（而不是只透传到 projectExtras）
 * - user TOML 的 [agent] / [features] / [modes] 也必须被读进 effective
 * - project 覆盖 user：agent 的标量字段按 key merge，modes.allowed / features.enabled 数组整组覆盖
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
  const root = join(tmpdir(), `xnova-effective-merge-${stamp}`)
  const userDir = join(root, 'home', '.xnovacode')
  const projectDir = join(root, 'project')
  mkdirSync(userDir, { recursive: true })
  mkdirSync(join(projectDir, '.xnovacode'), { recursive: true })
  return { root, userDir, projectDir }
}

describe('resolver.effective — project > user > builtin 合并', () => {
  let ws: ReturnType<typeof makeWorkspace>

  beforeEach(() => {
    ws = makeWorkspace()
  })

  afterEach(() => {
    if (existsSync(ws.root)) rmSync(ws.root, { recursive: true, force: true })
  })

  it('user TOML 的 [agent]/[modes]/[features] 必须被读进 effective', () => {
    writeFileSync(
      join(ws.userDir, 'config.toml'),
      `default_provider = "anthropic"
default_model = "claude-sonnet-4-6"

[agent]
default = "general"
max_parallel_subagents = 2

[modes]
allowed = ["standard"]
recommended = "standard"

[features]
enabled = ["memory"]
`,
      'utf-8',
    )

    const result = loadResolvedConfig(ws.projectDir, {
      configManager: new ConfigManager(ws.userDir),
    })

    expect(result.effective.agent?.default).toBe('general')
    expect(result.effective.agent?.maxParallelSubagents).toBe(2)
    expect(result.effective.modes?.allowed).toEqual(['standard'])
    expect(result.effective.modes?.recommended).toBe('standard')
    expect(result.effective.features?.enabled).toEqual(['memory'])
  })

  it('标量：project.agent.default 覆盖 user.agent.default（按 key merge，其它字段保留）', () => {
    writeFileSync(
      join(ws.userDir, 'config.toml'),
      `default_provider = "anthropic"
default_model = "claude-sonnet-4-6"

[agent]
default = "general"
max_parallel_subagents = 2
`,
      'utf-8',
    )
    writeFileSync(
      join(ws.projectDir, '.xnovacode', 'project.toml'),
      `[agent]
default = "plan"
`,
      'utf-8',
    )

    const result = loadResolvedConfig(ws.projectDir, {
      configManager: new ConfigManager(ws.userDir),
    })

    // project 覆盖 default
    expect(result.effective.agent?.default).toBe('plan')
    // user 的 max_parallel_subagents 仍保留（按 key merge）
    expect(result.effective.agent?.maxParallelSubagents).toBe(2)
  })

  it('数组：project.modes.allowed 整组覆盖 user.modes.allowed', () => {
    writeFileSync(
      join(ws.userDir, 'config.toml'),
      `default_provider = "anthropic"
default_model = "claude-sonnet-4-6"

[modes]
allowed = ["standard"]
recommended = "standard"
`,
      'utf-8',
    )
    writeFileSync(
      join(ws.projectDir, '.xnovacode', 'project.toml'),
      `[modes]
allowed = ["xforge"]
recommended = "xforge"
`,
      'utf-8',
    )

    const result = loadResolvedConfig(ws.projectDir, {
      configManager: new ConfigManager(ws.userDir),
    })

    // 数组整组覆盖：user 的 "standard" 不得遗留
    expect(result.effective.modes?.allowed).toEqual(['xforge'])
    expect(result.effective.modes?.recommended).toBe('xforge')
  })

  it('数组：project.features.enabled 整组覆盖 user.features.enabled', () => {
    writeFileSync(
      join(ws.userDir, 'config.toml'),
      `default_provider = "anthropic"
default_model = "claude-sonnet-4-6"

[features]
enabled = ["memory", "skills"]
`,
      'utf-8',
    )
    writeFileSync(
      join(ws.projectDir, '.xnovacode', 'project.toml'),
      `[features]
enabled = ["rag"]
`,
      'utf-8',
    )

    const result = loadResolvedConfig(ws.projectDir, {
      configManager: new ConfigManager(ws.userDir),
    })

    expect(result.effective.features?.enabled).toEqual(['rag'])
  })

  it('project.toml 缺失：effective 的 agent/modes/features 等价于 user 层值', () => {
    writeFileSync(
      join(ws.userDir, 'config.toml'),
      `default_provider = "anthropic"
default_model = "claude-sonnet-4-6"

[agent]
default = "general"
max_parallel_subagents = 3

[modes]
allowed = ["standard", "xforge"]
recommended = "standard"

[features]
enabled = ["rag"]
`,
      'utf-8',
    )

    const result = loadResolvedConfig(ws.projectDir, {
      configManager: new ConfigManager(ws.userDir),
    })

    expect(result.effective.agent?.default).toBe('general')
    expect(result.effective.agent?.maxParallelSubagents).toBe(3)
    expect(result.effective.modes?.allowed).toEqual(['standard', 'xforge'])
    expect(result.effective.modes?.recommended).toBe('standard')
    expect(result.effective.features?.enabled).toEqual(['rag'])
    // 没有 project.toml 时不得出现 project 相关 warning
    expect(result.warnings.filter(w => /project/i.test(w))).toEqual([])
  })

  it('effective 不退化为裸 user config：projectExtras 与 effective 同时可见', () => {
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
default = "plan"
max_parallel_subagents = 5

[features]
enabled = ["web", "memory"]

[modes]
allowed = ["xforge"]
recommended = "xforge"
`,
      'utf-8',
    )

    const result = loadResolvedConfig(ws.projectDir, {
      configManager: new ConfigManager(ws.userDir),
    })

    // effective 必须反映 project 覆盖（防止回潮到 "只透传 projectExtras"）
    expect(result.effective.agent?.default).toBe('plan')
    expect(result.effective.agent?.maxParallelSubagents).toBe(5)
    expect(result.effective.features?.enabled).toEqual(['web', 'memory'])
    expect(result.effective.modes?.allowed).toEqual(['xforge'])
    expect(result.effective.modes?.recommended).toBe('xforge')

    // projectExtras 继续承载原始 snake_case 结构（保持向后兼容）
    expect(result.projectExtras?.agent?.default).toBe('plan')
    expect(result.projectExtras?.agent?.max_parallel_subagents).toBe(5)
  })
})
