import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  PermissionDialogRequest,
  PermissionDialogResponse,
  RuntimeCancelResult,
  RuntimeInspectResult,
  StudioBridgeApi,
  StudioConversationBlock,
  StudioHostState,
  StudioProjectSessionSummary,
  StudioRunStatus,
  StudioScratchpadEntry,
  StudioSettingsApi,
  StudioShellSnapshot,
  StudioRuntimeEvent,
  UserQuestionDialogRequest,
  UserQuestionDialogResponse,
} from '../../shared/studio-bridge-contract'
import {
  resolveStartupRoute,
  type StartupRouteResult,
} from '../utils/startup-route'
import { resolveWorkContext } from '../utils/work-context'
import {
  clearProjectWorkPreference,
  readProjectWorkPreference,
  resolveWorkPreferenceRestore,
  writeProjectWorkPreference,
  type ResolvedWorkPreference,
  type WorkPreferenceRestoreStatus,
  type WorkPreferenceRestoreSources,
} from '../utils/work-preferences'
import { createToolRunningStep } from '../utils/tool-event-summary'

interface RecoveryState {
  status: WorkPreferenceRestoreStatus
  sources: WorkPreferenceRestoreSources
  projectDefaults: ResolvedWorkPreference['projectDefaults']
}

interface SubmitPromptResult {
  ok: boolean
  error?: string
  reportedToTimeline?: boolean
}

export interface ContextState {
  usedPercentage: number
  lastInputTokens: number
  effectiveWindow: number
  level: 'normal' | 'warning' | 'critical' | 'overflow'
}

export type LiveConversationBlock = StudioConversationBlock

export interface LiveConversationState {
  pendingUserText: string | null
  blocks: LiveConversationBlock[]
}

const RUN_IDLE_WARNING_MS = 90_000
const RUN_IDLE_WARNING_MESSAGE = '运行长时间没有新进展，可以停止后重试'
const RUN_STEP_CALLING_MODEL = '正在调用模型'
const RUN_STEP_STOPPING = '正在停止当前运行'

/**
 * finalizedRunIdsRef 的 LRU 上限 — 防止长会话累积万级 runId 占用 renderer 内存。
 * 64 已经覆盖"用户翻历史时上下来回切几个 run"的场景，超出即作废最老的。
 */
export const FINALIZED_RUN_IDS_LIMIT = 64

/**
 * Bootstrap / 上下文准备阶段的 timing_mark stage → 中文步骤文案。
 * 这些事件在 model_request_started 之前，弥补"正在启动运行"到"正在请求模型"
 * 之间长达数秒甚至数十秒的 UI 反馈空白。
 *
 * 不在表中的 stage（例如 `*_done`, `createRuntime.submit_start`）不更新文案，
 * 避免高频闪烁；最后由 `model_request_started` 接管。
 */
const BOOTSTRAP_STAGE_TO_RUN_STEP: Record<string, string> = {
  runtime_bootstrap_start: '正在加载工作区配置',
  tool_registry_ready: '工具与插件已就绪',
  history_hydration_start: '正在恢复对话上下文',
  context_build_start: '正在构建模型上下文',
}

export function resolveBootstrapStepFromTimingStage(
  stage: string | undefined,
): string | null {
  if (!stage) {
    return null
  }
  return BOOTSTRAP_STAGE_TO_RUN_STEP[stage] ?? null
}

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

function createEmptyLiveConversation(
  pendingUserText: string | null = null,
): LiveConversationState {
  return {
    pendingUserText,
    blocks: [],
  }
}

function deriveLiveConversation(
  pendingUserText: string | null,
  blocks: LiveConversationBlock[],
): LiveConversationState {
  return {
    pendingUserText,
    blocks,
  }
}

function replaceLiveBlocks(
  current: LiveConversationState,
  blocks: LiveConversationBlock[],
): LiveConversationState {
  return deriveLiveConversation(current.pendingUserText, blocks)
}

function appendLiveTextBlock(
  current: LiveConversationState,
  id: string,
  content: string,
): LiveConversationState {
  if (!content) {
    return current
  }

  const lastBlock = current.blocks.at(-1)
  if (lastBlock?.type === 'text') {
    return replaceLiveBlocks(current, [
      ...current.blocks.slice(0, -1),
      {
        ...lastBlock,
        content: lastBlock.content + content,
      },
    ])
  }

  return replaceLiveBlocks(current, [
    ...current.blocks,
    {
      id,
      type: 'text',
      content,
    },
  ])
}

function appendLiveThinkingBlock(
  current: LiveConversationState,
  id: string,
  content: string,
): LiveConversationState {
  if (!content) {
    return current
  }

  const lastBlock = current.blocks.at(-1)
  if (
    lastBlock?.type === 'thinking' &&
    lastBlock.endedAt === undefined &&
    lastBlock.durationMs === undefined
  ) {
    return replaceLiveBlocks(current, [
      ...current.blocks.slice(0, -1),
      {
        ...lastBlock,
        content: lastBlock.content + content,
      },
    ])
  }

  return replaceLiveBlocks(current, [
    ...current.blocks,
    {
      id,
      type: 'thinking',
      content,
      startedAt: Date.now(),
    },
  ])
}

function finalizeOpenThinkingBlocks(
  current: LiveConversationState,
): LiveConversationState {
  const endedAt = Date.now()
  let changed = false
  const nextBlocks = current.blocks.map((block) => {
    if (block.type !== 'thinking') {
      return block
    }
    if (block.endedAt !== undefined || block.durationMs !== undefined) {
      return block
    }
    changed = true
    if (block.startedAt !== undefined) {
      return {
        ...block,
        endedAt,
        durationMs: Math.max(0, endedAt - block.startedAt),
      }
    }
    return {
      ...block,
      endedAt,
    }
  })

  return changed ? replaceLiveBlocks(current, nextBlocks) : current
}

function appendLiveStatusBlock(
  current: LiveConversationState,
  id: string,
  content: string,
): LiveConversationState {
  if (!content) {
    return current
  }

  const lastBlock = current.blocks.at(-1)
  if (lastBlock?.type === 'status' && lastBlock.content === content) {
    return current
  }

  return replaceLiveBlocks(current, [
    ...current.blocks,
    {
      id,
      type: 'status',
      content,
    },
  ])
}

function appendLiveSystemBlock(
  current: LiveConversationState,
  id: string,
  content: string,
  level: 'info' | 'warning' | 'error',
): LiveConversationState {
  if (!content) {
    return current
  }

  const hasSameMessage = current.blocks.some(
    (block) => block.type === 'system' && block.content === content,
  )
  if (hasSameMessage) {
    return current
  }

  return replaceLiveBlocks(current, [
    ...current.blocks,
    {
      id,
      type: 'system',
      content,
      level,
    },
  ])
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

/**
 * 用户点击 Stop 后 runStatus = 'cancelling'，但 abort 信号传到 runtime 之前
 * 仍可能有 text_delta / model_first_chunk / context_update 等事件到达。
 * 这个判断把 cancelling 排除在"可被翻回 running"的活跃状态之外，
 * 避免 Stop 反馈被晚到的活跃事件冲刷。
 */
function isActiveButNotCancelling(status: StudioRunStatus): boolean {
  return (
    status === 'starting' ||
    status === 'running' ||
    status === 'waiting_permission' ||
    status === 'waiting_user_input' ||
    status === 'tool_calling'
  )
}

function createRunningStepFromRuntimeEvent(event: StudioRuntimeEvent): string | null {
  const toolName =
    typeof event.payload?.toolName === 'string' ? event.payload.toolName : null
  const args =
    event.payload?.args && typeof event.payload.args === 'object'
      ? (event.payload.args as Record<string, unknown>)
      : {}

  return toolName ? createToolRunningStep(toolName, args) : null
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

function resolveProjectPathFromSnapshot(
  snapshot: StudioShellSnapshot,
  selection?: {
    projectPath?: string | null
  },
): string | null {
  const route = resolveStartupRoute({
    recentProject: snapshot.startup.recentProject,
    recentSession: snapshot.startup.recentSession,
  })

  return (
    selection?.projectPath ??
    (route.kind === 'restore-session'
      ? route.projectPath
      : snapshot.defaults.projectPath ??
        snapshot.recentProjects[0]?.path ??
        null)
  )
}

function resolveDisplayRecoveryStatus(
  startupRoute: StartupRouteResult,
  baseStatus: WorkPreferenceRestoreStatus,
): WorkPreferenceRestoreStatus {
  if (
    startupRoute.kind === 'blank-chat' &&
    (startupRoute.reason === 'project-missing' ||
      startupRoute.reason === 'session-invalid')
  ) {
    return {
      kind: 'fallback',
      message: '最近工作偏好存在不可恢复项，已回退到项目推荐值。',
    }
  }

  return baseStatus
}

export function useStudioBridge() {
  const [bridge, setBridge] = useState(() => window.xnovaStudio ?? null)
  const [hostStatus, setHostStatus] = useState<'loading' | 'ready' | 'disabled' | 'error'>(
    bridge ? 'loading' : 'disabled',
  )
  const [hostState, setHostState] = useState<StudioHostState>({
    workspacePath: null,
    lastSelection: null,
  })
  const [hostError, setHostError] = useState<string | null>(null)
  const [isOpeningWorkspace, setIsOpeningWorkspace] = useState(false)
  const [shellStatus, setShellStatus] = useState<'loading' | 'ready' | 'disabled' | 'error'>(
    bridge ? 'loading' : 'disabled',
  )
  const [shellSnapshot, setShellSnapshot] = useState<StudioShellSnapshot | null>(null)
  const [shellError, setShellError] = useState<string | null>(null)
  const [runtimeStatus, setRuntimeStatus] = useState<
    'loading' | 'ready' | 'not-ready' | 'disabled' | 'error'
  >(bridge ? 'loading' : 'disabled')
  const [runtimeInspectResult, setRuntimeInspectResult] = useState<RuntimeInspectResult | null>(null)
  const [runtimeError, setRuntimeError] = useState<string | null>(null)
  const [lastRuntimeEvent, setLastRuntimeEvent] = useState<StudioRuntimeEvent | null>(null)
  const [pendingPermissionRequest, setPendingPermissionRequest] =
    useState<PermissionDialogRequest | null>(null)
  const [pendingUserInputRequest, setPendingUserInputRequest] =
    useState<UserQuestionDialogRequest | null>(null)
  const [selectedProjectPath, setSelectedProjectPath] = useState<string | null>(null)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [currentMode, setCurrentMode] = useState<'standard' | 'xforge'>('standard')
  const [currentAgentId, setCurrentAgentId] = useState<string | null>(null)
  const [currentProviderId, setCurrentProviderId] = useState<string | null>(null)
  const [currentModelId, setCurrentModelId] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [runStatus, setRunStatus] = useState<StudioRunStatus>('idle')
  const [currentRunId, setCurrentRunId] = useState<string | null>(null)
  const [lastRuntimeEventAt, setLastRuntimeEventAt] = useState<number | null>(null)
  const [runIdleWarning, setRunIdleWarning] = useState<string | null>(null)
  const [currentRunStep, setCurrentRunStep] = useState<string | null>(null)
  const cancelRequestedRef = useRef(false)
  const rendererSubmitTimingRef = useRef<RendererSubmitTimingState>({
    enabled: false,
    marks: new Map(),
    finished: false,
  })
  const liveBlockSequenceRef = useRef(0)
  const [liveConversation, setLiveConversation] = useState<LiveConversationState>(
    () => createEmptyLiveConversation(),
  )
  const [contextState, setContextState] = useState<ContextState>({
    usedPercentage: 0,
    lastInputTokens: 0,
    effectiveWindow: 128_000,
    level: 'normal',
  })
  const [recoveryState, setRecoveryState] = useState<RecoveryState>({
    status: {
      kind: 'empty',
      message: '当前没有可恢复的最近工作状态，已使用项目推荐值。',
    },
    sources: {
      session: 'none',
      mode: 'builtin',
      agent: 'none',
      model: 'none',
    },
    projectDefaults: {
      mode: 'standard',
      agentId: null,
      modelId: null,
    },
  })
  const activeRunIdRef = useRef<string | null>(null)
  const finalizedRunIdsRef = useRef<Set<string>>(new Set())
  const recordFinalizedRunId = (runId: string): void => {
    addFinalizedRunIdToLruSet(finalizedRunIdsRef.current, runId, FINALIZED_RUN_IDS_LIMIT)
  }
  const finalizedTerminalStatusRef = useRef<StudioRunStatus | null>(null)
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

  const startupRoute: StartupRouteResult = useMemo(
    () =>
      resolveStartupRoute({
        recentProject: shellSnapshot?.startup.recentProject ?? null,
        recentSession: shellSnapshot?.startup.recentSession ?? null,
      }),
    [shellSnapshot],
  )

  const activeSession: StudioProjectSessionSummary | null = useMemo(() => {
    if (!selectedSessionId) {
      return null
    }

    if (shellSnapshot?.activeSession?.sessionId === selectedSessionId) {
      return shellSnapshot.activeSession
    }

    return (
      shellSnapshot?.projectSessions.find(
        (session) => session.sessionId === selectedSessionId,
      ) ?? null
    )
  }, [selectedSessionId, shellSnapshot])

  const scratchpadEntries: StudioScratchpadEntry[] = useMemo(() => {
    if (!shellSnapshot) {
      return []
    }

    if (shellSnapshot.scratchpadEntries.length > 0) {
      return shellSnapshot.scratchpadEntries
    }

    return [
      {
        id: 'global-scratchpad',
        title: '全局 Scratchpad',
        updatedAt: null,
      },
    ]
  }, [shellSnapshot])

  const workContext = useMemo(
    () =>
      resolveWorkContext({
        selectedProjectPath,
        activeSession,
        defaults: shellSnapshot?.defaults ?? null,
        agentId: currentAgentId,
        modelId: currentModelId,
        mode: currentMode,
        contextUsageLabel: contextState.effectiveWindow > 0
          ? `${Math.round(contextState.usedPercentage * 100)}%`
          : null,
        contextState,
      }),
    [
      activeSession,
      contextState,
      currentAgentId,
      currentMode,
      currentModelId,
      selectedProjectPath,
      shellSnapshot,
    ],
  )

  const canRestoreProjectDefaults =
    selectedProjectPath !== null &&
    (currentMode !== recoveryState.projectDefaults.mode ||
      currentAgentId !== recoveryState.projectDefaults.agentId ||
      currentModelId !== recoveryState.projectDefaults.modelId)

  const availablePrimaryAgentIds = useMemo(() => {
    const ids = shellSnapshot?.defaults.availablePrimaryAgentIds ?? []
    const next = [...ids]
    if (currentAgentId && !next.includes(currentAgentId)) {
      next.unshift(currentAgentId)
    }
    if (next.length === 0) {
      next.push('general')
    }
    return next
  }, [currentAgentId, shellSnapshot?.defaults.availablePrimaryAgentIds])

  const statusIssues = useMemo(() => {
    const issues = [
      ...(shellSnapshot?.issues ?? []),
      ...(runtimeInspectResult?.issues ?? []),
    ]

    return issues.filter((issue, index) => {
      const key = `${issue.code}:${issue.message}`
      return issues.findIndex((candidate) => `${candidate.code}:${candidate.message}` === key) === index
    })
  }, [runtimeInspectResult, shellSnapshot])

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

  useEffect(() => {
    if (!bridge) {
      setHostStatus('disabled')
      setHostError('宿主桥接不可用')
      setShellStatus('disabled')
      setShellError('宿主桥接不可用')
      setRuntimeStatus('disabled')
      setRuntimeError('宿主桥接不可用')
      setIsSubmitting(false)
      setRunStatus('idle')
      setRuntimeInspectResult(null)
      setPendingPermissionRequest(null)
      setPendingUserInputRequest(null)
      setCurrentRunId(null)
      setLastRuntimeEventAt(null)
      setRunIdleWarning(null)
      setCurrentRunStep(null)
      activeRunIdRef.current = null
      finalizedRunIdsRef.current.clear()
      finalizedTerminalStatusRef.current = null
      cancelRequestedRef.current = false
      setCurrentAgentId(null)
      setCurrentProviderId(null)
      setCurrentModelId(null)
      setLiveConversation(createEmptyLiveConversation())
      setRecoveryState({
        status: {
          kind: 'empty',
          message: '当前没有可恢复的最近工作状态，已使用项目推荐值。',
        },
        sources: {
          session: 'none',
          mode: 'builtin',
          agent: 'none',
          model: 'none',
        },
        projectDefaults: {
          mode: 'standard',
          agentId: null,
          modelId: null,
        },
      })
      return
    }

    let disposed = false
    setHostStatus('loading')
    setHostError(null)
    setShellStatus('loading')
    setShellError(null)
    setRuntimeStatus('loading')
    setRuntimeError(null)

    const applySnapshot = (
      snapshot: StudioShellSnapshot,
      selection?: {
        projectPath?: string | null
        sessionId?: string | null
      },
    ) => {
      const nextProjectPath = resolveProjectPathFromSnapshot(snapshot, selection)
      const nextStartupRoute = resolveStartupRoute({
        recentProject: snapshot.startup.recentProject,
        recentSession: snapshot.startup.recentSession,
      })
      const storedPreference = readProjectWorkPreference(nextProjectPath)
      const restored = resolveWorkPreferenceRestore({
        projectPath: nextProjectPath,
        startupSessionId:
          selection?.sessionId ??
          (nextStartupRoute.kind === 'restore-session' &&
          nextStartupRoute.projectPath === nextProjectPath
            ? nextStartupRoute.sessionId
            : null),
        sessions: snapshot.projectSessions,
        defaults: snapshot.defaults,
        storedPreference,
      })
      const nextSelectedSessionId = selection?.sessionId ?? restored.sessionId
      const nextActiveSession =
        snapshot.activeSession?.sessionId === nextSelectedSessionId
          ? snapshot.activeSession
          : (snapshot.projectSessions.find(
              (session) => session.sessionId === nextSelectedSessionId,
            ) ?? null)

      setShellSnapshot(snapshot)
      setShellStatus('ready')
      setSelectedProjectPath(nextProjectPath)
      setSelectedSessionId(nextSelectedSessionId)
      setCurrentMode(restored.mode)
      setCurrentAgentId(restored.agentId)
      setCurrentProviderId(
        nextActiveSession?.providerId ?? snapshot.defaults.providerId ?? null,
      )
      setCurrentModelId(restored.modelId)
      setRecoveryState({
        status: resolveDisplayRecoveryStatus(nextStartupRoute, restored.status),
        sources: restored.sources,
        projectDefaults: restored.projectDefaults,
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

      setLastRuntimeEvent(event)
      setLastRuntimeEventAt(Date.now())
      setRunIdleWarning(null)
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
          setCurrentRunId(event.runId ?? null)
          setIsSubmitting(true)
          setRunStatus('running')
          setCurrentRunStep(RUN_STEP_CALLING_MODEL)
          break
        case 'timing_mark': {
          // bootstrap / 上下文准备阶段，用 stage 翻译为中文步骤
          // 给用户在"正在启动运行"和"正在请求模型"之间的空窗补反馈。
          const stage =
            typeof event.payload?.stage === 'string'
              ? event.payload.stage
              : undefined
          const bootstrapStep = resolveBootstrapStepFromTimingStage(stage)
          if (bootstrapStep) {
            setCurrentRunStep((current) =>
              current === RUN_STEP_STOPPING ? current : bootstrapStep,
            )
          }
          break
        }
        case 'model_request_started':
          setRunStatus((current) =>
            isActiveButNotCancelling(current) || current === 'idle'
              ? 'running'
              : current,
          )
          setCurrentRunStep((current) =>
            current === RUN_STEP_STOPPING ? current : '正在请求模型',
          )
          break
        case 'model_first_chunk':
          setRunStatus((current) =>
            isActiveButNotCancelling(current) || current === 'idle'
              ? 'running'
              : current,
          )
          setCurrentRunStep((current) =>
            current === RUN_STEP_STOPPING ? current : '模型已开始响应',
          )
          break
        case 'model_request_finished':
          setRunStatus((current) =>
            isActiveButNotCancelling(current) || current === 'idle'
              ? 'running'
              : current,
          )
          break
        case 'model_request_failed':
          finishRendererSubmitTiming('failed')
          if (event.runId) {
            recordFinalizedRunId(event.runId)
          }
          finalizedTerminalStatusRef.current = 'failed'
          activeRunIdRef.current = null
          setIsSubmitting(false)
          setRunStatus('failed')
          setCurrentRunId(null)
          setCurrentRunStep('运行失败')
          break
        case 'text_delta':
        case 'thinking':
        case 'context_update':
          setCurrentRunStep((current) =>
            current === RUN_STEP_STOPPING ? current : RUN_STEP_CALLING_MODEL,
          )
          setRunStatus((current) =>
            isActiveButNotCancelling(current) || current === 'idle'
              ? 'running'
              : current,
          )
          break
        case 'warning':
          setRunStatus((current) =>
            isActiveButNotCancelling(current) || current === 'idle'
              ? 'running'
              : current,
          )
          break
        case 'tool_start':
          // cancelling 期间不再切到 tool_calling，避免 Stop 反馈被冲刷
          setRunStatus((current) =>
            current === 'cancelling' ? current : 'tool_calling',
          )
          setCurrentRunStep((current) =>
            current === RUN_STEP_STOPPING
              ? current
              : (createRunningStepFromRuntimeEvent(event) ?? '正在执行工具'),
          )
          break
        case 'tool_end':
          setRunStatus((current) =>
            current === 'tool_calling' ? 'running' : current,
          )
          setCurrentRunStep((current) =>
            current === RUN_STEP_STOPPING ? current : RUN_STEP_CALLING_MODEL,
          )
          break
        case 'permission.request':
          // cancelling 期间不再切到 waiting_permission
          setRunStatus((current) =>
            current === 'cancelling' ? current : 'waiting_permission',
          )
          setCurrentRunStep((current) =>
            current === RUN_STEP_STOPPING ? current : '等待用户确认',
          )
          break
        case 'permission.decision':
          setRunStatus((current) =>
            current === 'waiting_permission' ? 'running' : current,
          )
          setCurrentRunStep((current) =>
            current === RUN_STEP_STOPPING ? current : RUN_STEP_CALLING_MODEL,
          )
          break
        case 'run_completed':
        case 'session_end':
          finishRendererSubmitTiming('completed')
          if (event.runId) {
            recordFinalizedRunId(event.runId)
          }
          finalizedTerminalStatusRef.current = 'completed'
          activeRunIdRef.current = null
          setIsSubmitting(false)
          setRunStatus('completed')
          setCurrentRunId(null)
          setCurrentRunStep('运行已完成')
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
          setIsSubmitting(false)
          setRunStatus(
            event.payload?.error || event.payload?.aborted === true
              ? 'failed'
              : 'completed',
          )
          setCurrentRunId(null)
          setCurrentRunStep(
            event.payload?.error || event.payload?.aborted === true
              ? '运行失败'
              : '运行已完成',
          )
          break
        case 'run_failed':
          finishRendererSubmitTiming('failed')
          if (event.runId) {
            recordFinalizedRunId(event.runId)
          }
          finalizedTerminalStatusRef.current = 'failed'
          activeRunIdRef.current = null
          setIsSubmitting(false)
          setRunStatus('failed')
          setCurrentRunId(null)
          setCurrentRunStep('运行失败')
          break
        case 'run_cancelled':
          finishRendererSubmitTiming('cancelled')
          if (event.runId) {
            recordFinalizedRunId(event.runId)
          }
          finalizedTerminalStatusRef.current = 'cancelled'
          activeRunIdRef.current = null
          setIsSubmitting(false)
          setRunStatus('cancelled')
          setCurrentRunId(null)
          setCurrentRunStep('已停止当前运行')
          break
        default:
          break
      }
      setLiveConversation((current) => {
        switch (event.type) {
          case 'run_started':
            return deriveLiveConversation(current.pendingUserText, [])
          case 'text_delta':
            return appendLiveTextBlock(
              finalizeOpenThinkingBlocks(current),
              createLiveBlockId('text'),
              typeof event.payload?.text === 'string' ? event.payload.text : '',
            )
          case 'thinking':
            return appendLiveThinkingBlock(
              current,
              createLiveBlockId('thinking'),
              typeof event.payload?.text === 'string' ? event.payload.text : '',
            )
          case 'tool_start': {
            const toolCallId =
              typeof event.payload?.toolCallId === 'string'
                ? event.payload.toolCallId
                : createLiveBlockId('tool')
            const toolName =
              typeof event.payload?.toolName === 'string'
                ? event.payload.toolName
                : 'unknown'
            const args =
              event.payload?.args && typeof event.payload.args === 'object'
                ? (event.payload.args as Record<string, unknown>)
                : {}
            const runningStep = createToolRunningStep(toolName, args)
            const finalizedCurrent = finalizeOpenThinkingBlocks(current)
            const lastBlock = finalizedCurrent.blocks.at(-1)
            const shouldInsertStatus =
              finalizedCurrent.blocks.length === 0 ||
              (lastBlock?.type !== 'text' && lastBlock?.type !== 'status')
            const blocks: LiveConversationBlock[] = shouldInsertStatus
              ? [
                  ...finalizedCurrent.blocks,
                  {
                    id: createLiveBlockId('status'),
                    type: 'status',
                    content: runningStep,
                  },
                ]
              : finalizedCurrent.blocks

            return replaceLiveBlocks(finalizedCurrent, [
              ...blocks,
                {
                  id: createLiveBlockId('tool'),
                  type: 'tool',
                  toolCallId,
                  toolName,
                  args,
                  status: 'running',
                },
            ])
          }
          case 'tool_end': {
            const toolCallId =
              typeof event.payload?.toolCallId === 'string'
                ? event.payload.toolCallId
                : ''
            let changed = false
            const nextBlocks = current.blocks.map((block) => {
              if (block.type !== 'tool' || block.toolCallId !== toolCallId) {
                return block
              }
              changed = true
              return {
                ...block,
                status:
                  event.payload?.success === false ? 'error' as const : 'done' as const,
                ...(typeof event.payload?.durationMs === 'number'
                  ? { durationMs: event.payload.durationMs }
                  : {}),
                ...(typeof event.payload?.success === 'boolean'
                  ? { success: event.payload.success }
                  : {}),
                ...(typeof event.payload?.resultSummary === 'string'
                  ? { resultSummary: event.payload.resultSummary }
                  : {}),
                ...(typeof event.payload?.resultFull === 'string'
                  ? { resultFull: event.payload.resultFull }
                  : {}),
              }
            })
            return changed ? replaceLiveBlocks(current, nextBlocks) : current
          }
          case 'run_completed':
          case 'session_end':
            return appendLiveStatusBlock(
              finalizeOpenThinkingBlocks(current),
              createLiveBlockId('status'),
              '运行已完成',
            )
          case 'turn_end':
            return appendLiveStatusBlock(
              finalizeOpenThinkingBlocks(current),
              createLiveBlockId('status'),
              event.payload?.error || event.payload?.aborted === true
                ? '运行失败'
                : '运行已完成',
            )
          case 'model_request_failed':
          case 'warning':
          case 'error':
          case 'runtime.error':
          case 'run_failed':
          case 'run_cancelled': {
            const message =
              typeof event.payload?.message === 'string'
                ? event.payload.message
                : typeof event.payload?.error === 'string'
                  ? event.payload.error
                  : null
            if (!message) {
              return current
            }
            const level =
              event.type === 'warning'
                ? 'warning'
                : event.type === 'run_cancelled'
                  ? 'info'
                  : 'error'
            return appendLiveSystemBlock(
              finalizeOpenThinkingBlocks(current),
              createLiveBlockId('system'),
              message,
              level,
            )
          }
          default:
            return current
        }
      })

      // 上下文窗口状态更新（不在 setLiveConversation 内，因为是独立状态）
      if (event.type === 'context_update' && event.payload) {
        setContextState({
          usedPercentage: typeof event.payload.usedPercentage === 'number' ? event.payload.usedPercentage : 0,
          lastInputTokens: typeof event.payload.lastInputTokens === 'number' ? event.payload.lastInputTokens : 0,
          effectiveWindow: typeof event.payload.effectiveWindow === 'number' ? event.payload.effectiveWindow : 128_000,
          level: (['normal', 'warning', 'critical', 'overflow'].includes(event.payload.level as string)
            ? event.payload.level as ContextState['level']
            : 'normal'),
        })
      }
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

    return () => {
      disposed = true
      unsubscribeHost()
      unsubscribeRuntime()
      unsubscribePermission()
      unsubscribeUserInput()
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
      const selection = {
        projectPath: response.state.workspacePath,
      }
      const nextProjectPath = resolveProjectPathFromSnapshot(snapshot, selection)
      const nextStoredPreference = readProjectWorkPreference(nextProjectPath)
      const restored = resolveWorkPreferenceRestore({
        projectPath: nextProjectPath,
        startupSessionId: snapshot.startup.recentSession?.sessionId ?? null,
        sessions: snapshot.projectSessions,
        defaults: snapshot.defaults,
        storedPreference: nextStoredPreference,
      })
      setShellSnapshot(snapshot)
      setSelectedProjectPath(nextProjectPath)
      setSelectedSessionId(restored.sessionId)
      setCurrentMode(restored.mode)
      setCurrentAgentId(restored.agentId)
      setCurrentProviderId(snapshot.activeSession?.providerId ?? snapshot.defaults.providerId ?? null)
      setCurrentModelId(restored.modelId)
      setRecoveryState({
        status: resolveDisplayRecoveryStatus(startupRoute, restored.status),
        sources: restored.sources,
        projectDefaults: restored.projectDefaults,
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
      const storedPreference = readProjectWorkPreference(projectPath)
      const snapshot = await bridge.shell.getSnapshot({
        projectPath,
        ...(storedPreference?.sessionId ? { sessionId: storedPreference.sessionId } : {}),
      })
      const restored = resolveWorkPreferenceRestore({
        projectPath,
        startupSessionId: snapshot.startup.recentSession?.sessionId ?? null,
        sessions: snapshot.projectSessions,
        defaults: snapshot.defaults,
        storedPreference,
      })
      setShellSnapshot(snapshot)
      setShellStatus('ready')
      setSelectedProjectPath(projectPath)
      setSelectedSessionId(restored.sessionId)
      setCurrentMode(restored.mode)
      setCurrentAgentId(restored.agentId)
      setCurrentProviderId(snapshot.activeSession?.providerId ?? snapshot.defaults.providerId ?? null)
      setCurrentModelId(restored.modelId)
      setRecoveryState({
        status: resolveDisplayRecoveryStatus(startupRoute, restored.status),
        sources: restored.sources,
        projectDefaults: restored.projectDefaults,
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
      const nextStartupRoute = resolveStartupRoute({
        recentProject: snapshot.startup.recentProject,
        recentSession: snapshot.startup.recentSession,
      })
      const storedPreference = readProjectWorkPreference(selectedProjectPath)
      const restored = resolveWorkPreferenceRestore({
        projectPath: selectedProjectPath,
        startupSessionId: sessionId,
        sessions: snapshot.projectSessions,
        defaults: snapshot.defaults,
        storedPreference,
      })
      const nextSession =
        snapshot.projectSessions.find((session) => session.sessionId === sessionId) ?? null
      setShellSnapshot(snapshot)
      setShellStatus('ready')
      setSelectedProjectPath(selectedProjectPath)
      setSelectedSessionId(sessionId)
      setCurrentMode(restored.mode)
      setCurrentAgentId(restored.agentId)
      setCurrentProviderId(nextSession?.providerId ?? snapshot.defaults.providerId ?? null)
      setCurrentModelId(nextSession?.modelId ?? restored.modelId)
      setRecoveryState({
        status: resolveDisplayRecoveryStatus(nextStartupRoute, restored.status),
        sources: restored.sources,
        projectDefaults: restored.projectDefaults,
      })
      writeProjectWorkPreference(selectedProjectPath, {
        sessionId,
        modelId: nextSession?.modelId ?? recoveryState.projectDefaults.modelId,
      })
    } catch (error) {
      setShellStatus('error')
      setShellError(getErrorMessage(error))
    }
  }

  const startupNotice = useMemo(() => {
    if (!bridge) {
      return '宿主桥接不可用'
    }

    if (startupRoute.kind === 'restore-session') {
      return shellError
    }

    switch (startupRoute.reason) {
      case 'project-missing':
        return '最近项目路径已失效，已回退到空白聊天页。'
      case 'session-invalid':
        return '最近会话数据损坏，已回退到空白聊天页。'
      default:
        return shellError
    }
  }, [bridge, shellError, startupRoute])

  const switchMode = (mode: 'standard' | 'xforge'): string | null => {
    if (!shellSnapshot?.defaults.allowedModes.includes(mode)) {
      return null
    }

    if (mode === 'xforge') {
      return 'XForge 暂未开放'
    }

    setCurrentMode(mode)
    writeProjectWorkPreference(selectedProjectPath, { mode })
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
        setLiveConversation((current) =>
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
          const selection = {
            ...(projectPath === undefined ? {} : { projectPath }),
            ...(submitResult.sessionId === null
              ? {}
              : { sessionId: submitResult.sessionId }),
          }
          const nextProjectPath = resolveProjectPathFromSnapshot(snapshot, selection)
          const nextStartupRoute = resolveStartupRoute({
            recentProject: snapshot.startup.recentProject,
            recentSession: snapshot.startup.recentSession,
          })
          const storedPreference = readProjectWorkPreference(nextProjectPath)
          const restored = resolveWorkPreferenceRestore({
            projectPath: nextProjectPath,
            startupSessionId:
              submitResult.sessionId ??
              (nextStartupRoute.kind === 'restore-session' &&
              nextStartupRoute.projectPath === nextProjectPath
                ? nextStartupRoute.sessionId
                : null),
            sessions: snapshot.projectSessions,
            defaults: snapshot.defaults,
            storedPreference,
          })

          setShellSnapshot(snapshot)
          setShellStatus('ready')
          setSelectedProjectPath(nextProjectPath)
          setSelectedSessionId(submitResult.sessionId ?? restored.sessionId)
          setCurrentMode(restored.mode)
          setCurrentAgentId(restored.agentId)
          setCurrentProviderId(
            snapshot.activeSession?.providerId ?? snapshot.defaults.providerId ?? null,
          )
          setCurrentModelId(restored.modelId)
          setRecoveryState({
            status: resolveDisplayRecoveryStatus(nextStartupRoute, restored.status),
            sources: restored.sources,
            projectDefaults: restored.projectDefaults,
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
      setLiveConversation((current) =>
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
    setLiveConversation((current) => finalizeOpenThinkingBlocks(current))

    try {
      const result = await bridge.runtime.cancel({
        runId: currentRunId,
        reason: 'user-requested',
      })
      if (!result.ok) {
        setRunStatus('failed')
        setCurrentRunStep('运行失败')
        setRuntimeError(result.error)
        setLiveConversation((current) =>
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
      setLiveConversation((current) =>
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
      setLiveConversation((current) =>
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
      setLiveConversation((current) =>
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
    hostStatus,
    hostState,
    hostError,
    isOpeningWorkspace,
    openWorkspace,
    shellStatus,
    shellSnapshot,
    shellError,
    runtimeStatus,
    runtimeInspectResult,
    runtimeError,
    startupRoute,
    startupNotice,
    activeSession,
    selectedProjectPath,
    selectedSessionId,
    selectProject,
    selectSession,
    scratchpadEntries,
    workContext,
    currentMode,
    currentAgentId,
    currentProviderId,
    currentModelId,
    setCurrentProviderModel: (providerId: string, modelId: string) => {
      setCurrentProviderId(providerId || null)
      setCurrentModelId(modelId || null)
    },
    availablePrimaryAgentIds,
    recoveryStatus: recoveryState.status,
    recoverySources: recoveryState.sources,
    statusIssues,
    canRestoreProjectDefaults,
    restoreProjectDefaults,
    switchMode,
    switchPrimaryAgent,
    submitPrompt,
    cancelCurrentRun,
    isSubmitting,
    runStatus,
    isRunActive: isActiveRunStatus(runStatus),
    runtimeSubmitAvailable: typeof bridge?.runtime.submit === 'function',
    currentRunId,
    currentRunStep,
    lastRuntimeEventAt,
    runIdleWarning,
    liveConversation,
    contextState,
    lastRuntimeEvent,
    pendingPermissionRequest,
    pendingUserInputRequest,
    respondPermissionRequest,
    respondUserInputRequest,
    settingsApi: (bridge?.settings ?? null) as StudioSettingsApi | null,
    memoryApi: bridge?.memory ?? null,
    mcpApi: bridge?.mcp ?? null,
    skillsPluginsApi: bridge?.skillsPlugins ?? null,
  }
}
