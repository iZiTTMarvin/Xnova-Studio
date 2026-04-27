// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { ToolActionRow } from '../src/renderer/components/ToolActionRow'
import type { ToolRowModel } from '../src/renderer/utils/conversation-render-rows'

afterEach(() => {
  cleanup()
})

function createToolModel(): ToolRowModel {
  return {
    id: 'tool-1',
    toolCallId: 'tool-1',
    toolName: 'read_file',
    normalizedToolName: 'read_file',
    args: {
      path: 'D:/workspace/demo/README.md',
    },
    status: 'done',
    success: true,
    resultSummary: 'summary',
    resultFull: 'full result text',
  }
}

function ControlledToolActionHarness() {
  const [mounted, setMounted] = useState(true)
  const [expanded, setExpanded] = useState(true)

  return (
    <div>
      <button type="button" onClick={() => setMounted((current) => !current)}>
        {mounted ? '卸载' : '挂载'}
      </button>
      {mounted ? (
        <ToolActionRow
          tool={createToolModel()}
          isExpanded={expanded}
          onExpandedChange={setExpanded}
        />
      ) : null}
    </div>
  )
}

describe('ToolActionRow', () => {
  it('受控展开状态在 remount 后保持一致', () => {
    render(<ControlledToolActionHarness />)

    expect(screen.getByText('完整结果')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '卸载' }))
    expect(screen.queryByText('完整结果')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '挂载' }))
    expect(screen.getByText('完整结果')).toBeTruthy()
  })
})
