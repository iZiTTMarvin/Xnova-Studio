// src/core/__tests__/initializer.toml-first.test.ts
/**
 * Phase 2 fix-A — 启动初始化器的 TOML-first 契约
 *
 * 规范来源：
 * - .trellis/spec/backend/config-toml-migration.md · §3 Contracts / §4 Error Matrix
 * - docs/implement/phase2-config-migration.md · 完成标准 #1/#2/#4
 *
 * 关键契约：
 * - 全新目录：只生成 `config.toml`，不再自动生成 `config.json`
 * - 仅有合法 legacy `config.json`：触发安全迁移 → TOML 生成，JSON 保留原文件
 * - legacy `config.json` 损坏：**不**重写、**不**备份、**不**覆盖原文件，仅 warning
 * - `config.toml` 存在但损坏：**不**覆盖原 TOML，仅 warning
 * - initializer 可通过注入自定义 baseDir / projectDir 隔离测试环境
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
  readdirSync,
} from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { initialize } from '../initializer.js'

function makeWorkspace(): {
  root: string
  userDir: string
  projectDir: string
} {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const root = join(tmpdir(), `xnova-initializer-test-${stamp}`)
  const userDir = join(root, 'home', '.xnovacode')
  const projectDir = join(root, 'project')
  mkdirSync(userDir, { recursive: true })
  mkdirSync(projectDir, { recursive: true })
  return { root, userDir, projectDir }
}

describe('initializer — TOML-first 契约', () => {
  let ws: ReturnType<typeof makeWorkspace>

  beforeEach(() => {
    ws = makeWorkspace()
  })

  afterEach(() => {
    if (existsSync(ws.root)) rmSync(ws.root, { recursive: true, force: true })
  })

  it('全新目录：只生成 config.toml，不再自动生成 config.json', () => {
    const result = initialize({ userDir: ws.userDir, projectDir: ws.projectDir })

    // 主配置必须落在 TOML
    expect(existsSync(join(ws.userDir, 'config.toml'))).toBe(true)
    // 绝不允许 initializer 自动生成 legacy JSON
    expect(existsSync(join(ws.userDir, 'config.json'))).toBe(false)

    // 诊断结果应提到 TOML 被创建，而不是 JSON
    const createdJoined = result.created.join('\n')
    expect(createdJoined).toMatch(/config\.toml$/m)
    expect(createdJoined).not.toMatch(/config\.json$/m)
  })

  it('仅存在合法 legacy config.json：触发安全迁移并保留 JSON 原文件', () => {
    const legacyApiKey = 'sk-legacy-initializer'
    const legacyRaw = JSON.stringify({
      defaultProvider: 'anthropic',
      defaultModel: 'claude-sonnet-4-6',
      providers: {
        anthropic: { apiKey: legacyApiKey, models: ['claude-sonnet-4-6'] },
      },
    })
    writeFileSync(join(ws.userDir, 'config.json'), legacyRaw, 'utf-8')

    initialize({ userDir: ws.userDir, projectDir: ws.projectDir })

    // TOML 被生成；JSON 原封不动
    expect(existsSync(join(ws.userDir, 'config.toml'))).toBe(true)
    expect(readFileSync(join(ws.userDir, 'config.json'), 'utf-8')).toBe(legacyRaw)

    // TOML 内容承载原 apiKey（snake_case）
    const tomlText = readFileSync(join(ws.userDir, 'config.toml'), 'utf-8')
    expect(tomlText).toMatch(/api_key\s*=\s*"sk-legacy-initializer"/)
  })

  it('legacy config.json 损坏：不覆盖不重置不备份，warning 明确', () => {
    writeFileSync(join(ws.userDir, 'config.json'), '{ broken json !!!', 'utf-8')

    const result = initialize({ userDir: ws.userDir, projectDir: ws.projectDir })

    // 原 JSON 必须原样保留（任何 "备份 + 重置" 都是 silent reset 红线）
    expect(readFileSync(join(ws.userDir, 'config.json'), 'utf-8')).toBe(
      '{ broken json !!!',
    )
    // initializer 不得产生 .bak 备份文件
    const files = readdirSync(ws.userDir)
    expect(files.some(f => f.endsWith('.bak'))).toBe(false)
    // 既无迁移成功，也不产生默认 TOML 覆盖（损坏 JSON 无法迁移）
    // TOML 可能存在（ConfigManager 会在找不到任何配置后首次写默认）
    // 但这里 legacy JSON 存在，ConfigManager 不会写默认 TOML
    expect(existsSync(join(ws.userDir, 'config.toml'))).toBe(false)

    // warning 必须暴露解析失败或迁移失败的事实
    const warnText = result.warnings.join('\n')
    expect(warnText).toMatch(/config\.json|migration|legacy/i)
  })

  it('config.toml 存在但损坏：绝不覆盖原 TOML，warning 含 toml 关键词', () => {
    const brokenToml = `default_provider = \ninvalid line]`
    writeFileSync(join(ws.userDir, 'config.toml'), brokenToml, 'utf-8')

    const result = initialize({ userDir: ws.userDir, projectDir: ws.projectDir })

    // 文件必须原样保留
    expect(readFileSync(join(ws.userDir, 'config.toml'), 'utf-8')).toBe(
      brokenToml,
    )
    // 不生成备份
    const files = readdirSync(ws.userDir)
    expect(files.some(f => f.endsWith('.bak'))).toBe(false)

    // warning 必须可被 UI / logger 看到
    expect(result.warnings.join('\n')).toMatch(/toml/i)
  })

  it('initializer 不再把 config.json 当成主写入目标（即使存在 TOML）', () => {
    // TOML 已就绪，JSON 不存在
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

    initialize({ userDir: ws.userDir, projectDir: ws.projectDir })

    // 绝对不应当因启动而产生 JSON
    expect(existsSync(join(ws.userDir, 'config.json'))).toBe(false)
  })
})
