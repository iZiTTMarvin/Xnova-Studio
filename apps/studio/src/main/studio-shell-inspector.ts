import { existsSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { join } from 'node:path'
import { loadResolvedConfig } from '@config/resolver.js'
import {
  SessionStore,
  getGitBranch,
  type SessionSummary,
} from '@persistence/index.js'
import { agentCatalog } from '@tools/agent/catalog.js'
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
const SESSION_TITLE_FALLBACK_CHAR_LIMIT = 10

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
  issues: StudioShellSnapshot['issues'],
): string | null {
  const explicitProjectPath = request.projectPath?.trim()
  if (explicitProjectPath) {
    return explicitProjectPath
  }

  if (hostState.workspacePath?.trim()) {
    if (isExistingDirectory(hostState.workspacePath)) {
      return hostState.workspacePath
    }

    issues.push({
      code: 'workspace-missing',
      severity: 'error',
      message: '当前 Workspace 路径已失效，已回退到最近可用项目。',
    })
  }

  return startupProject?.path ?? null
}

function buildProjectSessions(
  projectPath: string | null,
  summaries: SessionSummary[],
  store: Pick<SessionStore, 'loadMessages' | 'loadSubagents'>,
  readSessionOverview: (summary: SessionSummary) => {
    messageCount: number
    provider: string | null
    model: string | null
  },
): StudioProjectSessionSummary[] {
  if (!projectPath) {
    return []
  }

  const extractFallbackTitle = (sessionId: string): string | null => {
    try {
      const snapshot = store.loadMessages(sessionId)
      const firstUserMessage = snapshot.messages.find(
        (message) => message.role === 'user' && message.content.trim().length > 0,
      )
      if (!firstUserMessage) {
        return null
      }
      const chars = Array.from(firstUserMessage.content.trim())
      const fallbackTitle = chars
        .slice(0, SESSION_TITLE_FALLBACK_CHAR_LIMIT)
        .join('')
        .trim()
      return fallbackTitle || null
    } catch {
      return null
    }
  }

  return summaries
    .filter((summary) => summary.cwd === projectPath)
    .slice(0, PROJECT_SESSION_LIMIT)
    .flatMap((summary) => {
      try {
        const overview = readSessionOverview(summary)
        const subagents = store.loadSubagents(summary.sessionId, projectPath)

        return [
          {
            sessionId: summary.sessionId,
            projectPath,
            title:
              summary.firstMessage.trim() ||
              extractFallbackTitle(summary.sessionId) ||
              `会话 ${summary.sessionId.slice(0, 8)}`,
            updatedAt: summary.updatedAt,
            gitBranch: summary.gitBranch === 'unknown' ? null : summary.gitBranch,
            messageCount: overview.messageCount,
            providerId: overview.provider,
            modelId: overview.model,
            subagents: subagents.map((subagent) => {
              let partialResult: string | null = null
              if (subagent.status === 'stopped' || subagent.status === 'error') {
                for (let index = subagent.events.length - 1; index >= 0; index -= 1) {
                  const event = subagent.events[index]
                  if (event?.kind === 'text') {
                    partialResult = event.text
                    break
                  }
                }
              }

              return {
                agentId: subagent.agentId,
                description: subagent.description,
                status: subagent.status,
                stateMessage:
                  subagent.status === 'stopped'
                    ? '已停止，保留部分结果。'
                    : subagent.status === 'error'
                      ? '执行异常结束，可查看部分结果。'
                      : subagent.status === 'stopping'
                        ? '正在停止…'
                        : subagent.status === 'running'
                          ? '正在执行中。'
                          : '已完成。',
                partialResult,
              }
            }),
          },
        ]
      } catch {
        return []
      }
    })
}

function selectActiveSessionId(
  request: StudioShellSnapshotRequest,
  projectPath: string | null,
  startupSession: StudioStartupSessionCandidate | null,
  projectSessions: StudioProjectSessionSummary[],
): string | null {
  const requestedSessionId = request.sessionId?.trim()
  if (requestedSessionId) {
    return projectSessions.some((session) => session.sessionId === requestedSessionId)
      ? requestedSessionId
      : null
  }

  if (
    startupSession?.valid &&
    startupSession.projectPath === projectPath &&
    projectSessions.some((session) => session.sessionId === startupSession.sessionId)
  ) {
    return startupSession.sessionId
  }

  return projectSessions[0]?.sessionId ?? null
}

function buildActiveSessionDetail(
  sessionId: string | null,
  projectSessions: StudioProjectSessionSummary[],
  store: Pick<SessionStore, 'loadMessages'>,
) {
  if (!sessionId) {
    return null
  }

  const summary =
    projectSessions.find((session) => session.sessionId === sessionId) ?? null
  if (!summary) {
    return null
  }

  try {
    const snapshot = store.loadMessages(sessionId)
    return {
      ...summary,
      leafEventUuid: snapshot.leafEventUuid,
      messages: snapshot.messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        ...(message.toolEvents
          ? {
              toolEvents: message.toolEvents.map((toolEvent) => ({
                toolCallId: toolEvent.toolCallId,
                toolName: toolEvent.toolName,
                args: toolEvent.args,
                ...(typeof toolEvent.durationMs === 'number'
                  ? { durationMs: toolEvent.durationMs }
                  : {}),
                ...(typeof toolEvent.success === 'boolean'
                  ? { success: toolEvent.success }
                  : {}),
                ...(typeof toolEvent.resultSummary === 'string'
                  ? { resultSummary: toolEvent.resultSummary }
                  : {}),
                ...(typeof toolEvent.resultFull === 'string'
                  ? { resultFull: toolEvent.resultFull }
                  : {}),
                ...(typeof toolEvent.agentId === 'string'
                  ? { agentId: toolEvent.agentId }
                  : {}),
              })),
            }
          : {}),
        ...(message.provider ? { providerId: message.provider } : {}),
        ...(message.model ? { modelId: message.model } : {}),
        ...(message.thinking ? { thinking: message.thinking } : {}),
        ...(message.usage ? { usage: message.usage } : {}),
        ...(message.llmCallCount !== undefined
          ? { llmCallCount: message.llmCallCount }
          : {}),
        ...(message.toolCallCount !== undefined
          ? { toolCallCount: message.toolCallCount }
          : {}),
      })),
    }
  } catch {
    return null
  }
}

export interface StudioShellInspector {
  inspect(
    request: StudioShellSnapshotRequest,
    hostState: StudioHostState,
  ): Promise<StudioShellSnapshot>
}

export interface CreateStudioShellInspectorOptions {
  store?: Pick<SessionStore, 'list' | 'loadMessages' | 'loadSubagents'> &
    Partial<Pick<SessionStore, 'inspectSession'>>
  loadResolvedConfigFn?: typeof loadResolvedConfig
  getGitBranchFn?: typeof getGitBranch
  getPrimaryAgentId?: () => string
  listPrimaryAgentIds?: () => string[]
  onPerformanceSample?: (sample: {
    phase: 'studio-shell-inspect'
    durationMs: number
    projectPath: string | null
    sessionCount: number
  }) => void
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
  const listPrimaryAgentIds =
    options.listPrimaryAgentIds ??
    (() => agentCatalog.getPrimaryCandidates().map((agent) => agent.frontmatter.id))
  const sessionOverviewCache = new Map<
    string,
    {
      cacheKey: string
      overview: {
        messageCount: number
        provider: string | null
        model: string | null
      }
    }
  >()

  return {
    async inspect(request, hostState) {
      const inspectStartedAt = Date.now()
      const summaries = store.list({ limit: 50 })
      const recentProjects = selectRecentProjects(summaries)
      const startupProject = selectStartupProject(recentProjects)
      const startupSession = selectStartupSession(startupProject, summaries, store)
      const issues: StudioShellSnapshot['issues'] = []
      const projectPath = selectProjectPath(request, hostState, startupProject, issues)
      const readSessionOverview = (summary: SessionSummary) => {
        const cacheKey = `${summary.updatedAt}:${summary.fileSize}`
        const cached = sessionOverviewCache.get(summary.sessionId)
        if (cached && cached.cacheKey === cacheKey) {
          return cached.overview
        }

        const overview = store.inspectSession
          ? store.inspectSession(summary.sessionId)
          : (() => {
              const snapshot = store.loadMessages(summary.sessionId)
              return {
                messageCount: snapshot.messages.length,
                provider: snapshot.provider || null,
                model: snapshot.model || null,
              }
            })()

        sessionOverviewCache.set(summary.sessionId, {
          cacheKey,
          overview,
        })
        return overview
      }
      const projectSessions = buildProjectSessions(
        projectPath,
        summaries,
        store,
        readSessionOverview,
      )
      const activeSessionId = selectActiveSessionId(
        request,
        projectPath,
        startupSession,
        projectSessions,
      )
      const activeSession = buildActiveSessionDetail(
        activeSessionId,
        projectSessions,
        store,
      )

      const defaults = {
        projectPath,
        branch: projectPath ? getGitBranchFn(projectPath) : null,
        agentId: getPrimaryAgentId(),
        modelId: null as string | null,
        providerId: null as string | null,
        recommendedMode: null as StudioModeId | null,
        allowedModes: ['standard', 'xforge'] as StudioModeId[],
        availablePrimaryAgentIds: listPrimaryAgentIds(),
        availableModelIds: [] as string[],
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
        defaults.availableModelIds =
          resolved.effective.providers[defaults.providerId ?? '']?.models ?? []
        if (resolved.warnings.some((warning) => warning.startsWith('project.toml'))) {
          issues.push({
            code: 'project-config-error',
            severity: 'error',
            message: '当前项目配置存在错误，已回退到 user + builtin 默认。',
          })
        }
      }

      const result = {
        startup: {
          recentProject: startupProject,
          recentSession: startupSession,
        },
        recentProjects,
        projectSessions,
        ...(activeSession ? { activeSession } : {}),
        scratchpadEntries: [],
        defaults,
        issues,
        warnings,
      }

      options.onPerformanceSample?.({
        phase: 'studio-shell-inspect',
        durationMs: Date.now() - inspectStartedAt,
        projectPath,
        sessionCount: projectSessions.length,
      })

      return result
    },
  }
}
