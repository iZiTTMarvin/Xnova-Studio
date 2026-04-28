/**
 * WarmupStatusIndicator — 运行时预热状态的轻量提示组件。
 *
 * 职责：
 * - 展示 warming / ready / stale / failed 四种状态文案
 * - warming / stale 有呼吸圆点动效
 * - ready 短暂显示后自动淡出（2.5 秒）
 * - idle 状态不渲染
 *
 * 约束：
 * - 只是辅助提示，不影响 composer 可用性
 * - 不展示 cwd、cacheKey、system prompt、API 配置等内部细节
 */

import { useEffect, useRef, useState } from 'react'
import type { RuntimeWarmupStatus } from '../../shared/studio-bridge-contract'
import { WARMUP_STATUS_LABELS } from '../../shared/studio-bridge-contract'
import './WarmupStatusIndicator.css'

export interface WarmupStatusIndicatorProps {
  status: RuntimeWarmupStatus
}

/**
 * ready 状态自动淡出的延迟（毫秒）。
 * 让用户看到"运行时已就绪"后自然消失，不过度强调。
 */
const READY_AUTO_HIDE_MS = 2500
const EXIT_TRANSITION_MS = 280

export function WarmupStatusIndicator({ status }: WarmupStatusIndicatorProps) {
  const [rendered, setRendered] = useState(status !== 'idle')
  const [visible, setVisible] = useState(false)
  const [displayStatus, setDisplayStatus] = useState(status)
  const readyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (readyTimerRef.current !== null) {
      clearTimeout(readyTimerRef.current)
      readyTimerRef.current = null
    }
    if (exitTimerRef.current !== null) {
      clearTimeout(exitTimerRef.current)
      exitTimerRef.current = null
    }

    if (status === 'idle') {
      setVisible(false)
      // 先给 CSS 退出过渡留时间，再从布局中移除，避免 composer 上方留下透明空条。
      exitTimerRef.current = setTimeout(() => {
        setRendered(false)
        exitTimerRef.current = null
      }, EXIT_TRANSITION_MS)
      return
    }

    setRendered(true)
    setDisplayStatus(status)
    setVisible(true)

    // ready 状态短暂显示后自动淡出
    if (status === 'ready') {
      readyTimerRef.current = setTimeout(() => {
        setVisible(false)
        readyTimerRef.current = null
        exitTimerRef.current = setTimeout(() => {
          setRendered(false)
          exitTimerRef.current = null
        }, EXIT_TRANSITION_MS)
      }, READY_AUTO_HIDE_MS)
    }

    return () => {
      if (readyTimerRef.current !== null) {
        clearTimeout(readyTimerRef.current)
        readyTimerRef.current = null
      }
      if (exitTimerRef.current !== null) {
        clearTimeout(exitTimerRef.current)
        exitTimerRef.current = null
      }
    }
  }, [status])

  const label = WARMUP_STATUS_LABELS[displayStatus]
  if (!rendered || !label) {
    return null
  }

  const visibilityClass = visible
    ? 'warmup-indicator-visible'
    : 'warmup-indicator-exit'

  return (
    <div
      className={`warmup-indicator warmup-indicator-${displayStatus} ${visibilityClass}`}
      role="status"
      aria-live="polite"
      data-testid="warmup-status-indicator"
      data-warmup-status={displayStatus}
    >
      <span
        className={`warmup-dot warmup-dot-${displayStatus}`}
        aria-hidden="true"
      />
      <span className="warmup-label">{label}</span>
    </div>
  )
}
