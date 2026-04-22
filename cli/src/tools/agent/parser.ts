// src/tools/agent/parser.ts

/**
 * Agent frontmatter v1 parser / validator
 *
 * 文件格式（TOML frontmatter + Markdown 正文）：
 * ---
 * id = "my-agent"
 * name = "My Agent"
 * summary = "说明"
 * mode = "primary"
 * when_to_use = "描述"
 *
 * [tool_policy]
 * mode = "include"
 * tools = ["read_file", "grep"]
 * ---
 * Markdown 正文...
 *
 * frontmatter 内容为 TOML 格式，使用 --- 分隔符包裹。
 * 规范来源：.trellis/spec/backend/agent-schema-v1.md
 */

import { parseToml, TomlParseError } from '../../config/toml/index.js'
import { isValidAgentId } from './id-utils.js'
import type { AgentFrontmatterV1, AgentToolPolicyV1, AgentMode, ModelPreference } from './schema-v1.js'

// ═══════════════════════════════════════════════
// 错误类型
// ═══════════════════════════════════════════════

/**
 * Agent 校验错误 — 拒绝加载时抛出，包含字段名与文件路径定位信息。
 * 遵循 error-handling.md §1 "配置错误优先快速失败"原则。
 */
export class AgentValidationError extends Error {
  readonly field: string
  readonly filePath: string | undefined

  constructor(message: string, field: string, filePath?: string) {
    const location = filePath ? ` [${filePath}]` : ''
    super(`Agent 校验失败（字段 "${field}"）${location}: ${message}`)
    this.name = 'AgentValidationError'
    this.field = field
    this.filePath = filePath
  }
}

// ═══════════════════════════════════════════════
// Frontmatter 分割
// ═══════════════════════════════════════════════

/** frontmatter 分割结果 */
export interface SplitAgentFileResult {
  frontmatterRaw: string
  body: string
}

/**
 * 从 agent Markdown 文件内容中分割出 frontmatter（TOML）和正文。
 * frontmatter 使用 --- 分隔符包裹。
 * 若文件不含 frontmatter，frontmatterRaw 返回空字符串。
 */
export function splitAgentFile(content: string): SplitAgentFileResult {
  const trimmed = content.trimStart()
  if (!trimmed.startsWith('---')) {
    return { frontmatterRaw: '', body: content }
  }

  // 跳过首行 ---，查找第二个 --- 分隔符
  const afterFirst = trimmed.slice(3)
  const nextDashIdx = afterFirst.indexOf('\n---')
  if (nextDashIdx === -1) {
    return { frontmatterRaw: '', body: content }
  }

  const frontmatterRaw = afterFirst.slice(0, nextDashIdx).trim()
  const body = afterFirst.slice(nextDashIdx + 4).trim()

  return { frontmatterRaw, body }
}

// ═══════════════════════════════════════════════
// 合法值常量
// ═══════════════════════════════════════════════

/** 合法 mode 枚举 */
const VALID_MODES: readonly AgentMode[] = ['primary', 'subagent', 'all']

/** 合法 model_preference 枚举 */
const VALID_MODEL_PREFERENCES: readonly ModelPreference[] = ['fast', 'balanced', 'strong']

// ═══════════════════════════════════════════════
// Frontmatter 解析与校验
// ═══════════════════════════════════════════════

/**
 * 解析并校验 agent frontmatter 原始字符串（TOML 格式，不含 --- 分隔符）。
 *
 * 校验规则：
 * - id：必填，小写英文/数字/连字符
 * - name：必填，非空字符串
 * - summary：必填，非空字符串
 * - when_to_use：必填，非空字符串
 * - mode：可选，缺省 'all'，值必须是 primary | subagent | all
 * - inherits：可选，若存在必须是非空字符串（引用有效性由 loader 层验证）
 * - tool_policy：必填，mode 必须是 include | exclude，tools 必须是字符串数组
 * - model_preference：可选，fast | balanced | strong
 * - extra：可选，object
 *
 * @param raw - frontmatter TOML 原始字符串
 * @param filePath - 可选，用于错误信息定位（agent 文件路径）
 * @throws AgentValidationError 校验失败时
 */
export function parseAgentFrontmatter(raw: string, filePath?: string): AgentFrontmatterV1 {
  // 第一步：TOML 解析
  let parsed: Record<string, unknown>
  try {
    parsed = parseToml(raw) as Record<string, unknown>
  } catch (err) {
    if (err instanceof TomlParseError) {
      throw new AgentValidationError(`TOML 解析失败：${err.message}`, 'frontmatter', filePath)
    }
    throw new AgentValidationError(`frontmatter 解析失败：${String(err)}`, 'frontmatter', filePath)
  }

  // ── 必填字段校验 ──

  // id
  const id = parsed['id']
  if (typeof id !== 'string' || !id.trim()) {
    throw new AgentValidationError('id 为必填字段，不能为空', 'id', filePath)
  }
  if (!isValidAgentId(id.trim())) {
    throw new AgentValidationError(
      'id 仅允许小写英文、数字、连字符，且不能以连字符开头（例如 "my-agent"）',
      'id',
      filePath,
    )
  }

  // name
  const name = parsed['name']
  if (typeof name !== 'string' || !name.trim()) {
    throw new AgentValidationError('name 为必填字段，不能为空', 'name', filePath)
  }

  // summary
  const summary = parsed['summary']
  if (typeof summary !== 'string' || !summary.trim()) {
    throw new AgentValidationError('summary 为必填字段，不能为空', 'summary', filePath)
  }

  // when_to_use
  const when_to_use = parsed['when_to_use']
  if (typeof when_to_use !== 'string' || !when_to_use.trim()) {
    throw new AgentValidationError('when_to_use 为必填字段，不能为空', 'when_to_use', filePath)
  }

  // ── 可选字段校验 ──

  // mode（缺省 'all'）
  let mode: AgentMode = 'all'
  const modeRaw = parsed['mode']
  if (modeRaw !== undefined) {
    if (!VALID_MODES.includes(modeRaw as AgentMode)) {
      throw new AgentValidationError(
        `mode 非法值 "${String(modeRaw)}"，允许值：${VALID_MODES.join(' | ')}`,
        'mode',
        filePath,
      )
    }
    mode = modeRaw as AgentMode
  }

  // inherits（可选，schema 层只验证格式，引用解析在 loader 层）
  let inherits: string | undefined
  const inheritsRaw = parsed['inherits']
  if (inheritsRaw !== undefined) {
    if (typeof inheritsRaw !== 'string' || !inheritsRaw.trim()) {
      throw new AgentValidationError(
        'inherits 若存在，必须是非空字符串（指向已知 agent id）',
        'inherits',
        filePath,
      )
    }
    const normalizedInherits = inheritsRaw.trim()
    if (!isValidAgentId(normalizedInherits)) {
      throw new AgentValidationError(
        'inherits 必须是合法 agent id，只允许小写英文、数字、连字符',
        'inherits',
        filePath,
      )
    }
    inherits = normalizedInherits
  }

  // tool_policy（必填对象）
  const toolPolicyRaw = parsed['tool_policy']
  if (toolPolicyRaw == null || typeof toolPolicyRaw !== 'object' || Array.isArray(toolPolicyRaw)) {
    throw new AgentValidationError(
      'tool_policy 为必填对象，格式：[tool_policy]\\nmode = "include"\\ntools = [...]',
      'tool_policy',
      filePath,
    )
  }
  const tpObj = toolPolicyRaw as Record<string, unknown>
  const tpMode = tpObj['mode']
  if (tpMode !== 'include' && tpMode !== 'exclude') {
    throw new AgentValidationError(
      `tool_policy.mode 非法值 "${String(tpMode)}"，允许值：include | exclude`,
      'tool_policy.mode',
      filePath,
    )
  }
  const tpTools = tpObj['tools']
  if (!Array.isArray(tpTools) || !tpTools.every((t): t is string => typeof t === 'string')) {
    throw new AgentValidationError(
      'tool_policy.tools 必须是字符串数组（例如 ["read_file", "grep"]）',
      'tool_policy.tools',
      filePath,
    )
  }
  const tool_policy: AgentToolPolicyV1 = {
    mode: tpMode as 'include' | 'exclude',
    tools: tpTools,
  }

  // model_preference（可选）
  let model_preference: ModelPreference | undefined
  const mpRaw = parsed['model_preference']
  if (mpRaw !== undefined) {
    if (!VALID_MODEL_PREFERENCES.includes(mpRaw as ModelPreference)) {
      throw new AgentValidationError(
        `model_preference 非法值 "${String(mpRaw)}"，允许值：${VALID_MODEL_PREFERENCES.join(' | ')}`,
        'model_preference',
        filePath,
      )
    }
    model_preference = mpRaw as ModelPreference
  }

  // extra（可选 object）
  let extra: Record<string, unknown> | undefined
  const extraRaw = parsed['extra']
  if (extraRaw !== undefined) {
    if (typeof extraRaw !== 'object' || Array.isArray(extraRaw) || extraRaw === null) {
      throw new AgentValidationError('extra 若存在，必须是对象', 'extra', filePath)
    }
    extra = extraRaw as Record<string, unknown>
  }

  // ── 组装结果 ──
  const result: AgentFrontmatterV1 = {
    id: id.trim(),
    name: name.trim(),
    summary: summary.trim(),
    mode,
    when_to_use: when_to_use.trim(),
    tool_policy,
  }

  if (inherits !== undefined) result.inherits = inherits
  if (model_preference !== undefined) result.model_preference = model_preference
  if (extra !== undefined) result.extra = extra

  return result
}

/**
 * 解析完整的 agent Markdown 文件内容（含 --- frontmatter 分隔符）。
 *
 * @param content - 完整文件内容
 * @param filePath - 可选，用于错误定位
 * @throws AgentValidationError 若无 frontmatter 或校验失败
 */
export function parseAgentFile(
  content: string,
  filePath?: string,
): { frontmatter: AgentFrontmatterV1; body: string } {
  const { frontmatterRaw, body } = splitAgentFile(content)
  if (!frontmatterRaw) {
    throw new AgentValidationError(
      'agent 文件必须以 --- frontmatter 分隔符开头，缺少 frontmatter',
      'frontmatter',
      filePath,
    )
  }
  const frontmatter = parseAgentFrontmatter(frontmatterRaw, filePath)
  return { frontmatter, body }
}
