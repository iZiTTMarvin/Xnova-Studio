// src/tools/agent/definition-registry.ts

/**
 * AgentDefinitionRegistry — Agent 类型注册表（v1 版本）。
 *
 * 管理所有 Agent 定义（builtin + user），
 * 供 dispatch_agent 工具按 subagent_type 查找配置。
 *
 * 注册顺序（后覆盖先，实现 user > builtin 优先级）：
 * 1. 内置（builtin：general / explore / plan）
 * 2. 用户自定义（user：~/.xnovacode/agents/*.md）
 *
 * Phase 3 变更：
 * - 来源枚举收敛为 'builtin' | 'user'（移除 project-level/plugin）
 * - 新增 getForPrimarySelector / getForSubagentPool 方法（复用 mode-filter）
 * - 新增 getAllAsV1 方法（供 UI/API 消费 LoadedAgentDefinitionV1 格式）
 *
 * 规范来源：.trellis/spec/backend/agent-schema-v1.md §3 来源契约
 */

import type { AgentDefinition, AgentSource } from './types.js'
import type { LoadedAgentDefinitionV1 } from './schema-v1.js'
import { canBePrimary, canBeSubagent } from './mode-filter.js'

const SOURCE_ORDER: Record<AgentSource, number> = {
  'builtin': 0,
  'user': 1,
}

function assertAgentSource(source: string): AgentSource {
  if (source !== 'builtin' && source !== 'user') {
    throw new Error(`非法 Agent source "${source}"，只允许 builtin | user`)
  }
  return source
}

export class AgentDefinitionRegistry {
  readonly #definitions = new Map<string, AgentDefinition>()

  /** 注册 Agent 定义（同名覆盖，实现 user > builtin 的优先级） */
  register(def: AgentDefinition): void {
    assertAgentSource(def.source)
    this.#definitions.set(def.agentType, def)
  }

  /** 移除指定 Agent 定义（供删除 / 全量重建前使用） */
  unregister(agentType: string): void {
    this.#definitions.delete(agentType)
  }

  /** 清空注册表（供 catalog 全量重建时使用） */
  reset(): void {
    this.#definitions.clear()
  }

  /** 获取指定类型的定义 */
  get(agentType: string): AgentDefinition | undefined {
    return this.#definitions.get(agentType)
  }

  /** 获取所有已注册定义（按 source 排序：builtin → user） */
  getAll(): AgentDefinition[] {
    return [...this.#definitions.values()].sort(
      (a, b) => (SOURCE_ORDER[assertAgentSource(a.source)] ?? 99) - (SOURCE_ORDER[assertAgentSource(b.source)] ?? 99),
    )
  }

  /**
   * 获取主 Agent 候选池（mode = primary | all）。
   * UI 主 Agent 选择器必须使用此方法，不得自行过滤。
   */
  getForPrimarySelector(): AgentDefinition[] {
    return this.getAll().filter(d => {
      const mode = d.mode ?? 'all'
      return canBePrimary(mode)
    })
  }

  /**
   * 获取 SubAgent 候选池（mode = subagent | all）。
   * dispatch_agent 的 subagent_type 枚举必须使用此方法，不得自行过滤。
   */
  getForSubagentPool(): AgentDefinition[] {
    return this.getAll().filter(d => {
      const mode = d.mode ?? 'all'
      return canBeSubagent(mode)
    })
  }

  /** 获取所有类型名列表（用于 dispatch_agent 参数 enum，包含所有 mode） */
  getTypeNames(): string[] {
    return [...this.#definitions.keys()]
  }

  /** 获取 SubAgent 候选池类型名（dispatch_agent 参数 enum 必须使用此方法） */
  getSubagentTypeNames(): string[] {
    return this.getForSubagentPool().map(d => d.agentType)
  }

  /** 生成 LLM 可读的类型说明文本（仅 SubAgent 候选池，用于 dispatch_agent description） */
  buildTypeDescriptions(): string {
    return this.getForSubagentPool()
      .map(d => `- ${d.agentType}: ${d.whenToUse}`)
      .join('\n')
  }

  /**
   * 将所有已注册定义转换为 LoadedAgentDefinitionV1 格式（供 UI/API 消费）。
   *
   * builtin agent 的 body 来自 getSystemPrompt()，filePath 为空字符串。
   * 此方法提供统一的 v1 视图，避免 UI 直接操作 AgentDefinition 运行时对象。
   */
  getAllAsV1(): LoadedAgentDefinitionV1[] {
    return this.getAll().map(d => ({
      source: assertAgentSource(d.source),
      frontmatter: {
        id: d.agentType,
        name: d.displayName ?? d.agentType,
        summary: d.summary ?? d.whenToUse,
        mode: d.mode ?? 'all',
        ...(d.inherits !== undefined ? { inherits: d.inherits } : {}),
        when_to_use: d.whenToUse,
        tool_policy: d.toolPolicy,
        ...(d.modelHint !== undefined ? { model_preference: d.modelHint } : {}),
        ...(d.extra !== undefined ? { extra: d.extra } : {}),
      },
      body: d.getSystemPrompt(),
      filePath: (d as { filePath?: string }).filePath ?? '',
    }))
  }
}

/** 模块级单例 */
export const agentDefinitionRegistry = new AgentDefinitionRegistry()
