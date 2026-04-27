import type { StudioProjectSessionSummary, StudioShellSnapshot } from '../../shared/studio-bridge-contract'
import { resolveStartupRoute, type StartupRouteResult } from './startup-route'
import {
  resolveWorkPreferenceRestore,
  type ResolvedWorkPreference,
  type WorkPreferenceRestoreStatus,
} from './work-preferences'

export interface RecoveryStateSnapshot {
  status: WorkPreferenceRestoreStatus
  sources: ReturnType<typeof resolveWorkPreferenceRestore>['sources']
  projectDefaults: ResolvedWorkPreference['projectDefaults']
}

export interface HydrationSelection {
  projectPath?: string | null
  sessionId?: string | null
}

export interface HydratedSnapshotResult {
  projectPath: string | null
  selectedSessionId: string | null
  activeSession: StudioProjectSessionSummary | null
  mode: 'standard' | 'xforge'
  agentId: string | null
  providerId: string | null
  modelId: string | null
  recoveryState: RecoveryStateSnapshot
  startupRoute: StartupRouteResult
}

export function resolveProjectPathFromSnapshot(
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

export function resolveDisplayRecoveryStatus(
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

export function hydrateStudioBridgeSnapshot(input: {
  snapshot: StudioShellSnapshot
  selection?: HydrationSelection
  readStoredPreference: (
    projectPath: string | null,
  ) => ReturnType<typeof resolveWorkPreferenceRestore> extends infer _
    ? ReturnType<
        typeof import('./work-preferences').readProjectWorkPreference
      >
    : never
}): HydratedSnapshotResult {
  const projectPath = resolveProjectPathFromSnapshot(
    input.snapshot,
    input.selection,
  )
  const startupRoute = resolveStartupRoute({
    recentProject: input.snapshot.startup.recentProject,
    recentSession: input.snapshot.startup.recentSession,
  })
  const storedPreference = input.readStoredPreference(projectPath)
  const restored = resolveWorkPreferenceRestore({
    projectPath,
    startupSessionId:
      input.selection?.sessionId ??
      (startupRoute.kind === 'restore-session' &&
      startupRoute.projectPath === projectPath
        ? startupRoute.sessionId
        : null),
    sessions: input.snapshot.projectSessions,
    defaults: input.snapshot.defaults,
    storedPreference,
  })
  const selectedSessionId = input.selection?.sessionId ?? restored.sessionId
  const activeSession =
    input.snapshot.activeSession?.sessionId === selectedSessionId
      ? input.snapshot.activeSession
      : (input.snapshot.projectSessions.find(
          (session) => session.sessionId === selectedSessionId,
        ) ?? null)

  return {
    projectPath,
    selectedSessionId,
    activeSession,
    mode: restored.mode,
    agentId: restored.agentId,
    providerId: activeSession?.providerId ?? input.snapshot.defaults.providerId ?? null,
    modelId: activeSession?.modelId ?? restored.modelId,
    recoveryState: {
      status: resolveDisplayRecoveryStatus(startupRoute, restored.status),
      sources: restored.sources,
      projectDefaults: restored.projectDefaults,
    },
    startupRoute,
  }
}
