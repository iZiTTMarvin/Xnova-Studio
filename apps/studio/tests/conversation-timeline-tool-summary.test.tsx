// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ConversationTimeline } from '../src/renderer/components/ConversationTimeline'

afterEach(() => {
  cleanup()
})

function createEmptyLiveConversation() {
  return {
    pendingUserText: null,
    blocks: [],
  }
}

describe('ConversationTimeline blocks-first', () => {
  it('tool action 用可读摘要展示 write_file，且不泄漏完整 content', () => {
    const secretContent = 'SPEC_CONTENT_SHOULD_NOT_BE_RENDERED'.repeat(20)

    render(
      <ConversationTimeline
        session={null}
        isRunActive={true}
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
        }}
      />,
    )

    expect(screen.getByText('写入文件')).toBeTruthy()
    expect(screen.getByText('SPEC.md')).toBeTruthy()
    expect(screen.getByText(`${secretContent.length} 字符 / 1 行`)).toBeTruthy()
    expect(document.body.textContent).not.toContain('SPEC_CONTENT_SHOULD_NOT_BE_RENDERED')
  })

  it('read_file 的大结果不会在默认视图中完整展示', () => {
    const largeContent = 'READ_RESULT_SHOULD_STAY_COLLAPSED'.repeat(30)

    render(
      <ConversationTimeline
        session={null}
        isRunActive={false}
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
        }}
      />,
    )

    expect(screen.getByText('读取文件')).toBeTruthy()
    expect(screen.getByText('index.html')).toBeTruthy()
    expect(screen.getByText('成功')).toBeTruthy()
    expect(screen.getByText('0.1s')).toBeTruthy()
    expect(document.body.textContent).not.toContain('READ_RESULT_SHOULD_STAY_COLLAPSED')
  })

  it('durationMs 缺失时不显示 0.0s，20ms 不显示 0.0s，120ms 显示 0.1s', () => {
    render(
      <ConversationTimeline
        session={null}
        isRunActive={false}
        liveConversation={{
          pendingUserText: null,
          blocks: [
            {
              id: 'tool-1',
              type: 'tool',
              toolCallId: 'tool-1',
              toolName: 'git',
              args: {
                subcommand: 'status',
              },
              status: 'done',
              success: true,
            },
            {
              id: 'tool-2',
              type: 'tool',
              toolCallId: 'tool-2',
              toolName: 'grep',
              args: {
                pattern: 'TODO',
              },
              status: 'error',
              success: false,
              durationMs: 20,
              resultSummary: 'not a git repository',
            },
            {
              id: 'tool-3',
              type: 'tool',
              toolCallId: 'tool-3',
              toolName: 'bash',
              args: {
                command: 'echo ok',
              },
              status: 'done',
              success: true,
              durationMs: 120,
            },
          ],
        }}
      />,
    )

    expect(screen.getByText('失败')).toBeTruthy()
    expect(screen.getByText('0.1s')).toBeTruthy()
    expect(document.body.textContent).not.toContain('0.0s')
  })

  it('persisted 与 live assistant blocks 都会先构建 renderRows，再展示 activity summary', () => {
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
                  id: 'tool-2',
                  type: 'tool',
                  toolCallId: 'tool-2',
                  toolName: 'grep',
                  args: {
                    pattern: 'session',
                  },
                  status: 'done',
                  success: true,
                },
              ],
            },
          ],
        }}
        isRunActive={true}
        liveConversation={{
          pendingUserText: null,
          blocks: [
            {
              id: 'live-tool-1',
              type: 'tool',
              toolCallId: 'live-tool-1',
              toolName: 'read_file',
              args: {
                path: 'D:/workspace/demo/index.ts',
              },
              status: 'done',
              success: true,
            },
            {
              id: 'live-tool-2',
              type: 'tool',
              toolCallId: 'live-tool-2',
              toolName: 'glob',
              args: {
                pattern: '**/*.ts',
              },
              status: 'running',
            },
          ],
        }}
      />,
    )

    expect(screen.getByText('已搜索代码库')).toBeTruthy()
    expect(screen.getByText('正在搜索代码库')).toBeTruthy()
    expect(document.querySelectorAll('.conversation-message-system')).toHaveLength(0)
  })

  it('thinking block 按 blocks 顺序渲染，而不是固定出现在最后', () => {
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
              blocks: [
                {
                  id: 'text-1',
                  type: 'text',
                  content: '先分析现状。',
                },
                {
                  id: 'thinking-1',
                  type: 'thinking',
                  content: '我需要先确认 session 恢复链路。',
                },
                {
                  id: 'text-2',
                  type: 'text',
                  content: '然后再给出结论。',
                },
              ],
            },
          ],
        }}
        isRunActive={false}
        liveConversation={createEmptyLiveConversation()}
      />,
    )

    const assistantText = document.querySelector('.conversation-message-assistant')?.textContent ?? ''
    expect(assistantText.indexOf('先分析现状。')).toBeLessThan(
      assistantText.indexOf('思考过程'),
    )
    expect(assistantText.indexOf('思考过程')).toBeLessThan(
      assistantText.indexOf('然后再给出结论。'),
    )
  })

  it('live thinking message 使用真实 isRunActive=false 时，不显示“思考中…”', () => {
    render(
      <ConversationTimeline
        session={null}
        isRunActive={false}
        liveConversation={{
          pendingUserText: null,
          blocks: [
            {
              id: 'thinking-1',
              type: 'thinking',
              content: '停止后不应继续 live。',
              startedAt: 1,
              endedAt: 2,
              durationMs: 1,
            },
          ],
        }}
      />,
    )

    expect(screen.getByText('思考过程')).toBeTruthy()
    expect(screen.queryByText('思考中…')).toBeNull()
  })

  it('用户已发出消息但 assistant 还没产出 block 时显示思考占位，并使用 currentRunStep 文案', () => {
    render(
      <ConversationTimeline
        session={null}
        isRunActive={true}
        currentRunStep="正在加载工作区配置"
        liveConversation={{
          pendingUserText: '帮我检查项目结构',
          blocks: [],
        }}
      />,
    )

    expect(screen.getByTestId('conversation-thinking-placeholder')).toBeTruthy()
    expect(screen.getByText('正在加载工作区配置')).toBeTruthy()
  })

  it('liveBlocks 出现首个 text 后，思考占位立即消失', () => {
    render(
      <ConversationTimeline
        session={null}
        isRunActive={true}
        currentRunStep="正在调用模型"
        liveConversation={{
          pendingUserText: '帮我检查项目结构',
          blocks: [
            {
              id: 'text-1',
              type: 'text',
              content: '正在分析…',
            },
          ],
        }}
      />,
    )

    expect(screen.queryByTestId('conversation-thinking-placeholder')).toBeNull()
  })

  it('isRunActive=false 时不显示思考占位（即使 pendingUserText 仍存在）', () => {
    render(
      <ConversationTimeline
        session={null}
        isRunActive={false}
        currentRunStep="运行已完成"
        liveConversation={{
          pendingUserText: '帮我检查项目结构',
          blocks: [],
        }}
      />,
    )

    expect(screen.queryByTestId('conversation-thinking-placeholder')).toBeNull()
  })
})
