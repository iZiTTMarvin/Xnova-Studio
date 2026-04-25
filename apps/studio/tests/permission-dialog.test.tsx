// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PermissionDialog } from '../src/renderer/components/PermissionDialog'

afterEach(() => {
  cleanup()
})

describe('PermissionDialog', () => {
  it('展示工具名、关键参数和危险等级，并回传允许决策', () => {
    const onRespond = vi.fn()

    render(
      <PermissionDialog
        request={{
          requestId: 'permission-1',
          toolName: 'bash',
          args: {
            command: 'pnpm test',
            cwd: 'D:/workspace/demo',
          },
          description: 'bash 将执行命令: pnpm test',
        }}
        onRespond={onRespond}
      />,
    )

    expect(screen.getByRole('dialog', { name: '工具权限确认' })).not.toBeNull()
    expect(screen.getByText('bash')).not.toBeNull()
    expect(screen.getByText('高风险')).not.toBeNull()
    expect(screen.getAllByText(/pnpm test/).length).toBeGreaterThan(0)

    fireEvent.click(screen.getByLabelText('本次会话记住'))
    fireEvent.click(screen.getByRole('button', { name: '允许' }))

    expect(onRespond).toHaveBeenCalledWith({
      requestId: 'permission-1',
      allow: true,
      remember: true,
    })
  })

  it('回传拒绝决策', () => {
    const onRespond = vi.fn()

    render(
      <PermissionDialog
        request={{
          requestId: 'permission-2',
          toolName: 'kill_shell',
          args: {
            pid: 1234,
          },
          description: 'kill_shell 将终止后台进程: 1234',
        }}
        onRespond={onRespond}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '拒绝' }))

    expect(onRespond).toHaveBeenCalledWith({
      requestId: 'permission-2',
      allow: false,
      remember: false,
    })
  })

  it('没有待处理请求时不渲染弹窗', () => {
    const { container } = render(
      <PermissionDialog request={null} onRespond={vi.fn()} />,
    )

    expect(container.firstChild).toBeNull()
  })
})
