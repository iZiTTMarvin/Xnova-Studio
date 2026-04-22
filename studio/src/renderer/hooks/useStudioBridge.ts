import { useEffect, useMemo, useState } from 'react'
import type {
  StudioHostState,
  StudioProjectSessionSummary,
  StudioScratchpadEntry,
  StudioShellSnapshot,
  StudioRuntimeEvent,
} from '../../shared/studio-bridge-contract'
import {
  resolveStartupRoute,
  type StartupRouteResult,
} from '../utils/startup-route'
import {
  readProjectModePreference,
  resolveModeSelection,
  writeProjectModePreference,
} from '../utils/mode-resolver'
import { resolveWorkContext } from '../utils/work-context'

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function buildShellRequest(projectPath?: string | null) {
  return projectPath === undefined ? {} : { projectPath }
}

function resolveSelectionFromSnapshot(
  snapshot: StudioShellSnapshot,
  selection?: {
    projectPath?: string | null
    sessionId?: string | null
  },
): {
  projectPath: string | null
  sessionId: string | null
} {
  const route = resolveStartupRoute({
    recentProject: snapshot.startup.recentProject,
    recentSession: snapshot.startup.recentSession,
  })

  const projectPath =
    selection?.projectPath ??
    (route.kind === 'restore-session'
      ? route.projectPath
      : snapshot.defaults.projectPath ??
        snapshot.recentProjects[0]?.path ??
        null)
  const sessionId =
    selection?.sessionId ??
    (route.kind === 'restore-session' && route.projectPath === projectPath
      ? route.sessionId
      : snapshot.projectSessions[0]?.sessionId ?? null)

  return {
    projectPath,
    sessionId,
  }
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
  const [lastRuntimeEvent, setLastRuntimeEvent] = useState<StudioRuntimeEvent | null>(null)
  const [selectedProjectPath, setSelectedProjectPath] = useState<string | null>(null)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [currentMode, setCurrentMode] = useState<'standard' | 'xforge'>('standard')

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
        mode: currentMode,
        contextUsageLabel: null,
      }),
    [activeSession, currentMode, selectedProjectPath, shellSnapshot],
  )

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
      return
    }

    let disposed = false
    setHostStatus('loading')
    setHostError(null)
    setShellStatus('loading')
    setShellError(null)

    const applySnapshot = (
      snapshot: StudioShellSnapshot,
      selection?: {
        projectPath?: string | null
        sessionId?: string | null
      },
    ) => {
      const nextSelection = resolveSelectionFromSnapshot(snapshot, selection)
      setShellSnapshot(snapshot)
      setShellStatus('ready')
      setSelectedProjectPath(nextSelection.projectPath)
      setSelectedSessionId(nextSelection.sessionId)
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
      })

    const unsubscribeHost = bridge.host.onStateChanged((state) => {
      if (disposed) {
        return
      }

      setHostState(state)
      setHostStatus('ready')
      void loadShellSnapshot(state.workspacePath)
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
      const selection = resolveSelectionFromSnapshot(snapshot, {
        projectPath: response.state.workspacePath,
      })
      setShellSnapshot(snapshot)
      setShellStatus('ready')
      setSelectedProjectPath(selection.projectPath)
      setSelectedSessionId(selection.sessionId)
    } catch (error) {
      const message = getErrorMessage(error)
      setHostStatus('error')
      setHostError(message)
      setShellStatus('error')
      setShellError(message)
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
      const selection = resolveSelectionFromSnapshot(snapshot, {
        projectPath,
      })
      setShellSnapshot(snapshot)
      setShellStatus('ready')
      setSelectedProjectPath(selection.projectPath)
      setSelectedSessionId(selection.sessionId)
    } catch (error) {
      setShellStatus('error')
      setShellError(getErrorMessage(error))
    }
  }

  const selectSession = (sessionId: string): void => {
    setSelectedSessionId(sessionId)
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

  useEffect(() => {
    if (!shellSnapshot) {
      return
    }

    const allowedModes = shellSnapshot.defaults.allowedModes
    const recentMode = readProjectModePreference(selectedProjectPath)
    const nextMode = resolveModeSelection({
      recentMode,
      recommendedMode: shellSnapshot.defaults.recommendedMode,
      allowedModes,
    })
    setCurrentMode(nextMode)
  }, [selectedProjectPath, shellSnapshot])

  const switchMode = (mode: 'standard' | 'xforge'): void => {
    if (!shellSnapshot?.defaults.allowedModes.includes(mode)) {
      return
    }

    setCurrentMode(mode)
    writeProjectModePreference(selectedProjectPath, mode)
  }

  return {
    hostStatus,
    hostState,
    hostError,
    isOpeningWorkspace,
    openWorkspace,
    shellStatus,
    shellSnapshot,
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
    switchMode,
    lastRuntimeEvent,
  }
}
