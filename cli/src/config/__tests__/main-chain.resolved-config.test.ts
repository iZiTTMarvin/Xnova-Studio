// src/config/__tests__/main-chain.resolved-config.test.ts
/**
 * Phase 2 fix-A — 主链路消费 resolved config 的契约
 *
 * 规范来源：
 * - .trellis/spec/backend/config-toml-migration.md · §3 读取优先级
 * - docs/implement/phase2-config-migration.md · 完成标准 #4（设置页与运行时消费同一套配置语义）
 *
 * 关键契约：
 * - 提供统一入口 `loadEffectiveRuntimeConfig(cwd, { configManager? })`：
 *   - 返回 `CCodeConfig`（运行时 camelCase 形状），等价于 `loadResolvedConfig(cwd).effective`
 *   - CLI / runtime 主链路（pipe-runner、useChat、dispatch-agent 等）必须走它
 *   - 禁止主链路再裸调 `configManager.load()` 作为最终运行时配置来源
 * - 入口调用后，project.toml 的 agent / modes / features 必须能被消费方看到
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  loadResolvedConfig,
  loadEffectiveRuntimeConfig,
} from '../resolver.js'
import { ConfigManager } from '../config-manager.js'

function makeWorkspace(): {
  root: string
  userDir: string
  projectDir: string
} {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const root = join(tmpdir(), `xnova-main-chain-${stamp}`)
  const userDir = join(root, 'home', '.xnovacode')
  const projectDir = join(root, 'project')
  mkdirSync(userDir, { recursive: true })
  mkdirSync(join(projectDir, '.xnovacode'), { recursive: true })
  return { root, userDir, projectDir }
}

describe('loadEffectiveRuntimeConfig — 主链路统一入口', () => {
  let ws: ReturnType<typeof makeWorkspace>

  beforeEach(() => {
    ws = makeWorkspace()
  })

  afterEach(() => {
    if (existsSync(ws.root)) rmSync(ws.root, { recursive: true, force: true })
  })

  it('返回值等价于 loadResolvedConfig(cwd).effective（单一事实源）', () => {
    writeFileSync(
      join(ws.userDir, 'config.toml'),
      `default_provider = "glm"
default_model = "glm-4"

[providers.glm]
api_key = "sk-user"
models = ["glm-4"]
`,
      'utf-8',
    )
    writeFileSync(
      join(ws.projectDir, '.xnovacode', 'project.toml'),
      `[agent]
default = "planner"
max_parallel_subagents = 4
`,
      'utf-8',
    )

    const manager1 = new ConfigManager(ws.userDir)
    const manager2 = new ConfigManager(ws.userDir)

    const effective = loadEffectiveRuntimeConfig(ws.projectDir, {
      configManager: manager1,
    })
    const fullResolved = loadResolvedConfig(ws.projectDir, {
      configManager: manager2,
    })

    // 运行时字段完全一致
    expect(effective.defaultProvider).toBe(fullResolved.effective.defaultProvider)
    expect(effective.defaultModel).toBe(fullResolved.effective.defaultModel)
    expect(effective.providers['glm']?.apiKey).toBe(
      fullResolved.effective.providers['glm']?.apiKey,
    )
    expect(effective.agent?.default).toBe(fullResolved.effective.agent?.default)
    expect(effective.agent?.maxParallelSubagents).toBe(
      fullResolved.effective.agent?.maxParallelSubagents,
    )
  })

  it('project.toml 存在时：入口返回的 runtime config 能看到 project 的 agent / modes / features', () => {
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
default = "reviewer"
max_parallel_subagents = 6

[features]
enabled = ["rag", "web"]

[modes]
allowed = ["standard", "xforge"]
recommended = "xforge"
`,
      'utf-8',
    )

    const runtime = loadEffectiveRuntimeConfig(ws.projectDir, {
      configManager: new ConfigManager(ws.userDir),
    })

    // 主链路消费方（pipe-runner / useChat / dispatch-agent）无需额外调用 resolver
    // 就能直接看到 project 覆盖的 agent / modes / features
    expect(runtime.agent?.default).toBe('reviewer')
    expect(runtime.agent?.maxParallelSubagents).toBe(6)
    expect(runtime.features?.enabled).toEqual(['rag', 'web'])
    expect(runtime.modes?.allowed).toEqual(['standard', 'xforge'])
    expect(runtime.modes?.recommended).toBe('xforge')

    // user 的 defaultProvider / defaultModel 仍然保留
    expect(runtime.defaultProvider).toBe('anthropic')
    expect(runtime.defaultModel).toBe('claude-sonnet-4-6')
  })

  it('project.toml 缺失：入口退化为 user + builtin，不得抛错、不得产生 project 相关 warning', () => {
    writeFileSync(
      join(ws.userDir, 'config.toml'),
      `default_provider = "openai"
default_model = "gpt-4o"

[providers.openai]
api_key = "sk-openai"
models = ["gpt-4o"]
`,
      'utf-8',
    )

    const runtime = loadEffectiveRuntimeConfig(ws.projectDir, {
      configManager: new ConfigManager(ws.userDir),
    })

    expect(runtime.defaultProvider).toBe('openai')
    expect(runtime.providers['openai']?.apiKey).toBe('sk-openai')
    // project-only 字段保持 undefined（不强写默认）
    expect(runtime.agent).toBeUndefined()
    expect(runtime.modes).toBeUndefined()
    expect(runtime.features).toBeUndefined()
  })
})
