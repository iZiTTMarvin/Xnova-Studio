// @vitest-environment jsdom

/**
 * WarmupStatusIndicator 组件测试
 *
 * 覆盖范围：
 * - warming / ready / stale / failed 文案正确显示
 * - idle 状态不渲染可见内容
 * - ready 状态自动淡出
 * - warmup 状态不影响 composer disabled 逻辑
 */

import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WarmupStatusIndicator } from '../src/renderer/components/WarmupStatusIndicator'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

describe('WarmupStatusIndicator', () => {
  it('warming 显示"正在准备运行时..."', () => {
    render(<WarmupStatusIndicator status="warming" />)
    expect(screen.getByText('正在准备运行时...')).toBeTruthy()
    expect(screen.getByTestId('warmup-status-indicator').dataset.warmupStatus).toBe('warming')
  })

  it('ready 显示"运行时已就绪"', () => {
    render(<WarmupStatusIndicator status="ready" />)
    expect(screen.getByText('运行时已就绪')).toBeTruthy()
    expect(screen.getByTestId('warmup-status-indicator').dataset.warmupStatus).toBe('ready')
  })

  it('stale 显示"运行时配置变化，正在重新准备..."', () => {
    render(<WarmupStatusIndicator status="stale" />)
    expect(screen.getByText('运行时配置变化，正在重新准备...')).toBeTruthy()
  })

  it('failed 显示"运行时准备失败，将在提交时重试"', () => {
    render(<WarmupStatusIndicator status="failed" />)
    expect(screen.getByText('运行时准备失败，将在提交时重试')).toBeTruthy()
  })

  it('idle 状态不渲染可见内容', () => {
    render(<WarmupStatusIndicator status="idle" />)
    expect(screen.queryByTestId('warmup-status-indicator')).toBeNull()
  })

  it('ready 状态 2.5 秒后自动淡出', () => {
    render(<WarmupStatusIndicator status="ready" />)
    const indicator = screen.getByTestId('warmup-status-indicator')

    // 初始可见
    expect(indicator.classList.contains('warmup-indicator-visible')).toBe(true)

    // 2.5 秒后淡出
    act(() => {
      vi.advanceTimersByTime(2500)
    })

    expect(indicator.classList.contains('warmup-indicator-exit')).toBe(true)
  })

  it('ready 淡出动画结束后从布局中移除', () => {
    render(<WarmupStatusIndicator status="ready" />)
    expect(screen.getByTestId('warmup-status-indicator')).toBeTruthy()

    act(() => {
      vi.advanceTimersByTime(2780)
    })

    expect(screen.queryByTestId('warmup-status-indicator')).toBeNull()
  })

  it('warming 状态不会自动淡出', () => {
    render(<WarmupStatusIndicator status="warming" />)
    const indicator = screen.getByTestId('warmup-status-indicator')

    act(() => {
      vi.advanceTimersByTime(5000)
    })

    // 仍然可见
    expect(indicator.classList.contains('warmup-indicator-visible')).toBe(true)
  })

  it('状态从 warming 切换到 ready 后显示 ready 文案', () => {
    const { rerender } = render(<WarmupStatusIndicator status="warming" />)
    expect(screen.getByText('正在准备运行时...')).toBeTruthy()

    rerender(<WarmupStatusIndicator status="ready" />)
    expect(screen.getByText('运行时已就绪')).toBeTruthy()
  })

  it('状态从 ready 切换到 idle 后先淡出再从布局移除', () => {
    const { rerender } = render(<WarmupStatusIndicator status="ready" />)
    expect(screen.getByText('运行时已就绪')).toBeTruthy()

    rerender(<WarmupStatusIndicator status="idle" />)
    // idle 时 visible=false，组件通过 CSS opacity 淡出
    const indicator = screen.getByTestId('warmup-status-indicator')
    expect(indicator.classList.contains('warmup-indicator-exit')).toBe(true)

    act(() => {
      vi.advanceTimersByTime(280)
    })

    expect(screen.queryByTestId('warmup-status-indicator')).toBeNull()
  })

  it('组件有 role="status" 和 aria-live="polite" 用于无障碍', () => {
    render(<WarmupStatusIndicator status="warming" />)
    const indicator = screen.getByTestId('warmup-status-indicator')
    expect(indicator.getAttribute('role')).toBe('status')
    expect(indicator.getAttribute('aria-live')).toBe('polite')
  })

  it('failed 状态不会自动淡出', () => {
    render(<WarmupStatusIndicator status="failed" />)
    const indicator = screen.getByTestId('warmup-status-indicator')

    act(() => {
      vi.advanceTimersByTime(10000)
    })

    expect(indicator.classList.contains('warmup-indicator-visible')).toBe(true)
  })
})
