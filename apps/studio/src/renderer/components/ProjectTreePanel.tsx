import { useMemo, useState } from 'react'
import type {
  StudioProjectSessionSummary,
  StudioRecentProjectSummary,
} from '../../shared/studio-bridge-contract'
import {
  IconChevronDown,
  IconChevronRight,
  IconFolder,
  IconPlus,
} from './Icons'

export interface ProjectTreePanelProps {
  recentProjects: StudioRecentProjectSummary[]
  selectedProjectPath: string | null
  onProjectSelect: (projectPath: string) => void
  sessions: StudioProjectSessionSummary[]
  activeSessionId: string | null
  onSessionSelect: (sessionId: string) => void
  activeSubagentId: string | null
  onSubagentSelect: (sessionId: string, agentId: string) => void
  onStartProjectSession?: (projectPath: string) => void
}

interface ProjectDrawerSummary {
  path: string
  name: string
  exists?: boolean
  gitBranch?: string | null
  sessions: StudioProjectSessionSummary[]
}

function getSubagentStatusLabel(
  status: StudioProjectSessionSummary['subagents'][number]['status'],
): string {
  switch (status) {
    case 'running':
      return '运行中'
    case 'stopping':
      return '停止中'
    case 'stopped':
      return '已停止'
    case 'done':
      return '已完成'
    case 'error':
      return '异常'
  }
}

function getPathLeaf(pathValue: string): string {
  const normalized = pathValue.replace(/\\/g, '/').replace(/\/+$/, '')
  const segments = normalized.split('/')
  return segments.at(-1) || pathValue
}

function buildProjectDrawers(
  recentProjects: StudioRecentProjectSummary[],
  sessions: StudioProjectSessionSummary[],
): ProjectDrawerSummary[] {
  const sessionsByProject = new Map<string, StudioProjectSessionSummary[]>()

  for (const session of sessions) {
    const current = sessionsByProject.get(session.projectPath) ?? []
    current.push(session)
    sessionsByProject.set(session.projectPath, current)
  }

  const projectPaths = new Set<string>()
  const drawers: ProjectDrawerSummary[] = recentProjects.map((project) => {
    projectPaths.add(project.path)
    return {
      ...project,
      sessions: sessionsByProject.get(project.path) ?? [],
    }
  })

  // 旧数据或迁移中的快照可能只带会话、不带最近项目。这里补一个抽屉，
  // 避免项目会话重新退化成平铺列表。
  for (const [projectPath, projectSessions] of sessionsByProject.entries()) {
    if (projectPaths.has(projectPath)) {
      continue
    }

    drawers.push({
      path: projectPath,
      name: getPathLeaf(projectPath),
      gitBranch: projectSessions[0]?.gitBranch ?? null,
      sessions: projectSessions,
    })
  }

  return drawers
}

function formatSessionMeta(session: StudioProjectSessionSummary): string {
  return `${session.gitBranch ?? 'unknown'} · ${session.messageCount} 条消息`
}

export function ProjectTreePanel(props: ProjectTreePanelProps) {
  const [expandedSubagents, setExpandedSubagents] = useState<Record<string, boolean>>({})
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({})
  const activeSessionProjectPath = useMemo(
    () =>
      props.sessions.find((session) => session.sessionId === props.activeSessionId)
        ?.projectPath ?? null,
    [props.activeSessionId, props.sessions],
  )
  const projectDrawers = useMemo(
    () => buildProjectDrawers(props.recentProjects, props.sessions),
    [props.recentProjects, props.sessions],
  )

  return (
    <section className="project-tree-panel" aria-label="项目树">
      <div className="tree-section">
        <div className="tree-section-title">项目工作区</div>
        <div className="tree-list project-drawer-list">
          {projectDrawers.map((project) => {
            const isProjectActive =
              props.selectedProjectPath === project.path ||
              activeSessionProjectPath === project.path
            const isProjectExpanded =
              expandedProjects[project.path] ?? isProjectActive
            const projectSessionLabel =
              project.sessions.length > 0
                ? `${project.sessions.length} 个会话`
                : project.exists === false
                  ? '路径不可用'
                  : '暂无会话'

            return (
              <div
                key={project.path}
                className={[
                  'project-drawer',
                  isProjectActive ? 'project-drawer-active' : '',
                  isProjectExpanded ? 'project-drawer-expanded' : '',
                ].filter(Boolean).join(' ')}
              >
                <div className="project-drawer-row">
                  <button
                    type="button"
                    className="project-drawer-toggle"
                    aria-label={`${isProjectExpanded ? '收起' : '展开'} ${project.name} 项目会话`}
                    aria-expanded={isProjectExpanded}
                    onClick={() => {
                      setExpandedProjects((current) => ({
                        ...current,
                        [project.path]: !isProjectExpanded,
                      }))
                    }}
                  >
                    {isProjectExpanded ? <IconChevronDown /> : <IconChevronRight />}
                  </button>

                  <button
                    type="button"
                    className="tree-item tree-project-main"
                    onClick={() => {
                      props.onProjectSelect(project.path)
                    }}
                  >
                    <span className="tree-project-icon" aria-hidden>
                      <IconFolder />
                    </span>
                    <strong>{project.name}</strong>
                    <span>{projectSessionLabel}</span>
                  </button>

                  {props.onStartProjectSession ? (
                    <button
                      type="button"
                      className="project-drawer-new-session"
                      aria-label={`在 ${project.name} 中开始新对话`}
                      title={`在 ${project.name} 中开始新对话`}
                      onClick={() => {
                        props.onStartProjectSession?.(project.path)
                      }}
                    >
                      <IconPlus />
                    </button>
                  ) : null}
                </div>

                {isProjectExpanded ? (
                  <div className="project-drawer-sessions" aria-label={`${project.name} 的会话`}>
                    {project.sessions.length > 0 ? (
                      project.sessions.map((session) => {
                        const isExpanded = expandedSubagents[session.sessionId] === true
                        // a11y 标签使用会话标题（含 fallback），不再误用第 0 个 subagent 的 id：
                        // 多个 subagent 时屏幕阅读器会读出错误的 agent。
                        const subagentToggleLabel =
                          session.subagents.length > 0
                            ? `${isExpanded ? '收起' : '展开'}会话 "${session.title}" 的 ${session.subagents.length} 个子代理`
                            : ''

                        return (
                          <div key={session.sessionId} className="tree-session">
                            <button
                              type="button"
                              className={`tree-item tree-session-item ${
                                props.activeSessionId === session.sessionId ? 'tree-item-active' : ''
                              }`}
                              onClick={() => {
                                props.onSessionSelect(session.sessionId)
                              }}
                            >
                              <strong>{session.title}</strong>
                              <span>{formatSessionMeta(session)}</span>
                            </button>

                            {session.subagents.length > 0 ? (
                              <div className="subagent-tree">
                                <button
                                  type="button"
                                  className="subagent-toggle"
                                  aria-label={subagentToggleLabel}
                                  aria-expanded={isExpanded}
                                  onClick={() => {
                                    setExpandedSubagents((current) => ({
                                      ...current,
                                      [session.sessionId]: !isExpanded,
                                    }))
                                  }}
                                >
                                  {isExpanded ? '收起子代理' : '展开子代理'}
                                </button>
                                {isExpanded ? (
                                  <div className="subagent-list">
                                    {session.subagents.map((subagent) => (
                                      <button
                                        key={subagent.agentId}
                                        type="button"
                                        className={`subagent-item ${
                                          props.activeSubagentId === subagent.agentId
                                            ? 'subagent-item-active'
                                            : ''
                                        }`}
                                        aria-label={`子代理 ${subagent.agentId} ${
                                          subagent.stateMessage ?? getSubagentStatusLabel(subagent.status)
                                        }`}
                                        onClick={() => {
                                          props.onSubagentSelect(session.sessionId, subagent.agentId)
                                        }}
                                      >
                                        <strong>{subagent.agentId}</strong>
                                        <span>{subagent.description}</span>
                                        <span>{subagent.stateMessage ?? getSubagentStatusLabel(subagent.status)}</span>
                                        {subagent.partialResult ? (
                                          <span>{subagent.partialResult}</span>
                                        ) : null}
                                      </button>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        )
                      })
                    ) : (
                      <div className="project-drawer-empty">当前项目还没有会话</div>
                    )}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
