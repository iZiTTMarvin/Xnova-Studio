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

export function StudioHomePage() {
  const {
    hostState,
    isOpeningWorkspace,
    openWorkspace,
    shellStatus,
    shellSnapshot,
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
    switchMode,
  } = useStudioBridge()
  const [activeNavId, setActiveNavId] = useState<PrimaryNavId>('quick-chat')

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
        ? (
          <section className="session-card">
            <p className="section-eyebrow">工具</p>
            <h2>工具页已预留稳定入口</h2>
            <p className="session-meta">Phase 5 不提前做 Settings/Tools 深度整合，只保留主壳位置。</p>
          </section>
        )
        : activeNavId === 'settings'
          ? (
            <section className="session-card">
              <p className="section-eyebrow">设置</p>
              <h2>设置页已预留稳定入口</h2>
              <p className="session-meta">Settings 的深内容属于后续阶段，本子任务只锁定 IA。</p>
            </section>
          )
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

        <section className="hero-card">
          <p className="hero-eyebrow">Phase 5 Project-aware Shell</p>
          <h1>Xnova Studio</h1>
          <p className="hero-copy">
            {shellStatus === 'loading'
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

        {content}

        <section className="detail-card">
          <div className="detail-row">
            <span>最近项目数</span>
            <strong>{shellSnapshot?.recentProjects.length ?? 0}</strong>
          </div>
          <div className="detail-row">
            <span>当前项目默认 Agent</span>
            <strong>{shellSnapshot?.defaults.agentId ?? '未解析'}</strong>
          </div>
          <div className="detail-row">
            <span>当前模型</span>
            <strong>{shellSnapshot?.defaults.modelId ?? '未解析'}</strong>
          </div>
        </section>
      </main>
    </div>
  )
}
