// src/config/toml/field-mapping.ts
/**
 * Phase 2 · Task B — TOML snake_case ↔ runtime camelCase 双向映射
 *
 * 规范要求：迁移不借机做语义变更，只改格式（spec: config-toml-migration.md §2）。
 *
 * 设计要点：
 * - 不做默认值填充；未提供的字段保持 undefined（默认值由 resolver / ConfigManager 决定）
 * - 显式处理空字符串、空数组：不得被视作 undefined 而丢失
 * - 只做 shape transform；类型合法性由 schema validator 兜底
 *
 * 字段对应表：
 *   default_provider    ↔ defaultProvider
 *   default_model       ↔ defaultModel
 *   sub_agent_model     ↔ subAgentModel
 *   status_bar          ↔ statusBar
 *   providers.<n>.api_key       ↔ apiKey
 *   providers.<n>.base_url      ↔ baseURL
 *   providers.<n>.vision_models ↔ visionModels
 *   memory.embedding.api_key    ↔ apiKey
 *   memory.embedding.base_url   ↔ baseURL
 */

import type {
  AgentDefaults,
  CCodeConfig,
  EmbeddingConfig,
  FeatureConfig,
  MemoryConfig,
  ModeConfig,
  ProviderConfig,
} from '../config-manager.js'
import type {
  EmbeddingConfigToml,
  MemoryConfigToml,
  ProviderConfigToml,
  UserAgentDefaults,
  UserConfigToml,
  UserFeatureConfig,
  UserModeConfig,
} from './types.js'

function mapProviderTomlToRuntime(
  toml: ProviderConfigToml,
): ProviderConfig {
  const out: ProviderConfig = {
    apiKey: toml.api_key,
    models: toml.models,
  }
  if (toml.base_url !== undefined) out.baseURL = toml.base_url
  if (toml.protocol !== undefined) out.protocol = toml.protocol
  if (toml.vision_models !== undefined) out.visionModels = toml.vision_models
  return out
}

function mapProviderRuntimeToToml(
  runtime: ProviderConfig,
): ProviderConfigToml {
  const out: ProviderConfigToml = {
    api_key: runtime.apiKey,
    models: runtime.models,
  }
  if (runtime.baseURL !== undefined) out.base_url = runtime.baseURL
  if (runtime.protocol !== undefined) out.protocol = runtime.protocol
  if (runtime.visionModels !== undefined) {
    out.vision_models = runtime.visionModels
  }
  return out
}

function mapEmbeddingTomlToRuntime(
  toml: EmbeddingConfigToml,
): EmbeddingConfig {
  const out: EmbeddingConfig = {}
  if (toml.api_key !== undefined) out.apiKey = toml.api_key
  if (toml.base_url !== undefined) out.baseURL = toml.base_url
  if (toml.model !== undefined) out.model = toml.model
  if (toml.dimension !== undefined) out.dimension = toml.dimension
  return out
}

function mapEmbeddingRuntimeToToml(
  runtime: EmbeddingConfig,
): EmbeddingConfigToml {
  const out: EmbeddingConfigToml = {}
  if (runtime.apiKey !== undefined) out.api_key = runtime.apiKey
  if (runtime.baseURL !== undefined) out.base_url = runtime.baseURL
  if (runtime.model !== undefined) out.model = runtime.model
  if (runtime.dimension !== undefined) out.dimension = runtime.dimension
  return out
}

function mapMemoryTomlToRuntime(toml: MemoryConfigToml): MemoryConfig {
  const out: MemoryConfig = {}
  if (toml.enabled !== undefined) out.enabled = toml.enabled
  if (toml.embedding !== undefined) {
    out.embedding = mapEmbeddingTomlToRuntime(toml.embedding)
  }
  return out
}

function mapMemoryRuntimeToToml(runtime: MemoryConfig): MemoryConfigToml {
  const out: MemoryConfigToml = {}
  if (runtime.enabled !== undefined) out.enabled = runtime.enabled
  if (runtime.embedding !== undefined) {
    out.embedding = mapEmbeddingRuntimeToToml(runtime.embedding)
  }
  return out
}

// ── user 级 [agent] / [modes] / [features] 双向映射 ──
//
// 字段对应表：
//   agent.default                    ↔ agent.default（标量透传）
//   agent.max_parallel_subagents     ↔ agent.maxParallelSubagents
//   modes.allowed                    ↔ modes.allowed（数组透传）
//   modes.recommended                ↔ modes.recommended
//   features.enabled                 ↔ features.enabled

function mapAgentTomlToRuntime(toml: UserAgentDefaults): AgentDefaults {
  const out: AgentDefaults = {}
  if (toml.default !== undefined) out.default = toml.default
  if (toml.max_parallel_subagents !== undefined) {
    out.maxParallelSubagents = toml.max_parallel_subagents
  }
  return out
}

function mapAgentRuntimeToToml(runtime: AgentDefaults): UserAgentDefaults {
  const out: UserAgentDefaults = {}
  if (runtime.default !== undefined) out.default = runtime.default
  if (runtime.maxParallelSubagents !== undefined) {
    out.max_parallel_subagents = runtime.maxParallelSubagents
  }
  return out
}

function mapModesTomlToRuntime(toml: UserModeConfig): ModeConfig {
  const out: ModeConfig = {}
  if (toml.allowed !== undefined) out.allowed = [...toml.allowed]
  if (toml.recommended !== undefined) out.recommended = toml.recommended
  return out
}

function mapModesRuntimeToToml(runtime: ModeConfig): UserModeConfig {
  const out: UserModeConfig = {}
  if (runtime.allowed !== undefined) out.allowed = [...runtime.allowed]
  if (runtime.recommended !== undefined) out.recommended = runtime.recommended
  return out
}

function mapFeaturesTomlToRuntime(toml: UserFeatureConfig): FeatureConfig {
  const out: FeatureConfig = {}
  if (toml.enabled !== undefined) out.enabled = [...toml.enabled]
  return out
}

function mapFeaturesRuntimeToToml(runtime: FeatureConfig): UserFeatureConfig {
  const out: UserFeatureConfig = {}
  if (runtime.enabled !== undefined) out.enabled = [...runtime.enabled]
  return out
}

/**
 * TOML user 配置 → runtime 字段部分值
 *
 * 返回 `Partial<CCodeConfig>`：未提供的字段保持 undefined，
 * 由 ConfigManager / resolver 决定是否补默认值。
 */
export function tomlToRuntimeUser(
  toml: UserConfigToml,
): Partial<CCodeConfig> {
  const out: Partial<CCodeConfig> = {}
  if (toml.default_provider !== undefined) {
    out.defaultProvider = toml.default_provider
  }
  if (toml.default_model !== undefined) {
    out.defaultModel = toml.default_model
  }
  if (toml.sub_agent_model !== undefined) {
    out.subAgentModel = toml.sub_agent_model
  }
  if (toml.status_bar !== undefined) {
    out.statusBar = toml.status_bar
  }
  if (toml.providers !== undefined) {
    const providers: Record<string, ProviderConfig | undefined> = {}
    for (const name of Object.keys(toml.providers)) {
      providers[name] = mapProviderTomlToRuntime(toml.providers[name]!)
    }
    out.providers = providers
  }
  if (toml.memory !== undefined) {
    out.memory = mapMemoryTomlToRuntime(toml.memory)
  }
  if (toml.agent !== undefined) {
    out.agent = mapAgentTomlToRuntime(toml.agent)
  }
  if (toml.modes !== undefined) {
    out.modes = mapModesTomlToRuntime(toml.modes)
  }
  if (toml.features !== undefined) {
    out.features = mapFeaturesTomlToRuntime(toml.features)
  }
  return out
}

/**
 * runtime 配置 → TOML user schema
 *
 * 只负责 shape 变换：
 * - `providers[name] === undefined` 不会出现在输出（保持最小有效集）
 * - 空字符串 / 空数组完好保留
 */
export function runtimeToTomlUser(runtime: CCodeConfig): UserConfigToml {
  const out: UserConfigToml = {
    default_provider: runtime.defaultProvider,
    default_model: runtime.defaultModel,
  }
  if (runtime.subAgentModel !== undefined) {
    out.sub_agent_model = runtime.subAgentModel
  }
  if (runtime.statusBar !== undefined) {
    out.status_bar = runtime.statusBar
  }
  const providerEntries: Array<[string, ProviderConfigToml]> = []
  for (const name of Object.keys(runtime.providers)) {
    const provider = runtime.providers[name]
    if (provider === undefined) continue
    providerEntries.push([name, mapProviderRuntimeToToml(provider)])
  }
  if (providerEntries.length > 0) {
    const providers: Record<string, ProviderConfigToml> = {}
    for (const [name, toml] of providerEntries) providers[name] = toml
    out.providers = providers
  }
  if (runtime.memory !== undefined) {
    out.memory = mapMemoryRuntimeToToml(runtime.memory)
  }
  if (runtime.agent !== undefined) {
    out.agent = mapAgentRuntimeToToml(runtime.agent)
  }
  if (runtime.modes !== undefined) {
    out.modes = mapModesRuntimeToToml(runtime.modes)
  }
  if (runtime.features !== undefined) {
    out.features = mapFeaturesRuntimeToToml(runtime.features)
  }
  return out
}
