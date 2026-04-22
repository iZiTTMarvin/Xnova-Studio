// src/config/legacy-migration.ts
/**
 * Phase 2 · Task B — legacy `config.json` → `config.toml` 安全迁移
 *
 * 规范来源：.trellis/spec/backend/config-toml-migration.md · §3 迁移规则
 *
 * 关键硬约束：
 * - `config.toml` 已存在 → 绝不覆盖（fallback：'config.toml already exists'）
 * - `config.json` 无法解析 → 绝不写 TOML、绝不动 JSON
 * - TOML 写入失败 → 保留原 JSON，返回明确错误
 * - 任一失败路径都必须带 reason，禁止 silent fallback
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { runtimeToTomlUser } from './toml/field-mapping.js'
import { stringifyToml } from './toml/index.js'
import type { CCodeConfig } from './config-manager.js'

/** 迁移结果 — 与 spec §2 `MigrationResult` 语义对齐 */
export interface MigrationResult {
  /** 是否真实产生了 TOML 文件 */
  success: boolean
  /** 成功时指向新生成的 config.toml 绝对路径 */
  writtenPath?: string
  /** 迁移期间 legacy JSON 绝对路径（保留，不被删除或覆盖） */
  keptLegacyPath?: string
  /** 失败时的简短原因（用于 UI / logger 展示） */
  error?: string
  /** 失败时采取的回退策略说明 */
  fallback?: string
}

interface MigrateOptions {
  /** 配置目录，默认 `~/.xnovacode/`（由调用方决定） */
  baseDir: string
}

function resolvePaths(baseDir: string): {
  tomlPath: string
  jsonPath: string
} {
  return {
    tomlPath: join(baseDir, 'config.toml'),
    jsonPath: join(baseDir, 'config.json'),
  }
}

/**
 * 把 legacy `config.json` 安全迁移成 `config.toml`
 *
 * 调用语义：**幂等**。
 * - 调用者无须自行判断 TOML 是否已存在；本函数会自行短路并返回 fallback。
 * - 任何失败不会产生部分写入（即便 TOML 半落盘后也不接着删 JSON）。
 */
export function migrateLegacyJsonToToml(
  baseDir: string,
): MigrationResult {
  const opts: MigrateOptions = { baseDir }
  const { tomlPath, jsonPath } = resolvePaths(opts.baseDir)

  // 1) TOML 已存在：无条件短路，避免覆盖用户新编辑的 TOML
  if (existsSync(tomlPath)) {
    const base: MigrationResult = {
      success: false,
      fallback: 'config.toml already exists; skipping migration',
    }
    if (existsSync(jsonPath)) base.keptLegacyPath = jsonPath
    return base
  }

  // 2) legacy JSON 不存在：无可迁
  if (!existsSync(jsonPath)) {
    return {
      success: false,
      fallback: 'no legacy json to migrate',
    }
  }

  // 3) 读取 + 解析 legacy JSON
  let legacy: CCodeConfig
  try {
    const raw = readFileSync(jsonPath, 'utf-8')
    legacy = JSON.parse(raw) as CCodeConfig
  } catch (err) {
    return {
      success: false,
      error: `failed to parse legacy config.json: ${
        err instanceof Error ? err.message : String(err)
      }`,
      fallback: 'kept legacy json untouched',
      keptLegacyPath: jsonPath,
    }
  }

  // 4) shape 变换：camelCase → snake_case
  let tomlText: string
  try {
    const tomlObject = runtimeToTomlUser(legacy)
    tomlText = stringifyToml(tomlObject)
  } catch (err) {
    return {
      success: false,
      error: `failed to build toml payload: ${
        err instanceof Error ? err.message : String(err)
      }`,
      fallback: 'kept legacy json untouched',
      keptLegacyPath: jsonPath,
    }
  }

  // 5) 写入 TOML；任何写入错误不动 JSON
  try {
    mkdirSync(dirname(tomlPath), { recursive: true })
    writeFileSync(tomlPath, tomlText, 'utf-8')
  } catch (err) {
    return {
      success: false,
      error: `failed to write config.toml: ${
        err instanceof Error ? err.message : String(err)
      }`,
      fallback: 'kept legacy json untouched',
      keptLegacyPath: jsonPath,
    }
  }

  return {
    success: true,
    writtenPath: tomlPath,
    keptLegacyPath: jsonPath,
  }
}
