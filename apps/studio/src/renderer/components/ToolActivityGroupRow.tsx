import { useEffect, useRef, useState } from 'react'
import { IconCheck, IconChevronDown, IconChevronRight } from './Icons'
import type { ToolRowModel } from '../utils/conversation-render-rows'
import {
  createToolEventSummary,
  formatDurationLabel,
} from '../utils/tool-event-summary'

interface ToolActivityGroupRowProps {
  title: string
  running: boolean
  tools: ToolRowModel[]
}

const MAX_VISIBLE_TOOLS = 6
const AUTO_COLLAPSE_DELAY_MS = 720

function isToolRunning(tool: ToolRowModel): boolean {
  return tool.status === 'running'
}

export function ToolActivityGroupRow(props: ToolActivityGroupRowProps) {
  const [isExpanded, setIsExpanded] = useState(props.running)
  const [hasInteracted, setHasInteracted] = useState(false)
  const previousRunningRef = useRef(props.running)

  useEffect(() => {
    if (props.running) {
      if (!hasInteracted) {
        setIsExpanded(true)
      }
      previousRunningRef.current = true
      return
    }

    if (previousRunningRef.current && !hasInteracted) {
      const timer = window.setTimeout(() => {
        setIsExpanded(false)
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
          setHasInteracted(true)
          setIsExpanded((current) => !current)
        }}
        aria-expanded={isExpanded}
      >
        <span className="tool-activity-group-row-status">
          {props.running ? <span className="spinner" /> : <IconCheck />}
        </span>
        <span className="tool-activity-group-row-title">{props.title}</span>
        <span className="tool-activity-group-row-count">{props.tools.length} 项</span>
        <span className="tool-activity-group-row-chevron">
          {isExpanded ? <IconChevronDown /> : <IconChevronRight />}
        </span>
      </button>

      {isExpanded ? (
        <div className="tool-activity-group-row-details">
          {visibleTools.map((tool) => {
            const summary = createToolEventSummary(
              tool.toolName,
              tool.args,
              tool.resultSummary,
            )
            const durationText = formatDurationLabel(tool.durationMs)

            return (
              <div key={tool.id} className="tool-activity-group-item">
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
              </div>
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
  )
}
