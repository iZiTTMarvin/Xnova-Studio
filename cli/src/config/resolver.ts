// src/config/resolver.ts
/**
 * Phase 2 · Task C + fix-A — 统一配置 resolver
 *
 * 规范来源：.trellis/spec/backend/config-toml-migration.md · §3 Contracts
 *
 * 职责：
 * - 读取项目级 `<cwd>/.xnovacode/project.toml`
 * - 按 `project > user > builtin` 合并得到 ResolvedConfig.effective
 * - 暴露 source 路径（userToml / projectToml / legacyJson），供 UI / observability 使用
 * - 累积 warning 通道（来自 ConfigManager 与 project.toml 损坏/字段错误）
 *
 * 合并规则（spec §3.merge）：
 * - 标量：project 覆盖 user 覆盖 builtin
 * - 对象：按 key merge（例如 `agent.default` 覆盖、`agent.maxParallelSubagents` 保留）
 * - 数组：project 整组替换 user（例如 `modes.allowed`、`features.enabled`）
 *
 * Phase 2 的 project.toml 只含 `agent` / `features` / `modes`，因此合并只影响
 * `CCodeConfig` 的这三个可选字段；provider / memory / defaultModel 等仍由 user 层决定。
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  ConfigManager,
  type AgentDefaults,
  type CCodeConfig,
  type FeatureConfig,
  type ModeConfig,
} from './config-manager.js'
import {
  parseToml,
  TomlParseError,
  TomlValidationError,
  validateProjectConfigToml,
  type ProjectConfigToml,
} from './toml/index.js'

/** 已解析配置的来源路径 — 对应 spec §2 `ResolvedConfig.source` */
export interface ResolvedConfigSource {
  userToml?: string
  projectToml?: string
  legacyJson?: string
}

/**
 * Resolver 输出
 *
 * - `effective`：运行时消费的 CCodeConfig，包含 project > user > builtin 合并后的最终值
 * - `projectExtras`：project.toml 原始 snake_case 结构（向后兼容；UI 可从此读原始字段）
 * - `source`：三个来源路径，用于 UI / observability
 * - `warnings`：累积的降级痕迹（user + project 两段）
 */
export interface ResolvedConfigResult {
  effective: CCodeConfig
  projectExtras?: ProjectConfigToml
  source: ResolvedConfigSource
  warnings: string[]
}

export interface LoadResolvedConfigOptions {
  /** 允许注入 ConfigManager（便于测试隔离 HOME 目录） */
  configManager?: ConfigManager
}

function resolveProjectTomlPath(cwd: string): string {
  return join(cwd, '.xnovacode', 'project.toml')
}

function loadProjectToml(
  projectTomlPath: string,
  warnings: string[],
): ProjectConfigToml | undefined {
  if (!existsSync(projectTomlPath)) return undefined

  let raw: string
  try {
    raw = readFileSync(projectTomlPath, 'utf-8')
  } catch (err) {
    warnings.push(
      `project.toml read error: ${
        err instanceof Error ? err.message : String(err)
      }`,
    )
    return undefined
  }

  try {
    const parsed = parseToml(raw)
    return validateProjectConfigToml(parsed)
  } catch (err) {
    if (err instanceof TomlParseError) {
      warnings.push(
        `project.toml parse error at line ${err.line}:${err.column} — ${err.message}`,
      )
    } else if (err instanceof TomlValidationError) {
      warnings.push(
        `project.toml validation error at "${err.path}": ${err.message}`,
      )
    } else {
      warnings.push(
        `project.toml load error: ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
    }
    // 损坏的 project.toml 绝不被当作空配置吞掉：返回 undefined 但 warning 已写入
    return undefined
  }
}

function detectUserSource(
  configManager: ConfigManager,
): Pick<ResolvedConfigSource, 'userToml' | 'legacyJson'> {
  const paths = configManager.getPaths()
  const out: Pick<ResolvedConfigSource, 'userToml' | 'legacyJson'> = {}
  if (existsSync(paths.tomlPath)) out.userToml = paths.tomlPath
  if (existsSync(paths.jsonPath)) out.legacyJson = paths.jsonPath
  return out
}

// ── merge 助手 ────────────────────────────────────────────────────────
//
// spec §3：标量覆盖 / 对象按 key merge / 数组整组覆盖
//
// project.toml 使用 snake_case schema，运行时用 camelCase；
// 这里只负责形状变换 + 合并，不做默认值填充。

function mergeAgent(
  userAgent: AgentDefaults | undefined,
  projectAgent: ProjectConfigToml['agent'],
): AgentDefaults | undefined {
  if (!userAgent && !projectAgent) return undefined
  const out: AgentDefaults = { ...(userAgent ?? {}) }
  if (projectAgent) {
    if (projectAgent.default !== undefined) out.default = projectAgent.default
    if (projectAgent.max_parallel_subagents !== undefined) {
      out.maxParallelSubagents = projectAgent.max_parallel_subagents
    }
  }
  return Object.keys(out).length > 0 ? out : undefined
}

function mergeModes(
  userModes: ModeConfig | undefined,
  projectModes: ProjectConfigToml['modes'],
): ModeConfig | undefined {
  if (!userModes && !projectModes) return undefined
  const out: ModeConfig = {}
  if (userModes?.allowed !== undefined) out.allowed = [...userModes.allowed]
  if (userModes?.recommended !== undefined) out.recommended = userModes.recommended
  if (projectModes) {
    // 数组整组覆盖
    if (projectModes.allowed !== undefined) {
      out.allowed = [...projectModes.allowed]
    }
    if (projectModes.recommended !== undefined) {
      out.recommended = projectModes.recommended
    }
  }
  return Object.keys(out).length > 0 ? out : undefined
}

function mergeFeatures(
  userFeatures: FeatureConfig | undefined,
  projectFeatures: ProjectConfigToml['features'],
): FeatureConfig | undefined {
  if (!userFeatures && !projectFeatures) return undefined
  const out: FeatureConfig = {}
  if (userFeatures?.enabled !== undefined) out.enabled = [...userFeatures.enabled]
  if (projectFeatures?.enabled !== undefined) {
    // 数组整组覆盖
    out.enabled = [...projectFeatures.enabled]
  }
  return Object.keys(out).length > 0 ? out : undefined
}

/**
 * 加载并合并配置（project > user > builtin）
 *
 * @param cwd 当前工作目录，用于定位 `.xnovacode/project.toml`
 * @param options 可选注入（如测试用隔离的 ConfigManager）
 */
export function loadResolvedConfig(
  cwd: string,
  options: LoadResolvedConfigOptions = {},
): ResolvedConfigResult {
  const configManager = options.configManager ?? new ConfigManager()
  const warnings: string[] = []

  // 1) 先加载 user 层（ConfigManager 内部已负责 TOML 优先 / JSON 回退 / 迁移）
  const effectiveUser = configManager.load()
  warnings.push(...configManager.getLastWarnings())

  // 2) 加载 project.toml（可选）
  const projectTomlPath = resolveProjectTomlPath(cwd)
  const projectExtras = loadProjectToml(projectTomlPath, warnings)

  // 3) 合并 — spec §3：标量/对象按 key merge、数组整组覆盖
  //    provider / memory / defaultProvider 等 CCodeConfig 字段仅由 user 提供；
  //    agent / modes / features 允许 project 覆盖。
  const mergedAgent = mergeAgent(effectiveUser.agent, projectExtras?.agent)
  const mergedModes = mergeModes(effectiveUser.modes, projectExtras?.modes)
  const mergedFeatures = mergeFeatures(
    effectiveUser.features,
    projectExtras?.features,
  )

  const effective: CCodeConfig = { ...effectiveUser }
  if (mergedAgent !== undefined) effective.agent = mergedAgent
  else delete effective.agent
  if (mergedModes !== undefined) effective.modes = mergedModes
  else delete effective.modes
  if (mergedFeatures !== undefined) effective.features = mergedFeatures
  else delete effective.features

  // 4) 组装 source
  const sourcePaths = detectUserSource(configManager)
  const source: ResolvedConfigSource = {}
  if (sourcePaths.userToml) source.userToml = sourcePaths.userToml
  if (sourcePaths.legacyJson) source.legacyJson = sourcePaths.legacyJson
  if (existsSync(projectTomlPath)) source.projectToml = projectTomlPath

  const result: ResolvedConfigResult = {
    effective,
    source,
    warnings,
  }
  if (projectExtras !== undefined) result.projectExtras = projectExtras
  return result
}

/**
 * 主链路统一入口 — 返回 runtime camelCase 形状的 CCodeConfig。
 *
 * 等价于 `loadResolvedConfig(cwd, options).effective`，是 CLI / runtime 主链路
 * （pipe-runner、useChat、dispatch-agent、bootstrap 等）消费配置时的唯一入口。
 *
 * 使用它而非裸 `configManager.load()` 的理由：
 * - 保证运行时看到的就是 `project > user > builtin` 合并后的值
 * - 统一 warning 与 source 观测入口（若调用方需要完整上下文，使用 `loadResolvedConfig`）
 *
 * 注意：该函数会顺带通过 ConfigManager 做 legacy JSON → TOML 首次迁移。
 */
export function loadEffectiveRuntimeConfig(
  cwd: string,
  options: LoadResolvedConfigOptions = {},
): CCodeConfig {
  return loadResolvedConfig(cwd, options).effective
}
