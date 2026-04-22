// src/config/settings-contract.ts
/**
 * Phase 2 · Task D — 设置页 ↔ 运行时配置的统一 API 契约
 *
 * 设计目的：
 * - 把 HTTP 层（`cli/src/server/dashboard/api.ts`）对配置读写的细节下沉到纯函数
 * - 便于测试：只依赖 `ConfigManager`，无需起 server
 * - 让前端能看到 source / warnings，避免"保存后到底写到哪"这种不可见的问题
 *
 * 契约：
 * - 读取响应：`{ config, source, warnings }`
 * - 保存响应：`{ success, provider, model, source, warnings, error? }`
 * - `source` 与 `resolver.ts` 同形（userToml / projectToml / legacyJson）
 *   Task D 不处理 projectToml，仅由 resolver 专管，避免 Settings 提前承担 project 读写责任
 */

import { existsSync } from 'node:fs'
import { ConfigManager, type CCodeConfig } from './config-manager.js'

export interface SettingsSource {
  userToml?: string
  legacyJson?: string
}

export interface SettingsReadResponse {
  config: CCodeConfig
  source: SettingsSource
  warnings: string[]
}

export interface SettingsSaveResponse {
  success: boolean
  provider: string
  model: string
  source: SettingsSource
  warnings: string[]
  error?: string
}

function describeSource(manager: ConfigManager): SettingsSource {
  const paths = manager.getPaths()
  const out: SettingsSource = {}
  if (existsSync(paths.tomlPath)) out.userToml = paths.tomlPath
  if (existsSync(paths.jsonPath)) out.legacyJson = paths.jsonPath
  return out
}

/**
 * 构造 `GET /api/settings` 响应
 *
 * 语义：只读；绝不因"读"产生写入以外的副作用
 * （ConfigManager 内部在首次 load 时可能触发 legacy 迁移，这属于已知且必要的写入）。
 */
export function buildSettingsReadResponse(
  manager: ConfigManager,
): SettingsReadResponse {
  const config = manager.load()
  return {
    config,
    source: describeSource(manager),
    warnings: manager.getLastWarnings(),
  }
}

/**
 * 构造 `POST /api/settings/save` 响应
 *
 * 语义：
 * - 主写路径统一为 TOML（由 `ConfigManager.save()` 保证）
 * - 写入失败：返回 `success: false, error: ...`，**绝不吞错**，source 指向当前真实状态
 * - 成功：返回新的 provider / model（供广播给 CLI 客户端使用）
 */
export function buildSettingsSaveResponse(
  manager: ConfigManager,
  nextConfig: CCodeConfig,
): SettingsSaveResponse {
  const provider = String(nextConfig.defaultProvider ?? '')
  const model = String(nextConfig.defaultModel ?? '')
  try {
    manager.save(nextConfig)
    return {
      success: true,
      provider,
      model,
      source: describeSource(manager),
      warnings: manager.getLastWarnings(),
    }
  } catch (err) {
    return {
      success: false,
      provider,
      model,
      source: describeSource(manager),
      warnings: manager.getLastWarnings(),
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
