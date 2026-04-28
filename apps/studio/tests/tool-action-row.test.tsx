// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToolActionRow } from '../src/renderer/components/ToolActionRow'
import type { ToolRowModel } from '../src/renderer/utils/conversation-render-rows'

afterEach(() => {
  cleanup()
})

// ---------------------------------------------------------------------------
// 工具模型工厂
// ---------------------------------------------------------------------------

function createToolModel(
  overrides: Partial<ToolRowModel> = {},
): ToolRowModel {
  return {
    id: 'tool-1',
    toolCallId: 'tool-1',
    toolName: 'read_file',
    normalizedToolName: 'read_file',
    args: { path: 'D:/workspace/demo/README.md' },
    status: 'done',
    success: true,
    resultSummary: 'summary',
    resultFull: 'full result text',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// 受控展开 harness（保留原有测试）
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// 状态可变 harness：用于模拟 running -> done/error 的状态切换
// ---------------------------------------------------------------------------

function StatusTransitionHarness(props: {
  initialTool: ToolRowModel
}) {
  const [tool, setTool] = useState(props.initialTool)

  return (
    <div>
      <button
        type="button"
        data-testid="set-done"
        onClick={() => setTool((prev) => ({ ...prev, status: 'done', success: true }))}
      >
        设为完成
      </button>
      <button
        type="button"
        data-testid="set-error"
        onClick={() => setTool((prev) => ({ ...prev, status: 'error', success: false }))}
      >
        设为失败
      </button>
      <ToolActionRow tool={tool} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// 可卸载 harness：用于测试 unmount 时 timer 清理
// ---------------------------------------------------------------------------

function UnmountHarness(props: { initialTool: ToolRowModel }) {
  const [mounted, setMounted] = useState(true)
  const [tool, setTool] = useState(props.initialTool)

  return (
    <div>
      <button
        type="button"
        data-testid="set-done"
        onClick={() => setTool((prev) => ({ ...prev, status: 'done', success: true }))}
      >
        设为完成
      </button>
      <button
        type="button"
        data-testid="unmount"
        onClick={() => setMounted(false)}
      >
        卸载
      </button>
      {mounted ? <ToolActionRow tool={tool} /> : <span data-testid="unmounted">已卸载</span>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// 原有测试
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// 最小可见时间测试
// ---------------------------------------------------------------------------

describe('ToolActionRow 最小可见时间', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('100ms 完成的 write_file 至少显示 600ms running', () => {
    const tool = createToolModel({
      toolName: 'write_file',
      normalizedToolName: 'write_file',
      status: 'running',
      success: undefined,
      resultSummary: undefined,
      resultFull: undefined,
    })

    render(<StatusTransitionHarness initialTool={tool} />)

    // 初始应显示 running 状态
    expect(screen.getByText('进行中')).toBeTruthy()

    // 100ms 后工具完成
    act(() => { vi.advanceTimersByTime(100) })
    fireEvent.click(screen.getByTestId('set-done'))

    // 此时 displayStatus 仍应为 running（不足 600ms）
    expect(screen.getByText('进行中')).toBeTruthy()

    // 再过 400ms（总共 500ms），仍然 running
    act(() => { vi.advanceTimersByTime(400) })
    expect(screen.getByText('进行中')).toBeTruthy()

    // 再过 100ms（总共 600ms），应切换到完成
    act(() => { vi.advanceTimersByTime(100) })
    expect(screen.getByText('成功')).toBeTruthy()
    expect(screen.queryByText('进行中')).toBeNull()
  })

  it('失败工具也先显示 running，再切 error', () => {
    const tool = createToolModel({
      toolName: 'edit_file',
      normalizedToolName: 'edit_file',
      status: 'running',
      success: undefined,
      resultSummary: undefined,
      resultFull: undefined,
    })

    render(<StatusTransitionHarness initialTool={tool} />)

    expect(screen.getByText('进行中')).toBeTruthy()

    // 50ms 后工具失败
    act(() => { vi.advanceTimersByTime(50) })
    fireEvent.click(screen.getByTestId('set-error'))

    // 仍应显示 running
    expect(screen.getByText('进行中')).toBeTruthy()
    expect(screen.queryByText('工具执行失败')).toBeNull()

    // 550ms 后（总共 600ms），切换到失败
    act(() => { vi.advanceTimersByTime(550) })
    expect(screen.getByText('失败')).toBeTruthy()
    expect(screen.getByText('工具执行失败')).toBeTruthy()
    expect(screen.queryByText('进行中')).toBeNull()
  })

  it('超过 600ms 的 running 工具完成后立即显示 done', () => {
    const tool = createToolModel({
      toolName: 'bash',
      normalizedToolName: 'bash',
      status: 'running',
      success: undefined,
      resultSummary: undefined,
      resultFull: undefined,
    })

    render(<StatusTransitionHarness initialTool={tool} />)

    expect(screen.getByText('进行中')).toBeTruthy()

    // 800ms 后工具完成（已超过 600ms）
    act(() => { vi.advanceTimersByTime(800) })
    fireEvent.click(screen.getByTestId('set-done'))

    // 应立即显示完成，无需等待
    expect(screen.getByText('成功')).toBeTruthy()
  })

  it('unmount 后 timer 被清理，不会产生 setState 警告', () => {
    const tool = createToolModel({
      toolName: 'write_file',
      normalizedToolName: 'write_file',
      status: 'running',
      success: undefined,
      resultSummary: undefined,
      resultFull: undefined,
    })

    render(<UnmountHarness initialTool={tool} />)

    expect(screen.getByText('进行中')).toBeTruthy()

    // 100ms 后工具完成
    act(() => { vi.advanceTimersByTime(100) })
    fireEvent.click(screen.getByTestId('set-done'))

    // 立即卸载组件
    fireEvent.click(screen.getByTestId('unmount'))
    expect(screen.getByTestId('unmounted')).toBeTruthy()

    // 推进时间到 600ms 后，不应抛出错误（timer 已清理）
    expect(() => {
      act(() => { vi.advanceTimersByTime(600) })
    }).not.toThrow()
  })

  it('非动作类工具（read_file）不启用 min-visible，直接显示真实状态', () => {
    const tool = createToolModel({
      toolName: 'read_file',
      normalizedToolName: 'read_file',
      status: 'running',
      success: undefined,
      resultSummary: undefined,
      resultFull: undefined,
    })

    render(<StatusTransitionHarness initialTool={tool} />)

    expect(screen.getByText('进行中')).toBeTruthy()

    // 立即完成
    fireEvent.click(screen.getByTestId('set-done'))

    // 非动作类工具应立即显示完成，不等待 600ms
    expect(screen.getByText('成功')).toBeTruthy()
  })

  it('非动作类工具（grep）不启用 min-visible', () => {
    const tool = createToolModel({
      toolName: 'grep',
      normalizedToolName: 'grep',
      status: 'running',
      success: undefined,
      resultSummary: undefined,
      resultFull: undefined,
    })

    render(<StatusTransitionHarness initialTool={tool} />)

    expect(screen.getByText('进行中')).toBeTruthy()

    fireEvent.click(screen.getByTestId('set-done'))

    // 应立即显示完成
    expect(screen.getByText('成功')).toBeTruthy()
  })

  it('git 工具启用 min-visible', () => {
    const tool = createToolModel({
      toolName: 'git',
      normalizedToolName: 'git',
      status: 'running',
      success: undefined,
      resultSummary: undefined,
      resultFull: undefined,
    })

    render(<StatusTransitionHarness initialTool={tool} />)

    expect(screen.getByText('进行中')).toBeTruthy()

    act(() => { vi.advanceTimersByTime(50) })
    fireEvent.click(screen.getByTestId('set-done'))

    // 仍应显示 running
    expect(screen.getByText('进行中')).toBeTruthy()

    // 550ms 后切换
    act(() => { vi.advanceTimersByTime(550) })
    expect(screen.getByText('成功')).toBeTruthy()
  })

  it('todo_write 和 dispatch_agent 启用 min-visible', () => {
    for (const toolName of ['todo_write', 'dispatch_agent']) {
      cleanup()
      const tool = createToolModel({
        toolName,
        normalizedToolName: toolName,
        status: 'running',
        success: undefined,
        resultSummary: undefined,
        resultFull: undefined,
      })

      render(<StatusTransitionHarness initialTool={tool} />)

      expect(screen.getByText('进行中')).toBeTruthy()

      act(() => { vi.advanceTimersByTime(50) })
      fireEvent.click(screen.getByTestId('set-done'))

      // 仍应显示 running（min-visible 生效）
      expect(screen.getByText('进行中')).toBeTruthy()

      act(() => { vi.advanceTimersByTime(550) })
      expect(screen.getByText('成功')).toBeTruthy()
    }
  })
})
