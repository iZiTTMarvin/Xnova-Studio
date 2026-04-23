import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ConfigManager } from '../config-manager.js'
import {
  readProviderSettingsSnapshot,
  saveProviderSettings,
  testProviderConnection,
} from '../provider-settings.js'

function makeWorkspace(): {
  root: string
  userDir: string
  projectDir: string
} {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const root = join(tmpdir(), `xnova-provider-settings-${stamp}`)
  const userDir = join(root, 'home', '.xnovacode')
  const projectDir = join(root, 'project')
  mkdirSync(userDir, { recursive: true })
  mkdirSync(join(projectDir, '.xnovacode'), { recursive: true })
  return { root, userDir, projectDir }
}

describe('provider settings service', () => {
  let ws: ReturnType<typeof makeWorkspace>

  beforeEach(() => {
    ws = makeWorkspace()
  })

  afterEach(() => {
    if (existsSync(ws.root)) {
      rmSync(ws.root, { recursive: true, force: true })
    }
  })

  it('读取 resolved config 时回显 effective default provider/model 与 source', () => {
    writeFileSync(
      join(ws.userDir, 'config.toml'),
      `default_provider = "anthropic"
default_model = "claude-sonnet-4-6"

[providers.anthropic]
api_key = "sk-ant"
models = ["claude-sonnet-4-6", "claude-opus-4-6"]
`,
      'utf-8',
    )
    writeFileSync(
      join(ws.projectDir, '.xnovacode', 'project.toml'),
      `[modes]
allowed = ["standard", "xforge"]
recommended = "xforge"
`,
      'utf-8',
    )

    const snapshot = readProviderSettingsSnapshot(ws.projectDir, {
      configManager: new ConfigManager(ws.userDir),
    })

    expect(snapshot.effectiveDefaults.defaultProvider).toBe('anthropic')
    expect(snapshot.effectiveDefaults.defaultModel).toBe('claude-sonnet-4-6')
    expect(snapshot.source.userToml).toBe(join(ws.userDir, 'config.toml'))
    expect(snapshot.source.projectToml).toBe(
      join(ws.projectDir, '.xnovacode', 'project.toml'),
    )
    expect(snapshot.editableConfig.providers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'anthropic',
        apiKey: 'sk-ant',
      }),
    ]))
  })

  it('保存 provider 草稿后只写 TOML，并保留无关 memory 配置', () => {
    writeFileSync(
      join(ws.userDir, 'config.toml'),
      `default_provider = "anthropic"
default_model = "claude-sonnet-4-6"

[providers.anthropic]
api_key = "sk-ant"
models = ["claude-sonnet-4-6"]

[memory]
enabled = true
`,
      'utf-8',
    )

    const result = saveProviderSettings(
      {
        defaultProvider: 'openai',
        defaultModel: 'gpt-4o',
        subAgentModel: 'gpt-4o-mini',
        providers: [
          {
            id: 'anthropic',
            apiKey: 'sk-ant',
            baseURL: null,
            protocol: 'anthropic',
            models: ['claude-sonnet-4-6'],
            visionModels: [],
          },
          {
            id: 'openai',
            apiKey: 'sk-openai',
            baseURL: null,
            protocol: 'openai',
            models: ['gpt-4o', 'gpt-4o-mini'],
            visionModels: ['gpt-4o'],
          },
        ],
      },
      {
        projectPath: ws.projectDir,
        configManager: new ConfigManager(ws.userDir),
      },
    )

    expect(result.success).toBe(true)
    expect(result.snapshot?.effectiveDefaults.defaultProvider).toBe('openai')
    expect(result.snapshot?.effectiveDefaults.defaultModel).toBe('gpt-4o')

    const tomlText = readFileSync(join(ws.userDir, 'config.toml'), 'utf-8')
    expect(tomlText).toContain('default_provider = "openai"')
    expect(tomlText).toContain('default_model = "gpt-4o"')
    expect(tomlText).toContain('[providers.openai]')
    expect(tomlText).toContain('sub_agent_model = "gpt-4o-mini"')
    expect(tomlText).toContain('[memory]')
    expect(tomlText).toContain('enabled = true')
    expect(existsSync(join(ws.userDir, 'config.json'))).toBe(false)
  })

  it('测试连通性会先校验必填字段，再透传 runner 结果', async () => {
    await expect(
      testProviderConnection({
        providerId: 'openai',
        config: {
          id: 'openai',
          apiKey: '',
          baseURL: null,
          protocol: 'openai',
          models: [],
          visionModels: [],
        },
      }),
    ).resolves.toEqual({
      success: false,
      providerId: 'openai',
      error: '需要填写 API Key 和至少一个模型',
    })

    const runConnection = vi.fn(async () => ({
      model: 'gpt-4o',
      durationMs: 16,
    }))

    await expect(
      testProviderConnection(
        {
          providerId: 'openai',
          config: {
            id: 'openai',
            apiKey: 'sk-openai',
            baseURL: null,
            protocol: 'openai',
            models: ['gpt-4o'],
            visionModels: [],
          },
        },
        { runConnection },
      ),
    ).resolves.toEqual({
      success: true,
      providerId: 'openai',
      model: 'gpt-4o',
      durationMs: 16,
    })
    expect(runConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: 'openai',
        model: 'gpt-4o',
      }),
    )
  })
})
