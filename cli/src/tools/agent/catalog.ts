// src/tools/agent/catalog.ts

/**
 * AgentCatalogService — Agent 单一事实源。
 *
 * 职责：
 * - 启动时统一加载 builtin + user agent
 * - 维护 runtime registry 与产品层 LoadedAgentDefinitionV1 的一致性
 * - 提供主 Agent / SubAgent 候选池过滤
 * - 提供 default_agent 校验
 * - 提供重载能力，保证删除/覆盖后 registry 与磁盘同步
 *
 * 设计原则：
 * - API / UI / runtime 必须共用这里的事实源，避免“页面可见但 runtime 不可调度”
 * - 对 user agent 的删除采用全量重建，确保同名 builtin 能可靠恢复
 */

import type { AgentDefinition } from './types.js'
import type { LoadedAgentDefinitionV1 } from './schema-v1.js'
import { AgentDefinitionRegistry, agentDefinitionRegistry } from './definition-registry.js'
import { getBuiltInAgentDefinitions } from './built-in.js'
import { adaptRuntimeToV1, adaptV1ToRuntime } from './compat-loader.js'
import { filterForPrimarySelector, filterForSubagentPool, validateDefaultAgent } from './mode-filter.js'
import { UserAgentStore, userAgentStore } from './user-agent-store.js'

export interface ResolvedPrimaryAgentResult {
  agent: AgentDefinition
  warnings: string[]
}

interface AgentCatalogDeps {
  registry?: AgentDefinitionRegistry
  userStore?: UserAgentStore
  builtins?: () => AgentDefinition[]
}

export class AgentCatalogService {
  readonly #loaded = new Map<string, LoadedAgentDefinitionV1>()
  #initialized = false
  readonly #registry: AgentDefinitionRegistry
  readonly #userStore: UserAgentStore
  readonly #builtins: () => AgentDefinition[]

  constructor(deps: AgentCatalogDeps = {}) {
    this.#registry = deps.registry ?? agentDefinitionRegistry
    this.#userStore = deps.userStore ?? userAgentStore
    this.#builtins = deps.builtins ?? getBuiltInAgentDefinitions
  }

  ensureInitialized(): void {
    if (this.#initialized) return
    this.reload()
  }

  reload(): void {
    this.#loaded.clear()
    this.#registry.reset()

    for (const builtin of this.#builtins()) {
      this.#registry.register(builtin)
      this.#loaded.set(builtin.agentType, adaptRuntimeToV1(builtin))
    }

    const pendingUsers = [...this.#userStore.listAll()]
    while (pendingUsers.length > 0) {
      let resolvedCount = 0

      for (let index = 0; index < pendingUsers.length; ) {
        const user = pendingUsers[index]!
        const inheritedId = user.frontmatter.inherits

        // user > builtin：若父级有用户覆盖版本尚未注册，不能提前退回 builtin 版本
        const shouldWaitForPendingUserParent =
          inheritedId !== undefined &&
          pendingUsers.some((candidate, candidateIndex) =>
            candidateIndex !== index && candidate.frontmatter.id === inheritedId,
          )

        if (shouldWaitForPendingUserParent || inheritedId === user.frontmatter.id) {
          index++
          continue
        }

        try {
          const runtime = adaptV1ToRuntime(user, this.#registry)
          this.#registry.register(runtime)
          this.#loaded.set(user.frontmatter.id, user)
          pendingUsers.splice(index, 1)
          resolvedCount++
        } catch (err) {
          // user agent 允许继承稍后才出现的另一个 user agent，因此缺父级时先留到下一轮解析
          if (inheritedId && this.#registry.get(inheritedId) === undefined) {
            index++
            continue
          }
          throw err
        }
      }

      if (resolvedCount === 0) {
        const unresolved = pendingUsers
          .map(user => `${user.frontmatter.id} -> ${user.frontmatter.inherits ?? '(none)'}`)
          .join(', ')
        throw new Error(
          `用户 agent 继承解析失败：存在循环依赖或缺失父级引用（${unresolved}）`,
        )
      }
    }

    this.#initialized = true
  }

  getAll(): LoadedAgentDefinitionV1[] {
    this.ensureInitialized()
    return [...this.#loaded.values()].sort((a, b) =>
      a.frontmatter.id.localeCompare(b.frontmatter.id),
    )
  }

  getById(agentId: string): LoadedAgentDefinitionV1 | undefined {
    this.ensureInitialized()
    return this.#loaded.get(agentId)
  }

  getPrimaryCandidates(): LoadedAgentDefinitionV1[] {
    return filterForPrimarySelector(this.getAll())
  }

  getSubagentCandidates(): LoadedAgentDefinitionV1[] {
    return filterForSubagentPool(this.getAll())
  }

  getSubagentTypeNames(): string[] {
    return this.getSubagentCandidates().map(agent => agent.frontmatter.id)
  }

  validateDefaultAgent(agentId: string) {
    return validateDefaultAgent(agentId, this.getAll())
  }

  resolvePrimaryAgent(preferredAgentId?: string): ResolvedPrimaryAgentResult {
    this.ensureInitialized()
    const warnings: string[] = []

    if (preferredAgentId?.trim()) {
      const validation = this.validateDefaultAgent(preferredAgentId.trim())
      if (validation.valid) {
        const runtime = this.#registry.get(preferredAgentId.trim())
        if (runtime) {
          return { agent: runtime, warnings }
        }
      } else if (validation.error) {
        warnings.push(validation.error)
      }
    }

    const fallback = this.#registry.get('general')
    if (fallback) {
      return { agent: fallback, warnings }
    }

    const firstPrimary = this.#registry.getForPrimarySelector()[0]
    if (!firstPrimary) {
      throw new Error('没有可用的主 Agent 候选项（primary | all）')
    }

    return { agent: firstPrimary, warnings }
  }
}

export const agentCatalog = new AgentCatalogService()
