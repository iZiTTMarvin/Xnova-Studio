/**
 * SubAgentCard — 对话流中的子 Agent 折叠卡片。
 *
 * 默认折叠显示摘要（状态 + 当前工具），点击展开查看详情。
 * 使用项目现有的 CSS 类名风格和 Icons 组件，不使用 Tailwind。
 */

import { memo, useState } from 'react'
import { IconCheck, IconChevronRight, IconCross } from './Icons'

/** 子 Agent 详细事件 */
export interface SubAgentDetailEvent {
  type: 'tool_start' | 'tool_done' | 'text' | 'error'
  toolName?: string
  durationMs?: number
  success?: boolean
  resultSummary?: string
  text?: string
  error?: string
}

/** 子 Agent 信息模型 */
export interface SubAgentInfo {
  agentId: string
  /** 人类可读名称 */
  name?: string
  /** Agent 类型（general / explore / plan / 自定义） */
  agentType?: string
  description: string
  status: 'running' | 'stopping' | 'stopped' | 'done' | 'error'
  turn: number
  maxTurns: number
  currentTool?: string
  /** 详细事件（展开时显示） */
  events: SubAgentDetailEvent[]
}

interface SubAgentCardProps {
  agent: SubAgentInfo
  isExpanded?: boolean
  onExpandedChange?: (nextExpanded: boolean) => void
}

/** 状态对应的中文标签 */
function getStatusLabel(status: SubAgentInfo['status']): string {
  switch (status) {
    case 'running': return '运行中'
    case 'stopping': return '正在停止'
    case 'stopped': return '已停止'
    case 'done': return '已完成'
    case 'error': return '错误'
  }
}

/** 状态对应的 CSS modifier */
function getStatusModifier(status: SubAgentInfo['status']): string {
  switch (status) {
    case 'running':
    case 'stopping':
      return 'subagent-card--running'
    case 'done':
      return 'subagent-card--done'
    case 'error':
      return 'subagent-card--error'
    default:
      return ''
  }
}

export const SubAgentCard = memo(function SubAgentCard(props: SubAgentCardProps) {
  const { agent } = props
  const isExpandedControlled = typeof props.isExpanded === 'boolean'
  const [internalExpanded, setInternalExpanded] = useState(false)
  const isExpanded = isExpandedControlled ? props.isExpanded : internalExpanded
  const setExpanded = (nextExpanded: boolean) => {
    if (!isExpandedControlled) {
      setInternalExpanded(nextExpanded)
    }
    props.onExpandedChange?.(nextExpanded)
  }

  const isSpinning = agent.status === 'running' || agent.status === 'stopping'
  const statusModifier = getStatusModifier(agent.status)
  const turnProgress = agent.maxTurns > 0
    ? `${agent.turn}/${agent.maxTurns}`
    : `${agent.turn}`

  return (
    <div
      className={[
        'subagent-card',
        statusModifier,
      ].filter(Boolean).join(' ')}
    >
      {/* 折叠头 */}
      <button
        type="button"
        className="subagent-card-header"
        onClick={() => setExpanded(!isExpanded)}
        aria-expanded={isExpanded}
      >
        <span className="subagent-card-status">
          {isSpinning ? (
            <span className="spinner" />
          ) : agent.status === 'done' ? (
            <IconCheck className="subagent-card-icon-success" />
          ) : agent.status === 'error' ? (
            <IconCross className="subagent-card-icon-error" />
          ) : (
            <IconCheck className="subagent-card-icon-muted" />
          )}
        </span>

        <span className="subagent-card-info">
          <span className="subagent-card-name-line">
            {agent.agentType ? (
              <span className="subagent-card-type-tag">{agent.agentType}</span>
            ) : null}
            <span className="subagent-card-name">
              {agent.name ?? agent.description}
            </span>
          </span>
          {isSpinning ? (
            <span className="subagent-card-running-detail">
              {agent.status === 'stopping' ? (
                <span className="subagent-card-stopping">正在停止...</span>
              ) : (
                <>
                  <span className="subagent-card-turn">turn {turnProgress}</span>
                  {agent.currentTool ? (
                    <span className="subagent-card-current-tool">▸ {agent.currentTool}</span>
                  ) : null}
                </>
              )}
            </span>
          ) : null}
        </span>

        <span className="subagent-card-meta">
          <span className={`subagent-card-status-label subagent-card-status-label--${agent.status}`}>
            {getStatusLabel(agent.status)}
          </span>
          <span className={`subagent-card-chevron ${isExpanded ? 'subagent-card-chevron--open' : ''}`}>
            <IconChevronRight />
          </span>
        </span>
      </button>

      {/* 展开详情 */}
      <div className={`subagent-card-details-wrapper ${isExpanded ? 'subagent-card-details-wrapper--open' : ''}`}>
        {isExpanded ? (
          <div className="subagent-card-details">
            {agent.events.length === 0 ? (
              <div className="subagent-card-empty">(等待事件...)</div>
            ) : (
              agent.events
                .filter((e) => e.type !== 'tool_start')
                .map((evt, i) => (
                  <div key={i} className="subagent-card-event">
                    {evt.type === 'tool_done' ? (
                      <div className="subagent-card-event-tool">
                        <span className={evt.success ? 'subagent-card-icon-success' : 'subagent-card-icon-error'}>
                          {evt.success ? <IconCheck /> : <IconCross />}
                        </span>
                        <span className="subagent-card-event-tool-name">{evt.toolName}</span>
                        {evt.durationMs != null ? (
                          <span className="subagent-card-event-duration">{evt.durationMs}ms</span>
                        ) : null}
                        {evt.resultSummary ? (
                          <span className="subagent-card-event-summary">
                            ⎿ {evt.resultSummary.split('\n')[0]}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                    {evt.type === 'text' && evt.text ? (
                      <div className="subagent-card-event-text">{evt.text}</div>
                    ) : null}
                    {evt.type === 'error' ? (
                      <div className="subagent-card-event-error">✗ {evt.error}</div>
                    ) : null}
                  </div>
                ))
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
})
