import { memo, useState } from 'react'
import { IconCheck, IconChevronDown, IconChevronRight, IconCross } from './Icons'
import type { ToolRowModel } from '../utils/conversation-render-rows'
import {
  createToolArgumentDetails,
  createToolEventSummary,
  formatDurationLabel,
  truncateText,
} from '../utils/tool-event-summary'

interface ToolActionRowProps {
  tool: ToolRowModel
  isExpanded?: boolean
  onExpandedChange?: (nextExpanded: boolean) => void
}

function isToolFailure(tool: ToolRowModel): boolean {
  return tool.status === 'error' || tool.success === false
}

function getToolStatusLabel(tool: ToolRowModel): string {
  if (tool.status === 'running') {
    return '进行中'
  }
  return isToolFailure(tool) ? '失败' : '成功'
}

function getVisibleFailureSummary(tool: ToolRowModel): string | null {
  if (!isToolFailure(tool)) {
    return null
  }

  const summary = tool.resultSummary?.trim()
  if (!summary) {
    return '工具执行失败'
  }

  return truncateText(summary, 120)
}

export const ToolActionRow = memo(function ToolActionRow(props: ToolActionRowProps) {
  const isExpandedControlled = typeof props.isExpanded === 'boolean'
  const [internalExpanded, setInternalExpanded] = useState(false)
  const isExpanded = isExpandedControlled ? props.isExpanded : internalExpanded
  const setExpanded = (nextExpanded: boolean) => {
    if (!isExpandedControlled) {
      setInternalExpanded(nextExpanded)
    }
    props.onExpandedChange?.(nextExpanded)
  }
  const summary = createToolEventSummary(
    props.tool.toolName,
    props.tool.args,
    props.tool.resultSummary,
  )
  const argumentDetails = createToolArgumentDetails(
    props.tool.toolName,
    props.tool.args,
  )
  const durationText = formatDurationLabel(props.tool.durationMs)
  const failureSummary = getVisibleFailureSummary(props.tool)
  const detailResultSummary =
    failureSummary === null && props.tool.resultSummary?.trim()
      ? truncateText(props.tool.resultSummary.trim(), 160)
      : null
  const hasResultFull =
    typeof props.tool.resultFull === 'string' &&
    props.tool.resultFull.trim().length > 0 &&
    props.tool.resultFull !== props.tool.resultSummary
  const isRunning = props.tool.status === 'running'
  const isFailure = isToolFailure(props.tool)
  const hasExpandableDetails =
    argumentDetails.length > 0 || detailResultSummary !== null || hasResultFull

  return (
    <div
      className={[
        'tool-action-row',
        isRunning ? 'tool-action-row--running' : '',
        isFailure ? 'tool-action-row--error' : '',
      ].filter(Boolean).join(' ')}
    >
      <button
        type="button"
        className="tool-action-row-main"
        onClick={() => {
          if (hasExpandableDetails) {
            setExpanded(!isExpanded)
          }
        }}
        aria-expanded={hasExpandableDetails ? isExpanded : undefined}
      >
        <span className="tool-action-row-status">
          {isRunning ? (
            <span className="spinner" />
          ) : isFailure ? (
            <IconCross className="tool-action-row-icon-error" />
          ) : (
            <IconCheck className="tool-action-row-icon-success" />
          )}
        </span>

        <span className="tool-action-row-copy">
          <span className="tool-action-row-title-line">
            <span className="tool-action-row-title">{summary.title}</span>
            {summary.target ? (
              <span className="tool-action-row-target">{summary.target}</span>
            ) : null}
            {summary.detail ? (
              <span className="tool-action-row-detail">{summary.detail}</span>
            ) : null}
          </span>
          {failureSummary ? (
            <span className="tool-action-row-failure">{failureSummary}</span>
          ) : null}
        </span>

        <span className="tool-action-row-meta">
          <span className="tool-action-row-status-text">{getToolStatusLabel(props.tool)}</span>
          {durationText ? (
            <span className="tool-action-row-duration">{durationText}</span>
          ) : null}
          {hasExpandableDetails ? (
            <span className="tool-action-row-chevron">
              {isExpanded ? <IconChevronDown /> : <IconChevronRight />}
            </span>
          ) : null}
        </span>
      </button>

      {hasExpandableDetails && isExpanded ? (
        <div className="tool-action-row-details">
          {argumentDetails.length > 0 ? (
            <div className="tool-action-row-detail-section">
              <span className="tool-action-row-detail-label">参数摘要</span>
              <div className="tool-action-row-detail-result">
                {argumentDetails.map((detail) => (
                  <div key={`${detail.label}:${detail.value}`}>
                    <strong>{detail.label}</strong>
                    {': '}
                    <span>{detail.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {detailResultSummary ? (
            <div className="tool-action-row-detail-section">
              <span className="tool-action-row-detail-label">结果摘要</span>
              <div className="tool-action-row-detail-result">{detailResultSummary}</div>
            </div>
          ) : null}

          {hasResultFull ? (
            <details className="tool-action-row-detail-section">
              <summary className="tool-action-row-detail-label">完整结果</summary>
              <pre className="tool-action-row-detail-code">{props.tool.resultFull}</pre>
            </details>
          ) : null}
        </div>
      ) : null}
    </div>
  )
})
