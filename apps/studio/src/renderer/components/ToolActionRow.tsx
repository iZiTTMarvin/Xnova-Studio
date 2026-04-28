import { memo, useState } from 'react'
import { IconCheck, IconChevronDown, IconChevronRight, IconCross } from './Icons'
import type { ToolRowModel } from '../utils/conversation-render-rows'
import {
  createToolArgumentDetails,
  createToolEventSummary,
  formatDurationLabel,
  truncateText,
} from '../utils/tool-event-summary'
import { MarkdownContent } from '../utils/markdown-renderer'
import { isMinVisibleActionTool } from '../utils/tool-classification'
import { useMinVisibleStatus } from '../hooks/useMinVisibleStatus'

interface ToolActionRowProps {
  tool: ToolRowModel
  isExpanded?: boolean
  onExpandedChange?: (nextExpanded: boolean) => void
}

function isToolFailure(tool: ToolRowModel): boolean {
  return tool.status === 'error' || tool.success === false
}

function getToolStatusLabel(tool: ToolRowModel, displayStatus: 'running' | 'done' | 'error'): string {
  if (displayStatus === 'running') {
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

/**
 * 尝试从完整结果中推断代码语言。
 * 用于在详情区域的代码块上显示 lang 标签。
 */
function inferResultLang(tool: ToolRowModel): string | null {
  const name = tool.toolName.toLowerCase()
  if (name.includes('bash') || name.includes('shell') || name.includes('exec')) {
    return 'shell'
  }
  // 从 args 中推断文件类型
  const path =
    typeof tool.args['path'] === 'string'
      ? tool.args['path']
      : typeof tool.args['file'] === 'string'
        ? tool.args['file']
        : null
  if (path) {
    const ext = path.split('.').pop()?.toLowerCase()
    if (ext) {
      const langMap: Record<string, string> = {
        ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
        py: 'python', rs: 'rust', go: 'go', java: 'java',
        json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'toml',
        css: 'css', html: 'html', md: 'markdown', sql: 'sql',
        sh: 'shell', bash: 'shell',
      }
      return langMap[ext] ?? ext
    }
  }
  return null
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

  // 展示层状态：动作类工具启用最小可见时间，避免快速完成时 running 态一闪而过
  const displayStatus = useMinVisibleStatus(props.tool.status, {
    enabled: isMinVisibleActionTool(props.tool.toolName),
  })

  const summary = createToolEventSummary(
    props.tool.toolName,
    props.tool.args,
    props.tool.resultSummary,
  )
  const argumentDetails = createToolArgumentDetails(
    props.tool.toolName,
    props.tool.args,
  )
  // 视觉状态基于 displayStatus，而非直接读 tool.status
  // 当 displayStatus 仍为 running（min-visible 延迟中），不提前显示失败样式
  const isRunning = displayStatus === 'running'
  const isFailure = !isRunning && (displayStatus === 'error' || isToolFailure(props.tool))
  const durationText = formatDurationLabel(props.tool.durationMs)
  const rawFailureSummary = getVisibleFailureSummary(props.tool)
  // min-visible 延迟期间继续保持 running 观感，避免同时出现 spinner 和失败文案
  const failureSummary = isFailure ? (rawFailureSummary ?? '工具执行失败') : null
  const detailResultSummary =
    failureSummary === null && props.tool.resultSummary?.trim()
      ? truncateText(props.tool.resultSummary.trim(), 160)
      : null
  const hasResultFull =
    typeof props.tool.resultFull === 'string' &&
    props.tool.resultFull.trim().length > 0 &&
    props.tool.resultFull !== props.tool.resultSummary
  const hasExpandableDetails =
    argumentDetails.length > 0 || detailResultSummary !== null || hasResultFull
  const resultLang = inferResultLang(props.tool)

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
          <span className="tool-action-row-status-text">{getToolStatusLabel(props.tool, displayStatus)}</span>
          {durationText ? (
            <span className="tool-action-row-duration">{durationText}</span>
          ) : null}
          {hasExpandableDetails ? (
            <span className={`tool-action-row-chevron ${isExpanded ? 'tool-action-row-chevron--open' : ''}`}>
              <IconChevronRight />
            </span>
          ) : null}
        </span>
      </button>

      {/* 运行中进度条 */}
      {isRunning ? <div className="tool-action-row-progress" /> : null}

      {/* 展开详情区域：仅在展开时渲染内容，配合 CSS 过渡动画 */}
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
              <div className="tool-action-row-detail-result">
                <MarkdownContent text={detailResultSummary} />
              </div>
            </div>
          ) : null}

          {hasResultFull ? (
            <details className="tool-action-row-detail-section">
              <summary className="tool-action-row-detail-label">完整结果</summary>
              <div className="tool-action-row-detail-code-wrapper">
                {resultLang ? (
                  <span className="tool-action-row-detail-code-lang">{resultLang}</span>
                ) : null}
                <pre className="tool-action-row-detail-code">{props.tool.resultFull}</pre>
              </div>
            </details>
          ) : null}
        </div>
      ) : null}
    </div>
  )
})
