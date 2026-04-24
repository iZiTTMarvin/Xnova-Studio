import { useState } from 'react'
import type { StudioSkillsPluginsOverviewSnapshot } from '../../shared/studio-bridge-contract'

export interface SkillsPluginsOverviewCardProps {
  status: 'loading' | 'ready' | 'disabled' | 'error'
  snapshot: StudioSkillsPluginsOverviewSnapshot | null
  error: string | null
}

function getStatusLabel(status: 'loading' | 'ready' | 'disabled' | 'error' | 'empty'): string {
  switch (status) {
    case 'loading':
      return '加载中'
    case 'ready':
      return '已接入'
    case 'disabled':
      return '不可用'
    case 'error':
      return '错误'
    case 'empty':
      return '空态'
  }
}

export function SkillsPluginsOverviewCard(props: SkillsPluginsOverviewCardProps) {
  const [showManage, setShowManage] = useState(false)

  return (
    <section className="feature-section-card">
      <div className="feature-section-header">
        <h3>Skills / Plugins</h3>
        <span className={`feature-section-status feature-section-status-${props.snapshot?.status === 'empty' ? 'empty' : props.status === 'ready' ? 'ready' : props.status}`}>
          {getStatusLabel(props.snapshot?.status ?? props.status)}
        </span>
      </div>

      {props.error ? (
        <div className="provider-feedback provider-feedback-error">
          <strong>{props.error}</strong>
        </div>
      ) : null}

      <p className="feature-section-summary">
        {props.snapshot?.statusMessage ??
          (props.status === 'loading'
            ? '正在读取 Skills / Plugins 状态…'
            : props.status === 'disabled'
              ? '当前宿主桥接不可用，Skills / Plugins 状态暂时不可读取。'
              : 'Skills / Plugins 状态暂不可用。')}
      </p>

      {props.snapshot ? (
        <>
          <div className="feature-highlight-grid">
            {props.snapshot.sourceDistribution.map((entry) => (
              <div key={entry.source} className="feature-highlight-card">
                <span className="feature-highlight-label">{entry.source}</span>
                <strong className="feature-highlight-value">{entry.count}</strong>
              </div>
            ))}
          </div>

          <div className="provider-card-list">
            <article className="provider-item-card">
              <div className="provider-item-header">
                <h4>最近使用</h4>
              </div>
              {props.snapshot.recentSkills.length === 0 ? (
                <p className="feature-section-detail">暂无最近使用的 skill。</p>
              ) : (
                props.snapshot.recentSkills.map((skill) => (
                  <div key={skill.name} className="detail-row">
                    <span>{skill.name}</span>
                    <strong>{skill.source}</strong>
                  </div>
                ))
              )}
            </article>

            <article className="provider-item-card">
              <div className="provider-item-header">
                <h4>常用 Skill</h4>
              </div>
              {props.snapshot.frequentSkills.length === 0 ? (
                <p className="feature-section-detail">暂无常用 skill。</p>
              ) : (
                props.snapshot.frequentSkills.map((skill) => (
                  <div key={skill.name} className="detail-row">
                    <span>{skill.name}</span>
                    <strong>{skill.useCount}</strong>
                  </div>
                ))
              )}
            </article>
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
          className="secondary-button"
          onClick={() => {
            setShowManage((value) => !value)
          }}
        >
          管理 Skills / Plugins
        </button>
      </div>

      {showManage && props.snapshot ? (
        <div className="provider-card-list">
          {props.snapshot.plugins.map((plugin) => (
            <article key={plugin.name} className="provider-item-card">
              <div className="provider-item-header">
                <h4>{plugin.name}</h4>
                <span className="feature-section-status feature-section-status-ready">{plugin.source}</span>
              </div>
              <p className="feature-section-detail">
                v{plugin.version}
                {' · '}
                Skills {plugin.skillCount}
                {' · '}
                Hooks {plugin.hasHooks ? '有' : '无'}
              </p>
              {plugin.description ? (
                <p className="feature-section-detail">{plugin.description}</p>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}
    </section>
  )
}
