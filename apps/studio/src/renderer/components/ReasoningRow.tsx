import { memo, useEffect, useRef, useState } from 'react'
import { IconChevronDown, IconChevronRight } from './Icons'
import { formatDurationLabel } from '../utils/tool-event-summary'

interface ReasoningRowProps {
  content: string
  isLive: boolean
  durationMs?: number
  startedAt?: number
  endedAt?: number
  isExpanded?: boolean
  onExpandedChange?: (nextExpanded: boolean) => void
}

export const ReasoningRow = memo(function ReasoningRow(props: ReasoningRowProps) {
  const isExpandedControlled = typeof props.isExpanded === 'boolean'
  const [internalExpanded, setInternalExpanded] = useState(props.isLive)
  const isExpanded = isExpandedControlled ? props.isExpanded : internalExpanded
  const setExpanded = (nextExpanded: boolean) => {
    if (!isExpandedControlled) {
      setInternalExpanded(nextExpanded)
    }
    props.onExpandedChange?.(nextExpanded)
  }
  const [elapsedMs, setElapsedMs] = useState(() => {
    if (props.durationMs !== undefined) {
      return props.durationMs
    }
    if (props.startedAt !== undefined) {
      return Math.max(0, Date.now() - props.startedAt)
    }
    return 0
  })
  const previousLiveRef = useRef(props.isLive)

  useEffect(() => {
    if (!props.isLive) {
      if (props.durationMs !== undefined) {
        setElapsedMs(props.durationMs)
        return
      }
      if (props.startedAt !== undefined) {
        const endedAt = props.endedAt ?? Date.now()
        setElapsedMs(Math.max(0, endedAt - props.startedAt))
      }
      return
    }

    setExpanded(true)
    const startTime = props.startedAt ?? Date.now()
    setElapsedMs(Math.max(0, Date.now() - startTime))
    const timer = window.setInterval(() => {
      setElapsedMs(Math.max(0, Date.now() - startTime))
    }, 100)

    return () => window.clearInterval(timer)
  }, [props.durationMs, props.endedAt, props.isLive, props.startedAt])

  useEffect(() => {
    if (previousLiveRef.current && !props.isLive) {
      setExpanded(false)
    }
    previousLiveRef.current = props.isLive
  }, [props.isLive])

  const durationText = formatDurationLabel(
    props.durationMs ?? (elapsedMs > 0 ? elapsedMs : undefined),
  )

  return (
    <div className={`reasoning-row ${isExpanded ? '' : 'reasoning-row--collapsed'}`}>
      <button
        type="button"
        className="reasoning-row-header"
        onClick={() => setExpanded(!isExpanded)}
        aria-expanded={isExpanded}
      >
        <span className="reasoning-row-chevron">
          {isExpanded ? <IconChevronDown /> : <IconChevronRight />}
        </span>
        {props.isLive ? <span className="spinner" /> : null}
        <span className="reasoning-row-title">
          {props.isLive ? '思考中…' : '思考过程'}
        </span>
        {durationText ? (
          <span className="reasoning-row-duration">⏱ {durationText}</span>
        ) : null}
      </button>
      {isExpanded ? (
        <div className="reasoning-row-content">
          <div className="reasoning-row-text">{props.content}</div>
        </div>
      ) : null}
    </div>
  )
})
