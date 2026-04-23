import type { StudioMemoryOverviewSnapshot } from '../../shared/studio-bridge-contract'
import { resolveMemoryFeedbackPresentation } from '../utils/memory-feedback'

export interface MemoryOverviewCardProps {
  status: 'loading' | 'ready' | 'disabled' | 'error'
  snapshot: StudioMemoryOverviewSnapshot | null
  error: string | null
  actionMessage: string | null
  isRebuilding: boolean
  onRebuild: () => Promise<void>
}

export function MemoryOverviewCard(props: MemoryOverviewCardProps) {
  const canRebuild =
    props.status === 'ready' &&
    Boolean(props.snapshot?.overview.projectPath)
  const feedback = resolveMemoryFeedbackPresentation({
    snapshot: props.snapshot,
    status: props.status,
    error: props.error,
    actionMessage: props.actionMessage,
  })

  return (
    <section className="feature-section-card">
      <div className="feature-section-header">
        <h3>Memory</h3>
        <span
          className={`feature-section-status feature-section-status-${feedback.statusClassName}`}
        >
          {feedback.statusLabel}
        </span>
      </div>

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

      {!props.error && !props.actionMessage && feedback.actionHint ? (
        <div className="provider-feedback provider-feedback-warning">
          <strong>{feedback.actionHint}</strong>
        </div>
      ) : null}

      <p className="feature-section-summary">
        {feedback.statusMessage}
      </p>

      {props.snapshot ? (
        <>
          <div className="feature-highlight-grid">
            <div className="feature-highlight-card">
              <span className="feature-highlight-label">全局记忆</span>
              <strong className="feature-highlight-value">{props.snapshot.overview.globalEntries}</strong>
            </div>
            <div className="feature-highlight-card">
              <span className="feature-highlight-label">项目记忆</span>
              <strong className="feature-highlight-value">{props.snapshot.overview.projectEntries}</strong>
            </div>
            <div className="feature-highlight-card">
              <span className="feature-highlight-label">向量 chunk</span>
              <strong className="feature-highlight-value">{props.snapshot.overview.vectorChunks}</strong>
            </div>
          </div>

          <div className="provider-source-grid">
            <div className="provider-source-item">
              <span>Embedding 维度</span>
              <strong>{props.snapshot.embedding.dimension ?? '未建立'}</strong>
            </div>
            <div className="provider-source-item">
              <span>缺失字段</span>
              <strong>
                {props.snapshot.embedding.missingFields.length > 0
                  ? props.snapshot.embedding.missingFields.join(', ')
                  : '无'}
              </strong>
            </div>
            <div className="provider-source-item">
              <span>配置来源</span>
              <strong>{props.snapshot.source.userToml ?? '未提供'}</strong>
            </div>
          </div>

          {props.snapshot.warnings.length > 0 ? (
            <div className="provider-feedback provider-feedback-error">
              {props.snapshot.warnings.map((warning) => (
                <strong key={warning}>{warning}</strong>
              ))}
            </div>
          ) : null}
        </>
      ) : null}

      <div className="provider-toolbar">
        <button
          type="button"
          className="primary-button"
          onClick={() => {
            void props.onRebuild()
          }}
          disabled={!canRebuild || props.isRebuilding}
        >
          {props.isRebuilding ? '重建中…' : '重建 Memory 索引'}
        </button>
      </div>
    </section>
  )
}
