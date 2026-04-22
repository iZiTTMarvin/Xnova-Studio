import type {
  StudioStartupProjectCandidate,
  StudioStartupSessionCandidate,
} from '../../shared/studio-bridge-contract'

export interface StartupRouteInput {
  recentProject: StudioStartupProjectCandidate | null
  recentSession: StudioStartupSessionCandidate | null
  userOverride?: 'blank-chat' | 'last-session'
}

export type StartupRouteResult =
  | {
      kind: 'blank-chat'
      reason:
        | 'user-override'
        | 'no-recent-project'
        | 'no-recent-session'
        | 'project-missing'
        | 'session-invalid'
    }
  | {
      kind: 'blank-chat'
      reason: 'project-missing'
      projectPath: string
    }
  | {
      kind: 'blank-chat'
      reason: 'session-invalid'
      projectPath: string
      sessionId: string
    }
  | {
      kind: 'restore-session'
      projectPath: string
      sessionId: string
    }

export function resolveStartupRoute(
  input: StartupRouteInput,
): StartupRouteResult {
  if (input.userOverride === 'blank-chat') {
    return {
      kind: 'blank-chat',
      reason: 'user-override',
    }
  }

  if (!input.recentProject) {
    return {
      kind: 'blank-chat',
      reason: 'no-recent-project',
    }
  }

  if (!input.recentProject.exists) {
    return {
      kind: 'blank-chat',
      reason: 'project-missing',
      projectPath: input.recentProject.path,
    }
  }

  if (!input.recentSession) {
    return {
      kind: 'blank-chat',
      reason: 'no-recent-session',
    }
  }

  if (!input.recentSession.valid) {
    return {
      kind: 'blank-chat',
      reason: 'session-invalid',
      projectPath: input.recentSession.projectPath,
      sessionId: input.recentSession.sessionId,
    }
  }

  return {
    kind: 'restore-session',
    projectPath: input.recentSession.projectPath,
    sessionId: input.recentSession.sessionId,
  }
}
