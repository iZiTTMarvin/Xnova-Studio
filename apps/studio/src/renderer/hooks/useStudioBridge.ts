import { useEffect, useMemo, useState } from 'react'
import type {
  PermissionDialogRequest,
  PermissionDialogResponse,
  RuntimeInspectResult,
  StudioBridgeApi,
  StudioHostState,
  StudioProjectSessionSummary,
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

interface RecoveryState {
  status: WorkPreferenceRestoreStatus
  sources: WorkPreferenceRestoreSources
  projectDefaults: ResolvedWorkPreference['projectDefaults']
}

interface SubmitPromptResult {
  ok: boolean
  error?: string
}

export interface ContextState {
  usedPercentage: number
  lastInputTokens: number
  effectiveWindow: number
  level: 'normal' | 'warning' | 'critical' | 'overflow'
}

interface LiveConversationState {
  pendingUserText: string | null
  assistantText: string
  thinkingText: string
  toolEvents: Array<{
    toolCallId: string
    toolName: string
    args: Record<string, unknown>
    status: 'running' | 'done'
    durationMs?: number
    success?: boolean
    resultSummary?: string
  }>
  systemMessages: string[]
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function appendSystemMessageUnique(
  messages: string[],
  message: string,
): string[] {
  return messages.at(-1) === message ? messages : [...messages, message]
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
  const [liveConversation, setLiveConversation] = useState<LiveConversationState>({
    pendingUserText: null,
    assistantText: '',
    thinkingText: '',
    toolEvents: [],
    systemMessages: [],
  })
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
  ): Promise<void> => {
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
        return
      }

      setRuntimeStatus('error')
      setRuntimeError(result.error)
    } catch (error) {
      setRuntimeInspectResult(null)
      setRuntimeStatus('error')
      setRuntimeError(getErrorMessage(error))
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
      setRuntimeInspectResult(null)
      setPendingPermissionRequest(null)
      setPendingUserInputRequest(null)
      setCurrentAgentId(null)
      setCurrentProviderId(null)
      setCurrentModelId(null)
      setLiveConversation({
        pendingUserText: null,
        assistantText: '',
        thinkingText: '',
        toolEvents: [],
        systemMessages: [],
      })
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

      setLastRuntimeEvent(event)
      setLiveConversation((current) => {
        switch (event.type) {
          case 'text_delta':
            return {
              ...current,
              assistantText:
                current.assistantText +
                (typeof event.payload?.text === 'string' ? event.payload.text : ''),
            }
          case 'thinking':
            return {
              ...current,
              thinkingText:
                current.thinkingText +
                (typeof event.payload?.text === 'string' ? event.payload.text : ''),
            }
          case 'tool_start': {
            const toolCallId =
              typeof event.payload?.toolCallId === 'string'
                ? event.payload.toolCallId
                : `tool-${Date.now()}`
            const toolName =
              typeof event.payload?.toolName === 'string'
                ? event.payload.toolName
                : 'unknown'
            const args =
              event.payload?.args && typeof event.payload.args === 'object'
                ? (event.payload.args as Record<string, unknown>)
                : {}

            return {
              ...current,
              toolEvents: [
                ...current.toolEvents,
                {
                  toolCallId,
                  toolName,
                  args,
                  status: 'running',
                },
              ],
            }
          }
          case 'tool_end': {
            const toolCallId =
              typeof event.payload?.toolCallId === 'string'
                ? event.payload.toolCallId
                : ''
            return {
              ...current,
              toolEvents: current.toolEvents.map((toolEvent) =>
                toolEvent.toolCallId === toolCallId
                  ? {
                      ...toolEvent,
                      status: 'done',
                      ...(typeof event.payload?.durationMs === 'number'
                        ? { durationMs: event.payload.durationMs }
                        : {}),
                      ...(typeof event.payload?.success === 'boolean'
                        ? { success: event.payload.success }
                        : {}),
                      ...(typeof event.payload?.resultSummary === 'string'
                        ? { resultSummary: event.payload.resultSummary }
                        : {}),
                    }
                  : toolEvent,
              ),
            }
          }
          case 'warning':
          case 'error':
          case 'runtime.error': {
            const message =
              typeof event.payload?.message === 'string'
                ? event.payload.message
                : typeof event.payload?.error === 'string'
                  ? event.payload.error
                  : null
            return message
              ? {
                  ...current,
                  systemMessages: appendSystemMessageUnique(
                    current.systemMessages,
                    message,
                  ),
                }
              : current
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
      }) ?? (() => undefined)
    const unsubscribeUserInput =
      bridge.userInput?.onRequest((request) => {
        if (disposed) {
          return
        }

        setPendingUserInputRequest(request)
      }) ?? (() => undefined)

    return () => {
      disposed = true
      unsubscribeHost()
      unsubscribeRuntime()
      unsubscribePermission()
      unsubscribeUserInput()
    }
  }, [bridge])

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

    setIsSubmitting(true)
    setRuntimeError(null)
    setShellError(null)
    setLiveConversation({
      pendingUserText: prompt,
      assistantText: '',
      thinkingText: '',
      toolEvents: [],
      systemMessages: [],
    })
    const projectPath = selectedProjectPath ?? hostState.workspacePath ?? null

    try {
      if (typeof bridge.runtime.submit !== 'function') {
        setRuntimeStatus('error')
        setRuntimeError('runtime.submit 不可用。')
        return {
          ok: false,
          error: 'runtime.submit 不可用。',
        }
      }
      const submitResult = await bridge.runtime.submit({
        text: prompt,
        projectPath,
        sessionId: selectedSessionId,
        agentId: currentAgentId,
        providerId: currentProviderId,
        modelId: currentModelId,
      })
      if (!submitResult.ok) {
        setRuntimeStatus('error')
        setRuntimeError(submitResult.error)
        setLiveConversation((current) => ({
          ...current,
          systemMessages: appendSystemMessageUnique(
            current.systemMessages,
            submitResult.error,
          ),
        }))
        return { ok: false, error: submitResult.error }
      }

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
          setLiveConversation({
            pendingUserText: null,
            assistantText: '',
            thinkingText: '',
            toolEvents: [],
            systemMessages: [],
          })
          await inspectRuntime(bridge, true)
        } catch (error) {
          console.error('submitPrompt 后台状态刷新失败', error)
          setShellStatus('error')
          setShellError(getErrorMessage(error))
        }
      }

      void refreshStateAsync()
      return { ok: true }
    } catch (error) {
      const message = getErrorMessage(error)
      setRuntimeStatus('error')
      setRuntimeError(message)
      setShellStatus('error')
      setShellError(message)
      setLiveConversation((current) => ({
        ...current,
        systemMessages: appendSystemMessageUnique(
          current.systemMessages,
          message,
        ),
      }))
      return { ok: false, error: message }
    } finally {
      setIsSubmitting(false)
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
    } catch (error) {
      const message = getErrorMessage(error)
      setRuntimeError(message)
      setLiveConversation((current) => ({
        ...current,
        systemMessages: appendSystemMessageUnique(
          current.systemMessages,
          message,
        ),
      }))
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
    } catch (error) {
      const message = getErrorMessage(error)
      setRuntimeError(message)
      setLiveConversation((current) => ({
        ...current,
        systemMessages: appendSystemMessageUnique(
          current.systemMessages,
          message,
        ),
      }))
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
    isSubmitting,
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
