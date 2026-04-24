// src/config/toml/index.ts
/**
 * TOML 子模块入口（barrel export）
 *
 * 对外只暴露契约 API：
 * - parser / serializer
 * - validator
 * - 错误类型
 * - schema 类型
 *
 * 禁止对外暴露内部辅助函数（例如 cursor 操作），
 * 以便后续替换实现时不影响上游调用。
 */

export { parseToml } from './parser.js'
export { stringifyToml } from './serializer.js'
export {
  validateUserConfigToml,
  validateProjectConfigToml,
} from './schema.js'
export { TomlParseError, TomlValidationError } from './errors.js'
export type {
  ProviderConfigToml,
  EmbeddingConfigToml,
  MemoryConfigToml,
  UserAgentDefaults,
  UserModeConfig,
  UserFeatureConfig,
  UserConfigToml,
  ProjectConfigToml,
} from './types.js'
