import type { ReactNode } from 'react'
import type {
  SettingsToolsPageStatus,
  SettingsToolsPageViewModel,
} from '../hooks/useSettingsToolsPageModel'

function getStatusLabel(status: SettingsToolsPageStatus): string {
  switch (status) {
    case 'loading':
      return '加载中'
    case 'empty':
      return '空态'
    case 'disabled':
      return '不可用'
    case 'error':
      return '错误'
    case 'ready':
      return '已接入'
  }
}

export interface SettingsToolsPageLayoutProps {
  page: SettingsToolsPageViewModel
  children?: ReactNode
}

export function SettingsToolsPageLayout(props: SettingsToolsPageLayoutProps) {
  const { page } = props

  return (
    <section className="feature-page-shell" aria-label={page.title}>
      <div className="feature-page-card">
        <p className="section-eyebrow">{page.eyebrow}</p>
        <h2>{page.title}</h2>
        <p className="feature-page-copy">{page.description}</p>
      </div>

      <div className={`feature-page-banner feature-page-banner-${page.status}`}>
        <strong>{page.statusMessage}</strong>
      </div>

      {page.warnings.length > 0 ? (
        <section className="warning-list-card" aria-label={`${page.title} 当前告警`}>
          <strong>当前告警</strong>
          <ul>
            {page.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="feature-highlight-grid">
        {page.highlights.map((item) => (
          <div key={item.label} className="feature-highlight-card">
            <span className="feature-highlight-label">{item.label}</span>
            <strong className="feature-highlight-value">{item.value}</strong>
          </div>
        ))}
      </div>

      {props.children ?? (
        <div className="feature-section-grid">
          {page.sections.map((section) => (
            <section key={section.id} className="feature-section-card">
              <div className="feature-section-header">
                <h3>{section.title}</h3>
                <span
                  className={`feature-section-status feature-section-status-${section.status}`}
                >
                  {getStatusLabel(section.status)}
                </span>
              </div>
              <p className="feature-section-summary">{section.summary}</p>
              <p className="feature-section-detail">{section.detail}</p>
            </section>
          ))}
        </div>
      )}
    </section>
  )
}
