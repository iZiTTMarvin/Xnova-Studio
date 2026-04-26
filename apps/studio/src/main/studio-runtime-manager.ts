import {
  createEngineServiceApi,
  type EngineServiceApi,
  type RuntimeConfigInput,
  type RuntimeHostBridge,
  type RuntimeInstance,
  type RuntimeSnapshot,
} from '@xnova/runtime'
import type {
  StudioHostState,
  StudioRuntimeEvent,
} from '../shared/studio-bridge-contract'

export interface StudioRuntimeSelection {
  cwd: string
  workspaceRoot: string
  sessionId: string | null
  agentId: string | null
}

export interface StudioRuntimeBridgeState {
  hostState: StudioHostState
  eventSink: ((event: StudioRuntimeEvent) => void) | null
  submitActivity: {
    start(): void
    touch(): void
    suspend(): void
    resume(): void
    clear(): void
  } | null
}

export interface StudioManagedRuntimeEntry {
  key: string
  selection: StudioRuntimeSelection
  engineServiceApi: EngineServiceApi
  instance: RuntimeInstance
  bridgeState: StudioRuntimeBridgeState
  lastUsedAt: number
}

export interface AcquireStudioRuntimeOptions {
  selection: StudioRuntimeSelection
  config: RuntimeConfigInput['config']
  hostState: StudioHostState
  emitRuntimeEvent: (event: StudioRuntimeEvent) => void
  createRuntimeFn: (
    input: RuntimeConfigInput,
    bridge: RuntimeHostBridge,
  ) => Promise<RuntimeInstance>
  createBridge: (
    bridgeState: StudioRuntimeBridgeState,
    selection: StudioRuntimeSelection,
  ) => RuntimeHostBridge
}

export interface AcquireStudioRuntimeResult {
  entry: StudioManagedRuntimeEntry
  reused: boolean
  reactivated: boolean
}

export interface CreateStudioRuntimeManagerOptions {
  createEngineServiceApiFn?: (workspaceRoot: string) => EngineServiceApi
  /**
   * 非活跃 runtime 实例的最大保留数量（默认 3）。
   * 切换到第 N+1 个 (workspace, agent, session) 组合时，最老的非活跃实例会被
   * dispose() 并从 Map 中清理，避免 RuntimeInstance 永久驻留导致内存泄漏。
   * 当前 active 实例不会被淘汰。
   */
  maxIdleEntries?: number
  /** 测试钩子：当某个 entry 被淘汰并 dispose 时调用 */
  onEvict?: (entry: StudioManagedRuntimeEntry) => void
}

export interface StudioRuntimeManager {
  getEngineServiceApi(workspaceRoot: string): EngineServiceApi
  acquireRuntime(options: AcquireStudioRuntimeOptions): Promise<AcquireStudioRuntimeResult>
  releaseRuntime(entry: StudioManagedRuntimeEntry): void
  commitSession(
    entry: StudioManagedRuntimeEntry,
    sessionId: string | null,
  ): StudioManagedRuntimeEntry
  getRuntimeSnapshot(hostState: StudioHostState): RuntimeSnapshot | null
  /** 当前管理的 runtime 实例数量（含 active 与 idle） */
  getEntryCount(): number
  dispose(): Promise<void>
}

function buildRuntimeKey(selection: StudioRuntimeSelection): string {
  return [
    selection.workspaceRoot,
    selection.cwd,
    selection.agentId ?? '__default_agent__',
    selection.sessionId ?? '__draft_session__',
  ].join('::')
}

export function createStudioRuntimeManager(
  options: CreateStudioRuntimeManagerOptions = {},
): StudioRuntimeManager {
  const createEngineServiceApiFn =
    options.createEngineServiceApiFn ??
    ((workspaceRoot: string) => createEngineServiceApi({ cwd: workspaceRoot }))
  const engineServiceApiCache = new Map<string, EngineServiceApi>()
  const runtimeEntries = new Map<string, StudioManagedRuntimeEntry>()
  // 默认保留 3 个非活跃实例：覆盖"用户偶尔切回上一个 / 上上个 session"的场景，
  // 同时严格限制实例总数避免内存累积。
  const maxIdleEntries = Math.max(0, options.maxIdleEntries ?? 3)
  let activeRuntimeKey: string | null = null

  function getEngineServiceApi(workspaceRoot: string): EngineServiceApi {
    const normalizedWorkspaceRoot = workspaceRoot.trim()
    const cached = engineServiceApiCache.get(normalizedWorkspaceRoot)
    if (cached) {
      return cached
    }

    const nextEngineServiceApi = createEngineServiceApiFn(normalizedWorkspaceRoot)
    engineServiceApiCache.set(normalizedWorkspaceRoot, nextEngineServiceApi)
    return nextEngineServiceApi
  }

  /**
   * LRU 淘汰：保留最近使用的 maxIdleEntries 个非活跃实例。
   * - 不淘汰 active 实例（当前正在用的）
   * - 按 lastUsedAt 升序淘汰最老的
   * - dispose 是 fire-and-forget；底层 dispose() 内部已 abort + 释放 provider
   */
  function evictIdleEntries(): void {
    const idleEntries = [...runtimeEntries.values()]
      .filter((entry) => entry.key !== activeRuntimeKey)
      .sort((left, right) => left.lastUsedAt - right.lastUsedAt)

    const overflow = idleEntries.length - maxIdleEntries
    if (overflow <= 0) {
      return
    }

    for (let index = 0; index < overflow; index += 1) {
      const victim = idleEntries[index]
      if (!victim) {
        continue
      }
      runtimeEntries.delete(victim.key)
      victim.bridgeState.eventSink = null
      victim.bridgeState.submitActivity = null
      options.onEvict?.(victim)
      void victim.instance.dispose().catch(() => {
        // dispose 失败不阻塞 release；底层会自行 abort 并清理资源
      })
    }
  }

  return {
    getEngineServiceApi,

    async acquireRuntime(optionsInput) {
      const key = buildRuntimeKey(optionsInput.selection)
      const existingEntry = runtimeEntries.get(key)
      const reactivated = activeRuntimeKey !== key
      const previousActiveKey = activeRuntimeKey
      activeRuntimeKey = key

      if (existingEntry) {
        existingEntry.selection = optionsInput.selection
        existingEntry.lastUsedAt = Date.now()
        existingEntry.bridgeState.hostState = optionsInput.hostState
        existingEntry.bridgeState.eventSink = optionsInput.emitRuntimeEvent
        // 切换了 active：旧的 active 现在变 idle，触发 LRU 淘汰评估
        if (previousActiveKey !== null && previousActiveKey !== key) {
          evictIdleEntries()
        }
        return {
          entry: existingEntry,
          reused: true,
          reactivated,
        }
      }

      const bridgeState: StudioRuntimeBridgeState = {
        hostState: optionsInput.hostState,
        eventSink: optionsInput.emitRuntimeEvent,
        submitActivity: null,
      }
      const engineServiceApi = getEngineServiceApi(optionsInput.selection.workspaceRoot)
      const instance = await optionsInput.createRuntimeFn(
        {
          cwd: optionsInput.selection.cwd,
          workspaceRoot: optionsInput.selection.workspaceRoot,
          config: optionsInput.config,
          mode: 'standard',
        },
        optionsInput.createBridge(bridgeState, optionsInput.selection),
      )
      const entry: StudioManagedRuntimeEntry = {
        key,
        selection: optionsInput.selection,
        engineServiceApi,
        instance,
        bridgeState,
        lastUsedAt: Date.now(),
      }
      runtimeEntries.set(key, entry)
      // 新建 entry 后评估 LRU：之前的 active 现在变 idle，
      // 加上其他历史 idle 实例可能超过上限，需要淘汰最老的几个。
      evictIdleEntries()

      return {
        entry,
        reused: false,
        reactivated,
      }
    },

    releaseRuntime(entry) {
      // 仅清空 bridge 引用，保留实例供下一次 acquire 复用。
      // 实例的真正 dispose 由 LRU 在切到新 entry 时按"非活跃 + 超出上限"触发。
      entry.bridgeState.eventSink = null
      entry.bridgeState.submitActivity = null
    },

    getEntryCount() {
      return runtimeEntries.size
    },

    commitSession(entry, sessionId) {
      const nextSessionId = sessionId?.trim() || null
      if (entry.selection.sessionId === nextSessionId) {
        entry.lastUsedAt = Date.now()
        return entry
      }

      const previousKey = entry.key
      const nextSelection: StudioRuntimeSelection = {
        ...entry.selection,
        sessionId: nextSessionId,
      }
      const nextKey = buildRuntimeKey(nextSelection)
      runtimeEntries.delete(previousKey)
      entry.selection = nextSelection
      entry.key = nextKey
      entry.lastUsedAt = Date.now()
      runtimeEntries.set(nextKey, entry)
      if (activeRuntimeKey === previousKey) {
        activeRuntimeKey = nextKey
      }
      return entry
    },

    getRuntimeSnapshot(hostState) {
      const workspacePath = hostState.workspacePath?.trim()
      if (!workspacePath) {
        return null
      }

      const activeEntry =
        activeRuntimeKey === null ? null : runtimeEntries.get(activeRuntimeKey) ?? null
      if (
        activeEntry &&
        (activeEntry.selection.workspaceRoot === workspacePath ||
          activeEntry.selection.cwd === workspacePath)
      ) {
        return activeEntry.instance.getSnapshot()
      }

      const matchingEntry = [...runtimeEntries.values()]
        .filter(
          (entry) =>
            entry.selection.workspaceRoot === workspacePath ||
            entry.selection.cwd === workspacePath,
        )
        .sort((left, right) => right.lastUsedAt - left.lastUsedAt)[0]

      return matchingEntry?.instance.getSnapshot() ?? null
    },

    async dispose() {
      const entries = [...runtimeEntries.values()]
      runtimeEntries.clear()
      engineServiceApiCache.clear()
      activeRuntimeKey = null

      await Promise.all(entries.map((entry) => entry.instance.dispose()))
    },
  }
}
