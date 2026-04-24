import { useState, type ReactNode } from 'react'
import { IconChat, IconSearch, IconAgent, IconFolder, IconTool, IconSettings } from './Icons'
import xnovaLogo from '../assets/xnova-logo.png'
import './ProjectShellSidebar.css'

export type PrimaryNavId =
  | 'quick-chat'
  | 'search'
  | 'agents'
  | 'projects'
  | 'tools'

export type SidebarBlockStatus = 'loading' | 'empty' | 'disabled' | 'ready'

interface SidebarBlockConfig {
  title: '项目' | '聊天'
  status: SidebarBlockStatus
  message: string
  content: ReactNode
}

interface PrimaryNavItem {
  id: PrimaryNavId
  label: string
  icon: ReactNode
}

export const PRIMARY_NAV_ITEMS: PrimaryNavItem[] = [
  { id: 'quick-chat', label: '新对话', icon: <IconChat /> },
  { id: 'search', label: '搜索', icon: <IconSearch /> },
  { id: 'agents', label: 'Agents', icon: <IconAgent /> },
  { id: 'projects', label: '项目', icon: <IconFolder /> },
  { id: 'tools', label: '工具', icon: <IconTool /> },
]

export interface ProjectShellSidebarProps {
  activeNavId: PrimaryNavId
  onNavigate: (id: PrimaryNavId) => void
  onOpenSettings: () => void
  projectBlock: SidebarBlockConfig
  chatBlock: SidebarBlockConfig
}

function renderBlockState(config: SidebarBlockConfig): ReactNode {
  if (config.status === 'ready') {
    return config.content
  }

  return (
    <div className={`sidebar-block-state sidebar-block-state-${config.status}`}>
      <p>{config.message}</p>
    </div>
  )
}

/**
 * 左侧壳 — 安静、原生、低装饰
 *
 * - 一级导航固定 7 个入口
 * - 项目 / 聊天两个 block 独立折叠/展开
 * - 更安静的品牌区，不做过度品牌展示
 * - 导航项 hover 有微过渡，激活态明确但不刺眼
 */
export function ProjectShellSidebar(props: ProjectShellSidebarProps) {
  const [projectCollapsed, setProjectCollapsed] = useState(false)
  const [chatCollapsed, setChatCollapsed] = useState(false)

  return (
    <aside className="studio-sidebar">
      <div className="sidebar-brand">
        <img src={xnovaLogo} alt="Xnova" className="sidebar-brand-mark" />
        <div>
          <h1 className="sidebar-brand-title">Xnova Studio</h1>
          <div className="sidebar-brand-subtitle">Quiet operational shell</div>
        </div>
      </div>

      <div className="sidebar-main">
        <nav className="sidebar-nav" aria-label="Studio 一级导航">
          {PRIMARY_NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`sidebar-nav-button ${
                props.activeNavId === item.id ? 'sidebar-nav-button-active' : ''
              }`}
              onClick={() => {
                props.onNavigate(item.id)
              }}
            >
              <span className="sidebar-nav-icon">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <section className="sidebar-block">
          <header className="sidebar-block-header">
            <h2>项目</h2>
            <button
              type="button"
              className="sidebar-toggle"
              aria-label={projectCollapsed ? '展开项目' : '折叠项目'}
              onClick={() => {
                setProjectCollapsed((value) => !value)
              }}
            >
              {projectCollapsed ? '展开' : '折叠'}
            </button>
          </header>
          {!projectCollapsed ? (
            <div className="sidebar-block-body sidebar-block-scroll">
              {renderBlockState(props.projectBlock)}
            </div>
          ) : null}
        </section>

        <section className="sidebar-block">
          <header className="sidebar-block-header">
            <h2>聊天</h2>
            <button
              type="button"
              className="sidebar-toggle"
              aria-label={chatCollapsed ? '展开聊天' : '折叠聊天'}
              onClick={() => {
                setChatCollapsed((value) => !value)
              }}
            >
              {chatCollapsed ? '展开' : '折叠'}
            </button>
          </header>
          {!chatCollapsed ? (
            <div className="sidebar-block-body sidebar-block-scroll">
              {renderBlockState(props.chatBlock)}
            </div>
          ) : null}
        </section>
      </div>

      <div className="sidebar-utility">
        <button
          type="button"
          className="sidebar-nav-button sidebar-utility-button"
          onClick={props.onOpenSettings}
        >
          <span className="sidebar-nav-icon"><IconSettings /></span>
          设置
        </button>
      </div>
    </aside>
  )
}
