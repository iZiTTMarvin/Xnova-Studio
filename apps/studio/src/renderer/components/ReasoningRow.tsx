import { memo, useEffect, useRef, useState } from 'react'
import { IconChevronDown, IconChevronRight } from './Icons'
import { formatDurationLabel } from '../utils/tool-event-summary'
import { MarkdownContent } from '../utils/markdown-renderer'

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

  // 精确计时逻辑：
  // - 已完成（有 durationMs）→ 直接使用 durationMs，不启动计时器
  // - 已完成（无 durationMs，有 startedAt/endedAt）→ 计算差值，不启动计时器
  // - 进行中（isLive=true）→ 以 startedAt 为基准，启动 setInterval 每 100ms 刷新
  const resolveStaticMs = (): number => {
    if (props.durationMs !== undefined) {
      return props.durationMs
    }
    if (props.startedAt !== undefined) {
      const endedAt = props.endedAt ?? Date.now()
      return Math.max(0, endedAt - props.startedAt)
    }
    return 0
  }

  const [elapsedMs, setElapsedMs] = useState(() => resolveStaticMs())
  // 保存计时器最后一次读到的值，用于 live→completed 时没有 startedAt/durationMs 的情况
  const lastLiveElapsedRef = useRef(elapsedMs)
  const previousLiveRef = useRef(props.isLive)

  useEffect(() => {
    if (!props.isLive) {
      // 思考结束：有静态数据则用静态数据，否则保留计时器最后值（不归零）
      const staticMs = resolveStaticMs()
      setElapsedMs(staticMs > 0 ? staticMs : lastLiveElapsedRef.current)
      return
    }

    // 思考进行中：自动展开，以 startedAt 为基准启动实时计时器
    setExpanded(true)
    const startTime = props.startedAt ?? Date.now()
    // 立即刷新一次，避免初始值滞后
    const initial = Math.max(0, Date.now() - startTime)
    setElapsedMs(initial)
    lastLiveElapsedRef.current = initial
    const timer = window.setInterval(() => {
      const current = Math.max(0, Date.now() - startTime)
      setElapsedMs(current)
      lastLiveElapsedRef.current = current
    }, 100)

    return () => window.clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.durationMs, props.endedAt, props.isLive, props.startedAt])

  // 从 live → 完成时，自动折叠（类似 OpenCowork 的 ThinkingBlock 行为）
  useEffect(() => {
    if (previousLiveRef.current && !props.isLive) {
      setExpanded(false)
    }
    previousLiveRef.current = props.isLive
  }, [props.isLive])

  const durationText = formatDurationLabel(
    props.durationMs ?? (elapsedMs > 0 ? elapsedMs : undefined),
  )

  const hasContent = props.content.trim().length > 0

  return (
    <div
      className={[
        'reasoning-row',
        isExpanded ? '' : 'reasoning-row--collapsed',
        props.isLive ? 'reasoning-row--live' : '',
      ].filter(Boolean).join(' ')}
    >
      <button
        type="button"
        className="reasoning-row-header"
        onClick={() => setExpanded(!isExpanded)}
        aria-expanded={isExpanded}
      >
        {/* chevron 使用统一的容器 + CSS transform 过渡旋转 */}
        <span className={`reasoning-row-chevron ${isExpanded ? 'reasoning-row-chevron--open' : ''}`}>
          <IconChevronRight />
        </span>
        {props.isLive ? <span className="spinner" /> : null}
        <span className="reasoning-row-title">
          {props.isLive ? '思考中…' : '思考过程'}
        </span>
        {durationText ? (
          <span className="reasoning-row-duration">⏱ {durationText}</span>
        ) : null}
      </button>
      {/* 展开/折叠使用 max-height 过渡动画，内容始终渲染以保持 DOM 稳定 */}
      <div className="reasoning-row-content-wrapper">
        <div className="reasoning-row-content">
          {hasContent ? (
            <div className="reasoning-row-text">
              <MarkdownContent text={props.content} />
            </div>
          ) : (
            // 思考内容尚未到达时，显示三点等待动画
            <div className="conversation-thinking-placeholder">
              <span className="conversation-thinking-placeholder-dots" aria-hidden>
                <span /><span /><span />
              </span>
              <span className="conversation-thinking-placeholder-label">AI 正在深度思考…</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
})
