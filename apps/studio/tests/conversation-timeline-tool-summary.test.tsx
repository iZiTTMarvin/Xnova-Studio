// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ConversationTimeline } from '../src/renderer/components/ConversationTimeline'

afterEach(() => {
  cleanup()
})

describe('ConversationTimeline tool event summary', () => {
  it('tool_start 用可读摘要展示 write_file，且不泄漏完整 content', () => {
    const secretContent = 'SPEC_CONTENT_SHOULD_NOT_BE_RENDERED'.repeat(20)

    render(
      <ConversationTimeline
        session={null}
        liveConversation={{
          pendingUserText: null,
          assistantText: '',
          thinkingText: '',
          systemMessages: [],
          toolEvents: [
            {
              toolCallId: 'tool-1',
              toolName: 'write_file',
              args: {
                path: 'D:/workspace/demo/SPEC.md',
                content: secretContent,
              },
              status: 'running',
            },
          ],
        }}
      />,
    )

    expect(screen.getByText('写入文件')).toBeTruthy()
    expect(screen.getByText('SPEC.md')).toBeTruthy()
    expect(screen.getByText(`${secretContent.length} 字符 / 1 行`)).toBeTruthy()
    expect(document.body.textContent).not.toContain('SPEC_CONTENT_SHOULD_NOT_BE_RENDERED')
  })

  it('read_file 的大内容不会被默认渲染到 UI', () => {
    const largeContent = 'READ_RESULT_SHOULD_STAY_COLLAPSED'.repeat(30)

    render(
      <ConversationTimeline
        session={null}
        liveConversation={{
          pendingUserText: null,
          assistantText: '',
          thinkingText: '',
          systemMessages: [],
          toolEvents: [
            {
              toolCallId: 'tool-1',
              toolName: 'read_file',
              args: {
                path: 'D:/workspace/demo/index.html',
                content: largeContent,
              },
              status: 'done',
              success: true,
              durationMs: 118,
              resultSummary: largeContent,
              resultFull: largeContent,
            },
          ],
        }}
      />,
    )

    expect(screen.getByText('读取文件')).toBeTruthy()
    expect(screen.getByText('index.html')).toBeTruthy()
    expect(screen.getByText('成功')).toBeTruthy()
    expect(screen.getByText('0.1s')).toBeTruthy()
    expect(document.body.textContent).not.toContain('READ_RESULT_SHOULD_STAY_COLLAPSED')
  })

  it('tool_end 显示成功、失败和耗时', () => {
    render(
      <ConversationTimeline
        session={null}
        liveConversation={{
          pendingUserText: null,
          assistantText: '',
          thinkingText: '',
          systemMessages: [],
          toolEvents: [
            {
              toolCallId: 'tool-1',
              toolName: 'bash',
              args: {
                command: 'pnpm test',
                cwd: 'D:/workspace/demo',
              },
              status: 'done',
              success: true,
              durationMs: 1260,
              resultSummary: 'tests passed',
            },
            {
              toolCallId: 'tool-2',
              toolName: 'git',
              args: {
                subcommand: 'status',
              },
              status: 'done',
              success: false,
              durationMs: 42,
              resultSummary: 'not a git repository',
            },
          ],
        }}
      />,
    )

    expect(screen.getByText('执行命令')).toBeTruthy()
    expect(screen.getByText('成功')).toBeTruthy()
    expect(screen.getByText('1.3s')).toBeTruthy()
    expect(screen.getByText('执行 Git')).toBeTruthy()
    expect(screen.getByText('失败')).toBeTruthy()
    expect(screen.getByText('0.0s')).toBeTruthy()
  })
})
