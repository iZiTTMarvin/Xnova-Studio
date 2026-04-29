import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { resolveStartupRoute } from '../utils/startup-route'
import { resolveWorkContext } from '../utils/work-context'
import { useRuntimeStore } from '../stores/runtime-store'
import { useSessionStore } from '../stores/session-store'
import { useSettingsStore } from '../stores/settings-store'
import type { StudioProjectSessionSummary } from '../../shared/studio-bridge-contract'

function isActiveRunStatus(status: ReturnType<typeof useRuntimeStore.getState>['runStatus']): boolean {
  return (
    status === 'starting' ||
    status === 'running' ||
    status === 'waiting_permission' ||
    status === 'waiting_user_input' ||
    status === 'tool_calling' ||
    status === 'cancelling'
  )
}

function getScratchpadEntries(
  shellSnapshot: ReturnType<typeof useSessionStore.getState>['shellSnapshot'],
) {
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
}

export function useStudioBridgeState() {
  const sessionState = useSessionStore(
    useShallow((state) => ({
      hostStatus: state.hostStatus,
      hostState: state.hostState,
      hostError: state.hostError,
      isOpeningWorkspace: state.isOpeningWorkspace,
      shellStatus: state.shellStatus,
      shellSnapshot: state.shellSnapshot,
      shellError: state.shellError,
      selectedProjectPath: state.selectedProjectPath,
      selectedSessionId: state.selectedSessionId,
      recoveryState: state.recoveryState,
    })),
  )
  const settingsState = useSettingsStore(
    useShallow((state) => ({
      currentMode: state.currentMode,
      currentAgentId: state.currentAgentId,
      currentProviderId: state.currentProviderId,
      currentModelId: state.currentModelId,
    })),
  )
  const runtimeState = useRuntimeStore(
    useShallow((state) => ({
      runtimeStatus: state.runtimeStatus,
      runtimeInspectResult: state.runtimeInspectResult,
      runtimeError: state.runtimeError,
      lastRuntimeEvent: state.lastRuntimeEvent,
      pendingPermissionRequest: state.pendingPermissionRequest,
      pendingUserInputRequest: state.pendingUserInputRequest,
      isSubmitting: state.isSubmitting,
      runStatus: state.runStatus,
      currentRunId: state.currentRunId,
      lastRuntimeEventAt: state.lastRuntimeEventAt,
      runIdleWarning: state.runIdleWarning,
      currentRunStep: state.currentRunStep,
      liveConversation: state.liveConversation,
      contextState: state.contextState,
      warmupStatus: state.warmupStatus,
    })),
  )

  const startupRoute = useMemo(
    () =>
      resolveStartupRoute({
        recentProject: sessionState.shellSnapshot?.startup.recentProject ?? null,
        recentSession: sessionState.shellSnapshot?.startup.recentSession ?? null,
      }),
    [sessionState.shellSnapshot],
  )

  const activeSession: StudioProjectSessionSummary | null = useMemo(() => {
    if (!sessionState.selectedSessionId) {
      return null
    }

    if (
      sessionState.shellSnapshot?.activeSession?.sessionId ===
      sessionState.selectedSessionId
    ) {
      return sessionState.shellSnapshot.activeSession
    }

    return (
      sessionState.shellSnapshot?.projectSessions.find(
        (session) => session.sessionId === sessionState.selectedSessionId,
      ) ?? null
    )
  }, [sessionState.selectedSessionId, sessionState.shellSnapshot])

  const scratchpadEntries = useMemo(
    () => getScratchpadEntries(sessionState.shellSnapshot),
    [sessionState.shellSnapshot],
  )

  const workContext = useMemo(
    () =>
      resolveWorkContext({
        selectedProjectPath: sessionState.selectedProjectPath,
        activeSession,
        defaults: sessionState.shellSnapshot?.defaults ?? null,
        agentId: settingsState.currentAgentId,
        modelId: settingsState.currentModelId,
        mode: settingsState.currentMode,
        contextUsageLabel:
          runtimeState.contextState.effectiveWindow > 0
            ? `${Math.round(runtimeState.contextState.usedPercentage * 100)}%`
            : null,
        contextState: runtimeState.contextState,
      }),
    [
      activeSession,
      runtimeState.contextState,
      sessionState.selectedProjectPath,
      sessionState.shellSnapshot,
      settingsState.currentAgentId,
      settingsState.currentMode,
      settingsState.currentModelId,
    ],
  )

  const canRestoreProjectDefaults =
    sessionState.selectedProjectPath !== null &&
    (settingsState.currentMode !== sessionState.recoveryState.projectDefaults.mode ||
      settingsState.currentAgentId !==
        sessionState.recoveryState.projectDefaults.agentId ||
      settingsState.currentModelId !==
        sessionState.recoveryState.projectDefaults.modelId)

  const availablePrimaryAgentIds = useMemo(() => {
    const ids =
      sessionState.shellSnapshot?.defaults.availablePrimaryAgentIds ?? []
    const next = [...ids]
    if (
      settingsState.currentAgentId &&
      !next.includes(settingsState.currentAgentId)
    ) {
      next.unshift(settingsState.currentAgentId)
    }
    if (next.length === 0) {
      next.push('general')
    }
    return next
  }, [
    settingsState.currentAgentId,
    sessionState.shellSnapshot?.defaults.availablePrimaryAgentIds,
  ])

  const statusIssues = useMemo(() => {
    const issues = [
      ...(sessionState.shellSnapshot?.issues ?? []),
      ...(runtimeState.runtimeInspectResult?.issues ?? []),
    ]

    return issues.filter((issue, index) => {
      const key = `${issue.code}:${issue.message}`
      return (
        issues.findIndex(
          (candidate) => `${candidate.code}:${candidate.message}` === key,
        ) === index
      )
    })
  }, [runtimeState.runtimeInspectResult, sessionState.shellSnapshot])

  const startupNotice = useMemo(() => {
    if (!window.xnovaStudio) {
      return '宿主桥接不可用'
    }

    if (startupRoute.kind === 'restore-session') {
      return sessionState.shellError
    }

    switch (startupRoute.reason) {
      case 'project-missing':
        return '最近项目路径已失效，已回退到空白聊天页。'
      case 'session-invalid':
        return '最近会话数据损坏，已回退到空白聊天页。'
      default:
        return sessionState.shellError
    }
  }, [sessionState.shellError, startupRoute])

  return {
    ...sessionState,
    ...settingsState,
    ...runtimeState,
    startupRoute,
    startupNotice,
    activeSession,
    scratchpadEntries,
    workContext,
    canRestoreProjectDefaults,
    availablePrimaryAgentIds,
    statusIssues,
    recoveryStatus: sessionState.recoveryState.status,
    recoverySources: sessionState.recoveryState.sources,
    isRunActive: isActiveRunStatus(runtimeState.runStatus),
  }
}
