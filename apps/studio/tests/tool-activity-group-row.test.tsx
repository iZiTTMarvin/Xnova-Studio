// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { act } from 'react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToolActivityGroupRow } from '../src/renderer/components/ToolActivityGroupRow'
import type { ToolRowModel } from '../src/renderer/utils/conversation-render-rows'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function createToolModel(id: string): ToolRowModel {
  return {
    id,
    toolCallId: `${id}-call`,
    toolName: 'read_file',
    normalizedToolName: 'read_file',
    args: {
      path: `D:/workspace/demo/file-${id}.ts`,
    },
    status: 'done',
    success: true,
  }
}

function ControlledGroupHarness(props: {
  tools: ToolRowModel[]
}) {
  const [mounted, setMounted] = useState(true)
  const [expanded, setExpanded] = useState(true)
  const [hasInteracted, setHasInteracted] = useState(true)

  return (
    <div>
      <button type="button" onClick={() => setMounted((current) => !current)}>
        {mounted ? '卸载' : '挂载'}
      </button>
      {mounted ? (
        <ToolActivityGroupRow
          title="已搜索代码库"
          running={false}
          tools={props.tools}
          isExpanded={expanded}
          hasInteracted={hasInteracted}
          onExpandedChange={setExpanded}
          onInteractedChange={setHasInteracted}
        />
      ) : null}
    </div>
  )
}

describe('ToolActivityGroupRow', () => {
  it('超过 6 个工具项时显示“还有 N 个操作”', () => {
    render(
      <ToolActivityGroupRow
        title="正在搜索代码库"
        running={true}
        tools={[
          createToolModel('1'),
          createToolModel('2'),
          createToolModel('3'),
          createToolModel('4'),
          createToolModel('5'),
          createToolModel('6'),
          createToolModel('7'),
          createToolModel('8'),
        ]}
      />,
    )

    expect(screen.getByText('还有 2 个操作')).toBeTruthy()
    expect(screen.getByText('file-1.ts')).toBeTruthy()
    expect(screen.queryByText('file-8.ts')).toBeNull()
  })

  it('running -> done 后会延迟自动折叠', () => {
    vi.useFakeTimers()

    const tools = [createToolModel('1'), createToolModel('2')]
    const { rerender } = render(
      <ToolActivityGroupRow
        title="正在搜索代码库"
        running={true}
        tools={tools}
      />,
    )

    expect(screen.getByText('file-1.ts')).toBeTruthy()

    rerender(
      <ToolActivityGroupRow
        title="已搜索代码库"
        running={false}
        tools={tools}
      />,
    )

    act(() => {
      vi.advanceTimersByTime(600)
    })
    expect(screen.getByText('file-1.ts')).toBeTruthy()

    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(screen.queryByText('file-1.ts')).toBeNull()
  })

  it('受控展开状态在 remount 后保持一致', () => {
    const tools = [createToolModel('1'), createToolModel('2')]

    render(<ControlledGroupHarness tools={tools} />)

    expect(screen.getByText('file-1.ts')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '卸载' }))
    expect(screen.queryByText('file-1.ts')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '挂载' }))
    expect(screen.getByText('file-1.ts')).toBeTruthy()
  })
})
