import { Fragment, useEffect, useMemo, useState } from 'react'
import {
  ProjectShellSidebar,
  type PrimaryNavId,
  type SidebarBlockStatus,
} from '../components/ProjectShellSidebar'
import { ModeSwitch } from '../components/ModeSwitch'
import { ContextBar } from '../components/ContextBar'
import { ProjectTreePanel } from '../components/ProjectTreePanel'
import { ScratchpadList } from '../components/ScratchpadList'
import { useStudioBridge } from '../hooks/useStudioBridge'
import { useMemoryOverview } from '../hooks/useMemoryOverview'
import { useSettingsToolsPageModel } from '../hooks/useSettingsToolsPageModel'
import { resolveMemoryFeedbackPresentation } from '../utils/memory-feedback'
import { StudioSettingsPage } from './SettingsPage'
import { StudioToolsPage } from './ToolsPage'

interface SelectedSubagentState {
  sessionId: string
  agentId: string
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
    currentModelId,
    recoveryStatus,
    recoverySources,
    statusIssues,
    canRestoreProjectDefaults,
    restoreProjectDefaults,
    switchMode,
    lastRuntimeEvent,
  } = useStudioBridge()
  const [activeNavId, setActiveNavId] = useState<PrimaryNavId>('quick-chat')
  const [selectedSubagent, setSelectedSubagent] = useState<SelectedSubagentState | null>(null)
  const memoryOverview = useMemoryOverview(memoryApi, {
    enabled: shellStatus === 'ready' && activeNavId !== 'settings',
    deferMs: 150,
  })

  const { settingsPage, toolsPage } = useSettingsToolsPageModel({
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
        selectSession(sessionId)
      }}
      activeSubagentId={selectedSubagent?.agentId ?? null}
      onSubagentSelect={(sessionId, agentId) => {
        setActiveNavId('projects')
        selectSession(sessionId)
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
      case 'chat':
        return '聊天'
      case 'tools':
        return '工具'
      case 'settings':
        return '设置'
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
            setActiveNavId('settings')
            return
        }
      }}
    />
  )

  const shouldShowMemoryFeedback =
    shellStatus === 'ready' &&
    activeNavId !== 'settings' &&
    memoryApi !== null &&
    (memoryOverview.status !== 'ready' ||
      memoryOverview.snapshot?.status !== 'ready' ||
      memoryOverview.error !== null ||
      memoryOverview.isRebuilding)
  const memoryFeedback = resolveMemoryFeedbackPresentation({
    snapshot: memoryOverview.snapshot,
    status: memoryOverview.status,
    error: memoryOverview.error,
    actionMessage: memoryOverview.actionMessage,
  })

  const content = activeNavId === 'search'
    ? (
      <section className="session-card">
        <p className="section-eyebrow">搜索</p>
        <h2>搜索页已预留位置</h2>
        <p className="feature-section-detail">本子任务只落信息架构，不提前实现搜索能力。</p>
      </section>
    )
    : activeNavId === 'agents'
      ? (
        <section className="session-card">
          <p className="section-eyebrow">Agents</p>
          <h2>Agents 页已接入一级导航</h2>
          <p className="feature-section-detail">本子任务只保证一级入口与壳结构稳定，不重做 Agent 深内容。</p>
        </section>
      )
      : activeNavId === 'tools'
        ? <StudioToolsPage page={toolsPage} mcpApi={mcpApi} skillsPluginsApi={skillsPluginsApi} />
      : activeNavId === 'settings'
        ? <StudioSettingsPage page={settingsPage} settingsApi={settingsApi} memoryApi={memoryApi} />
        : activeNavId === 'chat'
          ? (
            <section className="blank-chat-stage">
                <p className="section-eyebrow">Scratchpad</p>
                <h2>全局即时工作区</h2>
                <p>不替代项目主链路，只做轻量 scratchpad。</p>
              </section>
            )
            : (
              <>
                {startupRoute.kind === 'restore-session' ? (
                  <section className="workspace-surface">
                    {workContextBar}
                    <section className="session-card">
                      <p className="section-eyebrow">已恢复最近工作会话</p>
                      <h2>{activeSession?.title ?? `会话 ${startupRoute.sessionId.slice(0, 8)}`}</h2>
                      <div className="detail-row" style={{ marginTop: '12px' }}>
                        <span>项目</span>
                        <strong className="mono">{activeSession?.projectPath ?? startupRoute.projectPath}</strong>
                      </div>
                      <div className="detail-row">
                        <span>分支</span>
                        <strong className="mono">{activeSession?.gitBranch ?? shellSnapshot?.defaults.branch ?? 'unknown'}</strong>
                      </div>
                      <div className="detail-row">
                        <span>消息</span>
                        <strong>{activeSession?.messageCount ?? 0} 条</strong>
                      </div>
                    </section>
                  </section>
                ) : activeNavId === 'projects' && selectedSubagentEntry ? (
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
                ) : (
                  <section className="blank-chat-stage blank-chat-stage-codex">
                    <h2>{blankStageTitle}</h2>

                    <div className="composer-shell composer-shell-codex">
                      <textarea
                        className="composer-input"
                        rows={3}
                        placeholder="向 Xnova 提出任何问题。输入 @ 使用工具、文件或技能"
                        readOnly
                      />
                      <div className="composer-footer">
                        <div className="composer-tools">
                          <button type="button" className="ghost-icon-button" aria-label="添加上下文">
                            +
                          </button>
                          <span className="mini-pill mini-pill-warning">完全访问权限</span>
                          <span className="mini-pill mono">{currentModelId ?? 'openai / gpt-5.4'}</span>
                        </div>
                        <button className="composer-send" aria-label="发送" />
                      </div>
                    </div>

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
                        <div className="suggestion-icon" />
                        <div>
                          <strong>开始一个新项目</strong>
                          <span>绑定 workspace 后，让 Xnova 从 0 到 1 推进初始化、编码与测试。</span>
                        </div>
                      </button>
                      <button
                        type="button"
                        className="suggestion-row suggestion-row-minimal"
                        onClick={() => {
                          void openWorkspace()
                        }}
                      >
                        <div className="suggestion-icon" />
                        <div>
                          <strong>打开并继续一个已有项目</strong>
                          <span>恢复最近会话，把项目、分支、Agent、模型一起带回当前工作面。</span>
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
                        <div className="suggestion-icon" />
                        <div>
                          <strong>分析当前项目结构</strong>
                          <span>基于当前 workspace 事实源，快速理解入口、模块边界与测试面。</span>
                        </div>
                      </button>
                    </div>
                  </section>
                )}
              </>
            )

  return (
    <div className="project-shell-layout">
      <ProjectShellSidebar
        activeNavId={activeNavId}
        onNavigate={setActiveNavId}
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
                onModeChange={switchMode}
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

        {/* 启动通知 */}
        {startupNotice ? (
          <section className="shell-banner">
            <strong>{startupNotice}</strong>
          </section>
        ) : null}

        {/* 状态问题 */}
        {statusIssues.length > 0 ? (
          <section className="warning-list-card" aria-label="状态问题">
            <strong>状态问题</strong>
            <ul>
              {statusIssues.map((issue) => (
                <li key={`${issue.code}-${issue.message}`}>
                  <span className="status-issue-code mono">{issue.code}</span>
                  <span className="status-issue-message">{issue.message}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* Memory 反馈 */}
        {shouldShowMemoryFeedback ? (
          <section className="warning-list-card" aria-label="Memory 主流程反馈">
            <div className="warning-status-line">
              <strong>Memory 状态</strong>
              <span className="warning-status-label">{memoryFeedback.statusLabel}</span>
            </div>
            <ul>
              <li>{memoryFeedback.statusMessage}</li>
              {memoryFeedback.actionHint ? (
                <li>建议动作: {memoryFeedback.actionHint}</li>
              ) : null}
            </ul>
          </section>
        ) : null}

        {/* SubAgent 反馈 */}
        {liveSubagentFeedback || sessionSubagentFeedback.length > 0 ? (
          <section className="warning-list-card" aria-label="SubAgent 主流程反馈">
            <strong>SubAgent 状态</strong>
            <ul>
              {liveSubagentFeedback ? (
                <li>{liveSubagentFeedback.message}</li>
              ) : null}
              {liveSubagentFeedback?.partialResult ? (
                <li>{liveSubagentFeedback.partialResult}</li>
              ) : null}
              {sessionSubagentFeedback.map((subagent) => (
                <Fragment key={subagent.agentId}>
                  <li key={`${subagent.agentId}-status`}>
                    {subagent.agentId}
                    {': '}
                    {subagent.stateMessage ?? getSubagentStatusLabel(subagent.status)}
                  </li>
                  {subagent.partialResult ? (
                    <li key={`${subagent.agentId}-partial`}>{subagent.partialResult}</li>
                  ) : null}
                </Fragment>
              ))}
            </ul>
          </section>
        ) : null}

        {/* 主内容区 */}
        {content}

        {/* 恢复状态 — 仅在设置页外、且有需要时显示 */}
        {activeNavId !== 'settings' && activeNavId !== 'tools' && recoveryStatus.kind !== 'empty' ? (
          <section className="inline-card" style={{ padding: '14px 18px' }}>
            <div className="detail-row" style={{ padding: '6px 0' }}>
              <span>恢复状态</span>
              <strong>{recoveryStatus.message}</strong>
            </div>
            <div className="detail-row" style={{ padding: '6px 0' }}>
              <span>来源</span>
              <span className="mono">
                会话:{recoverySources.session} · 模式:{recoverySources.mode} · Agent:{recoverySources.agent}
              </span>
            </div>
            {canRestoreProjectDefaults ? (
              <div style={{ marginTop: '8px' }}>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={restoreProjectDefaults}
                >
                  回到项目推荐值
                </button>
              </div>
            ) : null}
          </section>
        ) : null}
      </main>
    </div>
  )
}
