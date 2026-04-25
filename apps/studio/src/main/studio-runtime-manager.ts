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

  return {
    getEngineServiceApi,

    async acquireRuntime(optionsInput) {
      const key = buildRuntimeKey(optionsInput.selection)
      const existingEntry = runtimeEntries.get(key)
      const reactivated = activeRuntimeKey !== key
      activeRuntimeKey = key

      if (existingEntry) {
        existingEntry.selection = optionsInput.selection
        existingEntry.lastUsedAt = Date.now()
        existingEntry.bridgeState.hostState = optionsInput.hostState
        existingEntry.bridgeState.eventSink = optionsInput.emitRuntimeEvent
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

      return {
        entry,
        reused: false,
        reactivated,
      }
    },

    releaseRuntime(entry) {
      entry.bridgeState.eventSink = null
      entry.bridgeState.submitActivity = null
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
