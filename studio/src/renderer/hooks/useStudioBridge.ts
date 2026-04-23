import { useEffect, useMemo, useState } from 'react'
import type {
  RuntimeInspectResult,
  StudioBridgeApi,
  StudioHostState,
  StudioProjectSessionSummary,
  StudioScratchpadEntry,
  StudioSettingsApi,
  StudioShellSnapshot,
  StudioRuntimeEvent,
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

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function buildShellRequest(projectPath?: string | null) {
  return projectPath === undefined ? {} : { projectPath }
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
  const [runtimeStatus, setRuntimeStatus] = useState<'loading' | 'ready' | 'disabled' | 'error'>(
    bridge ? 'loading' : 'disabled',
  )
  const [runtimeInspectResult, setRuntimeInspectResult] = useState<RuntimeInspectResult | null>(null)
  const [runtimeError, setRuntimeError] = useState<string | null>(null)
  const [lastRuntimeEvent, setLastRuntimeEvent] = useState<StudioRuntimeEvent | null>(null)
  const [selectedProjectPath, setSelectedProjectPath] = useState<string | null>(null)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [currentMode, setCurrentMode] = useState<'standard' | 'xforge'>('standard')
  const [currentAgentId, setCurrentAgentId] = useState<string | null>(null)
  const [currentModelId, setCurrentModelId] = useState<string | null>(null)
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
        contextUsageLabel: null,
      }),
    [
      activeSession,
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
        setRuntimeStatus(result.status === 'ready' ? 'ready' : 'disabled')
        setRuntimeError(
          result.status === 'ready'
            ? null
            : (result.issues[0]?.message ?? 'runtime 未就绪。'),
        )
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
      setRuntimeInspectResult(null)
      setCurrentAgentId(null)
      setCurrentModelId(null)
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

      setShellSnapshot(snapshot)
      setShellStatus('ready')
      setSelectedProjectPath(nextProjectPath)
      setSelectedSessionId(selection?.sessionId ?? restored.sessionId)
      setCurrentMode(restored.mode)
      setCurrentAgentId(restored.agentId)
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
        const snapshot = await bridge.shell.getSnapshot(buildShellRequest(projectPath))
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
        void loadShellSnapshot(state.workspacePath)
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
      void loadShellSnapshot(state.workspacePath)
      void inspectRuntime(bridge, true)
    })

    const unsubscribeRuntime = bridge.runtime.onEvent((event) => {
      if (disposed) {
        return
      }

      setLastRuntimeEvent(event)
    })

    return () => {
      disposed = true
      unsubscribeHost()
      unsubscribeRuntime()
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

      const snapshot = await bridge.shell.getSnapshot(
        buildShellRequest(response.state.workspacePath),
      )
      setShellStatus('ready')
      const selection = {
        projectPath: response.state.workspacePath,
      }
      const nextProjectPath = resolveProjectPathFromSnapshot(snapshot, selection)
      const storedPreference = readProjectWorkPreference(nextProjectPath)
      const restored = resolveWorkPreferenceRestore({
        projectPath: nextProjectPath,
        startupSessionId: snapshot.startup.recentSession?.sessionId ?? null,
        sessions: snapshot.projectSessions,
        defaults: snapshot.defaults,
        storedPreference,
      })
      setShellSnapshot(snapshot)
      setSelectedProjectPath(nextProjectPath)
      setSelectedSessionId(restored.sessionId)
      setCurrentMode(restored.mode)
      setCurrentAgentId(restored.agentId)
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
      const snapshot = await bridge.shell.getSnapshot({ projectPath })
      const storedPreference = readProjectWorkPreference(projectPath)
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

  const selectSession = (sessionId: string): void => {
    setSelectedSessionId(sessionId)
    if (!selectedProjectPath) {
      return
    }

    const nextSession =
      shellSnapshot?.projectSessions.find((session) => session.sessionId === sessionId) ?? null
    const nextModelId = nextSession?.modelId ?? recoveryState.projectDefaults.modelId
    setCurrentModelId(nextModelId)
    writeProjectWorkPreference(selectedProjectPath, {
      sessionId,
      modelId: nextModelId,
    })
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

  const switchMode = (mode: 'standard' | 'xforge'): void => {
    if (!shellSnapshot?.defaults.allowedModes.includes(mode)) {
      return
    }

    setCurrentMode(mode)
    writeProjectWorkPreference(selectedProjectPath, { mode })
  }

  const restoreProjectDefaults = (): void => {
    if (!selectedProjectPath) {
      return
    }

    clearProjectWorkPreference(selectedProjectPath, ['mode', 'agentId', 'modelId'])
    setCurrentMode(recoveryState.projectDefaults.mode)
    setCurrentAgentId(recoveryState.projectDefaults.agentId)
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
    currentModelId,
    recoveryStatus: recoveryState.status,
    recoverySources: recoveryState.sources,
    statusIssues,
    canRestoreProjectDefaults,
    restoreProjectDefaults,
    switchMode,
    lastRuntimeEvent,
    settingsApi: (bridge?.settings ?? null) as StudioSettingsApi | null,
    memoryApi: bridge?.memory ?? null,
    mcpApi: bridge?.mcp ?? null,
    skillsPluginsApi: bridge?.skillsPlugins ?? null,
  }
}
