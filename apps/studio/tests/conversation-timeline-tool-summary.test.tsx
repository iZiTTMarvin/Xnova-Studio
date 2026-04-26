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
          blocks: [
            {
              id: 'tool-1',
              type: 'tool',
              toolCallId: 'tool-1',
              toolName: 'write_file',
              args: {
                path: 'D:/workspace/demo/SPEC.md',
                content: secretContent,
              },
              status: 'running',
            },
          ],
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
          blocks: [
            {
              id: 'tool-1',
              type: 'tool',
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
          blocks: [
            {
              id: 'tool-1',
              type: 'tool',
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
              id: 'tool-2',
              type: 'tool',
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

  it('live blocks 会渲染在同一个 Xnova assistant turn 内部并保持顺序', () => {
    render(
      <ConversationTimeline
        session={null}
        liveConversation={{
          pendingUserText: '请检查项目',
          blocks: [
            {
              id: 'text-1',
              type: 'text',
              content: '我先查看目录',
            },
            {
              id: 'tool-1',
              type: 'tool',
              toolCallId: 'tool-1',
              toolName: 'read_file',
              args: {
                path: 'D:/workspace/demo/SPEC.md',
              },
              status: 'done',
              success: true,
            },
            {
              id: 'text-2',
              type: 'text',
              content: '目录看完了',
            },
          ],
          assistantText: '我先查看目录目录看完了',
          thinkingText: '',
          systemMessages: [],
          toolEvents: [
            {
              toolCallId: 'tool-1',
              toolName: 'read_file',
              args: {
                path: 'D:/workspace/demo/SPEC.md',
              },
              status: 'done',
              success: true,
            },
          ],
        }}
      />,
    )

    const assistantMessages = document.querySelectorAll('.conversation-message-assistant')
    expect(assistantMessages).toHaveLength(1)
    const assistantMessage = assistantMessages[0]
    expect(assistantMessage?.textContent).toContain('我先查看目录')
    expect(assistantMessage?.textContent).toContain('读取文件')
    expect(assistantMessage?.textContent).toContain('目录看完了')

    const liveToolGroup = document.querySelector('.tool-call-group--live')
    expect(liveToolGroup).not.toBeNull()
    expect(assistantMessage?.contains(liveToolGroup)).toBe(true)
  })

  it('persisted assistant message 带 toolEvents 时仍显示正文并把工具归入 assistant turn', () => {
    render(
      <ConversationTimeline
        session={{
          sessionId: 'session-1',
          projectPath: 'D:/workspace/demo',
          title: 'demo',
          updatedAt: '2026-04-26T00:00:00.000Z',
          gitBranch: 'main',
          messageCount: 1,
          subagents: [],
          leafEventUuid: 'assistant-1',
          messages: [
            {
              id: 'assistant-1',
              role: 'assistant',
              content: '我会先写入规格文件。',
              toolEvents: [
                {
                  toolCallId: 'tool-1',
                  toolName: 'write_file',
                  args: {
                    path: 'D:/workspace/demo/SPEC.md',
                    content: 'SECRET_WRITE_CONTENT_SHOULD_NOT_RENDER'.repeat(10),
                  },
                  success: true,
                  durationMs: 12,
                },
              ],
            },
          ],
        }}
        liveConversation={{
          pendingUserText: null,
          blocks: [],
          assistantText: '',
          thinkingText: '',
          systemMessages: [],
          toolEvents: [],
        }}
      />,
    )

    const assistantMessages = document.querySelectorAll('.conversation-message-assistant')
    expect(assistantMessages).toHaveLength(1)
    expect(assistantMessages[0]?.textContent).toContain('我会先写入规格文件。')
    expect(assistantMessages[0]?.textContent).toContain('写入文件')
    expect(document.querySelectorAll('.conversation-message-system')).toHaveLength(0)
    expect(document.body.textContent).not.toContain('SECRET_WRITE_CONTENT_SHOULD_NOT_RENDER')
  })
})
