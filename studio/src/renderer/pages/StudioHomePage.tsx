import { useEffect, useMemo, useState } from 'react'
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
        setActiveNavId('projects')
        void selectProject(projectPath)
      }}
      sessions={shellSnapshot?.projectSessions ?? []}
      activeSessionId={selectedSessionId}
      onSessionSelect={(sessionId) => {
        setActiveNavId('projects')
        selectSession(sessionId)
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
        <p className="session-meta">本子任务只落信息架构，不提前实现搜索能力。</p>
      </section>
    )
    : activeNavId === 'agents'
      ? (
        <section className="session-card">
          <p className="section-eyebrow">Agents</p>
          <h2>Agents 页已接入一级导航</h2>
          <p className="session-meta">本子任务只保证一级入口与壳结构稳定，不重做 Agent 深内容。</p>
        </section>
      )
      : activeNavId === 'tools'
        ? <StudioToolsPage page={toolsPage} mcpApi={mcpApi} skillsPluginsApi={skillsPluginsApi} />
        : activeNavId === 'settings'
          ? <StudioSettingsPage page={settingsPage} settingsApi={settingsApi} memoryApi={memoryApi} />
          : activeNavId === 'chat'
            ? (
              <section className="blank-chat-card">
                <p className="section-eyebrow">Scratchpad</p>
                <h2>全局聊天保持 scratchpad 语义。</h2>
                <p className="session-meta">项目级主工作流仍然归属于项目块，不会在这里复制一套。</p>
              </section>
            )
            : (
              <>
                {startupRoute.kind === 'restore-session' ? (
                  <section className="session-card">
                    <p className="section-eyebrow">已恢复最近工作会话</p>
                    <h2>{activeSession?.title ?? `会话 ${startupRoute.sessionId.slice(0, 8)}`}</h2>
                    <p className="session-meta">
                      {activeSession?.projectPath ?? startupRoute.projectPath}
                    </p>
                    <p className="session-meta">
                      {activeSession?.gitBranch ?? shellSnapshot?.defaults.branch ?? 'unknown'}
                      {' · '}
                      {activeSession?.messageCount ?? 0}
                      {' '}
                      条消息
                    </p>
                  </section>
                ) : (
                  <section className="blank-chat-card">
                    <p className="section-eyebrow">从空白聊天开始</p>
                    <h2>把项目上下文带进来，然后直接开工。</h2>
                    <div className="suggestion-grid">
                      <button
                        type="button"
                        className="suggestion-card"
                        onClick={() => {
                          void openWorkspace()
                        }}
                      >
                        <strong>开始一个新项目</strong>
                        <span>先绑定一个 Workspace，再从空白聊天页开始。</span>
                      </button>
                      <button
                        type="button"
                        className="suggestion-card"
                        onClick={() => {
                          void openWorkspace()
                        }}
                      >
                        <strong>继续一个已有项目</strong>
                        <span>打开已有目录，把当前工作会话带回主壳。</span>
                      </button>
                      <button
                        type="button"
                        className="suggestion-card"
                        disabled={!shellSnapshot?.defaults.projectPath}
                      >
                        <strong>分析当前项目结构</strong>
                        <span>基于当前项目上下文，快速理解结构与入口。</span>
                      </button>
                    </div>
                    <div className="composer-shell">
                      <div className="composer-label">输入框将在后续子任务中接入完整 project-aware 主壳。</div>
                      <textarea
                        className="composer-input"
                        rows={4}
                        placeholder="描述你接下来想做的事，例如：分析当前仓库结构并告诉我主入口在哪里"
                        readOnly
                      />
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
        <ModeSwitch
          currentMode={currentMode}
          allowedModes={shellSnapshot?.defaults.allowedModes ?? ['standard', 'xforge']}
          onModeChange={switchMode}
        />

        {startupNotice ? (
          <section className="shell-banner">
            <strong>{startupNotice}</strong>
          </section>
        ) : null}

        {statusIssues.length > 0 ? (
          <section className="detail-card" aria-label="状态问题卡片">
            {statusIssues.map((issue) => (
              <div key={`${issue.code}-${issue.message}`} className="detail-row">
                <span>{issue.code}</span>
                <strong>{issue.message}</strong>
              </div>
            ))}
          </section>
        ) : null}

        {shouldShowMemoryFeedback ? (
          <section className="detail-card" aria-label="Memory 主流程反馈">
            <div className="detail-row">
              <span>Memory</span>
              <strong>{memoryFeedback.statusLabel}</strong>
            </div>
            <div className="detail-row">
              <span>当前反馈</span>
              <strong>{memoryFeedback.statusMessage}</strong>
            </div>
            {memoryFeedback.actionHint ? (
              <div className="detail-row">
                <span>建议动作</span>
                <strong>{memoryFeedback.actionHint}</strong>
              </div>
            ) : null}
          </section>
        ) : null}

        {liveSubagentFeedback || sessionSubagentFeedback.length > 0 ? (
          <section className="detail-card" aria-label="SubAgent 主流程反馈">
            {liveSubagentFeedback ? (
              <>
                <div className="detail-row">
                  <span>SubAgent 运行反馈</span>
                  <strong>{liveSubagentFeedback.message}</strong>
                </div>
                {liveSubagentFeedback.partialResult ? (
                  <div className="detail-row">
                    <span>部分结果</span>
                    <strong>{liveSubagentFeedback.partialResult}</strong>
                  </div>
                ) : null}
              </>
            ) : null}
            {sessionSubagentFeedback.map((subagent) => (
              <div key={subagent.agentId} className="detail-row">
                <span>{subagent.agentId}</span>
                <strong>{subagent.stateMessage ?? subagent.status}</strong>
              </div>
            ))}
            {sessionSubagentFeedback.map((subagent) =>
              subagent.partialResult ? (
                <div key={`${subagent.agentId}-partial`} className="detail-row">
                  <span>部分结果</span>
                  <strong>{subagent.partialResult}</strong>
                </div>
              ) : null,
            )}
          </section>
        ) : null}

        <section className="hero-card">
          <p className="hero-eyebrow">
            {activeNavId === 'settings' || activeNavId === 'tools'
              ? 'Phase 6 Settings and Tools'
              : 'Phase 5 Project-aware Shell'}
          </p>
          <h1>Xnova Studio</h1>
          <p className="hero-copy">
            {activeNavId === 'settings'
              ? '把全局设置与项目默认值收进桌面主壳，后续子任务会逐步填充 Provider 与 Memory。'
              : activeNavId === 'tools'
                ? 'MCP、Skills、Plugins 以状态卡片进入主壳，不再另起一套桌面运维后台。'
                : shellStatus === 'loading'
              ? '正在恢复最近的项目上下文与工作会话。'
              : startupRoute.kind === 'restore-session'
                ? '冷启动已从最近项目恢复到上一次工作会话，Overview 不再承担默认首页职责。'
                : '冷启动默认进入空白聊天页，让你从当前工作上下文直接开工。'}
          </p>
        </section>

        <section className="workspace-card">
          <div className="workspace-row">
            <span>当前 Workspace</span>
            <strong>{hostState.workspacePath ?? '尚未绑定'}</strong>
          </div>
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
        </section>

        <ContextBar workContext={workContext} />

        <section className="detail-card" aria-label="恢复状态卡片">
          <div className="detail-row">
            <span>恢复状态</span>
            <strong>{recoveryStatus.message}</strong>
          </div>
          <div className="detail-row">
            <span>会话来源</span>
            <strong>{recoverySources.session}</strong>
          </div>
          <div className="detail-row">
            <span>Mode 来源</span>
            <strong>{recoverySources.mode}</strong>
          </div>
          <div className="detail-row">
            <span>Agent 来源</span>
            <strong>{recoverySources.agent}</strong>
          </div>
          <div className="detail-row">
            <span>模型来源</span>
            <strong>{recoverySources.model}</strong>
          </div>
          <button
            type="button"
            className="secondary-button"
            onClick={restoreProjectDefaults}
            disabled={!canRestoreProjectDefaults}
          >
            回到项目推荐值
          </button>
        </section>

        {content}

        <section className="detail-card">
          <div className="detail-row">
            <span>最近项目数</span>
            <strong>{shellSnapshot?.recentProjects.length ?? 0}</strong>
          </div>
          <div className="detail-row">
            <span>当前 Agent</span>
            <strong>{currentAgentId ?? '未解析'}</strong>
          </div>
          <div className="detail-row">
            <span>当前模型</span>
            <strong>{currentModelId ?? '未解析'}</strong>
          </div>
        </section>
      </main>
    </div>
  )
}
