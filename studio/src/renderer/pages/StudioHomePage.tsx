import { useStudioBridge } from '../hooks/useStudioBridge'

function renderWorkspaceText(workspacePath: string | null): string {
  return workspacePath ?? '尚未选择 Workspace'
}

export function StudioHomePage() {
  const {
    bridgeAvailable,
    hostStatus,
    hostState,
    hostError,
    isOpeningWorkspace,
    openWorkspace,
    runtimeStatus,
    runtimeResult,
    lastRuntimeEvent,
    inspectRuntime,
  } = useStudioBridge()

  return (
    <main className="shell-page">
      <section className="hero-card">
        <p className="hero-eyebrow">Phase 4 Renderer Minimal Shell</p>
        <h1>Xnova Studio</h1>
        <p className="hero-copy">
          当前页面只验证 Electron Host 最小闭环：读取 host state、打开 Workspace、发起最小 runtime inspect。
        </p>
      </section>

      <section className="status-grid">
        <article className="status-card">
          <header className="status-header">
            <h2>Workspace</h2>
            <span className={`status-pill status-${hostStatus}`}>
              {bridgeAvailable ? hostStatus : 'disabled'}
            </span>
          </header>
          <p className="status-value">{renderWorkspaceText(hostState.workspacePath)}</p>
          <p className="status-note">
            {hostState.lastSelection?.ok === false
              ? hostState.lastSelection.message
              : hostState.workspacePath
                ? '当前 Workspace 已通过 preload host state 同步到 renderer。'
                : '尚未选择 Workspace'}
          </p>
          <button
            type="button"
            className="primary-button"
            onClick={() => {
              void openWorkspace()
            }}
            disabled={!bridgeAvailable || isOpeningWorkspace}
          >
            {isOpeningWorkspace ? '正在打开…' : '打开 Workspace'}
          </button>
        </article>

        <article className="status-card">
          <header className="status-header">
            <h2>Runtime</h2>
            <span className={`status-pill status-${runtimeStatus}`}>
              {runtimeStatus}
            </span>
          </header>
          <p className="status-value">
            {runtimeResult?.ok
              ? `${runtimeResult.snapshot.provider} / ${runtimeResult.snapshot.model}`
              : '尚未执行 Runtime 检查'}
          </p>
          <p className="status-note">
            {runtimeResult?.ok
              ? '最小 runtime inspect 已返回 provider / model / snapshot。'
              : runtimeResult?.ok === false
                ? runtimeResult.error
                : '通过 preload 发起一条最小 runtime 请求，不触发完整业务流。'}
          </p>
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              void inspectRuntime()
            }}
            disabled={!bridgeAvailable || runtimeStatus === 'loading'}
          >
            {runtimeStatus === 'loading' ? '检查中…' : '检查 Runtime'}
          </button>
        </article>
      </section>

      <section className="detail-card">
        <div className="detail-row">
          <span>Host 错误</span>
          <strong>{hostError ?? '无'}</strong>
        </div>
        <div className="detail-row">
          <span>最后 Runtime 事件</span>
          <strong>{lastRuntimeEvent?.type ?? '尚未收到事件'}</strong>
        </div>
        <div className="detail-row">
          <span>桥接状态</span>
          <strong>{bridgeAvailable ? '已连接' : '宿主桥接不可用'}</strong>
        </div>
      </section>
    </main>
  )
}
