// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { UserQuestionDialog } from '../src/renderer/components/UserQuestionDialog'

afterEach(() => {
  cleanup()
})

describe('UserQuestionDialog', () => {
  it('支持 text/select/multiselect 三种题型并回传答案', () => {
    const onRespond = vi.fn()

    render(
      <UserQuestionDialog
        request={{
          requestId: 'question-1',
          sessionId: 'session-1',
          questions: [
            {
              key: 'details',
              title: '请补充说明',
              type: 'text',
              placeholder: '例如：先补 IPC',
            },
            {
              key: 'focus',
              title: '本次优先修哪一层？',
              type: 'select',
              options: [
                { label: 'renderer' },
                { label: 'main' },
              ],
            },
            {
              key: 'tasks',
              title: '还要补哪些内容？',
              type: 'multiselect',
              options: [
                { label: 'dialog' },
                { label: 'ipc' },
                { label: 'tests' },
              ],
            },
          ],
        }}
        onRespond={onRespond}
      />,
    )

    expect(screen.getByRole('dialog', { name: '用户问题确认' })).not.toBeNull()
    fireEvent.change(screen.getByLabelText('请补充说明'), {
      target: { value: '先补 IPC push 模式' },
    })
    fireEvent.click(screen.getByLabelText('renderer'))
    fireEvent.click(screen.getByLabelText('dialog'))
    fireEvent.click(screen.getByLabelText('tests'))
    fireEvent.click(screen.getByRole('button', { name: '提交回答' }))

    expect(onRespond).toHaveBeenCalledWith({
      requestId: 'question-1',
      cancelled: false,
      answers: {
        details: '先补 IPC push 模式',
        focus: 'renderer',
        tasks: ['dialog', 'tests'],
      },
    })
  })

  it('点击取消时返回 cancelled', () => {
    const onRespond = vi.fn()

    render(
      <UserQuestionDialog
        request={{
          requestId: 'question-2',
          sessionId: 'session-2',
          questions: [
            {
              key: 'focus',
              title: '本次优先修哪一层？',
              type: 'select',
              options: [{ label: 'main' }],
            },
          ],
        }}
        onRespond={onRespond}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '取消' }))

    expect(onRespond).toHaveBeenCalledWith({
      requestId: 'question-2',
      cancelled: true,
      answers: {},
    })
  })

  it('没有待处理请求时不渲染弹窗', () => {
    const { container } = render(
      <UserQuestionDialog request={null} onRespond={vi.fn()} />,
    )

    expect(container.firstChild).toBeNull()
  })
})
