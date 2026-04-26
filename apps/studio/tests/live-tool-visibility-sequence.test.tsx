// @vitest-environment jsdom

import { useState } from 'react'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConversationTimeline } from '../src/renderer/components/ConversationTimeline'
import { useStudioBridge } from '../src/renderer/hooks/useStudioBridge'

function createRuntimeInspectResult() {
  return {
    ok: true as const,
    status: 'ready' as const,
    snapshot: {
      sessionId: null,
      isRunning: false,
      provider: 'openai',
      model: 'gpt-4.1-mini',
      warnings: [],
    },
    workspacePath: 'D:/workspace/demo',
    configWarnings: [],
    issues: [],
  }
}

function createShellSnapshot() {
  return {
    startup: {
      recentProject: {
        path: 'D:/workspace/demo',
        lastActiveAt: 10,
        exists: true,
      },
      recentSession: null,
    },
    recentProjects: [
      {
        path: 'D:/workspace/demo',
        name: 'demo',
        lastActiveAt: 10,
        exists: true,
        gitBranch: 'main',
      },
    ],
    projectSessions: [],
    scratchpadEntries: [],
    defaults: {
      projectPath: 'D:/workspace/demo',
      branch: 'main',
      agentId: 'general',
      modelId: 'gpt-4.1-mini',
      providerId: 'openai',
      recommendedMode: null,
      allowedModes: ['standard', 'xforge'],
      availablePrimaryAgentIds: ['general'],
      availableModelIds: ['gpt-4.1-mini'],
    },
    issues: [],
    warnings: [],
  }
}

function TimelineHarness() {
  const bridgeState = useStudioBridge()
  const [submitResult, setSubmitResult] = useState('')
  const liveBlockSummary = bridgeState.liveConversation.blocks
    .map((block) => {
      switch (block.type) {
        case 'text':
          return `text:${block.content}`
        case 'thinking':
          return `thinking:${block.content}`
        case 'tool':
          return `tool:${block.toolName}:${block.status}`
        case 'status':
          return `status:${block.content}`
        case 'system':
          return `system:${block.level}:${block.content}`
      }
    })
    .join('|')

  return (
    <div>
      <button
        onClick={() => {
          void bridgeState.submitPrompt('生成一个个人博客').then((result) => {
            setSubmitResult(result.ok ? 'ok' : (result.error ?? 'error'))
          })
        }}
      >
        提交
      </button>
      <div data-testid="run-status">{bridgeState.runStatus}</div>
      <div data-testid="current-run-step">{bridgeState.currentRunStep ?? ''}</div>
      <div data-testid="submit-result">{submitResult}</div>
      <div data-testid="live-blocks">{liveBlockSummary}</div>
      <ConversationTimeline
        session={null}
        liveConversation={bridgeState.liveConversation}
        isRunActive={bridgeState.isRunActive}
      />
    </div>
  )
}

afterEach(() => {
  cleanup()
  delete (window as Window & { xnovaStudio?: unknown }).xnovaStudio
  vi.useRealTimers()
})

describe('live tool visibility sequence', () => {
  it('tool_start 与 tool_end 拉开一个时间窗时，renderer 会先显示 running tool_action 再更新为 done', async () => {
    const startedAt = Date.now()
    const timeline: Array<{ label: string; at: number }> = []
    const mark = (label: string) => {
      timeline.push({
        label,
        at: Date.now() - startedAt,
      })
    }
    let runtimeEventHandler: ((event: {
      type: string
      timestamp: string
      runId?: string
      payload?: Record<string, unknown>
    }) => void) | null = null

    ;(window as Window & { xnovaStudio?: unknown }).xnovaStudio = {
      host: {
        getState: vi.fn(async () => ({
          workspacePath: 'D:/workspace/demo',
          lastSelection: null,
        })),
        openWorkspace: vi.fn(),
        onStateChanged: () => () => {},
      },
      runtime: {
        inspect: vi.fn(async () => createRuntimeInspectResult()),
        submit: vi.fn(
          () =>
            new Promise((resolve) => {
              mark('renderer_received run_started')
              runtimeEventHandler?.({
                type: 'run_started',
                timestamp: '2026-04-26T00:00:00.000Z',
                runId: 'run-visible',
              })
              mark('renderer_received tool_start')
              runtimeEventHandler?.({
                type: 'tool_start',
                timestamp: '2026-04-26T00:00:01.000Z',
                runId: 'run-visible',
                payload: {
                  toolCallId: 'tool-1',
                  toolName: 'write_file',
                  args: {
                    path: 'D:/workspace/demo/SPEC.md',
                    content: '# spec\\n...',
                  },
                },
              })
              setTimeout(() => {
                mark('renderer_received tool_end')
                runtimeEventHandler?.({
                  type: 'tool_end',
                  timestamp: '2026-04-26T00:00:02.000Z',
                  runId: 'run-visible',
                  payload: {
                    toolCallId: 'tool-1',
                    success: true,
                    durationMs: 25,
                  },
                })
                mark('renderer_received run_completed')
                runtimeEventHandler?.({
                  type: 'run_completed',
                  timestamp: '2026-04-26T00:00:03.000Z',
                  runId: 'run-visible',
                  payload: {
                    sessionId: 'session-1',
                  },
                })
                resolve({
                  ok: true as const,
                  sessionId: 'session-1',
                })
              }, 80)
            }),
        ),
        onEvent: (listener: (event: {
          type: string
          timestamp: string
          runId?: string
          payload?: Record<string, unknown>
        }) => void) => {
          runtimeEventHandler = listener
          return () => {
            runtimeEventHandler = null
          }
        },
      },
      shell: {
        getSnapshot: vi.fn(async () => createShellSnapshot()),
      },
      settings: {
        getProviderSettings: vi.fn(),
        saveProviderSettings: vi.fn(),
        testProviderConnection: vi.fn(),
      },
      memory: {
        getOverview: vi.fn(),
        rebuild: vi.fn(),
      },
      mcp: {
        getOverview: vi.fn(),
        addServer: vi.fn(),
        deleteServer: vi.fn(),
      },
      skillsPlugins: {
        getOverview: vi.fn(),
      },
    }

    render(<TimelineHarness />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '提交' })).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: '提交' }))

    await waitFor(() => {
      expect(screen.getByText('写入文件')).toBeTruthy()
      expect(screen.getByText('SPEC.md')).toBeTruthy()
      expect(screen.getByText('进行中')).toBeTruthy()
    })
    mark('ui_rendered tool_action running')

    await waitFor(() => {
      expect(screen.getByText('成功')).toBeTruthy()
    })
    mark('ui_updated tool_action done')

    console.log(
      timeline
        .map((item) => `T+${item.at}ms ${item.label}`)
        .join('\n'),
    )
  })

  it('tool_start 与 tool_end 同步连续到达时，最终 DOM 只留下 done，但 status 行证明 tool_start 已被处理', async () => {
    let runtimeEventHandler: ((event: {
      type: string
      timestamp: string
      runId?: string
      payload?: Record<string, unknown>
    }) => void) | null = null

    ;(window as Window & { xnovaStudio?: unknown }).xnovaStudio = {
      host: {
        getState: vi.fn(async () => ({
          workspacePath: 'D:/workspace/demo',
          lastSelection: null,
        })),
        openWorkspace: vi.fn(),
        onStateChanged: () => () => {},
      },
      runtime: {
        inspect: vi.fn(async () => createRuntimeInspectResult()),
        submit: vi.fn(async () => {
          runtimeEventHandler?.({
            type: 'run_started',
            timestamp: '2026-04-26T00:00:00.000Z',
            runId: 'run-sync',
          })
          runtimeEventHandler?.({
            type: 'tool_start',
            timestamp: '2026-04-26T00:00:01.000Z',
            runId: 'run-sync',
            payload: {
              toolCallId: 'tool-1',
              toolName: 'write_file',
              args: {
                path: 'D:/workspace/demo/SPEC.md',
                content: '# spec\\n...',
              },
            },
          })
          runtimeEventHandler?.({
            type: 'tool_end',
            timestamp: '2026-04-26T00:00:01.005Z',
            runId: 'run-sync',
            payload: {
              toolCallId: 'tool-1',
              success: true,
              durationMs: 5,
            },
          })
          runtimeEventHandler?.({
            type: 'run_completed',
            timestamp: '2026-04-26T00:00:02.000Z',
            runId: 'run-sync',
            payload: {
              sessionId: 'session-2',
            },
          })
          return {
            ok: true as const,
            sessionId: 'session-2',
          }
        }),
        onEvent: (listener: (event: {
          type: string
          timestamp: string
          runId?: string
          payload?: Record<string, unknown>
        }) => void) => {
          runtimeEventHandler = listener
          return () => {
            runtimeEventHandler = null
          }
        },
      },
      shell: {
        getSnapshot: vi
          .fn()
          .mockResolvedValueOnce(createShellSnapshot())
          .mockResolvedValueOnce(createShellSnapshot()),
      },
      settings: {
        getProviderSettings: vi.fn(),
        saveProviderSettings: vi.fn(),
        testProviderConnection: vi.fn(),
      },
      memory: {
        getOverview: vi.fn(),
        rebuild: vi.fn(),
      },
      mcp: {
        getOverview: vi.fn(),
        addServer: vi.fn(),
        deleteServer: vi.fn(),
      },
      skillsPlugins: {
        getOverview: vi.fn(),
      },
    }

    render(<TimelineHarness />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '提交' })).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: '提交' }))

    await waitFor(() => {
      expect(screen.getByTestId('run-status').textContent).toBe('completed')
    })

    expect(screen.getByText('写入文件')).toBeTruthy()
    expect(screen.getByText('成功')).toBeTruthy()
    expect(screen.queryByText('进行中')).toBeNull()
    expect(screen.getByTestId('live-blocks').textContent).toContain(
      'status:正在写入 SPEC.md|tool:write_file:done',
    )
  })
})
