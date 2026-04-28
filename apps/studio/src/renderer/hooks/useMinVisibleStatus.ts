import { useEffect, useRef, useState } from 'react'

/**
 * 展示层最小可见时间 hook。
 *
 * 当真实 status 从 running 切换到 done/error 时，如果 running 持续时间不足 minVisibleMs，
 * 视觉上继续显示 running 直到满足最小可见时间，然后再切换到真实终态。
 *
 * 设计约束：
 * - 不修改 store 中的真实状态，仅影响组件渲染用的 displayStatus。
 * - cancel / error / unmount 时必须清理 timer，不留残留 spinner。
 * - enabled=false 时直接透传真实 status，不启用延迟逻辑。
 */
export type ToolStatus = 'running' | 'done' | 'error'

/** 默认最小可见时间 600ms */
export const MIN_VISIBLE_MS = 600

export function useMinVisibleStatus(
  realStatus: ToolStatus,
  options: { enabled: boolean; minVisibleMs?: number },
): ToolStatus {
  const minMs = options.minVisibleMs ?? MIN_VISIBLE_MS
  const enabled = options.enabled

  // 记录 running 开始时间
  const runningStartRef = useRef<number | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // displayStatus：展示层使用的状态
  const [displayStatus, setDisplayStatus] = useState<ToolStatus>(realStatus)

  // 核心逻辑：追踪 realStatus 变化，维护 displayStatus
  useEffect(() => {
    // 不启用时直接透传，并清理可能残留的 timer
    if (!enabled) {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      runningStartRef.current = null
      setDisplayStatus(realStatus)
      return
    }

    // 进入 running：记录开始时间，立即显示 running
    if (realStatus === 'running') {
      runningStartRef.current = Date.now()
      setDisplayStatus('running')
      // 清理之前可能残留的 timer
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      return
    }

    // 从 running 切换到终态（done / error）
    const startTime = runningStartRef.current
    if (startTime === null) {
      // 没有经历过 running（例如初始就是 done），直接透传
      setDisplayStatus(realStatus)
      return
    }

    const elapsed = Date.now() - startTime
    const remaining = minMs - elapsed

    if (remaining <= 0) {
      // 已经超过最小可见时间，立即显示真实终态
      setDisplayStatus(realStatus)
      runningStartRef.current = null
      return
    }

    // 不足最小可见时间：继续显示 running，延迟后切换
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      runningStartRef.current = null
      setDisplayStatus(realStatus)
    }, remaining)

    // cleanup：组件卸载或 realStatus 再次变化时清理 timer
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [realStatus, minMs, enabled])

  // unmount 时兜底清理 timer
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [])

  return displayStatus
}
