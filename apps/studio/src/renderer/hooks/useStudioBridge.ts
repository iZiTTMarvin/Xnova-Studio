import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type {
  PermissionDialogRequest,
  PermissionDialogResponse,
  RuntimeCancelResult,
  RuntimeInspectResult,
  StudioBridgeApi,
  StudioHostState,
  StudioShellSnapshot,
  StudioRunStatus,
  StudioSettingsApi,
  StudioRuntimeEvent,
  UserQuestionDialogRequest,
  UserQuestionDialogResponse,
  RuntimeWarmupPrepareRequest,
  RuntimeWarmupStatusChangedEvent,
} from '../../shared/studio-bridge-contract'
import {
  clearProjectWorkPreference,
  readProjectWorkPreference,
  writeProjectWorkPreference,
} from '../utils/work-preferences'
import { createToolRunningStep } from '../utils/tool-event-summary'
import { hydrateStudioBridgeSnapshot } from '../utils/studio-bridge-hydration'
import {
  appendLiveSystemBlock,
  applyBufferedLiveDeltaChunks,
  createEmptyLiveConversation,
  finalizeOpenThinkingBlocks,
  RUN_STEP_CALLING_MODEL,
  RUN_STEP_STOPPING,
  useRuntimeStore,
  type LiveConversationBlock,
  type LiveConversationState,
} from '../stores/runtime-store'
import { useSessionStore } from '../stores/session-store'
import { useSettingsStore } from '../stores/settings-store'

interface SubmitPromptResult {
  ok: boolean
  error?: string
  reportedToTimeline?: boolean
}

export type { ContextState, LiveConversationBlock, LiveConversationState }
  from '../stores/runtime-store'

interface PendingLiveDeltaChunk {
  kind: 'text' | 'thinking'
  content: string
}

const RUN_IDLE_WARNING_MS = 90_000
const RUN_IDLE_WARNING_MESSAGE = '运行长时间没有新进展，可以停止后重试'

/**
 * finalizedRunIdsRef 的 LRU 上限 — 防止长会话累积万级 runId 占用 renderer 内存。
 * 64 已经覆盖"用户翻历史时上下来回切几个 run"的场景，超出即作废最老的。
 */
export const FINALIZED_RUN_IDS_LIMIT = 64

/**
 * 把一个 finalized runId 写入 Set，并按"最近插入"语义维护 LRU 上限。
 * Set 在 JS 中按插入顺序迭代，因此 `set.values().next().value` 即最老元素。
 *
 * 抽离为模块级函数是为了：
 * 1) 让单测能直接断言 LRU 边界，不需要构造完整的 useStudioBridge 场景；
 * 2) 让 hook 内的 closure 保持纯粹，避免把限额魔法常数散落进 hook body。
 */
export function addFinalizedRunIdToLruSet(
  set: Set<string>,
  runId: string,
  limit: number,
): void {
  // 已存在：先删后加，把它移到 LRU 尾部
  if (set.has(runId)) {
    set.delete(runId)
  }
  set.add(runId)
  while (set.size > limit) {
    const oldest = set.values().next().value
    if (oldest === undefined) {
      break
    }
    set.delete(oldest)
  }
}

type RendererSubmitTimingStatus = 'completed' | 'failed' | 'cancelled'

interface RendererSubmitTimingState {
  enabled: boolean
  marks: Map<string, number>
  finished: boolean
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isRendererSubmitTimingEnabled(): boolean {
  const isDev = import.meta.env.DEV === true && import.meta.env.MODE !== 'test'
  try {
    return isDev || window.localStorage.getItem('XNOVA_TIMING_DEBUG') === '1'
  } catch {
    return isDev
  }
}

function formatRendererTimingDuration(ms: number): string {
  if (ms < 1_000) {
    return `${Math.max(0, Math.round(ms))}ms`
  }
  return `${Math.round((ms / 1_000) * 10) / 10}s`
}

function buildRendererTimingSummary(
  marks: Map<string, number>,
): string[] {
  const lines: Array<{ label: string; from: string; to: string }> = [
    {
      label: 'user submit clicked -> runtime submit invoked',
      from: 'user_submit_clicked',
      to: 'renderer_runtime_submit_invoked',
    },
    {
      label: 'runtime submit invoked -> run_started received',
      from: 'renderer_runtime_submit_invoked',
      to: 'renderer_received_run_started',
    },
    {
      label: 'run_started -> model request started received',
      from: 'renderer_received_run_started',
      to: 'renderer_received_model_request_started',
    },
    {
      label: 'model request started -> model first chunk received',
      from: 'renderer_received_model_request_started',
      to: 'renderer_received_model_first_chunk',
    },
    {
      label: 'runtime submit invoked -> first visible progress received',
      from: 'renderer_runtime_submit_invoked',
      to: 'renderer_received_first_visible_progress',
    },
  ]

  return lines.flatMap((line) => {
    const from = marks.get(line.from)
    const to = marks.get(line.to)
    if (from === undefined || to === undefined || to < from) {
      return []
    }
    return [`- ${line.label}: ${formatRendererTimingDuration(to - from)}`]
  })
}

function isActiveRunStatus(status: StudioRunStatus): boolean {
  return (
    status === 'starting' ||
    status === 'running' ||
    status === 'waiting_permission' ||
    status === 'waiting_user_input' ||
    status === 'tool_calling' ||
    status === 'cancelling'
  )
}

function buildShellRequest(
  projectPath?: string | null,
  sessionId?: string | null,
) {
  return {
    ...(projectPath === undefined ? {} : { projectPath }),
    ...(sessionId === undefined ? {} : { sessionId }),
  }
}

export function useStudioBridge() {
  const [bridge, setBridge] = useState(() => window.xnovaStudio ?? null)
  const {
    hostState,
    shellSnapshot,
    selectedProjectPath,
    selectedSessionId,
    recoveryState,
    setHostStatus,
    setHostState,
    setHostError,
    setIsOpeningWorkspace,
    setShellStatus,
    setShellSnapshot,
    setShellError,
    setSelectedProjectPath,
    setSelectedSessionId,
    setRecoveryState,
    resetSessionState,
  } = useSessionStore(
    useShallow((state) => ({
      hostStatus: state.hostStatus,
      hostState: state.hostState,
      shellSnapshot: state.shellSnapshot,
      selectedProjectPath: state.selectedProjectPath,
      selectedSessionId: state.selectedSessionId,
      recoveryState: state.recoveryState,
      setHostStatus: state.setHostStatus,
      setHostState: state.setHostState,
      setHostError: state.setHostError,
      setIsOpeningWorkspace: state.setIsOpeningWorkspace,
      setShellStatus: state.setShellStatus,
      setShellSnapshot: state.setShellSnapshot,
      setShellError: state.setShellError,
      setSelectedProjectPath: state.setSelectedProjectPath,
      setSelectedSessionId: state.setSelectedSessionId,
      setRecoveryState: state.setRecoveryState,
      resetSessionState: state.resetSessionState,
    })),
  )
  const {
    currentMode,
    currentAgentId,
    currentProviderId,
    currentModelId,
    setCurrentMode,
    setCurrentAgentId,
    setCurrentProviderId,
    setCurrentModelId,
    setCurrentProviderModel,
    resetSettingsState,
  } = useSettingsStore(
    useShallow((state) => ({
      currentMode: state.currentMode,
      currentAgentId: state.currentAgentId,
      currentProviderId: state.currentProviderId,
      currentModelId: state.currentModelId,
      setCurrentMode: state.setCurrentMode,
      setCurrentAgentId: state.setCurrentAgentId,
      setCurrentProviderId: state.setCurrentProviderId,
      setCurrentModelId: state.setCurrentModelId,
      setCurrentProviderModel: state.setCurrentProviderModel,
      resetSettingsState: state.resetSettingsState,
    })),
  )
  const {
    runtimeStatus,
    runtimeInspectResult,
    runStatus,
    currentRunId,
    lastRuntimeEventAt,
    setRuntimeStatus,
    setRuntimeInspectResult,
    setRuntimeError,
    setLastRuntimeEvent,
    setPendingPermissionRequest,
    setPendingUserInputRequest,
    setIsSubmitting,
    setRunStatus,
    setCurrentRunId,
    setLastRuntimeEventAt,
    setRunIdleWarning,
    setCurrentRunStep,
    setLiveConversation,
    setContextState,
    setWarmupStatus,
    handleRuntimeEvent,
    resetRuntimeState,
  } = useRuntimeStore(
    useShallow((state) => ({
      runtimeStatus: state.runtimeStatus,
      runtimeInspectResult: state.runtimeInspectResult,
      runStatus: state.runStatus,
      currentRunId: state.currentRunId,
      lastRuntimeEventAt: state.lastRuntimeEventAt,
      setRuntimeStatus: state.setRuntimeStatus,
      setRuntimeInspectResult: state.setRuntimeInspectResult,
      setRuntimeError: state.setRuntimeError,
      setLastRuntimeEvent: state.setLastRuntimeEvent,
      setPendingPermissionRequest: state.setPendingPermissionRequest,
      setPendingUserInputRequest: state.setPendingUserInputRequest,
      setIsSubmitting: state.setIsSubmitting,
      setRunStatus: state.setRunStatus,
      setCurrentRunId: state.setCurrentRunId,
      setLastRuntimeEventAt: state.setLastRuntimeEventAt,
      setRunIdleWarning: state.setRunIdleWarning,
      setCurrentRunStep: state.setCurrentRunStep,
      setLiveConversation: state.setLiveConversation,
      setContextState: state.setContextState,
      setWarmupStatus: state.setWarmupStatus,
      handleRuntimeEvent: state.handleRuntimeEvent,
      resetRuntimeState: state.resetRuntimeState,
    })),
  )
  const cancelRequestedRef = useRef(false)
  const rendererSubmitTimingRef = useRef<RendererSubmitTimingState>({
    enabled: false,
    marks: new Map(),
    finished: false,
  })
  const liveBlockSequenceRef = useRef(0)
  const pendingLiveDeltaChunksRef = useRef<PendingLiveDeltaChunk[]>([])
  const pendingLiveDeltaRafRef = useRef<number | null>(null)
  const activeRunIdRef = useRef<string | null>(null)
  const finalizedRunIdsRef = useRef<Set<string>>(new Set())
  const recordFinalizedRunId = (runId: string): void => {
    addFinalizedRunIdToLruSet(finalizedRunIdsRef.current, runId, FINALIZED_RUN_IDS_LIMIT)
  }
  const finalizedTerminalStatusRef = useRef<StudioRunStatus | null>(null)
  const activeWarmupSelectionKeyRef = useRef<string | null>(null)
  const warmupPrepareSequenceRef = useRef(0)
  /**
   * submit / 会话切换 / 项目切换的 epoch。
   * submit 成功后的 refreshStateAsync 是 fire-and-forget 异步，
   * 在 await 中间用户可能已经发起了下一次 submit 或切换会话/项目。
   * 这里递增 epoch，refresh 闭包捕获自己启动时的 epoch，
   * await 完成后如果 epoch 已变就直接放弃 setState，避免 stale 写入。
   */
  const submitEpochRef = useRef(0)

  const createLiveBlockId = (kind: LiveConversationBlock['type']): string => {
    liveBlockSequenceRef.current += 1
    return `live-${kind}-${liveBlockSequenceRef.current}`
  }

  const cancelPendingLiveDeltaFlush = (): void => {
    if (pendingLiveDeltaRafRef.current === null) {
      return
    }
    cancelAnimationFrame(pendingLiveDeltaRafRef.current)
    pendingLiveDeltaRafRef.current = null
  }

  const drainPendingLiveDeltaChunks = (): PendingLiveDeltaChunk[] => {
    const next = pendingLiveDeltaChunksRef.current
    pendingLiveDeltaChunksRef.current = []
    return next
  }

  const clearPendingLiveDeltaChunks = (): void => {
    cancelPendingLiveDeltaFlush()
    pendingLiveDeltaChunksRef.current = []
  }

  const prepareWarmupForSelection = (
    input: RuntimeWarmupPrepareRequest,
  ): void => {
    if (!bridge?.warmup?.prepare || !input.projectPath?.trim()) {
      activeWarmupSelectionKeyRef.current = null
      setWarmupStatus('idle')
      return
    }

    const requestSequence = warmupPrepareSequenceRef.current + 1
    warmupPrepareSequenceRef.current = requestSequence

    void bridge.warmup
      .prepare(input)
      .then((result) => {
        if (warmupPrepareSequenceRef.current !== requestSequence) {
          return
        }
        activeWarmupSelectionKeyRef.current = result.selectionKey ?? null
        setWarmupStatus(result.ok ? result.status : 'failed')
      })
      .catch(() => {
        if (warmupPrepareSequenceRef.current !== requestSequence) {
          return
        }
        activeWarmupSelectionKeyRef.current = null
        setWarmupStatus('failed')
      })
  }

  const updateLiveConversationWithPending = (
    updater: (current: LiveConversationState) => LiveConversationState,
  ): void => {
    cancelPendingLiveDeltaFlush()
    const chunks = drainPendingLiveDeltaChunks()
    setLiveConversation((current) =>
      updater(applyBufferedLiveDeltaChunks(current, chunks)),
    )
  }

  const queuePendingLiveDeltaChunk = (
    kind: PendingLiveDeltaChunk['kind'],
    content: string,
  ): void => {
    if (!content) {
      return
    }
    const chunks = pendingLiveDeltaChunksRef.current
    const lastChunk = chunks.at(-1)
    if (lastChunk?.kind === kind) {
      lastChunk.content += content
    } else {
      chunks.push({ kind, content })
    }
    if (pendingLiveDeltaRafRef.current !== null) {
      return
    }
    pendingLiveDeltaRafRef.current = requestAnimationFrame(() => {
      pendingLiveDeltaRafRef.current = null
      const pendingChunks = drainPendingLiveDeltaChunks()
      if (pendingChunks.length === 0) {
        return
      }
      setLiveConversation((current) =>
        applyBufferedLiveDeltaChunks(current, pendingChunks),
      )
    })
  }

  const resetRendererSubmitTiming = (): void => {
    rendererSubmitTimingRef.current = {
      enabled: isRendererSubmitTimingEnabled(),
      marks: new Map(),
      finished: false,
    }
  }

  const markRendererSubmitTiming = (stage: string, at = Date.now()): void => {
    const timing = rendererSubmitTimingRef.current
    if (!timing.enabled || timing.marks.has(stage)) {
      return
    }
    timing.marks.set(stage, at)
  }

  const finishRendererSubmitTiming = (
    status: RendererSubmitTimingStatus,
  ): void => {
    const timing = rendererSubmitTimingRef.current
    if (!timing.enabled || timing.finished) {
      return
    }
    timing.finished = true
    const lines = buildRendererTimingSummary(timing.marks)
    if (lines.length === 0) {
      return
    }
    console.info(`Submit timing (renderer):\n${lines.join('\n')}`, {
      status,
      marks: [...timing.marks.entries()].map(([stage, at]) => ({ stage, at })),
    })
  }

  const canRestoreProjectDefaults =
    selectedProjectPath !== null &&
    (currentMode !== recoveryState.projectDefaults.mode ||
      currentAgentId !== recoveryState.projectDefaults.agentId ||
      currentModelId !== recoveryState.projectDefaults.modelId)

  const inspectRuntime = async (
    activeBridge: StudioBridgeApi,
    refresh?: boolean,
  ): Promise<RuntimeInspectResult | null> => {
    setRuntimeStatus('loading')
    setRuntimeError(null)

    try {
      const result = await activeBridge.runtime.inspect(
        refresh ? { refresh: true } : undefined,
      )
      setRuntimeInspectResult(result)

      if (result.ok) {
        setRuntimeStatus(result.status === 'ready' ? 'ready' : 'not-ready')
        setRuntimeError(null)
        return result
      }

      setRuntimeStatus('error')
      setRuntimeError(result.error)
      return result
    } catch (error) {
      setRuntimeInspectResult(null)
      setRuntimeStatus('error')
      setRuntimeError(getErrorMessage(error))
      return null
    }
  }

  useEffect(() => {
    if (bridge) {
      return
    }

    const timer = window.setInterval(() => {
      const nextBridge = window.xnovaStudio ?? null
      if (nextBridge) {
        setBridge(nextBridge)
      }
    }, 100)

    return () => {
      window.clearInterval(timer)
    }
  }, [bridge])

  useLayoutEffect(() => {
    if (!bridge) {
      resetSessionState()
      resetSettingsState()
      resetRuntimeState()
      setHostStatus('disabled')
      setHostError('宿主桥接不可用')
      setShellStatus('disabled')
      setShellError('宿主桥接不可用')
      setRuntimeStatus('disabled')
      setRuntimeError('宿主桥接不可用')
      activeRunIdRef.current = null
      finalizedRunIdsRef.current.clear()
      finalizedTerminalStatusRef.current = null
      activeWarmupSelectionKeyRef.current = null
      warmupPrepareSequenceRef.current += 1
      cancelRequestedRef.current = false
      clearPendingLiveDeltaChunks()
      return
    }

    resetSessionState()
    resetSettingsState()
    resetRuntimeState()
    setHostStatus('loading')
    setHostError(null)
    setShellStatus('loading')
    setShellError(null)
    setRuntimeStatus('loading')
    setRuntimeError(null)
    activeRunIdRef.current = null
    finalizedRunIdsRef.current.clear()
    finalizedTerminalStatusRef.current = null
    activeWarmupSelectionKeyRef.current = null
    warmupPrepareSequenceRef.current += 1
    cancelRequestedRef.current = false
    clearPendingLiveDeltaChunks()
  }, [
    bridge,
  ])

  useEffect(() => {
    if (!bridge) {
      return
    }

    let disposed = false

    const applySnapshot = (
      snapshot: StudioShellSnapshot,
      selection?: {
        projectPath?: string | null
        sessionId?: string | null
      },
    ) => {
      const hydrated = hydrateStudioBridgeSnapshot({
        snapshot,
        ...(selection === undefined ? {} : { selection }),
        readStoredPreference: readProjectWorkPreference,
      })

      setShellSnapshot(snapshot)
      setShellStatus('ready')
      setSelectedProjectPath(hydrated.projectPath)
      setSelectedSessionId(hydrated.selectedSessionId)
      setCurrentMode(hydrated.mode)
      setCurrentAgentId(hydrated.agentId)
      setCurrentProviderId(hydrated.providerId)
      setCurrentModelId(hydrated.modelId)
      setRecoveryState(hydrated.recoveryState)
      prepareWarmupForSelection({
        projectPath: hydrated.projectPath ?? '',
        agentId: hydrated.agentId,
        providerId: hydrated.providerId,
        modelId: hydrated.modelId,
        mode: hydrated.mode,
      })
    }

    const loadShellSnapshot = async (
      projectPath?: string | null,
      sessionId?: string | null,
    ) => {
      try {
        const snapshot = await bridge.shell.getSnapshot(
          buildShellRequest(projectPath, sessionId),
        )
        if (disposed) {
          return
        }

        const selection = {
          ...(projectPath === undefined ? {} : { projectPath }),
          ...(sessionId === undefined ? {} : { sessionId }),
        }
        applySnapshot(snapshot, selection)
      } catch (error) {
        if (disposed) {
          return
        }

        setShellStatus('error')
        setShellError(getErrorMessage(error))
      }
    }

    void bridge.host
      .getState()
      .then((state) => {
        if (disposed) {
          return
        }

        setHostState(state)
        setHostStatus('ready')
        const storedPreference = readProjectWorkPreference(state.workspacePath)
        void loadShellSnapshot(state.workspacePath, storedPreference?.sessionId ?? undefined)
        void inspectRuntime(bridge)
      })
      .catch((error) => {
        if (disposed) {
          return
        }

        const message = getErrorMessage(error)
        setHostStatus('error')
        setHostError(message)
        setShellStatus('error')
        setShellError(message)
        setRuntimeStatus('error')
        setRuntimeError(message)
      })

    const unsubscribeHost = bridge.host.onStateChanged((state) => {
      if (disposed) {
        return
      }

      setHostState(state)
      setHostStatus('ready')
      // workspace 切换时重置 warmup 状态，避免旧 workspace 的状态残留
      activeWarmupSelectionKeyRef.current = null
      warmupPrepareSequenceRef.current += 1
      setWarmupStatus('idle')
      const storedPreference = readProjectWorkPreference(state.workspacePath)
      void loadShellSnapshot(state.workspacePath, storedPreference?.sessionId ?? undefined)
      void inspectRuntime(bridge, true)
    })

    const unsubscribeRuntime = bridge.runtime.onEvent((event) => {
      if (disposed) {
        return
      }

      const isTerminalEvent =
        event.type === 'run_completed' ||
        event.type === 'run_failed' ||
        event.type === 'run_cancelled' ||
        event.type === 'turn_end' ||
        event.type === 'session_end' ||
        event.type === 'model_request_failed'

      if (event.type === 'run_started' && event.runId) {
        activeRunIdRef.current = event.runId
        finalizedRunIdsRef.current.delete(event.runId)
        finalizedTerminalStatusRef.current = null
      } else {
        if (event.runId) {
          if (finalizedRunIdsRef.current.has(event.runId)) {
            return
          }
          if (
            activeRunIdRef.current !== null &&
            event.runId !== activeRunIdRef.current
          ) {
            return
          }
        } else if (isTerminalEvent && finalizedTerminalStatusRef.current !== null) {
          return
        }
      }

      switch (event.type) {
        case 'run_started':
          markRendererSubmitTiming('renderer_received_run_started')
          break
        case 'model_request_started':
          markRendererSubmitTiming('renderer_received_model_request_started')
          break
        case 'model_first_chunk':
          markRendererSubmitTiming('renderer_received_model_first_chunk')
          break
        case 'text_delta':
        case 'tool_start':
        case 'tool_end':
        case 'context_update':
        case 'warning':
          markRendererSubmitTiming('renderer_received_first_visible_progress')
          break
        default:
          break
      }
      switch (event.type) {
        case 'run_started':
          cancelRequestedRef.current = false
          activeRunIdRef.current = event.runId ?? null
          break
        case 'model_request_failed':
          finishRendererSubmitTiming('failed')
          if (event.runId) {
            recordFinalizedRunId(event.runId)
          }
          finalizedTerminalStatusRef.current = 'failed'
          activeRunIdRef.current = null
          break
        case 'run_completed':
        case 'session_end':
          finishRendererSubmitTiming('completed')
          if (event.runId) {
            recordFinalizedRunId(event.runId)
          }
          finalizedTerminalStatusRef.current = 'completed'
          activeRunIdRef.current = null
          break
        case 'turn_end':
          finishRendererSubmitTiming(
            event.payload?.error || event.payload?.aborted === true
              ? 'failed'
              : 'completed',
          )
          if (event.runId) {
            recordFinalizedRunId(event.runId)
          }
          finalizedTerminalStatusRef.current =
            event.payload?.error || event.payload?.aborted === true
              ? 'failed'
              : 'completed'
          activeRunIdRef.current = null
          break
        case 'run_failed':
          finishRendererSubmitTiming('failed')
          if (event.runId) {
            recordFinalizedRunId(event.runId)
          }
          finalizedTerminalStatusRef.current = 'failed'
          activeRunIdRef.current = null
          break
        case 'run_cancelled':
          finishRendererSubmitTiming('cancelled')
          if (event.runId) {
            recordFinalizedRunId(event.runId)
          }
          finalizedTerminalStatusRef.current = 'cancelled'
          activeRunIdRef.current = null
          break
        default:
          break
      }
      handleRuntimeEvent(event)
    })
    const unsubscribePermission =
      bridge.permission?.onRequest((request) => {
        if (disposed) {
          return
        }

        setPendingPermissionRequest(request)
        setRunStatus('waiting_permission')
        setCurrentRunStep('等待用户确认')
      }) ?? (() => undefined)
    const unsubscribeUserInput =
      bridge.userInput?.onRequest((request) => {
        if (disposed) {
          return
        }

        setPendingUserInputRequest(request)
        setRunStatus('waiting_user_input')
        setCurrentRunStep('等待用户输入')
      }) ?? (() => undefined)

    // 订阅 warmup 状态变更 — 辅助提示，不影响 composer 可用性
    const unsubscribeWarmup =
      bridge.warmup?.onStatusChanged((event) => {
        if (disposed) {
          return
        }
        const activeSelectionKey = activeWarmupSelectionKeyRef.current
        if (event.selectionKey) {
          if (event.selectionKey !== activeSelectionKey) {
            return
          }
        } else if (activeSelectionKey) {
          return
        }
        setWarmupStatus(event.status)
      }) ?? (() => undefined)

    return () => {
      disposed = true
      clearPendingLiveDeltaChunks()
      unsubscribeHost()
      unsubscribeRuntime()
      unsubscribePermission()
      unsubscribeUserInput()
      unsubscribeWarmup()
    }
  }, [bridge])

  useEffect(() => {
    if (runStatus !== 'running' && runStatus !== 'tool_calling') {
      setRunIdleWarning(null)
      return
    }

    const updateWarning = () => {
      if (
        lastRuntimeEventAt !== null &&
        Date.now() - lastRuntimeEventAt >= RUN_IDLE_WARNING_MS
      ) {
        setRunIdleWarning(RUN_IDLE_WARNING_MESSAGE)
      }
    }

    updateWarning()
    const timer = window.setInterval(updateWarning, 1_000)
    return () => {
      window.clearInterval(timer)
    }
  }, [lastRuntimeEventAt, runStatus])

  const openWorkspace = async (): Promise<void> => {
    if (!bridge) {
      return
    }

    setIsOpeningWorkspace(true)
    setHostError(null)
    setShellError(null)

    try {
      const response = await bridge.host.openWorkspace()
      setHostState(response.state)
      if (!response.selection.ok && response.selection.code !== 'cancelled') {
        setHostError(response.selection.message)
      }
      const storedPreference = readProjectWorkPreference(response.state.workspacePath)

      const snapshot = await bridge.shell.getSnapshot(
        buildShellRequest(
          response.state.workspacePath,
          storedPreference?.sessionId ?? undefined,
        ),
      )
      setShellStatus('ready')
      const hydrated = hydrateStudioBridgeSnapshot({
        snapshot,
        selection: {
          projectPath: response.state.workspacePath,
        },
        readStoredPreference: readProjectWorkPreference,
      })
      setShellSnapshot(snapshot)
      setSelectedProjectPath(hydrated.projectPath)
      setSelectedSessionId(hydrated.selectedSessionId)
      setCurrentMode(hydrated.mode)
      setCurrentAgentId(hydrated.agentId)
      setCurrentProviderId(hydrated.providerId)
      setCurrentModelId(hydrated.modelId)
      setRecoveryState(hydrated.recoveryState)
      prepareWarmupForSelection({
        projectPath: hydrated.projectPath ?? '',
        agentId: hydrated.agentId,
        providerId: hydrated.providerId,
        modelId: hydrated.modelId,
        mode: hydrated.mode,
      })
      await inspectRuntime(bridge, true)
    } catch (error) {
      const message = getErrorMessage(error)
      setHostStatus('error')
      setHostError(message)
      setShellStatus('error')
      setShellError(message)
      setRuntimeStatus('error')
      setRuntimeError(message)
    } finally {
      setIsOpeningWorkspace(false)
    }
  }

  const selectProject = async (projectPath: string): Promise<void> => {
    if (!bridge) {
      return
    }

    setShellStatus('loading')
    setShellError(null)

    try {
      const boundHostState = await bridge.host.bindWorkspace(projectPath)
      setHostState(boundHostState)
      const storedPreference = readProjectWorkPreference(projectPath)
      const snapshot = await bridge.shell.getSnapshot({
        projectPath,
        ...(storedPreference?.sessionId ? { sessionId: storedPreference.sessionId } : {}),
      })
      const hydrated = hydrateStudioBridgeSnapshot({
        snapshot,
        selection: {
          projectPath,
        },
        readStoredPreference: readProjectWorkPreference,
      })
      setShellSnapshot(snapshot)
      setShellStatus('ready')
      setSelectedProjectPath(hydrated.projectPath)
      setSelectedSessionId(hydrated.selectedSessionId)
      setCurrentMode(hydrated.mode)
      setCurrentAgentId(hydrated.agentId)
      setCurrentProviderId(hydrated.providerId)
      setCurrentModelId(hydrated.modelId)
      setRecoveryState(hydrated.recoveryState)
      prepareWarmupForSelection({
        projectPath: hydrated.projectPath ?? '',
        agentId: hydrated.agentId,
        providerId: hydrated.providerId,
        modelId: hydrated.modelId,
        mode: hydrated.mode,
      })
      await inspectRuntime(bridge, true)
    } catch (error) {
      setShellStatus('error')
      setShellError(getErrorMessage(error))
    }
  }

  const selectSession = async (sessionId: string): Promise<void> => {
    // 切会话也递增 epoch：作废上一轮 submit 仍在 await 的 refreshStateAsync，
    // 避免它把旧 submit 的 sessionId 写回，覆盖用户刚切到的新会话。
    submitEpochRef.current += 1
    if (!selectedProjectPath || !bridge) {
      setSelectedSessionId(sessionId)
      return
    }

    setShellStatus('loading')
    setShellError(null)
    try {
      const snapshot = await bridge.shell.getSnapshot({
        projectPath: selectedProjectPath,
        sessionId,
      })
      const hydrated = hydrateStudioBridgeSnapshot({
        snapshot,
        selection: {
          projectPath: selectedProjectPath,
          sessionId,
        },
        readStoredPreference: readProjectWorkPreference,
      })
      setShellSnapshot(snapshot)
      setShellStatus('ready')
      setSelectedProjectPath(hydrated.projectPath)
      setSelectedSessionId(hydrated.selectedSessionId)
      setCurrentMode(hydrated.mode)
      setCurrentAgentId(hydrated.agentId)
      setCurrentProviderId(hydrated.providerId)
      setCurrentModelId(hydrated.modelId)
      setRecoveryState(hydrated.recoveryState)
      prepareWarmupForSelection({
        projectPath: hydrated.projectPath ?? '',
        agentId: hydrated.agentId,
        providerId: hydrated.providerId,
        modelId: hydrated.modelId,
        mode: hydrated.mode,
      })
      writeProjectWorkPreference(selectedProjectPath, {
        sessionId,
        modelId: hydrated.modelId ?? recoveryState.projectDefaults.modelId,
      })
    } catch (error) {
      setShellStatus('error')
      setShellError(getErrorMessage(error))
    }
  }

  const switchMode = (mode: 'standard' | 'xforge'): string | null => {
    if (!shellSnapshot?.defaults.allowedModes.includes(mode)) {
      return null
    }

    if (mode === 'xforge') {
      return 'XForge 暂未开放'
    }

    setCurrentMode(mode)
    writeProjectWorkPreference(selectedProjectPath, { mode })
    prepareWarmupForSelection({
      projectPath: selectedProjectPath ?? '',
      agentId: currentAgentId,
      providerId: currentProviderId,
      modelId: currentModelId,
      mode,
    })
    return null
  }

  const restoreProjectDefaults = (): void => {
    if (!selectedProjectPath) {
      return
    }

    clearProjectWorkPreference(selectedProjectPath, ['mode', 'agentId', 'modelId'])
    setCurrentMode(recoveryState.projectDefaults.mode)
    setCurrentAgentId(recoveryState.projectDefaults.agentId)
    setCurrentProviderId(shellSnapshot?.defaults.providerId ?? null)
    setCurrentModelId(recoveryState.projectDefaults.modelId)
    prepareWarmupForSelection({
      projectPath: selectedProjectPath,
      agentId: recoveryState.projectDefaults.agentId,
      providerId: shellSnapshot?.defaults.providerId ?? null,
      modelId: recoveryState.projectDefaults.modelId,
      mode: recoveryState.projectDefaults.mode,
    })
    setRecoveryState((current) => ({
      ...current,
      status: {
        kind: 'restored',
        message: '已回到项目推荐值。',
      },
      sources: {
        ...current.sources,
        mode: 'project-default',
        agent: current.projectDefaults.agentId ? 'project-default' : 'none',
        model: current.projectDefaults.modelId ? 'project-default' : 'none',
      },
    }))
  }

  const switchPrimaryAgent = async (agentId: string): Promise<void> => {
    if (!agentId) {
      return
    }

    setCurrentAgentId(agentId)
    if (selectedProjectPath) {
      writeProjectWorkPreference(selectedProjectPath, { agentId })
    }
    prepareWarmupForSelection({
      projectPath: selectedProjectPath ?? '',
      agentId,
      providerId: currentProviderId,
      modelId: currentModelId,
      mode: currentMode,
    })
  }

  const submitPrompt = async (text: string): Promise<SubmitPromptResult> => {
    const prompt = text.trim()
    const userSubmitClickedAt = Date.now()
    resetRendererSubmitTiming()
    markRendererSubmitTiming('user_submit_clicked', userSubmitClickedAt)
    if (!prompt || !bridge) {
      return { ok: false, error: '宿主桥接不可用。' }
    }
    if (!hostState.workspacePath?.trim()) {
      setRuntimeStatus('not-ready')
      setRuntimeError('请先绑定 Workspace，再开始项目会话。')
      return {
        ok: false,
        error: '请先绑定 Workspace，再开始项目会话。',
      }
    }
    if (runtimeStatus !== 'ready') {
      const message =
        runtimeInspectResult?.issues[0]?.message ?? '请先绑定 Workspace，再开始项目会话。'
      setRuntimeError(message)
      return {
        ok: false,
        error: message,
      }
    }
    if (isActiveRunStatus(runStatus)) {
      return {
        ok: false,
        error: '当前 Agent run 仍在执行，请等待完成后再发送下一条。',
      }
    }

    setIsSubmitting(true)
    setRunStatus('starting')
    setCurrentRunId(null)
    setLastRuntimeEventAt(Date.now())
    setRunIdleWarning(null)
    setCurrentRunStep('正在启动运行')
    clearPendingLiveDeltaChunks()
    activeRunIdRef.current = null
    finalizedTerminalStatusRef.current = null
    cancelRequestedRef.current = false
    setRuntimeError(null)
    setShellError(null)
    setLiveConversation(createEmptyLiveConversation(prompt))
    // 递增 submit epoch：作废所有还在 await 的旧 refreshStateAsync 写入
    submitEpochRef.current += 1
    const submitEpoch = submitEpochRef.current
    const projectPath = selectedProjectPath ?? hostState.workspacePath ?? null

    try {
      if (typeof bridge.runtime.submit !== 'function') {
        setRuntimeStatus('error')
        setRuntimeError('runtime.submit 不可用。')
        setRunStatus('failed')
        setCurrentRunStep('运行失败')
        return {
          ok: false,
          error: 'runtime.submit 不可用。',
        }
      }
      const rendererRuntimeSubmitInvokedAt = Date.now()
      markRendererSubmitTiming(
        'renderer_runtime_submit_invoked',
        rendererRuntimeSubmitInvokedAt,
      )
      if (
        selectedProjectPath &&
        selectedProjectPath !== hostState.workspacePath
      ) {
        const boundHostState = await bridge.host.bindWorkspace(selectedProjectPath)
        setHostState(boundHostState)
      }
      const submitResult = await bridge.runtime.submit({
        text: prompt,
        projectPath,
        sessionId: selectedSessionId,
        agentId: currentAgentId,
        providerId: currentProviderId,
        modelId: currentModelId,
        timing: {
          userSubmitClickedAt,
          rendererRuntimeSubmitInvokedAt,
        },
      })
      if (!submitResult.ok) {
        if (cancelRequestedRef.current) {
          finishRendererSubmitTiming('cancelled')
          return { ok: true }
        }
        finishRendererSubmitTiming('failed')
        setRuntimeStatus('error')
        setRuntimeError(submitResult.error)
        setRunStatus('failed')
        setCurrentRunStep('运行失败')
        updateLiveConversationWithPending((current) =>
          appendLiveSystemBlock(
            finalizeOpenThinkingBlocks(current),
            createLiveBlockId('system'),
            submitResult.error,
            'error',
          ),
        )
        return {
          ok: false,
          error: submitResult.error,
          reportedToTimeline: true,
        }
      }
      setRunStatus('completed')
      setCurrentRunStep('运行已完成')
      finishRendererSubmitTiming('completed')

      // 提交成功后立即返回，避免 getSnapshot/inspectRuntime 的异常影响 UI
      // 后续状态刷新通过异步任务完成，即使失败也不应阻止输入框清空
      const refreshStateAsync = async (): Promise<void> => {
        try {
          const snapshot = await bridge.shell.getSnapshot(
            buildShellRequest(
              projectPath,
              submitResult.sessionId === null ? undefined : submitResult.sessionId,
            ),
          )
          // epoch 守卫：getSnapshot 等待期间用户可能发起了下一次 submit
          // 或切换了会话/项目，此时本次 refresh 的所有写入都已过期，直接放弃
          if (submitEpochRef.current !== submitEpoch) {
            return
          }
          const hydrated = hydrateStudioBridgeSnapshot({
            snapshot,
            selection: {
              ...(projectPath === undefined ? {} : { projectPath }),
              ...(submitResult.sessionId === null
                ? {}
                : { sessionId: submitResult.sessionId }),
            },
            readStoredPreference: readProjectWorkPreference,
          })

          setShellSnapshot(snapshot)
          setShellStatus('ready')
          setSelectedProjectPath(hydrated.projectPath)
          setSelectedSessionId(hydrated.selectedSessionId)
          setCurrentMode(hydrated.mode)
          setCurrentAgentId(hydrated.agentId)
          setCurrentProviderId(hydrated.providerId)
          setCurrentModelId(hydrated.modelId)
          setRecoveryState(hydrated.recoveryState)
          prepareWarmupForSelection({
            projectPath: hydrated.projectPath ?? '',
            agentId: hydrated.agentId,
            providerId: hydrated.providerId,
            modelId: hydrated.modelId,
            mode: hydrated.mode,
          })
          const inspectResult = await inspectRuntime(bridge, true)
          // 第二次 epoch 守卫：inspectRuntime 期间又可能发起新 submit
          if (submitEpochRef.current !== submitEpoch) {
            return
          }
          const hasPersistedSubmittedSession =
            submitResult.sessionId === null
              ? Boolean(snapshot.activeSession?.messages.length)
              : snapshot.activeSession?.sessionId === submitResult.sessionId &&
                snapshot.activeSession.messages.length > 0
          if (
            inspectResult?.ok &&
            inspectResult.status === 'ready' &&
            hasPersistedSubmittedSession
          ) {
            clearPendingLiveDeltaChunks()
            setLiveConversation(createEmptyLiveConversation())
          }
        } catch (error) {
          console.error('submitPrompt 后台状态刷新失败', error)
          if (submitEpochRef.current !== submitEpoch) {
            return
          }
          setShellStatus('error')
          setShellError(getErrorMessage(error))
        }
      }

      void refreshStateAsync()
      return { ok: true }
    } catch (error) {
      const message = getErrorMessage(error)
      if (cancelRequestedRef.current) {
        finishRendererSubmitTiming('cancelled')
        return { ok: true }
      }
      finishRendererSubmitTiming('failed')
      setRuntimeStatus('error')
      setRuntimeError(message)
      setRunStatus('failed')
      setCurrentRunStep('运行失败')
      setShellStatus('error')
      setShellError(message)
      updateLiveConversationWithPending((current) =>
        appendLiveSystemBlock(
          finalizeOpenThinkingBlocks(current),
          createLiveBlockId('system'),
          message,
          'error',
        ),
      )
      return { ok: false, error: message }
    } finally {
      setIsSubmitting(false)
    }
  }

  const cancelCurrentRun = async (): Promise<RuntimeCancelResult> => {
    if (!bridge?.runtime || typeof bridge.runtime.cancel !== 'function') {
      const error = 'runtime.cancel 不可用。'
      setRuntimeError(error)
      return {
        ok: false,
        error,
      }
    }
    if (!isActiveRunStatus(runStatus)) {
      return {
        ok: false,
        error: '当前没有正在运行的 Agent run。',
      }
    }

    cancelRequestedRef.current = true
    setRunStatus('cancelling')
    setIsSubmitting(false)
    setRunIdleWarning(null)
    setCurrentRunStep(RUN_STEP_STOPPING)
    updateLiveConversationWithPending((current) => finalizeOpenThinkingBlocks(current))

    try {
      const result = await bridge.runtime.cancel({
        runId: currentRunId,
        reason: 'user-requested',
      })
      if (!result.ok) {
        setRunStatus('failed')
        setCurrentRunStep('运行失败')
        setRuntimeError(result.error)
        updateLiveConversationWithPending((current) =>
          appendLiveSystemBlock(
            finalizeOpenThinkingBlocks(current),
            createLiveBlockId('system'),
            result.error,
            'error',
          ),
        )
        return result
      }

      setRunStatus((current) =>
        current === 'cancelling' ? 'cancelled' : current,
      )
      finishRendererSubmitTiming('cancelled')
      setCurrentRunId(null)
      setCurrentRunStep('已停止当前运行')
      return result
    } catch (error) {
      const message = getErrorMessage(error)
      setRunStatus('failed')
      setCurrentRunStep('运行失败')
      setRuntimeError(message)
      updateLiveConversationWithPending((current) =>
        appendLiveSystemBlock(
          finalizeOpenThinkingBlocks(current),
          createLiveBlockId('system'),
          message,
          'error',
        ),
      )
      return {
        ok: false,
        error: message,
      }
    }
  }

  const respondPermissionRequest = async (
    response: PermissionDialogResponse,
  ): Promise<void> => {
    if (!bridge?.permission) {
      setRuntimeError('权限桥接不可用。')
      return
    }

    try {
      await bridge.permission.respond(response)
      setPendingPermissionRequest((current) =>
        current?.requestId === response.requestId ? null : current,
      )
      setRunStatus((current) =>
        current === 'waiting_permission' ? 'running' : current,
      )
      setCurrentRunStep(RUN_STEP_CALLING_MODEL)
    } catch (error) {
      const message = getErrorMessage(error)
      setRuntimeError(message)
      updateLiveConversationWithPending((current) =>
        appendLiveSystemBlock(
          finalizeOpenThinkingBlocks(current),
          createLiveBlockId('system'),
          message,
          'error',
        ),
      )
    }
  }

  const respondUserInputRequest = async (
    response: UserQuestionDialogResponse,
  ): Promise<void> => {
    if (!bridge?.userInput) {
      setRuntimeError('用户提问桥接不可用。')
      return
    }

    try {
      await bridge.userInput.respond(response)
      setPendingUserInputRequest((current) =>
        current?.requestId === response.requestId ? null : current,
      )
      setRunStatus((current) =>
        current === 'waiting_user_input' ? 'running' : current,
      )
      setCurrentRunStep(RUN_STEP_CALLING_MODEL)
    } catch (error) {
      const message = getErrorMessage(error)
      setRuntimeError(message)
      updateLiveConversationWithPending((current) =>
        appendLiveSystemBlock(
          finalizeOpenThinkingBlocks(current),
          createLiveBlockId('system'),
          message,
          'error',
        ),
      )
    }
  }

  return {
    openWorkspace,
    selectProject,
    selectSession,
    setCurrentProviderModel: (providerId: string, modelId: string) => {
      setCurrentProviderId(providerId || null)
      setCurrentModelId(modelId || null)
      prepareWarmupForSelection({
        projectPath: selectedProjectPath ?? '',
        agentId: currentAgentId,
        providerId: providerId || null,
        modelId: modelId || null,
        mode: currentMode,
      })
    },
    restoreProjectDefaults,
    switchMode,
    switchPrimaryAgent,
    submitPrompt,
    cancelCurrentRun,
    runtimeSubmitAvailable: typeof bridge?.runtime.submit === 'function',
    respondPermissionRequest,
    respondUserInputRequest,
    settingsApi: (bridge?.settings ?? null) as StudioSettingsApi | null,
    memoryApi: bridge?.memory ?? null,
    mcpApi: bridge?.mcp ?? null,
    skillsPluginsApi: bridge?.skillsPlugins ?? null,
  }
}
