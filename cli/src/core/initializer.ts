// src/core/initializer.ts

/**
 * 启动初始化器 — 在 CLI 入口最早期执行，确保运行环境就绪。
 *
 * Phase 2 fix-A：TOML-first 改造
 * -------------------------------------------------------
 * 规范：
 * - `.trellis/spec/backend/config-toml-migration.md` · §3 迁移规则 / §4 错误矩阵
 * - `docs/implement/phase2-config-migration.md` · 完成标准 #1/#2/#5
 *
 * 职责：
 * 1. 确保用户级 `~/.xnovacode/` 目录存在
 * 2. 通过 `ConfigManager` 承担主配置落地：
 *    - 仅 TOML 存在：直接读取，不改写
 *    - 仅 legacy JSON 存在：首次 load 时安全迁移 → TOML，JSON 保留原文件
 *    - 两者都不存在：首次 load 写默认 `config.toml`（不再写 JSON）
 *    - TOML / JSON 损坏：**不**备份、**不**重置、**不**覆盖，仅 warning
 * 3. 确保 `.mcp.json` 模板存在（不影响主配置）
 * 4. 确保项目级 `.xnovacode/settings.local.json` 与 `hooks.json` 存在
 * 5. 启动诊断：基于已解析 config 检查当前 provider 的 apiKey（不再裸读 JSON）
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { ConfigManager } from '../config/config-manager.js'

/** `.mcp.json` 默认模板 — 空 mcpServers，独立于主配置 */
const DEFAULT_MCP_CONFIG = {
  mcpServers: {},
}

/** 项目级 `settings.local.json` 默认模板 — 空权限，遵循默认询问机制 */
const DEFAULT_LOCAL_SETTINGS = {
  permissions: {
    allow: [],
  },
}

/**
 * `hooks.json` 默认模板 — 内置 PostToolUse 验证 hook。
 *
 * 对 TypeScript 项目：write_file / edit_file 后自动跑 tsc --noEmit，
 * 诊断结果通过 additionalContext 注入 LLM 上下文，引导自动修正。
 *
 * 优先级：项目级 > 用户级（bootstrap.ts 按 plugin → project → user 顺序加载，
 * 同名 matcher 全部执行，不覆盖）。
 *
 * 用户可按项目语言自行修改检查命令（Python → ruff、Rust → cargo check 等）。
 */
const DEFAULT_HOOKS_CONFIG = {
  hooks: {
    PostToolUse: [
      {
        matcher: '^(write_file|edit_file)$',
        hooks: [
          {
            type: 'command',
            // TypeScript 项目：检测 tsconfig.json 存在才跑 tsc --noEmit
            command:
              'if [ -f tsconfig.json ]; then result=$(npx tsc --noEmit 2>&1 | head -30); if [ -n "$result" ]; then echo "{\\"additionalContext\\":\\"TypeScript check:\\n$result\\"}"; fi; fi',
            timeout: 20000,
          },
          {
            type: 'command',
            // Java 项目：检测 pom.xml（Maven）或 build.gradle（Gradle）存在才编译检查
            // Maven: mvn compile -q 静默编译，只输出错误
            // Gradle: gradle compileJava -q 静默编译
            command:
              'if [ -f pom.xml ]; then result=$(mvn compile -q 2>&1 | tail -30); if echo "$result" | grep -qi "error"; then echo "{\\"additionalContext\\":\\"Java Maven check:\\n$result\\"}"; fi; elif [ -f build.gradle ] || [ -f build.gradle.kts ]; then result=$(gradle compileJava -q 2>&1 | tail -30); if echo "$result" | grep -qi "error"; then echo "{\\"additionalContext\\":\\"Java Gradle check:\\n$result\\"}"; fi; fi',
            timeout: 60000,
          },
        ],
      },
    ],
  },
}

/** initializer 注入参数（测试隔离用） */
export interface InitializeOptions {
  /** 用户级配置目录，默认 `~/.xnovacode` */
  userDir?: string
  /** 项目级工作目录，默认 `process.cwd()` */
  projectDir?: string
}

export interface InitDiagnostic {
  /** 是否有配置问题需要警告用户 */
  warnings: string[]
  /** 初始化过程中创建了哪些文件 */
  created: string[]
}

/**
 * 执行启动初始化，返回诊断信息。
 *
 * 幂等：已存在的文件不会被覆盖；损坏的主配置也绝不被 silent reset。
 */
export function initialize(options: InitializeOptions = {}): InitDiagnostic {
  const userDir = options.userDir ?? join(homedir(), '.xnovacode')
  const projectDir = options.projectDir ?? process.cwd()

  const warnings: string[] = []
  const created: string[] = []

  // 1. 确保用户级目录存在
  if (!existsSync(userDir)) {
    mkdirSync(userDir, { recursive: true })
  }

  // 2. 主配置落地 — 完全交给 ConfigManager
  //    - TOML 存在：读取（不改写）
  //    - 仅 JSON 存在：首次 load 触发安全迁移 → 生成 TOML，保留原 JSON
  //    - 两者都不存在：写默认 TOML
  //    - TOML / JSON 损坏：返回默认值 + warning；**不**改写原文件
  const tomlPath = join(userDir, 'config.toml')
  const jsonPath = join(userDir, 'config.json')
  const tomlExistedBefore = existsSync(tomlPath)
  const jsonExistedBefore = existsSync(jsonPath)

  const configManager = new ConfigManager(userDir)
  const loadedConfig = configManager.load()
  for (const warn of configManager.getLastWarnings()) {
    warnings.push(warn)
  }

  // 哪些 TOML 是本次 initialize 新生成的？
  // - 原本不存在，现在存在：由 ConfigManager 的首次写默认 / 首次迁移产生
  if (!tomlExistedBefore && existsSync(tomlPath)) {
    created.push(tomlPath)
  }
  // 主配置不再写 JSON；legacy JSON 若原本存在，也必须原样保留（ConfigManager 遵守）
  // 这里不把 jsonPath 加入 created，即使 initializer 不再生成它
  void jsonExistedBefore // 保留变量以表达意图；eslint no-unused-vars 友好

  // 3. 确保 .mcp.json 存在（独立于主配置）
  const mcpPath = join(userDir, '.mcp.json')
  if (!existsSync(mcpPath)) {
    writeFileSync(mcpPath, JSON.stringify(DEFAULT_MCP_CONFIG, null, 2), 'utf-8')
    created.push(mcpPath)
  }

  // 4. 确保项目级 .xnovacode/settings.local.json 存在
  const projectCcodeDir = join(projectDir, '.xnovacode')
  const localSettingsPath = join(projectCcodeDir, 'settings.local.json')
  if (!existsSync(localSettingsPath)) {
    if (!existsSync(projectCcodeDir)) {
      mkdirSync(projectCcodeDir, { recursive: true })
    }
    writeFileSync(
      localSettingsPath,
      JSON.stringify(DEFAULT_LOCAL_SETTINGS, null, 2),
      'utf-8',
    )
    created.push(localSettingsPath)
  }

  // 5. 确保 hooks.json 存在（项目级 + 用户级）
  //    bootstrap 加载顺序：plugin → project → user，规则叠加执行。
  //    项目级放完整默认规则（tsc 检查等），用户级放空模板（避免重复执行）。
  const projectHooksPath = join(projectCcodeDir, 'hooks.json')
  if (!existsSync(projectHooksPath)) {
    if (!existsSync(projectCcodeDir)) {
      mkdirSync(projectCcodeDir, { recursive: true })
    }
    writeFileSync(
      projectHooksPath,
      JSON.stringify(DEFAULT_HOOKS_CONFIG, null, 2),
      'utf-8',
    )
    created.push(projectHooksPath)
  }
  const userHooksPath = join(userDir, 'hooks.json')
  if (!existsSync(userHooksPath)) {
    // 用户级为空模板，避免和项目级重复执行。
    writeFileSync(userHooksPath, JSON.stringify({ hooks: {} }, null, 2), 'utf-8')
    created.push(userHooksPath)
  }

  // 6. 启动诊断：基于 loaded config 检查当前 provider 的 apiKey
  //    不再裸读 JSON —— 否则就跨过了 ConfigManager 的 TOML 主路径。
  const providerName = loadedConfig.defaultProvider
  if (providerName) {
    const providerCfg = loadedConfig.providers[providerName]
    if (!providerCfg) {
      warnings.push(`当前 provider "${providerName}" 未在 providers 中配置`)
    } else if (!providerCfg.apiKey) {
      // 提示用户操作真实写入目标：TOML 优先；若仅存在 legacy JSON 也指出
      const paths = configManager.getPaths()
      const hint = existsSync(paths.tomlPath)
        ? paths.tomlPath
        : existsSync(paths.jsonPath)
          ? paths.jsonPath
          : paths.tomlPath
      warnings.push(
        `当前 provider "${providerName}" 的 apiKey 为空，请在 ${hint} 中配置`,
      )
    }
  }

  return { warnings, created }
}
