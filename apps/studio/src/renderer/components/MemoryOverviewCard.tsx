import type { StudioMemoryOverviewSnapshot } from '../../shared/studio-bridge-contract'
import { resolveMemoryFeedbackPresentation } from '../utils/memory-feedback'
import './MemoryOverviewCard.css'

export interface MemoryOverviewCardProps {
  status: 'loading' | 'ready' | 'disabled' | 'error'
  snapshot: StudioMemoryOverviewSnapshot | null
  error: string | null
  actionMessage: string | null
  isRebuilding: boolean
  onRebuild: () => Promise<void>
}

function resolveEnabledLabel(snapshot: StudioMemoryOverviewSnapshot | null): string {
  if (!snapshot) {
    return '未启用'
  }
  return snapshot.enabled ? '已启用' : '未启用'
}

export function MemoryOverviewCard(props: MemoryOverviewCardProps) {
  const canRebuild = props.status === 'ready' && Boolean(props.snapshot?.overview.projectPath)
  const feedback = resolveMemoryFeedbackPresentation({
    snapshot: props.snapshot,
    status: props.status,
    error: props.error,
    actionMessage: props.actionMessage,
  })

  return (
    <section className="memory-settings-card">
      <header className="memory-settings-header">
        <h3>全局记忆</h3>
        <span className={`memory-status memory-status-${feedback.statusClassName}`}>
          {resolveEnabledLabel(props.snapshot)}
        </span>
      </header>

      <p className="memory-status-text">{feedback.statusMessage}</p>

      {props.error ? (
        <div className="provider-feedback provider-feedback-error">
          <strong>{props.error}</strong>
        </div>
      ) : null}

      {props.actionMessage ? (
        <div className="provider-feedback provider-feedback-success">
          <strong>{props.actionMessage}</strong>
        </div>
      ) : null}

      {props.snapshot ? (
        <div className="memory-metrics-row">
          <span>{`全局 ${props.snapshot.overview.globalEntries}`}</span>
          <span>{`项目 ${props.snapshot.overview.projectEntries}`}</span>
          <span>{`向量 ${props.snapshot.overview.vectorChunks}`}</span>
        </div>
      ) : null}

      <div className="memory-action-row">
        <button
          type="button"
          className="primary-button"
          onClick={() => {
            void props.onRebuild()
          }}
          disabled={!canRebuild || props.isRebuilding}
        >
          {props.isRebuilding ? '重建中…' : '重建索引'}
        </button>
      </div>
    </section>
  )
}
