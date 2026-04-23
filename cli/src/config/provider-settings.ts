import { existsSync } from 'node:fs'
import type { CCodeConfig, ConfigManager, ProviderConfig } from './config-manager.js'
import { buildSettingsSaveResponse, type SettingsSource } from './settings-contract.js'
import { loadResolvedConfig } from './resolver.js'

export interface ProviderSettingsProviderDraft {
  id: string
  apiKey: string
  baseURL: string | null
  protocol: 'anthropic' | 'openai'
  models: string[]
  visionModels: string[]
}

export interface ProviderSettingsEditableConfig {
  defaultProvider: string
  defaultModel: string
  subAgentModel: string | null
  providers: ProviderSettingsProviderDraft[]
}

export interface ProviderSettingsSnapshot {
  editableConfig: ProviderSettingsEditableConfig
  effectiveDefaults: {
    defaultProvider: string
    defaultModel: string
  }
  source: SettingsSource & { projectToml?: string }
  warnings: string[]
}

export interface SaveProviderSettingsInput extends ProviderSettingsEditableConfig {}

export interface SaveProviderSettingsResult {
  success: boolean
  snapshot?: ProviderSettingsSnapshot
  error?: string
}

export interface ProviderConnectionTestInput {
  providerId: string
  config: ProviderSettingsProviderDraft
  model?: string | null
}

export interface ProviderConnectionTestResult {
  success: boolean
  providerId: string
  model?: string
  durationMs?: number
  error?: string
}

export interface ReadProviderSettingsOptions {
  configManager: Pick<ConfigManager, 'load' | 'getLastWarnings' | 'getPaths'>
}

export interface SaveProviderSettingsOptions {
  projectPath?: string | null
  configManager: Pick<ConfigManager, 'load' | 'getLastWarnings' | 'getPaths' | 'save'>
}

export interface TestProviderConnectionOptions {
  runConnection?: (input: {
    providerId: string
    config: ProviderSettingsProviderDraft
    model: string
  }) => Promise<{ model: string; durationMs: number }>
}

function normalizeNullableString(value: string | null | undefined): string | undefined {
  const normalized = value?.trim()
  return normalized ? normalized : undefined
}

function toProviderDraft(id: string, provider: ProviderConfig | undefined): ProviderSettingsProviderDraft {
  return {
    id,
    apiKey: provider?.apiKey ?? '',
    baseURL: provider?.baseURL ?? null,
    protocol:
      provider?.protocol ??
      (id === 'anthropic' ? 'anthropic' : 'openai'),
    models: [...(provider?.models ?? [])],
    visionModels: [...(provider?.visionModels ?? [])],
  }
}

function toEditableConfig(config: CCodeConfig): ProviderSettingsEditableConfig {
  return {
    defaultProvider: config.defaultProvider,
    defaultModel: config.defaultModel,
    subAgentModel: config.subAgentModel ?? null,
    providers: Object.entries(config.providers).map(([id, provider]) =>
      toProviderDraft(id, provider),
    ),
  }
}

function listToProviderRecord(
  providers: ProviderSettingsProviderDraft[],
): Record<string, ProviderConfig | undefined> {
  const record: Record<string, ProviderConfig | undefined> = {}

  for (const provider of providers) {
    const id = provider.id.trim()
    const nextProvider: ProviderConfig = {
      apiKey: provider.apiKey,
      protocol: provider.protocol,
      models: [...provider.models],
      visionModels: provider.visionModels.filter((model) =>
        provider.models.includes(model),
      ),
    }
    const baseURL = normalizeNullableString(provider.baseURL)
    if (baseURL) {
      nextProvider.baseURL = baseURL
    }
    record[id] = nextProvider
  }

  return record
}

function describeUserSource(
  manager: Pick<ConfigManager, 'getPaths'>,
): SettingsSource {
  const paths = manager.getPaths()
  const out: SettingsSource = {}
  if (existsSync(paths.tomlPath)) out.userToml = paths.tomlPath
  if (existsSync(paths.jsonPath)) out.legacyJson = paths.jsonPath
  return out
}

function validateProviderDrafts(
  input: SaveProviderSettingsInput,
): string | null {
  if (!input.defaultProvider.trim()) {
    return 'defaultProvider 不能为空'
  }
  if (!input.defaultModel.trim()) {
    return 'defaultModel 不能为空'
  }

  const ids = new Set<string>()
  for (const provider of input.providers) {
    const id = provider.id.trim()
    if (!id) {
      return 'provider.id 不能为空'
    }
    if (ids.has(id)) {
      return `provider.id "${id}" 重复`
    }
    ids.add(id)
  }

  if (!ids.has(input.defaultProvider.trim())) {
    return `defaultProvider "${input.defaultProvider}" 不存在于 providers 中`
  }

  return null
}

function selectModelForTest(input: ProviderConnectionTestInput): string {
  const requestedModel = input.model?.trim()
  if (requestedModel && input.config.models.includes(requestedModel)) {
    return requestedModel
  }

  return input.config.models[0] ?? ''
}

async function runProviderConnectionProbe(input: {
  providerId: string
  config: ProviderSettingsProviderDraft
  model: string
}): Promise<{ model: string; durationMs: number }> {
  const [{ AnthropicProvider }, { OpenAICompatProvider }, { ProviderWrapper }] =
    await Promise.all([
      import('../providers/anthropic.js'),
      import('../providers/openai-compat.js'),
      import('../providers/wrapper.js'),
    ])

  const cfg = {
    apiKey: input.config.apiKey,
    models: input.config.models,
    ...(normalizeNullableString(input.config.baseURL)
      ? { baseURL: normalizeNullableString(input.config.baseURL)! }
      : {}),
  }

  const raw =
    input.config.protocol === 'anthropic'
      ? new AnthropicProvider(input.providerId, cfg)
      : new OpenAICompatProvider(input.providerId, cfg)
  const llm = new ProviderWrapper(raw)
  const startTime = Date.now()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)

  let gotText = false
  let gotDone = false
  let streamError = ''

  try {
    for await (const chunk of llm.chat({
      model: input.model,
      messages: [{ role: 'user', content: 'hi' }],
      maxTokens: 32,
      signal: controller.signal,
    })) {
      if (chunk.type === 'text' && chunk.text) {
        gotText = true
      }
      if (chunk.type === 'error') {
        streamError = chunk.error ?? '未知流错误'
      }
      if (chunk.type === 'done') {
        gotDone = true
      }
    }
  } finally {
    clearTimeout(timeout)
  }

  if (streamError) {
    throw new Error(streamError)
  }
  if (!gotText && !gotDone) {
    throw new Error('未收到有效响应')
  }

  return {
    model: input.model,
    durationMs: Date.now() - startTime,
  }
}

export function readProviderSettingsSnapshot(
  projectPath: string | null,
  options: ReadProviderSettingsOptions,
): ProviderSettingsSnapshot {
  const editableConfig = toEditableConfig(options.configManager.load())

  if (!projectPath) {
    return {
      editableConfig,
      effectiveDefaults: {
        defaultProvider: editableConfig.defaultProvider,
        defaultModel: editableConfig.defaultModel,
      },
      source: describeUserSource(options.configManager),
      warnings: options.configManager.getLastWarnings(),
    }
  }

  const resolved = loadResolvedConfig(projectPath, {
    configManager: options.configManager as ConfigManager,
  })

  return {
    editableConfig,
    effectiveDefaults: {
      defaultProvider: resolved.effective.defaultProvider,
      defaultModel: resolved.effective.defaultModel,
    },
    source: resolved.source,
    warnings: resolved.warnings,
  }
}

export function saveProviderSettings(
  input: SaveProviderSettingsInput,
  options: SaveProviderSettingsOptions,
): SaveProviderSettingsResult {
  const validationError = validateProviderDrafts(input)
  if (validationError) {
    return {
      success: false,
      error: validationError,
    }
  }

  const current = options.configManager.load()
  const nextConfig: CCodeConfig = {
    ...current,
    defaultProvider: input.defaultProvider.trim(),
    defaultModel: input.defaultModel.trim(),
    providers: listToProviderRecord(input.providers),
  }

  const nextSubAgentModel = normalizeNullableString(input.subAgentModel)
  if (nextSubAgentModel) {
    nextConfig.subAgentModel = nextSubAgentModel
  } else if ('subAgentModel' in nextConfig) {
    delete nextConfig.subAgentModel
  }

  const result = buildSettingsSaveResponse(
    options.configManager as ConfigManager,
    nextConfig,
  )
  if (!result.success) {
    return {
      success: false,
      error: result.error ?? '保存失败',
    }
  }

  return {
    success: true,
    snapshot: readProviderSettingsSnapshot(options.projectPath ?? null, {
      configManager: options.configManager,
    }),
  }
}

export async function testProviderConnection(
  input: ProviderConnectionTestInput,
  options: TestProviderConnectionOptions = {},
): Promise<ProviderConnectionTestResult> {
  if (!input.config.apiKey || input.config.models.length === 0) {
    return {
      success: false,
      providerId: input.providerId,
      error: '需要填写 API Key 和至少一个模型',
    }
  }

  const model = selectModelForTest(input)
  if (!model) {
    return {
      success: false,
      providerId: input.providerId,
      error: '需要填写 API Key 和至少一个模型',
    }
  }

  const runConnection = options.runConnection ?? runProviderConnectionProbe

  try {
    const result = await runConnection({
      providerId: input.providerId,
      config: input.config,
      model,
    })
    return {
      success: true,
      providerId: input.providerId,
      model: result.model,
      durationMs: result.durationMs,
    }
  } catch (error) {
    return {
      success: false,
      providerId: input.providerId,
      model,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
