// src/config/config-manager.ts
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { migrateLegacyJsonToToml } from './legacy-migration.js'
import {
  parseToml,
  stringifyToml,
  TomlParseError,
  TomlValidationError,
  validateUserConfigToml,
} from './toml/index.js'
import { runtimeToTomlUser, tomlToRuntimeUser } from './toml/field-mapping.js'

export interface ProviderConfig {
  apiKey: string
  baseURL?: string
  /** 协议类型：anthropic 原生 或 openai 兼容（默认 openai） */
  protocol?: 'anthropic' | 'openai'
  models: string[]
  /** 支持多模态图片理解的模型子集（models 的子集），为空或不填 = 全部不支持 */
  visionModels?: string[]
}

export interface EmbeddingConfig {
  apiKey?: string
  baseURL?: string
  model?: string
  dimension?: number
}

export interface MemoryConfig {
  enabled?: boolean
  embedding?: EmbeddingConfig
}

/**
 * 运行时 Agent 默认值（snake_case 的 TOML `[agent]` 映射到 camelCase）
 *
 * 用户级 `~/.xnovacode/config.toml` 与项目级 `.xnovacode/project.toml` 共用该 shape；
 * 合并由 `resolver.ts` 按 `project > user > builtin` 规则完成。
 */
export interface AgentDefaults {
  /** 默认 Agent 名（非 provider 名） */
  default?: string
  /** SubAgent 并发上限 */
  maxParallelSubagents?: number
}

/** 运行时模式配置（`[modes]` → camelCase） */
export interface ModeConfig {
  allowed?: Array<'standard' | 'xforge'>
  recommended?: 'standard' | 'xforge'
}

/** 运行时特性开关（`[features]` → camelCase） */
export interface FeatureConfig {
  enabled?: string[]
}

export interface CCodeConfig {
  defaultProvider: string
  defaultModel: string
  /** 子 Agent 默认模型（不配则继承主 Agent 当前模型），Provider 自动从 providers 中查找 */
  subAgentModel?: string
  providers: Record<string, ProviderConfig | undefined>
  statusBar?: boolean
  /** 记忆系统配置（embedding 向量检索） */
  memory?: MemoryConfig
  /** Agent 默认值；user 级和 project 级在 resolver 中按 key merge */
  agent?: AgentDefaults
  /** 模式配置；project 整组覆盖 user */
  modes?: ModeConfig
  /** 特性开关；project 整组覆盖 user */
  features?: FeatureConfig
}

const DEFAULT_CONFIG: CCodeConfig = {
  defaultProvider: 'anthropic',
  defaultModel: 'claude-sonnet-4-6',
  providers: {
    anthropic: {
      apiKey: '',
      models: ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],
      visionModels: [],  // 默认关闭，用户手动开启
    },
    glm: {
      apiKey: '',
      baseURL: 'https://open.bigmodel.cn/api/coding/paas/v4',
      models: ['glm-4-flash', 'glm-4-air', 'glm-4'],
      visionModels: [],
    },
    openai: {
      apiKey: '',
      models: ['gpt-4o', 'gpt-4o-mini'],
      visionModels: [],
    },
  },
  statusBar: true,
}

/**
 * ConfigManager 读写顺序（Phase 2 之后）：
 *
 * 1. 若 `config.toml` 存在 → parse + validate + camelCase 映射 → 与默认值合并
 *    - 解析 / 校验失败：降级返回默认配置，并记录 warning；**不得覆盖原 TOML**
 * 2. 若仅 `config.json` 存在 → 读取 JSON，与默认值合并
 *    - 首次 load 后尝试一次 JSON → TOML 迁移；失败只记 warning
 * 3. 两者都不存在 → 写入默认 `config.toml`
 *
 * `load()` / `save()` 主写路径统一指向 TOML；JSON 仅保留作为历史 fallback。
 */
export class ConfigManager {
  readonly #baseDir: string
  readonly #tomlPath: string
  readonly #jsonPath: string
  #cached: CCodeConfig | null = null
  #cachedMtime: number = 0
  #cachedSource: 'toml' | 'json' | 'default' = 'default'
  #warnings: string[] = []
  #migrationAttempted: boolean = false

  constructor(baseDir: string = join(homedir(), '.xnovacode')) {
    this.#baseDir = baseDir
    this.#tomlPath = join(baseDir, 'config.toml')
    this.#jsonPath = join(baseDir, 'config.json')
  }

  /**
   * 返回最近一次 `load()` 期间累积的 warning 文本列表
   *
   * 用途：供 UI / logger 显式展示"降级发生在哪里"，杜绝静默降级。
   */
  getLastWarnings(): string[] {
    return [...this.#warnings]
  }

  /**
   * 暴露当前 ConfigManager 管理的两个文件路径
   *
   * 用途：resolver / UI 需要知道配置落在哪里（例如 SettingsPage 显示 source）。
   * 不读取文件；仅做路径透出，不承诺文件一定存在。
   */
  getPaths(): { baseDir: string; tomlPath: string; jsonPath: string } {
    return {
      baseDir: this.#baseDir,
      tomlPath: this.#tomlPath,
      jsonPath: this.#jsonPath,
    }
  }

  load(): CCodeConfig {
    this.#warnings = []

    // 优先尝试 TOML 分支
    if (existsSync(this.#tomlPath)) {
      return this.#loadFromToml()
    }

    // TOML 不存在，落回 legacy JSON
    if (existsSync(this.#jsonPath)) {
      const cfg = this.#loadFromLegacyJson()
      // 首次 load 时 best-effort 触发一次迁移；失败不影响返回
      if (!this.#migrationAttempted) {
        this.#migrationAttempted = true
        this.#tryMigrate()
      }
      return cfg
    }

    // 两者都不存在 → 首次初始化：写默认 TOML
    this.#ensureDir()
    this.#writeTomlFromConfig(DEFAULT_CONFIG)
    this.#cached = { ...DEFAULT_CONFIG }
    this.#cachedSource = 'toml'
    try {
      this.#cachedMtime = statSync(this.#tomlPath).mtimeMs
    } catch {
      /* 首次写入后 stat 失败，下次 load 会重新读取 */
    }
    return this.#cached
  }

  /** 检查指定 provider + model 是否支持图片理解 */
  isVisionEnabled(provider: string, model: string): boolean {
    const config = this.load()
    const prov = config.providers[provider]
    if (!prov?.visionModels?.length) return false
    // 双重检查：模型必须在 models 列表中，且在 visionModels 白名单中
    return prov.models.includes(model) && prov.visionModels.includes(model)
  }

  /**
   * 保存完整配置
   *
   * Phase 2 起主写路径统一指向 TOML；legacy `config.json` 不再作为写入目标，
   * 由迁移流程一次性处理（见 `legacy-migration.ts`）。
   */
  save(config: CCodeConfig): void {
    this.#ensureDir()
    this.#writeTomlFromConfig(config)
    this.#cached = config
    this.#cachedSource = 'toml'
    try {
      this.#cachedMtime = statSync(this.#tomlPath).mtimeMs
    } catch {
      /* 保存后 stat 失败，下次 load 会重新读取 */
    }
  }

  // ── 私有：TOML 分支 ───────────────────────────────────────────────────
  #loadFromToml(): CCodeConfig {
    try {
      const mtime = statSync(this.#tomlPath).mtimeMs
      if (
        this.#cached &&
        this.#cachedSource === 'toml' &&
        mtime === this.#cachedMtime
      ) {
        return this.#cached
      }
      this.#cachedMtime = mtime
    } catch {
      /* stat 失败则无缓存走读盘路径 */
    }

    let raw: string
    try {
      raw = readFileSync(this.#tomlPath, 'utf-8')
    } catch (err) {
      this.#warnings.push(
        `failed to read config.toml: ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
      return this.#fallbackToDefault()
    }

    try {
      const parsed = parseToml(raw)
      const validated = validateUserConfigToml(parsed)
      const partial = tomlToRuntimeUser(validated)
      const merged = this.#mergeWithDefault(partial)
      this.#cached = merged
      this.#cachedSource = 'toml'
      return merged
    } catch (err) {
      if (err instanceof TomlParseError) {
        this.#warnings.push(
          `config.toml parse error at line ${err.line}:${err.column} — ${err.message}`,
        )
      } else if (err instanceof TomlValidationError) {
        this.#warnings.push(
          `config.toml validation error at "${err.path}": ${err.message}`,
        )
      } else {
        this.#warnings.push(
          `config.toml load error: ${
            err instanceof Error ? err.message : String(err)
          }`,
        )
      }
      // spec 红线：损坏的 TOML 绝不被覆盖，也不能 silent reset
      return this.#fallbackToDefault()
    }
  }

  // ── 私有：legacy JSON 分支 ────────────────────────────────────────────
  #loadFromLegacyJson(): CCodeConfig {
    try {
      const mtime = statSync(this.#jsonPath).mtimeMs
      if (
        this.#cached &&
        this.#cachedSource === 'json' &&
        mtime === this.#cachedMtime
      ) {
        return this.#cached
      }
      this.#cachedMtime = mtime
    } catch {
      /* stat 失败则走无缓存读盘路径 */
    }

    try {
      const raw = readFileSync(this.#jsonPath, 'utf-8')
      const loaded = JSON.parse(raw) as Partial<CCodeConfig>
      const merged = this.#mergeWithDefault(loaded)
      this.#cached = merged
      this.#cachedSource = 'json'
      // Phase 2 fix-A 起：legacy `config.json` 仅作为迁移来源，
      // 即便缺字段也不得回写原 JSON（spec §3 红线：禁止 silent reset / silent rewrite）。
      // 缺失字段只在内存中按默认值合并，由 TOML 迁移一次性接管主写入。
      return merged
    } catch (err) {
      this.#warnings.push(
        `failed to load legacy config.json: ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
      return this.#fallbackToDefault()
    }
  }

  #tryMigrate(): void {
    const result = migrateLegacyJsonToToml(this.#baseDir)
    if (!result.success) {
      // 迁移失败不阻断启动，但必须留下痕迹
      if (result.error) {
        this.#warnings.push(`legacy migration failed: ${result.error}`)
      }
      if (result.fallback) {
        this.#warnings.push(`legacy migration fallback: ${result.fallback}`)
      }
    }
  }

  // ── 私有：合并 / 写入 / fallback ──────────────────────────────────────
  #mergeWithDefault(partial: Partial<CCodeConfig>): CCodeConfig {
    // 浅合并一层 + providers 字典深合并，保持与 JSON 分支历史行为兼容
    const providers: Record<string, ProviderConfig | undefined> = {
      ...DEFAULT_CONFIG.providers,
      ...(partial.providers ?? {}),
    }
    return {
      ...DEFAULT_CONFIG,
      ...partial,
      providers,
    }
  }

  #fallbackToDefault(): CCodeConfig {
    this.#cached = { ...DEFAULT_CONFIG }
    this.#cachedSource = 'default'
    return this.#cached
  }

  #ensureDir(): void {
    mkdirSync(this.#baseDir, { recursive: true })
  }

  #writeTomlFromConfig(config: CCodeConfig): void {
    const payload = runtimeToTomlUser(config)
    writeFileSync(this.#tomlPath, stringifyToml(payload), 'utf-8')
  }
}

// 全局单例，使用默认路径 ~/.xnovacode/config.toml（legacy: config.json）
export const configManager = new ConfigManager()
