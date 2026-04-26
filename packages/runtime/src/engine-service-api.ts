import {
  contextManager,
  contextTracker,
  ensureSkillsDiscovered,
  getMcpStatus,
  getMemoryManager,
  pluginRegistry,
  sessionLogger,
  skillStore,
  tokenMeter,
  type Message,
  type ContextLevel,
} from '@xnova/core'
import {
  type CCodeConfig,
} from '@config/config-manager.js'
import { ConfigManager } from '@config/config-manager.js'
import { loadEffectiveRuntimeConfig } from '@config/resolver.js'
import type {
  CleanupOptions,
  CleanupResult,
  CleanupStats,
} from '@core/cleanup-service.js'
import {
  executeCleanup,
  getCleanupStats,
} from '@core/cleanup-service.js'
import {
  addMcpServer,
  deleteMcpServer,
  readMcpOverview,
  type McpMutationResult,
  type McpOverviewSnapshot,
  type McpServerConfigInput,
} from '@mcp/status-service.js'
import type { ServerInfo } from '@mcp/mcp-manager.js'
import type {
  MemoryOverviewSnapshot,
  MemoryRebuildResult,
} from '@memory/overview-service.js'
import {
  readMemoryOverview,
  rebuildMemoryIndex,
} from '@memory/overview-service.js'
import type {
  MemoryEntry,
  MemoryQuery,
  MemoryScope,
  MemorySearchResult,
  MemorySource,
  MemoryType,
} from '@memory/types.js'
import type {
  AggregateStats,
  SessionCostStats,
} from '@observability/token-meter.js'
import { sessionStore } from '@persistence/index.js'
import type {
  BranchInfo,
  SessionEvent,
  SessionSnapshot,
  SessionSummary,
} from '@persistence/session-types.js'
import {
  getMessagePlainText,
  SESSION_CONVERSATION_SCHEMA_VERSION,
} from '@persistence/index.js'
import { generateEventId } from '@persistence/session-utils.js'
import type { LoadedPluginInfo } from '@plugin/types.js'
import type { LLMProvider } from '@providers/provider.js'
import { getOrCreateProvider } from '@providers/registry.js'
import type {
  SkillsPluginsOverviewSnapshot,
} from '@skills/plugins-overview-service.js'
import { readSkillsPluginsOverview } from '@skills/plugins-overview-service.js'
import type { SkillMetadata } from '@skills/engine/types.js'

export const LEGACY_COMMAND_CAPABILITY_MAP = {
  model: 'runtime.setModel',
  compact: 'runtime.compactContext',
  context: 'runtime.getContextSnapshot',
  resume: 'sessionService.resumeSession',
  fork: 'sessionService.forkFromEvent',
  remember: 'memoryService',
  mcp: 'mcpService',
  skills: 'skillsService',
  plugins: 'pluginService',
  usage: 'usageService',
  gc: 'maintenanceService',
  clear: 'sessionService.clearConversation',
} as const

export interface RuntimeContextSnapshot {
  provider: string
  model: string
  strategy: string
  historyLength: number
  totalWindow: number
  outputReserve: number
  effectiveWindow: number
  lastInputTokens: number
  usedPercentage: number
  remaining: number
  level: ContextLevel
}

export interface RuntimeSetModelInput {
  provider: string
  model: string
}

export interface RuntimeModelSelection {
  provider: string
  model: string
}

export interface RuntimeCompactContextInput {
  strategy?: string
  focus?: string
  provider?: string
  model?: string
}

export type RuntimeCompactContextResult =
  | {
      ok: false
      reason: 'empty-history'
      message: string
    }
  | {
      ok: true
      summary: string
      history: Message[]
      tokensBefore: number
      compactedMessageCount: number
      strategy: string
    }

export interface SessionRestoreInput {
  sessionId: string
  leafEventUuid?: string
  provider?: string
  model?: string
  cwd?: string
  accumulatedMs?: number
}

export interface SessionRestoreResult {
  snapshot: SessionSnapshot
  resumeEventId: string
}

export interface SessionForkInput {
  sessionId: string
  eventUuid: string
  provider?: string
  model?: string
  cwd?: string
  accumulatedMs?: number
}

export interface SessionService {
  listSessions(options?: { projectSlug?: string; limit?: number }): SessionSummary[]
  listBranches(sessionId: string): BranchInfo[]
  loadSession(sessionId: string, leafEventUuid?: string): SessionSnapshot
  resumeSession(input: SessionRestoreInput): SessionRestoreResult
  forkFromEvent(input: SessionForkInput): SessionRestoreResult
  clearConversation(): void
  getCurrentSessionId(): string | null
}

export interface MemoryWriteInput {
  content: string
  title?: string
  scope?: MemoryScope
  type?: MemoryType
  tags?: string[]
  source?: MemorySource
  filePath?: string
}

export interface MemoryService {
  list(scope?: MemoryScope | 'all'): Promise<MemoryEntry[]>
  search(input: Pick<MemoryQuery, 'query' | 'topK' | 'scope' | 'tags' | 'type'>): Promise<MemorySearchResult[]>
  delete(id: string): Promise<void>
  write(input: MemoryWriteInput): Promise<MemoryEntry>
  rebuild(): Promise<void>
  getOverview(projectPath: string | null): Promise<MemoryOverviewSnapshot>
  rebuildIndex(projectPath: string | null): Promise<MemoryRebuildResult>
}

export interface McpService {
  getStatus(): Promise<ServerInfo[]>
  getOverview(): Promise<McpOverviewSnapshot>
  addServer(input: { name: string; config: McpServerConfigInput }): Promise<McpMutationResult>
  deleteServer(name: string): Promise<McpMutationResult>
}

export interface SkillsService {
  list(): Promise<SkillMetadata[]>
  getContent(name: string): Promise<string | null>
  getOverview(): Promise<SkillsPluginsOverviewSnapshot>
}

export interface UsageSummary {
  session: SessionCostStats
  today: AggregateStats[]
  month: AggregateStats[]
  cacheHitRate: number
}

export interface UsageService {
  getSummary(): UsageSummary
}

export interface PluginService {
  list(): LoadedPluginInfo[]
}

export interface MaintenanceService {
  getStats(options?: CleanupOptions): CleanupStats
  cleanup(options?: CleanupOptions): CleanupResult
}

export interface RuntimeCommandService {
  setModel(input: RuntimeSetModelInput): RuntimeModelSelection
  getModelSelection(): RuntimeModelSelection
  compactContext(input?: RuntimeCompactContextInput): Promise<RuntimeCompactContextResult>
  getContextSnapshot(): RuntimeContextSnapshot
}

export interface EngineServiceApi {
  runtime: RuntimeCommandService
  sessionService: SessionService
  memoryService: MemoryService
  mcpService: McpService
  skillsService: SkillsService
  usageService: UsageService
  pluginService: PluginService
  maintenanceService: MaintenanceService
}

interface ContextManagerRef {
  getHistoryRef(): Message[]
  getStrategyName(): string
  compact(history: Message[], provider: LLMProvider, options: { model: string; strategy?: string; focus?: string }): Promise<{
    history: Message[]
    summary: string
    tokensBefore: number
    compactedMessageCount: number
  }>
  replaceHistory(history: Message[]): void
  clearHistory(): void
  restoreHistory(history: Message[]): void
}

interface ContextTrackerRef {
  getState(): {
    totalWindow: number
    outputReserve: number
    effectiveWindow: number
    lastInputTokens: number
    usedPercentage: number
    remaining: number
    level: ContextLevel
  }
}

interface SessionStoreRef {
  list(options?: { projectSlug?: string; limit?: number }): SessionSummary[]
  listBranches(sessionId: string): BranchInfo[]
  loadMessages(sessionId: string, leafEventUuid?: string): SessionSnapshot
  append(sessionId: string, event: SessionEvent): void
}

interface SessionLoggerRef {
  sessionId: string | null
  lastEventUuid: string | null
  bind(sessionId: string, lastEventUuid?: string | null): void
}

interface TokenMeterRef {
  getSessionStats(): SessionCostStats
  getTodayStats(): AggregateStats[]
  getMonthStats(): AggregateStats[]
  getCacheHitRate(): number
}

interface SkillStoreRef {
  getAll(): SkillMetadata[]
  getContent(name: string): Promise<string | null>
}

interface PluginRegistryRef {
  list(): LoadedPluginInfo[]
}

interface MemoryManagerRef {
  list(scope?: MemoryScope | 'all'): Promise<MemoryEntry[]>
  search(query: MemoryQuery): Promise<MemorySearchResult[]>
  delete(id: string): Promise<void>
  write(input: Omit<MemoryEntry, 'id' | 'created' | 'updated'>): Promise<MemoryEntry>
  rebuild(): Promise<void>
}

export interface CreateEngineServiceApiOptions {
  cwd?: string
  loadConfigFn?: (cwd: string) => CCodeConfig
  createProviderFn?: (providerName: string, config: CCodeConfig) => LLMProvider
  contextManagerRef?: ContextManagerRef
  contextTrackerRef?: ContextTrackerRef
  sessionStoreRef?: SessionStoreRef
  sessionLoggerRef?: SessionLoggerRef
  generateEventIdFn?: () => string
  tokenMeterRef?: TokenMeterRef
  getMemoryManagerFn?: () => MemoryManagerRef | null
  configManager?: ConfigManager
  readMemoryOverviewFn?: typeof readMemoryOverview
  rebuildMemoryIndexFn?: typeof rebuildMemoryIndex
  getMcpStatusFn?: typeof getMcpStatus
  readMcpOverviewFn?: typeof readMcpOverview
  addMcpServerFn?: typeof addMcpServer
  deleteMcpServerFn?: typeof deleteMcpServer
  ensureSkillsDiscoveredFn?: typeof ensureSkillsDiscovered
  skillStoreRef?: SkillStoreRef
  readSkillsPluginsOverviewFn?: typeof readSkillsPluginsOverview
  pluginRegistryRef?: PluginRegistryRef
  getCleanupStatsFn?: typeof getCleanupStats
  executeCleanupFn?: typeof executeCleanup
}

function normalizeModelInput(value: string, field: 'provider' | 'model'): string {
  const normalized = value.trim()
  if (!normalized) {
    throw new Error(`runtime.setModel.${field} 不能为空。`)
  }
  return normalized
}

function resolveMemoryManager(getMemoryManagerFn: () => MemoryManagerRef | null): MemoryManagerRef {
  const manager = getMemoryManagerFn()
  if (!manager) {
    throw new Error('记忆系统未初始化。')
  }
  return manager
}

function deriveMemoryTitle(content: string): string {
  const firstLine = content.split('\n')[0] ?? content
  return firstLine.length > 30 ? `${firstLine.slice(0, 27)}...` : firstLine
}

function toStructuredHistory(snapshot: SessionSnapshot): Message[] {
  return snapshot.messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map((message) => ({
      role: message.role,
      content: getMessagePlainText(message),
    }))
    .filter((message) => message.content.length > 0)
}

function createResumeEvent(input: {
  sessionId: string
  parentUuid: string | null
  cwd: string
  provider: string
  model: string
  accumulatedMs: number
  eventId: string
}): SessionEvent {
  return {
    sessionId: input.sessionId,
    type: 'session_resume',
    timestamp: new Date().toISOString(),
    uuid: input.eventId,
    parentUuid: input.parentUuid,
    cwd: input.cwd,
    conversationSchemaVersion: SESSION_CONVERSATION_SCHEMA_VERSION,
    provider: input.provider,
    model: input.model,
    accumulatedMs: input.accumulatedMs,
  }
}

export function createEngineServiceApi(
  options: CreateEngineServiceApiOptions = {},
): EngineServiceApi {
  const runtimeCwd = options.cwd ?? process.cwd()
  const loadConfigFn = options.loadConfigFn ?? loadEffectiveRuntimeConfig
  const createProviderFn = options.createProviderFn ?? getOrCreateProvider
  const contextManagerRef = options.contextManagerRef ?? contextManager
  const contextTrackerRef = options.contextTrackerRef ?? contextTracker
  const sessionStoreRef = options.sessionStoreRef ?? sessionStore
  const sessionLoggerRef = options.sessionLoggerRef ?? sessionLogger
  const generateEventIdFn = options.generateEventIdFn ?? generateEventId
  const tokenMeterRef = options.tokenMeterRef ?? tokenMeter
  const getMemoryManagerFn = options.getMemoryManagerFn ?? getMemoryManager
  const configManager = options.configManager ?? new ConfigManager()
  const readMemoryOverviewFn = options.readMemoryOverviewFn ?? readMemoryOverview
  const rebuildMemoryIndexFn = options.rebuildMemoryIndexFn ?? rebuildMemoryIndex
  const getMcpStatusFn = options.getMcpStatusFn ?? getMcpStatus
  const readMcpOverviewFn = options.readMcpOverviewFn ?? readMcpOverview
  const addMcpServerFn = options.addMcpServerFn ?? addMcpServer
  const deleteMcpServerFn = options.deleteMcpServerFn ?? deleteMcpServer
  const ensureSkillsDiscoveredFn = options.ensureSkillsDiscoveredFn ?? ensureSkillsDiscovered
  const skillStoreRef = options.skillStoreRef ?? skillStore
  const readSkillsPluginsOverviewFn = options.readSkillsPluginsOverviewFn ?? readSkillsPluginsOverview
  const pluginRegistryRef = options.pluginRegistryRef ?? pluginRegistry
  const getCleanupStatsFn = options.getCleanupStatsFn ?? getCleanupStats
  const executeCleanupFn = options.executeCleanupFn ?? executeCleanup

  const initialConfig = loadConfigFn(runtimeCwd)
  const runtimeModelState: RuntimeModelSelection = {
    provider: initialConfig.defaultProvider,
    model: initialConfig.defaultModel,
  }

  const runtimeService: RuntimeCommandService = {
    setModel(input) {
      runtimeModelState.provider = normalizeModelInput(input.provider, 'provider')
      runtimeModelState.model = normalizeModelInput(input.model, 'model')
      return { ...runtimeModelState }
    },

    getModelSelection() {
      return { ...runtimeModelState }
    },

    async compactContext(input) {
      const history = contextManagerRef.getHistoryRef()
      if (history.length === 0) {
        return {
          ok: false,
          reason: 'empty-history',
          message: 'No messages to compact.',
        }
      }

      const provider = input?.provider ?? runtimeModelState.provider
      const model = input?.model ?? runtimeModelState.model
      const config = {
        ...loadConfigFn(runtimeCwd),
        defaultProvider: provider,
        defaultModel: model,
      }
      const llmProvider = createProviderFn(provider, config)
      const compacted = await contextManagerRef.compact(history, llmProvider, {
        model,
        ...(input?.strategy !== undefined ? { strategy: input.strategy } : {}),
        ...(input?.focus !== undefined ? { focus: input.focus } : {}),
      })
      contextManagerRef.replaceHistory(compacted.history)
      return {
        ok: true,
        summary: compacted.summary,
        history: compacted.history,
        tokensBefore: compacted.tokensBefore,
        compactedMessageCount: compacted.compactedMessageCount,
        strategy: input?.strategy ?? contextManagerRef.getStrategyName(),
      }
    },

    getContextSnapshot() {
      const state = contextTrackerRef.getState()
      return {
        provider: runtimeModelState.provider,
        model: runtimeModelState.model,
        strategy: contextManagerRef.getStrategyName(),
        historyLength: contextManagerRef.getHistoryRef().length,
        totalWindow: state.totalWindow,
        outputReserve: state.outputReserve,
        effectiveWindow: state.effectiveWindow,
        lastInputTokens: state.lastInputTokens,
        usedPercentage: state.usedPercentage,
        remaining: state.remaining,
        level: state.level,
      }
    },
  }

  const sessionService: SessionService = {
    listSessions(optionsInput) {
      return sessionStoreRef.list(optionsInput)
    },

    listBranches(sessionId) {
      return sessionStoreRef.listBranches(sessionId)
    },

    loadSession(sessionId, leafEventUuid) {
      return sessionStoreRef.loadMessages(sessionId, leafEventUuid)
    },

    resumeSession(input) {
      const snapshot = sessionStoreRef.loadMessages(input.sessionId, input.leafEventUuid)
      contextManagerRef.restoreHistory(toStructuredHistory(snapshot))
      sessionLoggerRef.bind(input.sessionId, snapshot.leafEventUuid)

      const provider = input.provider ?? runtimeModelState.provider
      const model = input.model ?? runtimeModelState.model
      const resumeEventId = generateEventIdFn()
      sessionStoreRef.append(
        input.sessionId,
        createResumeEvent({
          sessionId: input.sessionId,
          parentUuid: snapshot.leafEventUuid,
          cwd: input.cwd ?? snapshot.cwd ?? runtimeCwd,
          provider,
          model,
          accumulatedMs: input.accumulatedMs ?? 0,
          eventId: resumeEventId,
        }),
      )
      sessionLoggerRef.bind(input.sessionId, resumeEventId)
      return {
        snapshot,
        resumeEventId,
      }
    },

    forkFromEvent(input) {
      const snapshot = sessionStoreRef.loadMessages(input.sessionId, input.eventUuid)
      contextManagerRef.restoreHistory(toStructuredHistory(snapshot))
      sessionLoggerRef.bind(input.sessionId, input.eventUuid)

      const provider = input.provider ?? runtimeModelState.provider
      const model = input.model ?? runtimeModelState.model
      const resumeEventId = generateEventIdFn()
      sessionStoreRef.append(
        input.sessionId,
        createResumeEvent({
          sessionId: input.sessionId,
          parentUuid: input.eventUuid,
          cwd: input.cwd ?? snapshot.cwd ?? runtimeCwd,
          provider,
          model,
          accumulatedMs: input.accumulatedMs ?? 0,
          eventId: resumeEventId,
        }),
      )
      sessionLoggerRef.bind(input.sessionId, resumeEventId)

      return {
        snapshot,
        resumeEventId,
      }
    },

    clearConversation() {
      contextManagerRef.clearHistory()
    },

    getCurrentSessionId() {
      return sessionLoggerRef.sessionId
    },
  }

  const memoryService: MemoryService = {
    async list(scope) {
      return resolveMemoryManager(getMemoryManagerFn).list(scope)
    },

    async search(input) {
      return resolveMemoryManager(getMemoryManagerFn).search({
        query: input.query,
        ...(input.topK !== undefined ? { topK: input.topK } : {}),
        ...(input.scope !== undefined ? { scope: input.scope } : {}),
        ...(input.tags !== undefined ? { tags: input.tags } : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
      })
    },

    async delete(id) {
      await resolveMemoryManager(getMemoryManagerFn).delete(id)
    },

    async write(input) {
      const content = input.content.trim()
      if (!content) {
        throw new Error('memoryService.write.content 不能为空。')
      }
      return resolveMemoryManager(getMemoryManagerFn).write({
        scope: input.scope ?? 'project',
        title: input.title?.trim() || deriveMemoryTitle(content),
        content,
        type: input.type ?? 'user',
        tags: input.tags ?? [],
        source: input.source ?? 'user',
        filePath: input.filePath ?? '',
      })
    },

    async rebuild() {
      await resolveMemoryManager(getMemoryManagerFn).rebuild()
    },

    async getOverview(projectPath) {
      return readMemoryOverviewFn(projectPath, {
        configManager,
      })
    },

    async rebuildIndex(projectPath) {
      return rebuildMemoryIndexFn(projectPath, {
        configManager,
      })
    },
  }

  const mcpService: McpService = {
    async getStatus() {
      return getMcpStatusFn()
    },

    async getOverview() {
      return readMcpOverviewFn()
    },

    async addServer(input) {
      return addMcpServerFn(input)
    },

    async deleteServer(name) {
      return deleteMcpServerFn(name)
    },
  }

  const skillsService: SkillsService = {
    async list() {
      await ensureSkillsDiscoveredFn()
      return skillStoreRef.getAll()
    },

    async getContent(name) {
      await ensureSkillsDiscoveredFn()
      return skillStoreRef.getContent(name)
    },

    async getOverview() {
      return readSkillsPluginsOverviewFn()
    },
  }

  const usageService: UsageService = {
    getSummary() {
      return {
        session: tokenMeterRef.getSessionStats(),
        today: tokenMeterRef.getTodayStats(),
        month: tokenMeterRef.getMonthStats(),
        cacheHitRate: tokenMeterRef.getCacheHitRate(),
      }
    },
  }

  const pluginService: PluginService = {
    list() {
      return pluginRegistryRef.list()
    },
  }

  const maintenanceService: MaintenanceService = {
    getStats(optionsInput) {
      return getCleanupStatsFn(optionsInput)
    },

    cleanup(optionsInput) {
      return executeCleanupFn(optionsInput)
    },
  }

  return {
    runtime: runtimeService,
    sessionService,
    memoryService,
    mcpService,
    skillsService,
    usageService,
    pluginService,
    maintenanceService,
  }
}
