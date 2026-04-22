// src/tools/agent/id-utils.ts

/**
 * Agent ID 规则与校验工具。
 *
 * 这是 agent id 的唯一事实源，供 parser、store、API、runtime 共用，
 * 避免不同层各写一套正则导致路径穿越与语义漂移。
 */

/** 合法 id：小写英文 / 数字 / 连字符，且不以连字符开头 */
export const AGENT_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/

/** 判断 agent id 是否合法 */
export function isValidAgentId(id: string): boolean {
  return AGENT_ID_PATTERN.test(id)
}

/**
 * 断言 agent id 合法。
 *
 * @throws Error 若 id 非法
 */
export function assertValidAgentId(id: string, fieldName: string = 'id'): string {
  const trimmed = id.trim()
  if (!trimmed) {
    throw new Error(`${fieldName} 不能为空`)
  }
  if (!isValidAgentId(trimmed)) {
    throw new Error(
      `${fieldName} 仅允许小写英文、数字、连字符，且不能以连字符开头（例如 "my-agent"）`,
    )
  }
  return trimmed
}
