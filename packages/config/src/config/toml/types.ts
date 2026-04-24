// src/config/toml/types.ts
/**
 * Phase 2 · Task A — config.toml 与 project.toml 的 schema 类型骨架
 *
 * 字段事实源：
 * - user 配置：cli/src/config/config-manager.ts 中 `CCodeConfig` / `ProviderConfig` / `MemoryConfig`
 * - project 配置：.trellis/spec/backend/config-toml-migration.md 第 2 节 Signatures
 *
 * 命名策略：
 * - TOML 文件内使用 snake_case（TOML 惯例）
 * - 运行时 `CCodeConfig` 仍保留 camelCase，不在本 Task 内做字段 rename
 *   （避免借迁移夹带语义变更，专项规范明确禁止）
 * - TOML ↔ runtime 的字段名映射放在后续 Task（legacy migration / settings writeback）
 */

/** 单个 provider 的 TOML schema */
export interface ProviderConfigToml {
  api_key: string
  base_url?: string
  protocol?: 'anthropic' | 'openai'
  models: string[]
  vision_models?: string[]
}

/** Embedding 服务 TOML schema */
export interface EmbeddingConfigToml {
  api_key?: string
  base_url?: string
  model?: string
  dimension?: number
}

/** Memory 模块 TOML schema */
export interface MemoryConfigToml {
  enabled?: boolean
  embedding?: EmbeddingConfigToml
}

/** 用户级 Agent 默认值（不重叠项目级字段） */
export interface UserAgentDefaults {
  default?: string
  max_parallel_subagents?: number
}

/** 用户级 mode 配置 */
export interface UserModeConfig {
  allowed?: Array<'standard' | 'xforge'>
  recommended?: 'standard' | 'xforge'
}

/** 用户级 feature 开关 */
export interface UserFeatureConfig {
  enabled?: string[]
}

/**
 * 用户级 `~/.xnovacode/config.toml` 顶层 schema
 *
 * 除 providers / memory / agent / modes / features 外，还兼容顶层标量字段，
 * 以便从现有 config.json 平滑迁移（字段保持一致，仅格式变更）。
 */
export interface UserConfigToml {
  default_provider?: string
  default_model?: string
  sub_agent_model?: string
  status_bar?: boolean
  providers?: Record<string, ProviderConfigToml>
  memory?: MemoryConfigToml
  agent?: UserAgentDefaults
  modes?: UserModeConfig
  features?: UserFeatureConfig
}

/**
 * 项目级 `.xnovacode/project.toml` schema
 *
 * Phase 2 最小字段集：
 * - agent.default / agent.max_parallel_subagents
 * - features.enabled
 * - modes.allowed / modes.recommended
 *
 * 明确不允许把 project.toml 当作“第二份用户配置”。
 */
export interface ProjectConfigToml {
  agent?: {
    default?: string
    max_parallel_subagents?: number
  }
  features?: {
    enabled?: string[]
  }
  modes?: {
    allowed?: Array<'standard' | 'xforge'>
    recommended?: 'standard' | 'xforge'
  }
}
