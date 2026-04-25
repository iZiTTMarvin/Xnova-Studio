import { Fragment, useEffect, useMemo, useState } from 'react'
import {
  ProjectShellSidebar,
  type PrimaryNavId,
  type SidebarBlockStatus,
} from '../components/ProjectShellSidebar'
import { ModeSwitch } from '../components/ModeSwitch'
import { ContextBar } from '../components/ContextBar'
import { ConversationTimeline } from '../components/ConversationTimeline'
import { ProjectTreePanel } from '../components/ProjectTreePanel'
import { SessionModelPicker } from '../components/SessionModelPicker'
import { ScratchpadList } from '../components/ScratchpadList'
import { StudioSettingsDialog } from '../components/StudioSettingsDialog'
import { IconSend, IconFolder, IconSuggestionExplore } from '../components/Icons'
import { useStudioBridge } from '../hooks/useStudioBridge'
import { useMemoryOverview } from '../hooks/useMemoryOverview'
import { useSettingsToolsPageModel } from '../hooks/useSettingsToolsPageModel'
import { resolveMemoryFeedbackPresentation } from '../utils/memory-feedback'
import { StudioToolsPage } from './ToolsPage'
import './StudioHomePage.css'

interface SelectedSubagentState {
  sessionId: string
  agentId: string
}

const DEFAULT_AGENT_SUMMARY = '负责项目级编码链路执行。'

const AGENT_SUMMARY_MAP: Record<string, string> = {
  general: '通用主 Agent，适合多场景协作。',
  planner: '规划主 Agent，先拆解任务再推进实现。',
  reviewer: '评审主 Agent，偏重质量门禁与回归。',
}

function getSubagentStatusLabel(status: 'running' | 'stopping' | 'stopped' | 'done' | 'error'): string {
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

function getPathLeaf(pathValue: string | null | undefined): string | null {
  if (!pathValue) {
    return null
  }

  const normalized = pathValue.replace(/\\/g, '/').replace(/\/+$/, '')
  const segments = normalized.split('/')
  return segments[segments.length - 1] ?? null
}

function normalizeKeyword(value: string): string {
  return value.trim().toLowerCase()
}

export function StudioHomePage() {
  const {
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
    settingsApi,
    memoryApi,
    mcpApi,
    skillsPluginsApi,
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
    setCurrentProviderModel,
    availablePrimaryAgentIds,
    recoveryStatus,
    recoverySources,
    statusIssues,
    canRestoreProjectDefaults,
    restoreProjectDefaults,
    switchMode,
    switchPrimaryAgent,
    submitPrompt,
    isSubmitting,
    liveConversation,
    lastRuntimeEvent,
  } = useStudioBridge()
  const [activeNavId, setActiveNavId] = useState<PrimaryNavId>('quick-chat')
  const [selectedSubagent, setSelectedSubagent] = useState<SelectedSubagentState | null>(null)
  const [searchKeyword, setSearchKeyword] = useState('')
  const [composerInput, setComposerInput] = useState('')
  const [composerFeedback, setComposerFeedback] = useState<string | null>(null)
  const [modeNotice, setModeNotice] = useState<{ title: string; message: string } | null>(null)
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false)
  const memoryOverview = useMemoryOverview(memoryApi, {
    enabled: shellStatus === 'ready' && activeNavId !== 'tools',
    deferMs: 150,
  })

  const { toolsPage } = useSettingsToolsPageModel({
    hostStatus,
    hostState,
    hostError,
    shellStatus,
    shellSnapshot,
    shellError,
    runtimeStatus,
    runtimeInspectResult,
    runtimeError,
  })

  useEffect(() => {
    setActiveNavId(startupRoute.kind === 'restore-session' ? 'projects' : 'quick-chat')
  }, [startupRoute.kind])

  useEffect(() => {
    if (!selectedSubagent) {
      return
    }

    const stillExists = (shellSnapshot?.projectSessions ?? []).some(
      (session) =>
        session.sessionId === selectedSubagent.sessionId &&
        session.subagents.some((subagent) => subagent.agentId === selectedSubagent.agentId),
    )

    if (!stillExists) {
      setSelectedSubagent(null)
    }
  }, [selectedSubagent, shellSnapshot])

  const projectBlockStatus: SidebarBlockStatus = useMemo(() => {
    if (shellStatus === 'loading') {
      return 'loading'
    }
    if (startupNotice === '宿主桥接不可用') {
      return 'disabled'
    }
    if ((shellSnapshot?.recentProjects.length ?? 0) === 0) {
      return 'empty'
    }
    return 'ready'
  }, [shellSnapshot, shellStatus, startupNotice])

  const chatBlockStatus: SidebarBlockStatus = useMemo(() => {
    if (shellStatus === 'loading') {
      return 'loading'
    }
    if (startupNotice === '宿主桥接不可用') {
      return 'disabled'
    }
    return scratchpadEntries.length > 0 ? 'ready' : 'empty'
  }, [scratchpadEntries.length, shellStatus, startupNotice])

  const projectBlockContent = (
    <ProjectTreePanel
      recentProjects={shellSnapshot?.recentProjects ?? []}
      selectedProjectPath={selectedProjectPath}
      onProjectSelect={(projectPath) => {
        setSelectedSubagent(null)
        setActiveNavId('projects')
        void selectProject(projectPath)
      }}
      sessions={shellSnapshot?.projectSessions ?? []}
      activeSessionId={selectedSessionId}
      onSessionSelect={(sessionId) => {
        setSelectedSubagent(null)
        setActiveNavId('projects')
        void selectSession(sessionId)
      }}
      activeSubagentId={selectedSubagent?.agentId ?? null}
      onSubagentSelect={(sessionId, agentId) => {
        setActiveNavId('projects')
        void selectSession(sessionId)
        setSelectedSubagent({ sessionId, agentId })
      }}
    />
  )

  const chatBlockContent = <ScratchpadList entries={scratchpadEntries} />

  const liveSubagentFeedback = useMemo(() => {
    if (!lastRuntimeEvent || lastRuntimeEvent.type !== 'subagent_done') {
      return null
    }

    const payload = lastRuntimeEvent.payload ?? {}
    const rawOutput = typeof payload.output === 'string' ? payload.output : null
    if (!rawOutput) {
      return {
        message: '子 Agent 已结束。',
        partialResult: null,
      }
    }

    try {
      const parsed = JSON.parse(rawOutput) as Record<string, unknown>
      if (parsed.status === 'stopped') {
        return {
          message: '子 Agent 已停止，保留部分结果。',
          partialResult:
            typeof parsed.partialResult === 'string' ? parsed.partialResult : null,
        }
      }
    } catch {
      // 非 JSON 输出按普通文本处理
    }

    return {
      message: '子 Agent 已结束。',
      partialResult: rawOutput,
    }
  }, [lastRuntimeEvent])

  const sessionSubagentFeedback = useMemo(
    () =>
      (activeSession?.subagents ?? []).filter(
        (subagent) => subagent.status !== 'done',
      ),
    [activeSession],
  )

  const selectedSubagentEntry = useMemo(() => {
    if (!selectedSubagent) {
      return null
    }

    const session =
      shellSnapshot?.projectSessions.find(
        (candidate) => candidate.sessionId === selectedSubagent.sessionId,
      ) ?? null
    const subagent =
      session?.subagents.find((candidate) => candidate.agentId === selectedSubagent.agentId) ?? null

    if (!session || !subagent) {
      return null
    }

    return {
      session,
      subagent,
    }
  }, [selectedSubagent, shellSnapshot])

  const shouldShowWorkSurfaceChrome =
    activeNavId === 'quick-chat' || activeNavId === 'projects'

  const workspaceHeadingName = useMemo(
    () =>
      getPathLeaf(selectedProjectPath) ??
      getPathLeaf(hostState.workspacePath),
    [hostState.workspacePath, selectedProjectPath],
  )

  const blankStageTitle = workspaceHeadingName
    ? `要在 ${workspaceHeadingName} 中构建什么？`
    : '要开始什么项目？'

  const pageTitle = useMemo(() => {
    switch (activeNavId) {
      case 'quick-chat':
        return '新对话'
      case 'search':
        return '搜索'
      case 'agents':
        return 'Agents'
      case 'projects':
        return selectedSubagentEntry ? '子代理会话' : activeSession?.title ?? '项目工作区'
      case 'tools':
        return '工具'
    }
  }, [activeNavId, activeSession?.title, selectedSubagentEntry])

  const workContextBar = (
    <ContextBar
      workContext={workContext}
      onFieldSelect={(field) => {
        switch (field) {
          case 'project':
            if (selectedProjectPath ?? hostState.workspacePath) {
              setActiveNavId('projects')
            } else {
              void openWorkspace()
            }
            return
          case 'branch':
          case 'runningSubagents':
            setActiveNavId('projects')
            return
          case 'agent':
            setActiveNavId('agents')
            return
          case 'model':
          case 'contextUsage':
            setSettingsDialogOpen(true)
            return
        }
      }}
    />
  )

  const canSubmitPrompt =
    Boolean(hostState.workspacePath?.trim()) &&
    runtimeStatus === 'ready' &&
    !isSubmitting

  const activeSessionDetail =
    shellSnapshot?.activeSession?.sessionId === activeSession?.sessionId
      ? (shellSnapshot?.activeSession ?? null)
      : null

  const composerArea = (
    <div className="composer-shell composer-shell-codex">
      <textarea
        className="composer-input"
        rows={3}
        value={composerInput}
        aria-label="项目级新对话输入"
        placeholder="描述你要在当前项目完成的目标"
        onChange={(event) => {
          setComposerInput(event.currentTarget.value)
        }}
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            event.preventDefault()
            void handleSubmitPrompt()
          }
        }}
      />
      <div className="composer-footer composer-footer-stacked">
        <div className="composer-tools composer-tools-extended">
          <button type="button" className="ghost-icon-button" aria-label="添加上下文">
            +
          </button>
          <span className="mini-pill mini-pill-warning">
            {activeSession ? '继续会话' : '项目入口'}
          </span>
          <SessionModelPicker
            settingsApi={settingsApi}
            currentProviderId={currentProviderId}
            currentModelId={currentModelId}
            disabled={isSubmitting}
            onChange={(providerId, modelId) => {
              setCurrentProviderModel(providerId, modelId)
              setComposerFeedback(null)
            }}
          />
        </div>
        <button
          className="composer-send"
          aria-label="发送提示词"
          disabled={!canSubmitPrompt || composerInput.trim().length === 0}
          onClick={() => {
            void handleSubmitPrompt()
          }}
        >
          <IconSend />
        </button>
      </div>
      {composerFeedback ? (
        <p className="composer-feedback">{composerFeedback}</p>
      ) : null}
    </div>
  )

  const shouldShowMemoryFeedback =
    shellStatus === 'ready' &&
    activeNavId !== 'tools' &&
    memoryApi !== null &&
    memoryOverview.status !== 'loading' &&
    (memoryOverview.snapshot?.status === 'degraded' ||
      memoryOverview.snapshot?.status === 'bm25' ||
      memoryOverview.error !== null)
  const memoryFeedback = resolveMemoryFeedbackPresentation({
    snapshot: memoryOverview.snapshot,
    status: memoryOverview.status,
    error: memoryOverview.error,
    actionMessage: memoryOverview.actionMessage,
  })

  const recoveryNotice = recoveryStatus.kind !== 'empty' ? (
    <div className="notice-bar">
      <strong>恢复:</strong>
      {' '}
      <span>{recoveryStatus.message}</span>
      {canRestoreProjectDefaults ? (
        <button
          type="button"
          className="ghost-button"
          onClick={restoreProjectDefaults}
        >
          回到项目推荐值
        </button>
      ) : null}
    </div>
  ) : null

  const searchResult = useMemo(() => {
    const keyword = normalizeKeyword(searchKeyword)
    const projects = (shellSnapshot?.recentProjects ?? []).filter((project) => {
      if (!keyword) {
        return true
      }
      return normalizeKeyword(`${project.name} ${project.path} ${project.gitBranch ?? ''}`).includes(keyword)
    })
    const sessions = (shellSnapshot?.projectSessions ?? []).filter((session) => {
      if (!keyword) {
        return true
      }
      return normalizeKeyword(
        `${session.title} ${session.sessionId} ${session.projectPath} ${session.gitBranch ?? ''}`,
      ).includes(keyword)
    })
    return {
      projects,
      sessions,
    }
  }, [searchKeyword, shellSnapshot])

  const handleSubmitPrompt = async (): Promise<void> => {
    const nextText = composerInput.trim()
    if (!nextText || isSubmitting) {
      return
    }

    setComposerFeedback(null)
    setComposerInput('') // 发送后立即清空输入框，提升 UX
    try {
      const result = await submitPrompt(nextText)
      if (!result.ok) {
        setComposerFeedback(result.error ?? '提交失败')
        setComposerInput(nextText) // 发送失败时恢复内容，方便用户修改重发
        return
      }
      setActiveNavId('projects')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setComposerFeedback(`发送异常: ${message}`)
      setComposerInput(nextText) // 异常时恢复输入内容
    }
  }

  const searchContent = (
    <section className="entry-panel shell-card">
      <div className="entry-panel-header">
        <h2>搜索项目与会话</h2>
        <span className="mono">
          {searchResult.projects.length + searchResult.sessions.length}
          {' '}
          项结果
        </span>
      </div>
      <label className="entry-search-field">
        <span>关键词</span>
        <input
          aria-label="搜索项目与会话"
          value={searchKeyword}
          onChange={(event) => {
            setSearchKeyword(event.currentTarget.value)
          }}
          placeholder="项目名、会话标题、分支"
        />
      </label>

      <div className="entry-grid">
        <section className="entry-section">
          <h3>项目</h3>
          {searchResult.projects.length > 0 ? (
            <div className="entry-list">
              {searchResult.projects.map((project) => (
                <button
                  key={project.path}
                  type="button"
                  className="entry-item"
                  aria-label={`项目 ${project.name}`}
                  onClick={() => {
                    setSelectedSubagent(null)
                    setActiveNavId('projects')
                    void selectProject(project.path)
                  }}
                >
                  <strong>{project.name}</strong>
                  <span className="mono">{project.path}</span>
                  <span>{project.gitBranch ?? 'unknown'}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="entry-empty">没有匹配项目</p>
          )}
        </section>

        <section className="entry-section">
          <h3>会话</h3>
          {searchResult.sessions.length > 0 ? (
            <div className="entry-list">
              {searchResult.sessions.map((session) => (
                <button
                  key={session.sessionId}
                  type="button"
                  className="entry-item"
                  aria-label={`会话 ${session.title}`}
                  onClick={() => {
                    setSelectedSubagent(null)
                    setActiveNavId('projects')
                    void (async () => {
                      await selectProject(session.projectPath)
                      await selectSession(session.sessionId)
                    })()
                  }}
                >
                  <strong>{session.title}</strong>
                  <span className="mono">{session.projectPath}</span>
                  <span>
                    {session.gitBranch ?? 'unknown'}
                    {' · '}
                    {session.messageCount}
                    {' '}
                    条消息
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="entry-empty">没有匹配会话</p>
          )}
        </section>
      </div>
    </section>
  )

  const agentsContent = (
    <section className="entry-panel shell-card">
      <div className="entry-panel-header">
        <h2>主 Agent</h2>
        <span>当前 Agent: {currentAgentId ?? '未选择'}</span>
      </div>

      <div className="agent-grid" role="list">
        {availablePrimaryAgentIds.map((agentId) => {
          const isCurrent = currentAgentId === agentId
          return (
            <article key={agentId} className="agent-card" role="listitem">
              <div className="agent-card-header">
                <strong>{agentId}</strong>
                {isCurrent ? <span className="mini-pill">当前</span> : null}
              </div>
              <p>{AGENT_SUMMARY_MAP[agentId] ?? DEFAULT_AGENT_SUMMARY}</p>
              <button
                type="button"
                className="secondary-button"
                aria-label={`切换到 ${agentId}`}
                disabled={isCurrent}
                onClick={() => {
                  void switchPrimaryAgent(agentId)
                }}
              >
                {isCurrent ? '已在使用' : '切换'}
              </button>
            </article>
          )
        })}
      </div>
    </section>
  )

  const projectSurfaceContent = selectedSubagentEntry ? (
    <section className="workspace-surface" aria-label="子代理会话详情">
      {workContextBar}
      <section className="conversation-stage">
        <div className="conversation-header">
          <div>
            <p className="section-eyebrow">SubAgent</p>
            <h2>{selectedSubagentEntry.subagent.agentId}</h2>
          </div>
          <span
            className={`feature-section-status feature-section-status-${
              selectedSubagentEntry.subagent.status === 'error'
                ? 'error'
                : selectedSubagentEntry.subagent.status === 'done'
                  ? 'ready'
                  : selectedSubagentEntry.subagent.status === 'stopped'
                    ? 'warning'
                    : 'loading'
            }`}
          >
            {selectedSubagentEntry.subagent.stateMessage ??
              getSubagentStatusLabel(selectedSubagentEntry.subagent.status)}
          </span>
        </div>

        <div className="message-stream">
          <article className="message-block">
            <p>{selectedSubagentEntry.subagent.description}</p>
            <div className="runtime-log">
              <div>
                主会话：
                {' '}
                <span className="mono">{selectedSubagentEntry.session.title}</span>
              </div>
              <div>
                分支：
                {' '}
                <span className="mono">{selectedSubagentEntry.session.gitBranch ?? '未知分支'}</span>
              </div>
              <div>
                状态：
                {' '}
                {selectedSubagentEntry.subagent.stateMessage ??
                  getSubagentStatusLabel(selectedSubagentEntry.subagent.status)}
              </div>
            </div>

            {selectedSubagentEntry.subagent.partialResult ? (
              <div className="inline-subagent">
                <strong>部分结果</strong>
                <span>{selectedSubagentEntry.subagent.partialResult}</span>
              </div>
            ) : null}
          </article>
        </div>
      </section>
    </section>
  ) : activeSession ? (
    <section className="workspace-surface">
      {workContextBar}
      <section className="conversation-stage conversation-stage-main">
        <div className="conversation-header">
          <div>
            <p className="section-eyebrow">
              {startupRoute.kind === 'restore-session' ? '已恢复最近工作会话' : '项目会话'}
            </p>
            <h2>{activeSession.title}</h2>
          </div>
          <div className="conversation-header-meta">
            <span className="mini-pill mono">{activeSession.projectPath}</span>
            <span className="mini-pill mono">
              {activeSession.gitBranch ?? shellSnapshot?.defaults.branch ?? 'unknown'}
            </span>
            <span className="mini-pill">{activeSession.messageCount} 条消息</span>
          </div>
        </div>

        <ConversationTimeline
          session={activeSessionDetail}
          liveConversation={liveConversation}
        />
      </section>

      <div className="composer-context-shell composer-context-shell-session composer-floating">
        {composerArea}
      </div>
    </section>
  ) : (
    <section className="blank-chat-stage blank-chat-stage-codex">
      <h2>{blankStageTitle}</h2>

      {composerArea}

      <div className="composer-context-shell">
        {workContextBar}
      </div>

      <div className="suggestion-list suggestion-list-minimal">
        <button
          type="button"
          className="suggestion-row suggestion-row-minimal"
          onClick={() => {
            void openWorkspace()
          }}
        >
          <div className="suggestion-icon"><IconFolder /></div>
          <div>
            <strong>绑定项目目录</strong>
            <span>选择 workspace，让后续会话与分支上下文自动跟随。</span>
          </div>
        </button>
        <button
          type="button"
          className="suggestion-row suggestion-row-minimal"
          disabled={!shellSnapshot?.defaults.projectPath}
          onClick={() => {
            if (shellSnapshot?.defaults.projectPath) {
              setActiveNavId('projects')
            }
          }}
        >
          <div className="suggestion-icon"><IconSuggestionExplore /></div>
          <div>
            <strong>继续当前项目会话</strong>
            <span>直接进入项目会话树，延续最近工作状态。</span>
          </div>
        </button>
      </div>
    </section>
  )

  const isConversationView = activeNavId !== 'search' && activeNavId !== 'agents' && activeNavId !== 'tools'
    && (selectedSubagentEntry != null || activeSession != null)

  const content = activeNavId === 'search'
    ? searchContent
    : activeNavId === 'agents'
      ? agentsContent
      : activeNavId === 'tools'
        ? <StudioToolsPage page={toolsPage} mcpApi={mcpApi} skillsPluginsApi={skillsPluginsApi} />
        : projectSurfaceContent

  return (
    <div className="project-shell-layout">
      <ProjectShellSidebar
        activeNavId={activeNavId}
        onNavigate={(nextNavId) => {
          setActiveNavId(nextNavId)
          if (nextNavId !== 'projects') {
            setSelectedSubagent(null)
          }
        }}
        onOpenSettings={() => {
          setSettingsDialogOpen(true)
        }}
        projectBlock={{
          title: '项目',
          status: projectBlockStatus,
          message:
            projectBlockStatus === 'loading'
              ? '正在加载项目结构…'
              : projectBlockStatus === 'disabled'
                ? '当前宿主不可用'
                : '暂无项目数据',
          content: projectBlockContent,
        }}
        chatBlock={{
          title: '聊天',
          status: chatBlockStatus,
          message:
            chatBlockStatus === 'loading'
              ? '正在准备 scratchpad…'
              : chatBlockStatus === 'disabled'
                ? 'scratchpad 暂不可用'
                : 'scratchpad 暂无内容',
          content: chatBlockContent,
        }}
      />

      <main className="project-shell-page">
        <header className="workspace-header">
          <div className="workspace-header-start">
            <p className="workspace-header-title">{pageTitle}</p>
          </div>
          <div className="workspace-header-center">
            {shouldShowWorkSurfaceChrome ? (
              <ModeSwitch
                currentMode={currentMode}
                allowedModes={shellSnapshot?.defaults.allowedModes ?? ['standard', 'xforge']}
                onModeChange={(mode) => {
                  const notice = switchMode(mode)
                  if (notice) {
                    setModeNotice({
                      title: notice,
                      message: '当前阶段请先使用标准模式继续主链路。',
                    })
                  }
                }}
              />
            ) : null}
          </div>
          <div className="workspace-header-end">
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                void openWorkspace()
              }}
              disabled={isOpeningWorkspace}
            >
              {isOpeningWorkspace ? '正在打开…' : '打开 Workspace'}
            </button>
          </div>
        </header>

        {startupNotice ? (
          <div className="notice-bar notice-bar-error">
            <strong>{startupNotice}</strong>
          </div>
        ) : null}

        {statusIssues.length > 0 ? (
          <div className="notice-bar notice-bar-warning">
            <strong>状态问题:</strong>
            {' '}
            {statusIssues.map((issue) => issue.message).join(' · ')}
          </div>
        ) : null}

        {shouldShowMemoryFeedback ? (
          <div className="notice-bar notice-bar-warning">
            <strong>Memory</strong>
            {' '}
            <span>{memoryFeedback.statusLabel}</span>
            <span>:</span>
            {' '}
            <span>{memoryFeedback.statusMessage}</span>
            {memoryFeedback.actionHint ? (
              <>
                {' '}
                <span>{`建议动作: ${memoryFeedback.actionHint}`}</span>
              </>
            ) : null}
          </div>
        ) : null}

        {liveSubagentFeedback ? (
          <div className="notice-bar notice-bar-warning">
            <strong>{liveSubagentFeedback.message}</strong>
            {liveSubagentFeedback.partialResult ? (
              <>
                {' '}
                <span>{liveSubagentFeedback.partialResult}</span>
              </>
            ) : null}
          </div>
        ) : null}

        {sessionSubagentFeedback.length > 0 ? (
          <div className="notice-bar notice-bar-warning">
            <strong>子 Agent 状态:</strong>
            {' '}
            <span>
              {sessionSubagentFeedback
                .map((subagent) => subagent.stateMessage ?? getSubagentStatusLabel(subagent.status))
                .join(' · ')}
            </span>
          </div>
        ) : null}

        {recoveryNotice}

        {isConversationView ? (
          content
        ) : (
          <div className="main-scroll-area">
            {content}
          </div>
        )}
      </main>

      {modeNotice ? (
        <div className="mode-notice-backdrop" role="presentation">
          <section className="mode-notice-card" role="dialog" aria-modal="true" aria-label={modeNotice.title}>
            <strong>{modeNotice.title}</strong>
            <p>{modeNotice.message}</p>
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                setModeNotice(null)
              }}
            >
              我知道了
            </button>
          </section>
        </div>
      ) : null}

      <StudioSettingsDialog
        open={settingsDialogOpen}
        onClose={() => {
          setSettingsDialogOpen(false)
        }}
        settingsApi={settingsApi}
        memoryApi={memoryApi}
        workspacePath={selectedProjectPath ?? hostState.workspacePath}
      />
    </div>
  )
}
