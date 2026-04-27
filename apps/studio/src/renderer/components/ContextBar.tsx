import { useState } from 'react'
import type { WorkContext } from '../utils/work-context'
import type { ContextState } from '../stores/runtime-store'

export interface ContextBarFieldSpec {
  key:
    | 'project'
    | 'branch'
    | 'agent'
    | 'model'
    | 'contextUsage'
    | 'runningSubagents'
  label: string
  actionLabel: string
  isMono?: boolean
}

export const CONTEXT_BAR_FIELDS: ContextBarFieldSpec[] = [
  { key: 'project', label: '项目', actionLabel: '当前项目', isMono: true },
  { key: 'branch', label: '分支', actionLabel: '当前分支', isMono: true },
  { key: 'agent', label: 'Agent', actionLabel: '当前 Agent' },
  { key: 'model', label: '模型', actionLabel: '当前模型', isMono: true },
  { key: 'contextUsage', label: 'Context', actionLabel: '上下文使用量', isMono: true },
  { key: 'runningSubagents', label: 'SubAgent', actionLabel: '运行中的 SubAgent', isMono: true },
]

function getFieldValue(key: ContextBarFieldSpec['key'], workContext: WorkContext): string {
  switch (key) {
    case 'project':
      return workContext.projectPath ?? '未绑定项目'
    case 'branch':
      return workContext.branch ?? '未知分支'
    case 'agent':
      return workContext.agentId ?? '未选择 Agent'
    case 'model':
      return workContext.modelId ?? '未选择模型'
    case 'contextUsage':
      return workContext.contextUsageLabel ?? '0%'
    case 'runningSubagents':
      return workContext.runningSubagents > 0
        ? `${workContext.runningSubagents} 个运行中`
        : '0 个运行中'
  }
}

/** 格式化 token 数量为可读字符串 */
function formatTokens(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1)}M`
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(1)}K`
  }
  return String(count)
}

/** 获取上下文级别对应的颜色 */
function getLevelColor(level: ContextState['level']): string {
  switch (level) {
    case 'normal':
      return 'var(--primary)'
    case 'warning':
      return 'var(--warning)'
    case 'critical':
    case 'overflow':
      return 'var(--error)'
  }
}

/**
 * 上下文用量环形 SVG 进度指示器。
 * 类似 Codex App 的上下文圈。
 */
function ContextRing(props: { state: ContextState | null }) {
  const [showTooltip, setShowTooltip] = useState(false)
  const state = props.state

  const percentage = state ? Math.round(state.usedPercentage * 100) : 0
  const color = state ? getLevelColor(state.level) : 'var(--text-faint)'

  // SVG 环形参数
  const size = 28
  const strokeWidth = 3
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference * (1 - (state?.usedPercentage ?? 0))

  return (
    <div
      className="context-ring-wrapper"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <svg
        className="context-ring"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
      >
        {/* 背景环 */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--border-subtle)"
          strokeWidth={strokeWidth}
        />
        {/* 进度环 */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 400ms ease, stroke 300ms ease' }}
        />
        {/* 中间百分比文字 */}
        <text
          x={size / 2}
          y={size / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fill="var(--text-secondary)"
          fontSize="8"
          fontWeight="600"
          fontFamily="var(--font-mono)"
        >
          {percentage}
        </text>
      </svg>

      {showTooltip && state ? (
        <div className="context-ring-tooltip">
          <div className="context-ring-tooltip-row">
            <span>已用</span>
            <strong>{formatTokens(state.lastInputTokens)}</strong>
          </div>
          <div className="context-ring-tooltip-row">
            <span>窗口</span>
            <strong>{formatTokens(state.effectiveWindow)}</strong>
          </div>
          <div className="context-ring-tooltip-row">
            <span>占比</span>
            <strong style={{ color }}>{percentage}%</strong>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export interface ContextBarProps {
  workContext: WorkContext
  onFieldSelect?: (key: ContextBarFieldSpec['key']) => void
}

/**
 * 工作上下文条 — 紧凑 HUD Strip
 *
 * 位于输入框附近，长期展示当前工作状态。
 * 视觉上像一条轻量信息带，不是六张并排卡片。
 * 字段顺序固定：项目 → 分支 → Agent → 模型 → Context → SubAgent
 */
export function ContextBar(props: ContextBarProps) {
  return (
    <section className="context-strip" aria-label="工作上下文条">
      {CONTEXT_BAR_FIELDS.map((field) => {
        const value = getFieldValue(field.key, props.workContext)

        // Context 字段使用环形进度圈
        if (field.key === 'contextUsage') {
          const ringContent = (
            <>
              <span className="context-label">{field.label}</span>
              <ContextRing state={props.workContext.contextState} />
            </>
          )

          if (props.onFieldSelect) {
            return (
              <button
                key={field.key}
                type="button"
                className="context-item context-item-button"
                data-testid="context-bar-field"
                data-field-key={field.key}
                aria-label={`${field.actionLabel} ${value}`}
                title={value}
                onClick={() => {
                  props.onFieldSelect?.(field.key)
                }}
              >
                {ringContent}
              </button>
            )
          }

          return (
            <div
              key={field.key}
              className="context-item"
              data-testid="context-bar-field"
              data-field-key={field.key}
              title={value}
            >
              {ringContent}
            </div>
          )
        }

        const content = (
          <>
            <span className="context-label">{field.label}</span>
            <span className={`context-value ${field.isMono ? 'context-value-mono' : ''}`}>
              {value}
            </span>
          </>
        )

        if (props.onFieldSelect) {
          return (
            <button
              key={field.key}
              type="button"
              className="context-item context-item-button"
              data-testid="context-bar-field"
              data-field-key={field.key}
              aria-label={`${field.actionLabel} ${value}`}
              title={value}
              onClick={() => {
                props.onFieldSelect?.(field.key)
              }}
            >
              {content}
            </button>
          )
        }

        return (
          <div
            key={field.key}
            className="context-item"
            data-testid="context-bar-field"
            data-field-key={field.key}
            title={value}
          >
            {content}
          </div>
        )
      })}
    </section>
  )
}
