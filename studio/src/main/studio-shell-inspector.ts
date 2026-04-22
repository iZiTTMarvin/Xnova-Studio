import { existsSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { join } from 'node:path'
import { loadResolvedConfig } from '../../../cli/src/config/resolver.js'
import { SessionStore } from '../../../cli/src/persistence/session-store.js'
import type { SessionSummary } from '../../../cli/src/persistence/session-types.js'
import { getGitBranch } from '../../../cli/src/persistence/session-utils.js'
import { agentCatalog } from '../../../cli/src/tools/agent/catalog.js'
import type {
  StudioHostState,
  StudioModeId,
  StudioProjectSessionSummary,
  StudioRecentProjectSummary,
  StudioShellSnapshot,
  StudioShellSnapshotRequest,
  StudioStartupProjectCandidate,
  StudioStartupSessionCandidate,
} from '../shared/studio-bridge-contract'

const RECENT_PROJECT_LIMIT = 8
const PROJECT_SESSION_LIMIT = 12

function getProjectName(projectPath: string): string {
  const normalized = projectPath.replace(/[\\/]+$/, '')
  return path.basename(normalized) || normalized
}

function isExistingDirectory(projectPath: string): boolean {
  try {
    return statSync(projectPath).isDirectory()
  } catch {
    return false
  }
}

function normalizeAllowedModes(
  modes: Array<'standard' | 'xforge'> | undefined,
): StudioModeId[] {
  if (!modes || modes.length === 0) {
    return ['standard', 'xforge']
  }

  const filtered = modes.filter(
    (mode): mode is StudioModeId => mode === 'standard' || mode === 'xforge',
  )
  return filtered.length > 0 ? filtered : ['standard', 'xforge']
}

function selectRecentProjects(
  summaries: SessionSummary[],
): StudioRecentProjectSummary[] {
  const latestByPath = new Map<string, SessionSummary>()

  for (const summary of summaries) {
    if (!summary.cwd) {
      continue
    }

    const current = latestByPath.get(summary.cwd)
    if (!current || summary.updatedAt > current.updatedAt) {
      latestByPath.set(summary.cwd, summary)
    }
  }

  return [...latestByPath.values()]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, RECENT_PROJECT_LIMIT)
    .map((summary) => ({
      path: summary.cwd,
      name: getProjectName(summary.cwd),
      lastActiveAt: Date.parse(summary.updatedAt),
      exists: isExistingDirectory(summary.cwd),
      gitBranch: summary.gitBranch === 'unknown' ? null : summary.gitBranch,
    }))
}

function selectStartupProject(
  recentProjects: StudioRecentProjectSummary[],
): StudioStartupProjectCandidate | null {
  const recentProject = recentProjects[0]
  if (!recentProject) {
    return null
  }

  return {
    path: recentProject.path,
    lastActiveAt: recentProject.lastActiveAt,
    exists: recentProject.exists,
  }
}

function selectStartupSession(
  recentProject: StudioStartupProjectCandidate | null,
  summaries: SessionSummary[],
  store: Pick<SessionStore, 'loadMessages'>,
): StudioStartupSessionCandidate | null {
  if (!recentProject) {
    return null
  }

  const recentSession = summaries.find((summary) => summary.cwd === recentProject.path)
  if (!recentSession) {
    return null
  }

  let valid = true
  try {
    store.loadMessages(recentSession.sessionId)
  } catch {
    valid = false
  }

  return {
    projectPath: recentProject.path,
    sessionId: recentSession.sessionId,
    valid,
  }
}

function selectProjectPath(
  request: StudioShellSnapshotRequest,
  hostState: StudioHostState,
  startupProject: StudioStartupProjectCandidate | null,
): string | null {
  const explicitProjectPath = request.projectPath?.trim()
  if (explicitProjectPath) {
    return explicitProjectPath
  }

  if (hostState.workspacePath?.trim()) {
    return hostState.workspacePath
  }

  return startupProject?.path ?? null
}

function buildProjectSessions(
  projectPath: string | null,
  summaries: SessionSummary[],
  store: Pick<SessionStore, 'loadMessages' | 'loadSubagents'>,
): StudioProjectSessionSummary[] {
  if (!projectPath) {
    return []
  }

  return summaries
    .filter((summary) => summary.cwd === projectPath)
    .slice(0, PROJECT_SESSION_LIMIT)
    .flatMap((summary) => {
      try {
        const snapshot = store.loadMessages(summary.sessionId)
        const subagents = store.loadSubagents(summary.sessionId, projectPath)

        return [
          {
            sessionId: summary.sessionId,
            projectPath,
            title: summary.firstMessage || `会话 ${summary.sessionId.slice(0, 8)}`,
            updatedAt: summary.updatedAt,
            gitBranch: summary.gitBranch === 'unknown' ? null : summary.gitBranch,
            messageCount: snapshot.messages.length,
            subagents: subagents.map((subagent) => ({
              agentId: subagent.agentId,
              description: subagent.description,
              status: subagent.status,
            })),
          },
        ]
      } catch {
        return []
      }
    })
}

export interface StudioShellInspector {
  inspect(
    request: StudioShellSnapshotRequest,
    hostState: StudioHostState,
  ): Promise<StudioShellSnapshot>
}

export interface CreateStudioShellInspectorOptions {
  store?: Pick<SessionStore, 'list' | 'loadMessages' | 'loadSubagents'>
  loadResolvedConfigFn?: typeof loadResolvedConfig
  getGitBranchFn?: typeof getGitBranch
  getPrimaryAgentId?: () => string
}

export function createStudioShellInspector(
  options: CreateStudioShellInspectorOptions = {},
): StudioShellInspector {
  const store =
    options.store ?? new SessionStore(join(homedir(), '.xnovacode', 'sessions'))
  const loadResolvedConfigFn = options.loadResolvedConfigFn ?? loadResolvedConfig
  const getGitBranchFn = options.getGitBranchFn ?? getGitBranch
  const getPrimaryAgentId =
    options.getPrimaryAgentId ??
    (() => agentCatalog.resolvePrimaryAgent().agent.agentType)

  return {
    async inspect(request, hostState) {
      const summaries = store.list({ limit: 50 })
      const recentProjects = selectRecentProjects(summaries)
      const startupProject = selectStartupProject(recentProjects)
      const startupSession = selectStartupSession(startupProject, summaries, store)
      const projectPath = selectProjectPath(request, hostState, startupProject)
      const projectSessions = buildProjectSessions(projectPath, summaries, store)

      const defaults = {
        projectPath,
        branch: projectPath ? getGitBranchFn(projectPath) : null,
        agentId: getPrimaryAgentId(),
        modelId: null as string | null,
        providerId: null as string | null,
        recommendedMode: null as StudioModeId | null,
        allowedModes: ['standard', 'xforge'] as StudioModeId[],
      }
      const warnings: string[] = []

      if (projectPath && existsSync(projectPath)) {
        const resolved = loadResolvedConfigFn(projectPath)
        warnings.push(...resolved.warnings)
        defaults.agentId = resolved.effective.agent?.default ?? defaults.agentId
        defaults.modelId = resolved.effective.defaultModel
        defaults.providerId = resolved.effective.defaultProvider
        defaults.recommendedMode = resolved.effective.modes?.recommended ?? null
        defaults.allowedModes = normalizeAllowedModes(
          resolved.effective.modes?.allowed,
        )
      }

      return {
        startup: {
          recentProject: startupProject,
          recentSession: startupSession,
        },
        recentProjects,
        projectSessions,
        scratchpadEntries: [],
        defaults,
        warnings,
      }
    },
  }
}
