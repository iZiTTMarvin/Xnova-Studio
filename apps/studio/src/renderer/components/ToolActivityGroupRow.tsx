import { useEffect, useRef, useState } from 'react'
import { IconCheck, IconChevronDown, IconChevronRight } from './Icons'
import type { ToolRowModel } from '../utils/conversation-render-rows'
import {
  createToolEventSummary,
  formatDurationLabel,
} from '../utils/tool-event-summary'
import { ToolActionRow } from './ToolActionRow'

interface ToolActivityGroupRowProps {
  title: string
  running: boolean
  tools: ToolRowModel[]
  isExpanded?: boolean
  hasInteracted?: boolean
  onExpandedChange?: (nextExpanded: boolean) => void
  onInteractedChange?: (nextHasInteracted: boolean) => void
}

const MAX_VISIBLE_TOOLS = 6
const AUTO_COLLAPSE_DELAY_MS = 720

function isToolRunning(tool: ToolRowModel): boolean {
  return tool.status === 'running'
}

export function ToolActivityGroupRow(props: ToolActivityGroupRowProps) {
  const isExpandedControlled = typeof props.isExpanded === 'boolean'
  const hasInteractedControlled = typeof props.hasInteracted === 'boolean'
  const [internalExpanded, setInternalExpanded] = useState(props.running)
  const [internalHasInteracted, setInternalHasInteracted] = useState(false)
  // 子工具展开状态：记录哪些工具被单独展开查看详情
  const [expandedToolIds, setExpandedToolIds] = useState<Record<string, boolean>>({})
  const isExpanded = isExpandedControlled ? props.isExpanded : internalExpanded
  const hasInteracted = hasInteractedControlled
    ? props.hasInteracted
    : internalHasInteracted
  const setExpanded = (nextExpanded: boolean) => {
    if (!isExpandedControlled) {
      setInternalExpanded(nextExpanded)
    }
    props.onExpandedChange?.(nextExpanded)
  }
  const setInteracted = (nextHasInteracted: boolean) => {
    if (!hasInteractedControlled) {
      setInternalHasInteracted(nextHasInteracted)
    }
    props.onInteractedChange?.(nextHasInteracted)
  }
  const previousRunningRef = useRef(props.running)

  useEffect(() => {
    if (props.running) {
      if (!hasInteracted) {
        setExpanded(true)
      }
      previousRunningRef.current = true
      return
    }

    if (previousRunningRef.current && !hasInteracted) {
      const timer = window.setTimeout(() => {
        setExpanded(false)
      }, AUTO_COLLAPSE_DELAY_MS)
      previousRunningRef.current = false
      return () => window.clearTimeout(timer)
    }

    previousRunningRef.current = false
    return
  }, [hasInteracted, props.running])

  const visibleTools = isExpanded
    ? props.tools.slice(0, MAX_VISIBLE_TOOLS)
    : []
  const hiddenCount = Math.max(0, props.tools.length - visibleTools.length)

  // 进度计算
  const completedCount = props.tools.filter((t) => t.status !== 'running').length
  const totalCount = props.tools.length
  const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0

  const handleToolExpandedChange = (toolId: string, nextExpanded: boolean) => {
    setExpandedToolIds((current) => ({
      ...current,
      [toolId]: nextExpanded,
    }))
  }

  return (
    <div
      className={[
        'tool-activity-group-row',
        props.running ? 'tool-activity-group-row--running' : '',
      ].filter(Boolean).join(' ')}
    >
      <button
        type="button"
        className="tool-activity-group-row-main"
        onClick={() => {
          setInteracted(true)
          setExpanded(!isExpanded)
        }}
        aria-expanded={isExpanded}
      >
        <span className="tool-activity-group-row-status">
          {props.running ? <span className="spinner" /> : <IconCheck />}
        </span>
        <span className="tool-activity-group-row-title">{props.title}</span>
        <span className="tool-activity-group-row-count">{props.tools.length} 项</span>
        <span className={`tool-activity-group-row-chevron ${isExpanded ? 'tool-activity-group-row-chevron--open' : ''}`}>
          <IconChevronRight />
        </span>
      </button>

      {/* 运行中时显示进度条 */}
      {props.running ? (
        <div className="tool-activity-group-progress">
          <div className="tool-activity-group-progress-bar">
            <div
              className="tool-activity-group-progress-fill"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <span className="tool-activity-group-progress-text">
            {completedCount}/{totalCount} 已完成
          </span>
        </div>
      ) : null}

      {/* 展开的子工具列表：使用 max-height 过渡 + stagger 入场动画 */}
      <div className={`tool-activity-group-row-details-wrapper ${isExpanded ? 'tool-activity-group-row-details-wrapper--open' : ''}`}>
        {isExpanded ? (
          <div className="tool-activity-group-row-details">
            {visibleTools.map((tool, toolIndex) => {
              const isToolExpanded = expandedToolIds[tool.id] === true

              // 如果工具被单独展开，使用嵌套的 ToolActionRow 显示完整详情
              if (isToolExpanded) {
                return (
                  <div
                    key={tool.id}
                    className="tool-activity-group-item-expanded"
                    style={{ animationDelay: `${toolIndex * 40}ms` }}
                  >
                    <ToolActionRow
                      tool={tool}
                      isExpanded={true}
                      onExpandedChange={(next) => handleToolExpandedChange(tool.id, next)}
                    />
                  </div>
                )
              }

              const summary = createToolEventSummary(
                tool.toolName,
                tool.args,
                tool.resultSummary,
              )
              const durationText = formatDurationLabel(tool.durationMs)

              return (
                <button
                  key={tool.id}
                  type="button"
                  className="tool-activity-group-item tool-activity-group-item--stagger"
                  style={{ animationDelay: `${toolIndex * 40}ms` }}
                  onClick={() => handleToolExpandedChange(tool.id, true)}
                  title="点击查看详情"
                >
                  <span className="tool-activity-group-item-status">
                    {isToolRunning(tool) ? <span className="spinner" /> : <IconCheck />}
                  </span>
                  <span className="tool-activity-group-item-copy">
                    <span className="tool-activity-group-item-title">{summary.title}</span>
                    {summary.target ? (
                      <span className="tool-activity-group-item-target">{summary.target}</span>
                    ) : null}
                    {summary.detail ? (
                      <span className="tool-activity-group-item-detail">{summary.detail}</span>
                    ) : null}
                  </span>
                  {durationText ? (
                    <span className="tool-activity-group-item-duration">{durationText}</span>
                  ) : null}
                </button>
              )
            })}

            {hiddenCount > 0 ? (
              <div className="tool-activity-group-item tool-activity-group-item--more">
                还有 {hiddenCount} 个操作
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
