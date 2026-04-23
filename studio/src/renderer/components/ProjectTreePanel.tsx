import { useState } from 'react'
import type {
  StudioProjectSessionSummary,
  StudioRecentProjectSummary,
} from '../../shared/studio-bridge-contract'

export interface ProjectTreePanelProps {
  recentProjects: StudioRecentProjectSummary[]
  selectedProjectPath: string | null
  onProjectSelect: (projectPath: string) => void
  sessions: StudioProjectSessionSummary[]
  activeSessionId: string | null
  onSessionSelect: (sessionId: string) => void
}

export function ProjectTreePanel(props: ProjectTreePanelProps) {
  const [expandedSubagents, setExpandedSubagents] = useState<Record<string, boolean>>({})

  return (
    <section className="project-tree-panel" aria-label="项目树">
      <div className="tree-section">
        <div className="tree-section-title">最近项目</div>
        <div className="tree-list">
          {props.recentProjects.map((project) => (
            <button
              key={project.path}
              type="button"
              className={`tree-item ${
                props.selectedProjectPath === project.path ? 'tree-item-active' : ''
              }`}
              onClick={() => {
                props.onProjectSelect(project.path)
              }}
            >
              <strong>{project.name}</strong>
              <span>{project.gitBranch ?? 'unknown'}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="tree-section">
        <div className="tree-section-title">项目会话</div>
        <div className="tree-list">
          {props.sessions.map((session) => {
            const toggleId = session.subagents[0]?.agentId ?? session.sessionId
            const isExpanded = expandedSubagents[session.sessionId] === true

            return (
              <div key={session.sessionId} className="tree-session">
                <button
                  type="button"
                  className={`tree-item ${
                    props.activeSessionId === session.sessionId ? 'tree-item-active' : ''
                  }`}
                  onClick={() => {
                    props.onSessionSelect(session.sessionId)
                  }}
                >
                  <strong>{session.title}</strong>
                  <span>
                    {session.gitBranch ?? 'unknown'}
                    {' · '}
                    {session.messageCount}
                    {' '}
                    条消息
                  </span>
                </button>

                {session.subagents.length > 0 ? (
                  <div className="subagent-tree">
                    <button
                      type="button"
                      className="subagent-toggle"
                      aria-label={`${isExpanded ? '收起' : '展开'}子代理 ${toggleId}`}
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
                    <div key={subagent.agentId} className="subagent-item">
                      <strong>{subagent.agentId}</strong>
                      <span>{subagent.description}</span>
                      <span>{subagent.stateMessage ?? subagent.status}</span>
                    </div>
                  ))}
                </div>
                    ) : null}
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
