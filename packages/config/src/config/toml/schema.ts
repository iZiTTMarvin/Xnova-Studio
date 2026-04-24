// src/config/toml/schema.ts
/**
 * UserConfigToml / ProjectConfigToml 的运行期校验
 *
 * 设计原则：
 * - 禁止 silent fallback / silent reset：任何非法字段必须抛 TomlValidationError
 * - error.path 使用点分路径（providers.anthropic.api_key、memory.embedding.dimension …）
 * - 缺失的可选字段返回 undefined，不自动补默认值（默认值由 resolver 负责）
 * - 校验器只做“形状 / 枚举 / 正整数”等结构性校验；
 *   业务级合理性（例如 provider 下 models 至少一个）由后续 resolver / migration 任务负责
 */

import { TomlValidationError } from './errors.js'
import type {
  EmbeddingConfigToml,
  MemoryConfigToml,
  ProjectConfigToml,
  ProviderConfigToml,
  UserAgentDefaults,
  UserConfigToml,
  UserFeatureConfig,
  UserModeConfig,
} from './types.js'

const ALLOWED_MODES = ['standard', 'xforge'] as const
type AllowedMode = (typeof ALLOWED_MODES)[number]

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function assertString(value: unknown, path: string): string {
  if (typeof value !== 'string') {
    throw new TomlValidationError(
      `expected string, got ${describeType(value)}`,
      path,
    )
  }
  return value
}

function assertBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') {
    throw new TomlValidationError(
      `expected boolean, got ${describeType(value)}`,
      path,
    )
  }
  return value
}

function assertStringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value)) {
    throw new TomlValidationError(
      `expected array of string, got ${describeType(value)}`,
      path,
    )
  }
  value.forEach((item, idx) => {
    if (typeof item !== 'string') {
      throw new TomlValidationError(
        `expected string, got ${describeType(item)}`,
        `${path}[${idx}]`,
      )
    }
  })
  return value as string[]
}

function assertModeEnum(value: unknown, path: string): AllowedMode {
  const str = assertString(value, path)
  if (!ALLOWED_MODES.includes(str as AllowedMode)) {
    throw new TomlValidationError(
      `expected one of ${JSON.stringify(ALLOWED_MODES)}, got ${JSON.stringify(str)}`,
      path,
    )
  }
  return str as AllowedMode
}

function assertModeEnumArray(value: unknown, path: string): AllowedMode[] {
  if (!Array.isArray(value)) {
    throw new TomlValidationError(
      `expected array of mode enum, got ${describeType(value)}`,
      path,
    )
  }
  return value.map((item, idx) => assertModeEnum(item, `${path}[${idx}]`))
}

function describeType(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

function validateProvider(
  raw: unknown,
  path: string,
): ProviderConfigToml {
  if (!isPlainObject(raw)) {
    throw new TomlValidationError(
      `expected table, got ${describeType(raw)}`,
      path,
    )
  }
  const apiKey = assertString(raw.api_key, `${path}.api_key`)
  const models = assertStringArray(raw.models, `${path}.models`)
  const out: ProviderConfigToml = { api_key: apiKey, models }
  if (raw.base_url !== undefined) {
    out.base_url = assertString(raw.base_url, `${path}.base_url`)
  }
  if (raw.protocol !== undefined) {
    const p = assertString(raw.protocol, `${path}.protocol`)
    if (p !== 'anthropic' && p !== 'openai') {
      throw new TomlValidationError(
        `expected "anthropic" or "openai", got ${JSON.stringify(p)}`,
        `${path}.protocol`,
      )
    }
    out.protocol = p
  }
  if (raw.vision_models !== undefined) {
    out.vision_models = assertStringArray(
      raw.vision_models,
      `${path}.vision_models`,
    )
  }
  return out
}

function validateEmbedding(
  raw: unknown,
  path: string,
): EmbeddingConfigToml {
  if (!isPlainObject(raw)) {
    throw new TomlValidationError(
      `expected table, got ${describeType(raw)}`,
      path,
    )
  }
  const out: EmbeddingConfigToml = {}
  if (raw.api_key !== undefined) {
    out.api_key = assertString(raw.api_key, `${path}.api_key`)
  }
  if (raw.base_url !== undefined) {
    out.base_url = assertString(raw.base_url, `${path}.base_url`)
  }
  if (raw.model !== undefined) {
    out.model = assertString(raw.model, `${path}.model`)
  }
  if (raw.dimension !== undefined) {
    if (!isPositiveInteger(raw.dimension)) {
      throw new TomlValidationError(
        `expected positive integer, got ${JSON.stringify(raw.dimension)}`,
        `${path}.dimension`,
      )
    }
    out.dimension = raw.dimension
  }
  return out
}

function validateMemory(raw: unknown, path: string): MemoryConfigToml {
  if (!isPlainObject(raw)) {
    throw new TomlValidationError(
      `expected table, got ${describeType(raw)}`,
      path,
    )
  }
  const out: MemoryConfigToml = {}
  if (raw.enabled !== undefined) {
    out.enabled = assertBoolean(raw.enabled, `${path}.enabled`)
  }
  if (raw.embedding !== undefined) {
    out.embedding = validateEmbedding(raw.embedding, `${path}.embedding`)
  }
  return out
}

function validateUserAgent(
  raw: unknown,
  path: string,
): UserAgentDefaults {
  if (!isPlainObject(raw)) {
    throw new TomlValidationError(
      `expected table, got ${describeType(raw)}`,
      path,
    )
  }
  const out: UserAgentDefaults = {}
  if (raw.default !== undefined) {
    out.default = assertString(raw.default, `${path}.default`)
  }
  if (raw.max_parallel_subagents !== undefined) {
    if (!isPositiveInteger(raw.max_parallel_subagents)) {
      throw new TomlValidationError(
        `expected positive integer, got ${JSON.stringify(raw.max_parallel_subagents)}`,
        `${path}.max_parallel_subagents`,
      )
    }
    out.max_parallel_subagents = raw.max_parallel_subagents
  }
  return out
}

function validateUserModes(raw: unknown, path: string): UserModeConfig {
  if (!isPlainObject(raw)) {
    throw new TomlValidationError(
      `expected table, got ${describeType(raw)}`,
      path,
    )
  }
  const out: UserModeConfig = {}
  if (raw.allowed !== undefined) {
    out.allowed = assertModeEnumArray(raw.allowed, `${path}.allowed`)
  }
  if (raw.recommended !== undefined) {
    out.recommended = assertModeEnum(raw.recommended, `${path}.recommended`)
  }
  return out
}

function validateUserFeatures(
  raw: unknown,
  path: string,
): UserFeatureConfig {
  if (!isPlainObject(raw)) {
    throw new TomlValidationError(
      `expected table, got ${describeType(raw)}`,
      path,
    )
  }
  const out: UserFeatureConfig = {}
  if (raw.enabled !== undefined) {
    out.enabled = assertStringArray(raw.enabled, `${path}.enabled`)
  }
  return out
}

/**
 * 校验 `~/.xnovacode/config.toml` 解析结果
 *
 * 任何非法字段抛 {@link TomlValidationError}；缺失字段保持 undefined。
 */
export function validateUserConfigToml(raw: unknown): UserConfigToml {
  if (!isPlainObject(raw)) {
    throw new TomlValidationError(
      `expected top-level table, got ${describeType(raw)}`,
      '',
    )
  }
  const out: UserConfigToml = {}
  if (raw.default_provider !== undefined) {
    out.default_provider = assertString(
      raw.default_provider,
      'default_provider',
    )
  }
  if (raw.default_model !== undefined) {
    out.default_model = assertString(raw.default_model, 'default_model')
  }
  if (raw.sub_agent_model !== undefined) {
    out.sub_agent_model = assertString(
      raw.sub_agent_model,
      'sub_agent_model',
    )
  }
  if (raw.status_bar !== undefined) {
    out.status_bar = assertBoolean(raw.status_bar, 'status_bar')
  }
  if (raw.providers !== undefined) {
    if (!isPlainObject(raw.providers)) {
      throw new TomlValidationError(
        `expected table, got ${describeType(raw.providers)}`,
        'providers',
      )
    }
    const providers: Record<string, ProviderConfigToml> = {}
    for (const name of Object.keys(raw.providers)) {
      providers[name] = validateProvider(
        raw.providers[name],
        `providers.${name}`,
      )
    }
    out.providers = providers
  }
  if (raw.memory !== undefined) {
    out.memory = validateMemory(raw.memory, 'memory')
  }
  if (raw.agent !== undefined) {
    out.agent = validateUserAgent(raw.agent, 'agent')
  }
  if (raw.modes !== undefined) {
    out.modes = validateUserModes(raw.modes, 'modes')
  }
  if (raw.features !== undefined) {
    out.features = validateUserFeatures(raw.features, 'features')
  }
  return out
}

/**
 * 校验 `.xnovacode/project.toml` 解析结果
 *
 * 任何非法字段抛 {@link TomlValidationError}；缺失字段保持 undefined。
 */
export function validateProjectConfigToml(raw: unknown): ProjectConfigToml {
  if (!isPlainObject(raw)) {
    throw new TomlValidationError(
      `expected top-level table, got ${describeType(raw)}`,
      '',
    )
  }
  const out: ProjectConfigToml = {}
  if (raw.agent !== undefined) {
    if (!isPlainObject(raw.agent)) {
      throw new TomlValidationError(
        `expected table, got ${describeType(raw.agent)}`,
        'agent',
      )
    }
    const agent: NonNullable<ProjectConfigToml['agent']> = {}
    if (raw.agent.default !== undefined) {
      agent.default = assertString(raw.agent.default, 'agent.default')
    }
    if (raw.agent.max_parallel_subagents !== undefined) {
      if (!isPositiveInteger(raw.agent.max_parallel_subagents)) {
        throw new TomlValidationError(
          `expected positive integer, got ${JSON.stringify(raw.agent.max_parallel_subagents)}`,
          'agent.max_parallel_subagents',
        )
      }
      agent.max_parallel_subagents = raw.agent.max_parallel_subagents
    }
    out.agent = agent
  }
  if (raw.features !== undefined) {
    if (!isPlainObject(raw.features)) {
      throw new TomlValidationError(
        `expected table, got ${describeType(raw.features)}`,
        'features',
      )
    }
    const features: NonNullable<ProjectConfigToml['features']> = {}
    if (raw.features.enabled !== undefined) {
      features.enabled = assertStringArray(
        raw.features.enabled,
        'features.enabled',
      )
    }
    out.features = features
  }
  if (raw.modes !== undefined) {
    if (!isPlainObject(raw.modes)) {
      throw new TomlValidationError(
        `expected table, got ${describeType(raw.modes)}`,
        'modes',
      )
    }
    const modes: NonNullable<ProjectConfigToml['modes']> = {}
    if (raw.modes.allowed !== undefined) {
      modes.allowed = assertModeEnumArray(raw.modes.allowed, 'modes.allowed')
    }
    if (raw.modes.recommended !== undefined) {
      modes.recommended = assertModeEnum(
        raw.modes.recommended,
        'modes.recommended',
      )
    }
    out.modes = modes
  }
  return out
}
