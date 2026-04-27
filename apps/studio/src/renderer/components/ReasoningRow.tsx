import { memo, useEffect, useRef, useState } from 'react'
import { IconChevronDown, IconChevronRight } from './Icons'
import { formatDurationLabel } from '../utils/tool-event-summary'

interface ReasoningRowProps {
  content: string
  isLive: boolean
  durationMs?: number
}

export const ReasoningRow = memo(function ReasoningRow(props: ReasoningRowProps) {
  const [isExpanded, setIsExpanded] = useState(props.isLive)
  const [elapsedMs, setElapsedMs] = useState(props.durationMs ?? 0)
  const previousLiveRef = useRef(props.isLive)
  const startTimeRef = useRef<number | null>(props.isLive ? Date.now() : null)
  const elapsedRef = useRef(elapsedMs)

  useEffect(() => {
    elapsedRef.current = elapsedMs
  }, [elapsedMs])

  useEffect(() => {
    if (!props.isLive) {
      if (startTimeRef.current !== null) {
        setElapsedMs(Date.now() - startTimeRef.current)
      }
      if (props.durationMs !== undefined) {
        setElapsedMs(props.durationMs)
      }
      startTimeRef.current = null
      return
    }

    setIsExpanded(true)
    startTimeRef.current = Date.now() - elapsedRef.current
    const timer = window.setInterval(() => {
      if (startTimeRef.current === null) {
        return
      }
      setElapsedMs(Date.now() - startTimeRef.current)
    }, 100)

    return () => window.clearInterval(timer)
  }, [props.durationMs, props.isLive])

  useEffect(() => {
    if (previousLiveRef.current && !props.isLive) {
      setIsExpanded(false)
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
        onClick={() => setIsExpanded((current) => !current)}
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
