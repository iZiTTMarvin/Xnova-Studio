// src/tools/agent/compat-loader.ts

/**
 * Agent 兼容层 — 旧内置 agent 到 v1 schema 的双向转换
 *
 * 职责：
 * 1. 将现有 AgentDefinition（runtime 格式）转换为 LoadedAgentDefinitionV1（schema 格式）
 *    供 UI/API 消费
 * 2. 将 LoadedAgentDefinitionV1（从文件加载的用户 agent）转换为 AgentDefinition（runtime 格式）
 *    供 dispatch_agent 消费
 * 3. 确保旧内置 general / explore / plan 通过兼容层保持可用，不破坏现有主路径
 *
 * 规范来源：
 * - .trellis/spec/backend/agent-schema-v1.md §3 来源契约
 * - .trellis/tasks/04-22-phase3-agent-compat-loader/prd.md
 *
 * 重要约束：
 * - 不在此处实现 mode 候选池过滤（由 mode-filter.ts 负责）
 * - 不在此处实现用户 agent CRUD（由 user-agent-store.ts 负责）
 * - inherits 引用的有效性校验在此处执行（loader 层职责）
 */

import type { AgentDefinition } from './types.js'
import type { LoadedAgentDefinitionV1, AgentFrontmatterV1 } from './schema-v1.js'
import type { AgentDefinitionRegistry } from './definition-registry.js'

// ═══════════════════════════════════════════════
// AgentDefinition → LoadedAgentDefinitionV1
// ═══════════════════════════════════════════════

/**
 * 将运行时 AgentDefinition 对象转换为 LoadedAgentDefinitionV1 格式。
 *
 * 用于将内置 agent 对象导出给 UI/API 展示，
 * 让 UI 只需消费统一的 v1 格式，而无需感知 AgentDefinition 的内部细节。
 */
export function adaptRuntimeToV1(def: AgentDefinition): LoadedAgentDefinitionV1 {
  if (def.source !== 'builtin' && def.source !== 'user') {
    throw new Error(`非法运行时 Agent source "${String(def.source)}"` )
  }
  const frontmatter: AgentFrontmatterV1 = {
    id: def.agentType,
    name: def.displayName ?? def.agentType,
    summary: def.summary ?? def.whenToUse,
    mode: def.mode ?? 'all',
    when_to_use: def.whenToUse,
    tool_policy: def.toolPolicy,
  }
  if (def.inherits !== undefined) {
    frontmatter.inherits = def.inherits
  }
  if (def.modelHint !== undefined) {
    frontmatter.model_preference = def.modelHint
  }
  if (def.extra !== undefined) {
    frontmatter.extra = def.extra
  }
  return {
    source: def.source,
    frontmatter,
    body: def.getSystemPrompt(),
    filePath: (def as { filePath?: string }).filePath ?? '',
  }
}

// ═══════════════════════════════════════════════
// LoadedAgentDefinitionV1 → AgentDefinition
// ═══════════════════════════════════════════════

/**
 * 将加载后的 v1 agent 定义转换为运行时 AgentDefinition 格式。
 *
 * 主要用于：将用户自定义 agent（从文件加载）转换后注册到 AgentDefinitionRegistry，
 * 使其可被 dispatch_agent 工具正常消费。
 *
 * inherits 处理（统一契约）：
 * - 子级 frontmatter 中显式给出的 schema 字段（body / tool_policy / when_to_use / summary / mode / extra）始终由子级自己决定
 * - 父级只提供 runtime-only 默认值：maxTurns / contextPolicy / minTurns / timeoutMs / modelHint
 * - 若子级正文为空，则回退父级 system prompt 作为正文默认值
 * - 若 inherits 指向不存在的 agent，抛出错误（快速失败原则）
 *
 * @param v1 - 从文件解析出的 v1 agent 定义
 * @param registry - 当前注册表（用于解析 inherits）
 * @throws Error 若 inherits 指向不存在的 agent
 */
export function adaptV1ToRuntime(
  v1: LoadedAgentDefinitionV1,
  registry?: AgentDefinitionRegistry,
): AgentDefinition {
  const fm = v1.frontmatter

  // 解析 inherits：显式 schema 字段由子级 frontmatter 决定；仅继承 runtime-only 默认值
  let inheritedMaxTurns = 50
  let inheritedModelHint: AgentDefinition['modelHint']
  let inheritedContextPolicy: AgentDefinition['contextPolicy']
  let inheritedMinTurns: AgentDefinition['minTurns']
  let inheritedTimeoutMs: AgentDefinition['timeoutMs']
  let parentSystemPrompt: string | undefined

  if (fm.inherits !== undefined && registry !== undefined) {
    const parent = registry.get(fm.inherits)
    if (parent === undefined) {
      throw new Error(
        `agent "${fm.id}" 的 inherits 字段 "${fm.inherits}" 指向不存在的 agent，请检查 agent id 是否正确`,
      )
    }
    inheritedMaxTurns = parent.maxTurns
    inheritedModelHint = parent.modelHint
    inheritedContextPolicy = parent.contextPolicy
    inheritedMinTurns = parent.minTurns
    inheritedTimeoutMs = parent.timeoutMs
    parentSystemPrompt = parent.getSystemPrompt()
  }

  const modelHint = fm.model_preference ?? inheritedModelHint
  const resolvedBody = v1.body.trim() || parentSystemPrompt || fm.when_to_use

  const runtime: AgentDefinition = {
    agentType: fm.id,
    source: v1.source,
    displayName: fm.name,
    mode: fm.mode,
    ...(fm.inherits !== undefined ? { inherits: fm.inherits } : {}),
    summary: fm.summary,
    ...(fm.extra !== undefined ? { extra: fm.extra } : {}),
    whenToUse: fm.when_to_use,
    toolPolicy: fm.tool_policy,
    maxTurns: inheritedMaxTurns,
    ...(modelHint !== undefined ? { modelHint } : {}),
    ...(inheritedContextPolicy !== undefined ? { contextPolicy: inheritedContextPolicy } : {}),
    ...(inheritedMinTurns !== undefined ? { minTurns: inheritedMinTurns } : {}),
    ...(inheritedTimeoutMs !== undefined ? { timeoutMs: inheritedTimeoutMs } : {}),
    getSystemPrompt: () => resolvedBody,
    ...(v1.filePath ? { filePath: v1.filePath } : {}),
  }

  return runtime
}

// ═══════════════════════════════════════════════
// Registry 工具函数
// ═══════════════════════════════════════════════

/**
 * 从 registry 中获取所有 agent 的 v1 格式列表。
 *
 * 等价于 `registry.getAllAsV1()`，此处作为独立函数导出，
 * 便于不持有 registry 实例的模块调用。
 */
export function getAllAgentsAsV1(registry: AgentDefinitionRegistry): LoadedAgentDefinitionV1[] {
  return registry.getAllAsV1()
}

/**
 * 将一批 v1 agent 定义注册到 registry（覆盖同名旧定义）。
 * user agent 注册后自动覆盖同名 builtin agent（user > builtin）。
 *
 * @param agents - 待注册的 v1 agent 列表
 * @param registry - 目标注册表
 */
export function registerV1Agents(
  agents: LoadedAgentDefinitionV1[],
  registry: AgentDefinitionRegistry,
): void {
  for (const v1 of agents) {
    const runtime = adaptV1ToRuntime(v1, registry)
    registry.register(runtime)
  }
}
