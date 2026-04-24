// src/tools/agent/mode-filter.ts

/**
 * Agent 模式过滤助手 — 共享过滤规则（唯一事实源）
 *
 * 规范来源：.trellis/spec/backend/agent-schema-v1.md §3 运行时契约
 *
 * 主 Agent 候选池：primary | all
 * SubAgent 候选池：subagent | all
 * default_agent：只允许引用 primary | all
 *
 * UI 与 runtime 必须复用这里的函数，禁止各自重写 if/else 判断。
 * 参见 agent-schema-v1.md §7 Wrong vs Correct。
 */

import type { AgentMode, LoadedAgentDefinitionV1 } from './schema-v1.js'

// ═══════════════════════════════════════════════
// 基础判断函数
// ═══════════════════════════════════════════════

/**
 * 判断某 mode 的 agent 是否可作为主 Agent 使用。
 * primary | all → true
 */
export function canBePrimary(mode: AgentMode): boolean {
  return mode === 'primary' || mode === 'all'
}

/**
 * 判断某 mode 的 agent 是否可作为 SubAgent 使用。
 * subagent | all → true
 */
export function canBeSubagent(mode: AgentMode): boolean {
  return mode === 'subagent' || mode === 'all'
}

/**
 * 判断某 agent 是否可被 default_agent 引用。
 * 只允许 primary | all（与主 Agent 候选池规则一致）。
 */
export function canBeDefaultAgent(mode: AgentMode): boolean {
  return canBePrimary(mode)
}

// ═══════════════════════════════════════════════
// 候选池过滤
// ═══════════════════════════════════════════════

/**
 * 从 agent 列表中过滤出主 Agent 候选池（primary | all）。
 * UI 主 Agent 选择器应使用此函数。
 */
export function filterForPrimarySelector(agents: LoadedAgentDefinitionV1[]): LoadedAgentDefinitionV1[] {
  return agents.filter(a => canBePrimary(a.frontmatter.mode))
}

/**
 * 从 agent 列表中过滤出 SubAgent 候选池（subagent | all）。
 * dispatch_agent 的 subagent_type 枚举应使用此函数。
 */
export function filterForSubagentPool(agents: LoadedAgentDefinitionV1[]): LoadedAgentDefinitionV1[] {
  return agents.filter(a => canBeSubagent(a.frontmatter.mode))
}

// ═══════════════════════════════════════════════
// default_agent 校验
// ═══════════════════════════════════════════════

/** default_agent 校验结果 */
export interface DefaultAgentValidationResult {
  valid: boolean
  error?: string
}

/**
 * 校验 default_agent 配置是否合法。
 *
 * 失败场景：
 * - agentId 不存在于已加载列表
 * - agentId 对应 agent 的 mode 是 subagent（不允许作为 default_agent）
 *
 * @param agentId - 配置中指定的 default agent id
 * @param agents - 所有已加载的 agent 列表（builtin + user）
 */
export function validateDefaultAgent(
  agentId: string,
  agents: LoadedAgentDefinitionV1[],
): DefaultAgentValidationResult {
  const found = agents.find(a => a.frontmatter.id === agentId)
  if (!found) {
    return {
      valid: false,
      error: `default_agent "${agentId}" 不存在于已加载的 agent 列表中`,
    }
  }
  if (!canBeDefaultAgent(found.frontmatter.mode)) {
    return {
      valid: false,
      error: `default_agent "${agentId}" 的 mode 为 "${found.frontmatter.mode}"，default_agent 只允许引用 primary | all`,
    }
  }
  return { valid: true }
}
