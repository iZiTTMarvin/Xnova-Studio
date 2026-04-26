// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { act } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ReasoningRow } from '../src/renderer/components/ReasoningRow'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('ReasoningRow', () => {
  it('isLive 从 true 变为 false 后停止计时，并切换到“思考过程”', () => {
    vi.useFakeTimers()

    const { rerender } = render(
      <ReasoningRow
        content="继续思考"
        isLive={true}
      />,
    )

    act(() => {
      vi.advanceTimersByTime(120)
    })

    expect(screen.getByText('思考中…')).toBeTruthy()
    expect(screen.getByText('⏱ 0.1s')).toBeTruthy()

    rerender(
      <ReasoningRow
        content="继续思考"
        isLive={false}
      />,
    )

    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(screen.getByText('思考过程')).toBeTruthy()
    expect(screen.queryByText('思考中…')).toBeNull()
    expect(screen.getByText('⏱ 0.1s')).toBeTruthy()
  })

  it('persisted durationMs 存在时显示固定耗时', () => {
    render(
      <ReasoningRow
        content="固定时长"
        isLive={false}
        durationMs={120}
      />,
    )

    expect(screen.getByText('⏱ 0.1s')).toBeTruthy()
    expect(screen.getByText('思考过程')).toBeTruthy()
  })
})
