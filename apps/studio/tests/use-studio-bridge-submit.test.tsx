// @vitest-environment jsdom

import { useState } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useStudioBridge } from '../src/renderer/hooks/useStudioBridge'

function createRuntimeInspectResult() {
  return {
    ok: true as const,
    status: 'ready' as const,
    snapshot: {
      sessionId: null,
      isRunning: false,
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      warnings: [],
    },
    workspacePath: 'D:/workspace/demo',
    configWarnings: [],
    issues: [],
  }
}

function createShellSnapshot(sessionId: string | null) {
  return {
    startup: {
      recentProject: {
        path: 'D:/workspace/demo',
        lastActiveAt: 10,
        exists: true,
      },
      recentSession:
        sessionId === null
          ? null
          : {
              projectPath: 'D:/workspace/demo',
              sessionId,
              valid: true,
            },
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
    projectSessions:
      sessionId === null
        ? []
        : [
            {
              sessionId,
              projectPath: 'D:/workspace/demo',
              title: '分析当前项目结构',
              updatedAt: '2026-04-23T00:00:00.000Z',
              gitBranch: 'main',
              messageCount: 2,
              providerId: 'anthropic',
              modelId: 'claude-sonnet-4-6',
              subagents: [],
            },
          ],
    scratchpadEntries: [],
    defaults: {
      projectPath: 'D:/workspace/demo',
      branch: 'main',
      agentId: 'general',
      modelId: 'claude-sonnet-4-6',
      providerId: 'anthropic',
      recommendedMode: null,
      allowedModes: ['standard', 'xforge'],
      availablePrimaryAgentIds: ['general'],
      availableModelIds: ['claude-sonnet-4-6'],
    },
    issues: [],
    warnings: [],
  }
}

function installManualRaf() {
  let nextRafId = 1
  const scheduledCallbacks = new Map<number, FrameRequestCallback>()

  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const id = nextRafId
    nextRafId += 1
    scheduledCallbacks.set(id, callback)
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    scheduledCallbacks.delete(id)
  })

  return {
    flushAll() {
      const callbacks = [...scheduledCallbacks.values()]
      scheduledCallbacks.clear()
      callbacks.forEach((callback) => callback(Date.now()))
    },
  }
}

function HookHarness() {
  const bridgeState = useStudioBridge()
  const [submitResult, setSubmitResult] = useState('')
  const [selectSessionTarget, setSelectSessionTarget] = useState<string>('session-other')
  const assistantText = bridgeState.liveConversation.blocks
    .filter((block): block is Extract<(typeof bridgeState.liveConversation.blocks)[number], { type: 'text' }> =>
      block.type === 'text')
    .map((block) => block.content)
    .join('')
  const toolEvents = bridgeState.liveConversation.blocks
    .filter((block): block is Extract<(typeof bridgeState.liveConversation.blocks)[number], { type: 'tool' }> =>
      block.type === 'tool')
  const systemMessages = bridgeState.liveConversation.blocks
    .filter((block): block is Extract<(typeof bridgeState.liveConversation.blocks)[number], { type: 'system' }> =>
      block.type === 'system')
    .map((block) => block.content)
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
          void bridgeState
            .submitPrompt('  分析当前项目结构  ')
            .then((result) => {
              setSubmitResult(result.ok ? 'ok' : (result.error ?? 'error'))
            })
        }}
      >
        提交
      </button>
      <button
        onClick={() => {
          void bridgeState
            .cancelCurrentRun()
            .then((result) => {
              setSubmitResult(result.ok ? 'cancel-ok' : result.error)
            })
        }}
      >
        停止
      </button>
      <button
        onClick={() => {
          void bridgeState.selectSession(selectSessionTarget)
        }}
      >
        切换会话
      </button>
      <button
        onClick={() => {
          void bridgeState.selectProject('D:/workspace/project-b')
        }}
      >
        切换项目
      </button>
      <input
        data-testid="select-session-target"
        value={selectSessionTarget}
        onChange={(event) => setSelectSessionTarget(event.target.value)}
      />
      <div data-testid="shell-status">{bridgeState.shellStatus}</div>
      <div data-testid="run-status">{bridgeState.runStatus}</div>
      <div data-testid="run-active">{bridgeState.isRunActive ? 'yes' : 'no'}</div>
      <div data-testid="submitting">{bridgeState.isSubmitting ? 'yes' : 'no'}</div>
      <div data-testid="submit-result">{submitResult}</div>
      <div data-testid="assistant-text">{assistantText}</div>
      <div data-testid="tool-events">
        {toolEvents
          .map((toolEvent) => `${toolEvent.toolName}:${toolEvent.status}`)
          .join('|')}
      </div>
      <div data-testid="system-messages">
        {systemMessages.join('|')}
      </div>
      <div data-testid="live-blocks">{liveBlockSummary}</div>
      <div data-testid="live-conversation-json">
        {JSON.stringify(bridgeState.liveConversation.blocks)}
      </div>
      <div data-testid="run-idle-warning">{bridgeState.runIdleWarning ?? ''}</div>
      <div data-testid="current-run-step">{bridgeState.currentRunStep ?? ''}</div>
      <div data-testid="selected-session-id">
        {bridgeState.selectedSessionId ?? ''}
      </div>
      <div data-testid="selected-project-path">
        {bridgeState.selectedProjectPath ?? ''}
      </div>
    </div>
  )
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  delete (window as Window & { xnovaStudio?: unknown }).xnovaStudio
})

describe('useStudioBridge runtime submit', () => {
  it('submit 成功后会刷新 shell snapshot 与 runtime inspect，并清理 submitting 状态', async () => {
    const inspect = vi
      .fn()
      .mockResolvedValue(createRuntimeInspectResult())
      .mockResolvedValueOnce(createRuntimeInspectResult())
      .mockResolvedValueOnce(createRuntimeInspectResult())
    const submit = vi.fn(async () => ({
      ok: true as const,
      sessionId: 'session-2',
    }))
    const getSnapshot = vi
      .fn()
      .mockResolvedValueOnce(createShellSnapshot(null))
      .mockResolvedValueOnce(createShellSnapshot('session-2'))

    ;(window as Window & { xnovaStudio?: unknown }).xnovaStudio = {
      host: {
        getState: vi.fn(async () => ({
          workspacePath: 'D:/workspace/demo',
          lastSelection: null,
        })),
        openWorkspace: vi.fn(async () => ({
          selection: {
            ok: true as const,
            code: 'selected' as const,
            path: 'D:/workspace/demo',
          },
          state: {
            workspacePath: 'D:/workspace/demo',
            lastSelection: null,
          },
        })),
        onStateChanged: () => () => {},
      },
      runtime: {
        inspect,
        submit,
        onEvent: () => () => {},
      },
      shell: {
        getSnapshot,
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

    render(<HookHarness />)

    await waitFor(() => {
      expect(screen.getByTestId('shell-status').textContent).toBe('ready')
    })

    fireEvent.click(screen.getByRole('button', { name: '提交' }))

    await waitFor(() => {
      expect(submit).toHaveBeenCalledTimes(1)
    })

    expect(submit).toHaveBeenCalledWith({
      text: '分析当前项目结构',
      projectPath: 'D:/workspace/demo',
      sessionId: null,
      agentId: 'general',
      providerId: 'anthropic',
      modelId: 'claude-sonnet-4-6',
      timing: {
        userSubmitClickedAt: expect.any(Number),
        rendererRuntimeSubmitInvokedAt: expect.any(Number),
      },
    })
    await waitFor(() => {
      expect(getSnapshot).toHaveBeenCalledTimes(2)
    })
    await waitFor(() => {
      expect(inspect).toHaveBeenCalledTimes(2)
    })
    expect(inspect).toHaveBeenNthCalledWith(2, {
      refresh: true,
    })
    expect(screen.getByTestId('submitting').textContent).toBe('no')
  })

  it('缺少 runtime.submit 时不再 fallback 到 legacy submitPrompt 语义', async () => {
    const legacySubmitPrompt = vi.fn(async () => undefined)

    ;(window as Window & { xnovaStudio?: unknown }).xnovaStudio = {
      host: {
        getState: vi.fn(async () => ({
          workspacePath: 'D:/workspace/demo',
          lastSelection: null,
        })),
        openWorkspace: vi.fn(async () => ({
          selection: {
            ok: true as const,
            code: 'selected' as const,
            path: 'D:/workspace/demo',
          },
          state: {
            workspacePath: 'D:/workspace/demo',
            lastSelection: null,
          },
        })),
        onStateChanged: () => () => {},
      },
      runtime: {
        inspect: vi.fn(async () => createRuntimeInspectResult()),
        submitPrompt: legacySubmitPrompt,
        onEvent: () => () => {},
      },
      shell: {
        getSnapshot: vi.fn(async () => createShellSnapshot(null)),
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

    render(<HookHarness />)

    await waitFor(() => {
      expect(screen.getByTestId('shell-status').textContent).toBe('ready')
    })

    fireEvent.click(screen.getByRole('button', { name: '提交' }))

    await waitFor(() => {
      expect(screen.getByTestId('submit-result').textContent).toBe(
        'runtime.submit 不可用。',
      )
    })
    expect(legacySubmitPrompt).not.toHaveBeenCalled()
  })

  it('selectProject 会同步绑定主进程 workspace，避免权限层继续使用旧路径', async () => {
    const bindWorkspace = vi.fn(async (workspacePath: string) => ({
      workspacePath,
      lastSelection: {
        ok: true as const,
        code: 'selected' as const,
        path: workspacePath,
      },
    }))
    const inspect = vi.fn(async () => ({
      ...createRuntimeInspectResult(),
      workspacePath: 'D:/workspace/project-b',
    }))
    const projectSnapshot = {
      ...createShellSnapshot(null),
      startup: {
        recentProject: {
          path: 'D:/workspace/project-b',
          lastActiveAt: 20,
          exists: true,
        },
        recentSession: null,
      },
      defaults: {
        ...createShellSnapshot(null).defaults,
        projectPath: 'D:/workspace/project-b',
      },
    }
    const getSnapshot = vi
      .fn()
      .mockResolvedValueOnce(createShellSnapshot(null))
      .mockResolvedValueOnce(projectSnapshot)

    ;(window as Window & { xnovaStudio?: unknown }).xnovaStudio = {
      host: {
        getState: vi.fn(async () => ({
          workspacePath: 'D:/workspace/demo',
          lastSelection: null,
        })),
        openWorkspace: vi.fn(),
        bindWorkspace,
        onStateChanged: () => () => {},
      },
      runtime: {
        inspect,
        submit: vi.fn(),
        onEvent: () => () => {},
      },
      shell: {
        getSnapshot,
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

    render(<HookHarness />)

    await waitFor(() => {
      expect(screen.getByTestId('shell-status').textContent).toBe('ready')
    })

    fireEvent.click(screen.getByRole('button', { name: '切换项目' }))

    await waitFor(() => {
      expect(bindWorkspace).toHaveBeenCalledWith('D:/workspace/project-b')
    })
    expect(screen.getByTestId('selected-project-path').textContent).toBe(
      'D:/workspace/project-b',
    )
    expect(inspect).toHaveBeenLastCalledWith({ refresh: true })
  })

  it('submit 失败时同一条系统错误不会重复显示两次', async () => {
    let runtimeEventHandler: ((event: {
      type: string
      timestamp: string
      payload?: Record<string, unknown>
    }) => void) | null = null
    const submitError =
      'runtime submit 失败: LLM 请求连续 60 秒没有新的运行进展，已自动中断。请检查网络连接、API Key、baseURL 配置，或稍后重试。'

    ;(window as Window & { xnovaStudio?: unknown }).xnovaStudio = {
      host: {
        getState: vi.fn(async () => ({
          workspacePath: 'D:/workspace/demo',
          lastSelection: null,
        })),
        openWorkspace: vi.fn(async () => ({
          selection: {
            ok: true as const,
            code: 'selected' as const,
            path: 'D:/workspace/demo',
          },
          state: {
            workspacePath: 'D:/workspace/demo',
            lastSelection: null,
          },
        })),
        onStateChanged: () => () => {},
      },
      runtime: {
        inspect: vi.fn(async () => createRuntimeInspectResult()),
        submit: vi.fn(async () => {
          runtimeEventHandler?.({
            type: 'runtime.error',
            timestamp: '2026-04-26T00:00:00.000Z',
            payload: {
              message: submitError,
            },
          })
          return {
            ok: false as const,
            error: submitError,
          }
        }),
        onEvent: (listener: (event: {
          type: string
          timestamp: string
          payload?: Record<string, unknown>
        }) => void) => {
          runtimeEventHandler = listener
          return () => {
            runtimeEventHandler = null
          }
        },
      },
      shell: {
        getSnapshot: vi.fn(async () => createShellSnapshot(null)),
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

    render(<HookHarness />)

    await waitFor(() => {
      expect(screen.getByTestId('shell-status').textContent).toBe('ready')
    })

    fireEvent.click(screen.getByRole('button', { name: '提交' }))

    await waitFor(() => {
      expect(screen.getByTestId('submit-result').textContent).toBe(submitError)
    })

    expect(screen.getByTestId('system-messages').textContent).toBe(submitError)
  })

  it('runtime lifecycle 事件会驱动 runStatus，并保留 text/tool live 内容', async () => {
    let runtimeEventHandler: ((event: {
      type: string
      timestamp: string
      payload?: Record<string, unknown>
    }) => void) | null = null
    const submit = vi.fn(async () => {
      runtimeEventHandler?.({
        type: 'run_started',
        timestamp: '2026-04-26T00:00:00.000Z',
        payload: {
          status: 'running',
        },
      })
      runtimeEventHandler?.({
        type: 'text_delta',
        timestamp: '2026-04-26T00:00:01.000Z',
        payload: {
          text: '正在分析',
        },
      })
      runtimeEventHandler?.({
        type: 'tool_start',
        timestamp: '2026-04-26T00:00:02.000Z',
        payload: {
          toolCallId: 'tool-1',
          toolName: 'read_file',
          args: {
            path: 'src/index.ts',
          },
        },
      })
      runtimeEventHandler?.({
        type: 'tool_end',
        timestamp: '2026-04-26T00:00:03.000Z',
        payload: {
          toolCallId: 'tool-1',
          success: true,
        },
      })
      runtimeEventHandler?.({
        type: 'run_completed',
        timestamp: '2026-04-26T00:00:04.000Z',
        payload: {
          sessionId: 'session-2',
        },
      })
      return {
        ok: true as const,
        sessionId: 'session-2',
      }
    })

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
        submit,
        onEvent: (listener: (event: {
          type: string
          timestamp: string
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
          .mockResolvedValueOnce(createShellSnapshot(null))
          .mockResolvedValueOnce(createShellSnapshot('session-2')),
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

    render(<HookHarness />)

    await waitFor(() => {
      expect(screen.getByTestId('shell-status').textContent).toBe('ready')
    })

    fireEvent.click(screen.getByRole('button', { name: '提交' }))

    await waitFor(() => {
      expect(screen.getByTestId('run-status').textContent).toBe('completed')
    })
    expect(screen.getByTestId('run-active').textContent).toBe('no')
    expect(screen.getByTestId('assistant-text').textContent).toBe('正在分析')
    expect(screen.getByTestId('tool-events').textContent).toBe('read_file:done')
    expect(screen.getByTestId('current-run-step').textContent).toBe('运行已完成')
  })

  it('text_delta 会在同一帧内批量 flush，并合并为单个 text block', async () => {
    const raf = installManualRaf()
    let runtimeEventHandler: ((event: {
      type: string
      timestamp: string
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
            timestamp: '2026-04-27T00:00:00.000Z',
            payload: {
              status: 'running',
            },
          })
          runtimeEventHandler?.({
            type: 'text_delta',
            timestamp: '2026-04-27T00:00:01.000Z',
            payload: {
              text: '第一段',
            },
          })
          runtimeEventHandler?.({
            type: 'text_delta',
            timestamp: '2026-04-27T00:00:01.100Z',
            payload: {
              text: '第二段',
            },
          })
          return new Promise(() => undefined)
        }),
        onEvent: (listener: (event: {
          type: string
          timestamp: string
          payload?: Record<string, unknown>
        }) => void) => {
          runtimeEventHandler = listener
          return () => {
            runtimeEventHandler = null
          }
        },
      },
      shell: {
        getSnapshot: vi.fn(async () => createShellSnapshot(null)),
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

    render(<HookHarness />)

    await waitFor(() => {
      expect(screen.getByTestId('shell-status').textContent).toBe('ready')
    })

    fireEvent.click(screen.getByRole('button', { name: '提交' }))

    await waitFor(() => {
      expect(screen.getByTestId('run-status').textContent).toBe('running')
    })

    expect(screen.getByTestId('assistant-text').textContent).toBe('')
    expect(screen.getByTestId('live-conversation-json').textContent).toBe('[]')

    act(() => {
      raf.flushAll()
    })

    expect(screen.getByTestId('assistant-text').textContent).toBe('第一段第二段')
    const blocks = JSON.parse(
      screen.getByTestId('live-conversation-json').textContent ?? '[]',
    ) as Array<Record<string, unknown>>
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toMatchObject({
      type: 'text',
      content: '第一段第二段',
    })
  })

  it('liveConversation.blocks 会保留 text_delta / tool_start / tool_end / text_delta 的真实顺序', async () => {
    let runtimeEventHandler: ((event: {
      type: string
      timestamp: string
      payload?: Record<string, unknown>
    }) => void) | null = null
    const submit = vi.fn(async () => {
      runtimeEventHandler?.({
        type: 'run_started',
        timestamp: '2026-04-26T00:00:00.000Z',
      })
      runtimeEventHandler?.({
        type: 'text_delta',
        timestamp: '2026-04-26T00:00:01.000Z',
        payload: {
          text: '我先查看目录',
        },
      })
      runtimeEventHandler?.({
        type: 'tool_start',
        timestamp: '2026-04-26T00:00:02.000Z',
        payload: {
          toolCallId: 'tool-1',
          toolName: 'ls',
          args: {
            path: '.',
          },
        },
      })
      runtimeEventHandler?.({
        type: 'tool_end',
        timestamp: '2026-04-26T00:00:03.000Z',
        payload: {
          toolCallId: 'tool-1',
          success: true,
        },
      })
      runtimeEventHandler?.({
        type: 'text_delta',
        timestamp: '2026-04-26T00:00:04.000Z',
        payload: {
          text: '目录看完了',
        },
      })
      runtimeEventHandler?.({
        type: 'run_completed',
        timestamp: '2026-04-26T00:00:05.000Z',
      })
      return {
        ok: true as const,
        sessionId: 'session-2',
      }
    })

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
        submit,
        onEvent: (listener: (event: {
          type: string
          timestamp: string
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
          .mockResolvedValueOnce(createShellSnapshot(null))
          .mockResolvedValueOnce(createShellSnapshot('session-2')),
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

    render(<HookHarness />)

    await waitFor(() => {
      expect(screen.getByTestId('shell-status').textContent).toBe('ready')
    })

    fireEvent.click(screen.getByRole('button', { name: '提交' }))

    await waitFor(() => {
      expect(screen.getByTestId('run-status').textContent).toBe('completed')
    })
    expect(screen.getByTestId('live-blocks').textContent).toContain(
      'text:我先查看目录|tool:ls:done|text:目录看完了',
    )
  })

  it('tool_start 作为首个 live 内容时插入状态块，tool_end 只更新原工具块', async () => {
    let runtimeEventHandler: ((event: {
      type: string
      timestamp: string
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
        submit: vi.fn(() => {
          runtimeEventHandler?.({
            type: 'run_started',
            timestamp: '2026-04-26T00:00:00.000Z',
          })
          runtimeEventHandler?.({
            type: 'tool_start',
            timestamp: '2026-04-26T00:00:01.000Z',
            payload: {
              toolCallId: 'tool-1',
              toolName: 'write_file',
              args: {
                path: 'D:/workspace/demo/SPEC.md',
                content: 'hello\nworld',
              },
            },
          })
          runtimeEventHandler?.({
            type: 'tool_end',
            timestamp: '2026-04-26T00:00:02.000Z',
            payload: {
              toolCallId: 'tool-1',
              success: true,
              durationMs: 12,
            },
          })
          return new Promise(() => undefined)
        }),
        onEvent: (listener: (event: {
          type: string
          timestamp: string
          payload?: Record<string, unknown>
        }) => void) => {
          runtimeEventHandler = listener
          return () => {
            runtimeEventHandler = null
          }
        },
      },
      shell: {
        getSnapshot: vi.fn(async () => createShellSnapshot(null)),
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

    render(<HookHarness />)

    await waitFor(() => {
      expect(screen.getByTestId('shell-status').textContent).toBe('ready')
    })

    fireEvent.click(screen.getByRole('button', { name: '提交' }))

    await waitFor(() => {
      expect(screen.getByTestId('live-blocks').textContent).toContain(
        'tool:write_file:done',
      )
    })
    expect(screen.getByTestId('live-blocks').textContent).toBe(
      'status:正在写入 SPEC.md|tool:write_file:done',
    )
  })

  it('submit 成功后若 runtime inspect 刷新失败，不应提前清空 liveConversation', async () => {
    const raf = installManualRaf()
    let runtimeEventHandler: ((event: {
      type: string
      timestamp: string
      payload?: Record<string, unknown>
    }) => void) | null = null
    const inspect = vi
      .fn()
      .mockResolvedValueOnce(createRuntimeInspectResult())
      .mockRejectedValueOnce(new Error('inspect failed'))
    const submit = vi.fn(async () => {
      runtimeEventHandler?.({
        type: 'text_delta',
        timestamp: '2026-04-26T00:00:01.000Z',
        payload: {
          text: '刷新失败前的可见内容',
        },
      })
      return {
        ok: true as const,
        sessionId: 'session-2',
      }
    })

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
        inspect,
        submit,
        onEvent: (listener: (event: {
          type: string
          timestamp: string
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
          .mockResolvedValueOnce(createShellSnapshot(null))
          .mockResolvedValueOnce(createShellSnapshot('session-2')),
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

    render(<HookHarness />)

    await waitFor(() => {
      expect(screen.getByTestId('shell-status').textContent).toBe('ready')
    })

    fireEvent.click(screen.getByRole('button', { name: '提交' }))

    await waitFor(() => {
      expect(screen.getByTestId('submit-result').textContent).toBe('ok')
    })
    await waitFor(() => {
      expect(inspect).toHaveBeenCalledTimes(2)
    })

    act(() => {
      raf.flushAll()
    })
    expect(screen.getByTestId('assistant-text').textContent).toBe(
      '刷新失败前的可见内容',
    )
  })

  it('Stop 会调用 runtime.cancel，收到 run_cancelled 后恢复为可继续发送', async () => {
    let runtimeEventHandler: ((event: {
      type: string
      timestamp: string
      runId?: string
      payload?: Record<string, unknown>
    }) => void) | null = null
    const cancel = vi.fn(async () => {
      runtimeEventHandler?.({
        type: 'run_cancelled',
        timestamp: '2026-04-26T00:00:02.000Z',
        runId: 'run-1',
        payload: {
          message: '已停止当前运行',
          reason: 'user-requested',
        },
      })
      return {
        ok: true as const,
        runId: 'run-1',
      }
    })

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
        submit: vi.fn(() => {
          runtimeEventHandler?.({
            type: 'run_started',
            timestamp: '2026-04-26T00:00:00.000Z',
            runId: 'run-1',
            payload: {
              status: 'running',
            },
          })
          return new Promise(() => undefined)
        }),
        cancel,
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
        getSnapshot: vi.fn(async () => createShellSnapshot(null)),
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

    render(<HookHarness />)

    await waitFor(() => {
      expect(screen.getByTestId('shell-status').textContent).toBe('ready')
    })

    fireEvent.click(screen.getByRole('button', { name: '提交' }))

    await waitFor(() => {
      expect(screen.getByTestId('run-status').textContent).toBe('running')
    })
    expect(screen.getByTestId('run-active').textContent).toBe('yes')

    fireEvent.click(screen.getByRole('button', { name: '停止' }))

    await waitFor(() => {
      expect(cancel).toHaveBeenCalledWith({
        runId: 'run-1',
        reason: 'user-requested',
      })
    })
    await waitFor(() => {
      expect(screen.getByTestId('run-status').textContent).toBe('cancelled')
    })
    expect(screen.getByTestId('run-active').textContent).toBe('no')
    expect(screen.getByTestId('system-messages').textContent).toBe('已停止当前运行')
  })

  it('run_cancelled 后收到同 runId 的 late turn_end，不会覆盖 cancelled 终态', async () => {
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
        submit: vi.fn(() => {
          runtimeEventHandler?.({
            type: 'run_started',
            timestamp: '2026-04-26T00:00:00.000Z',
            runId: 'run-1',
          })
          return new Promise(() => undefined)
        }),
        cancel: vi.fn(async () => {
          runtimeEventHandler?.({
            type: 'run_cancelled',
            timestamp: '2026-04-26T00:00:01.000Z',
            runId: 'run-1',
            payload: {
              message: '已停止当前运行',
            },
          })
          return {
            ok: true as const,
            runId: 'run-1',
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
        getSnapshot: vi.fn(async () => createShellSnapshot(null)),
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

    render(<HookHarness />)

    await waitFor(() => {
      expect(screen.getByTestId('shell-status').textContent).toBe('ready')
    })

    fireEvent.click(screen.getByRole('button', { name: '提交' }))
    await waitFor(() => {
      expect(screen.getByTestId('run-status').textContent).toBe('running')
    })

    fireEvent.click(screen.getByRole('button', { name: '停止' }))
    await waitFor(() => {
      expect(screen.getByTestId('run-status').textContent).toBe('cancelled')
    })

    runtimeEventHandler?.({
      type: 'turn_end',
      timestamp: '2026-04-26T00:00:02.000Z',
      runId: 'run-1',
      payload: {
        stopReason: 'end_turn',
        aborted: false,
      },
    })

    expect(screen.getByTestId('run-status').textContent).toBe('cancelled')
    expect(screen.getByTestId('current-run-step').textContent).toBe('已停止当前运行')
    expect(screen.getByTestId('live-blocks').textContent).not.toContain('status:运行已完成')
  })

  it('run_cancelled 后收到同 runId 的 late session_end，不会覆盖 cancelled 终态', async () => {
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
        submit: vi.fn(() => {
          runtimeEventHandler?.({
            type: 'run_started',
            timestamp: '2026-04-26T00:00:00.000Z',
            runId: 'run-2',
          })
          return new Promise(() => undefined)
        }),
        cancel: vi.fn(async () => {
          runtimeEventHandler?.({
            type: 'run_cancelled',
            timestamp: '2026-04-26T00:00:01.000Z',
            runId: 'run-2',
            payload: {
              message: '已停止当前运行',
            },
          })
          return {
            ok: true as const,
            runId: 'run-2',
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
        getSnapshot: vi.fn(async () => createShellSnapshot(null)),
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

    render(<HookHarness />)

    await waitFor(() => {
      expect(screen.getByTestId('shell-status').textContent).toBe('ready')
    })

    fireEvent.click(screen.getByRole('button', { name: '提交' }))
    fireEvent.click(screen.getByRole('button', { name: '停止' }))

    await waitFor(() => {
      expect(screen.getByTestId('run-status').textContent).toBe('cancelled')
    })

    runtimeEventHandler?.({
      type: 'session_end',
      timestamp: '2026-04-26T00:00:02.000Z',
      runId: 'run-2',
      payload: {
        status: 'done',
      },
    })

    expect(screen.getByTestId('run-status').textContent).toBe('cancelled')
    expect(screen.getByTestId('current-run-step').textContent).toBe('已停止当前运行')
  })

  it('run_failed 后 late run_completed 不会覆盖 failed', async () => {
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
        submit: vi.fn(() => {
          runtimeEventHandler?.({
            type: 'run_started',
            timestamp: '2026-04-26T00:00:00.000Z',
            runId: 'run-3',
          })
          runtimeEventHandler?.({
            type: 'run_failed',
            timestamp: '2026-04-26T00:00:01.000Z',
            runId: 'run-3',
            payload: {
              message: 'provider failed',
            },
          })
          return new Promise(() => undefined)
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
        getSnapshot: vi.fn(async () => createShellSnapshot(null)),
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

    render(<HookHarness />)
    await waitFor(() => {
      expect(screen.getByTestId('shell-status').textContent).toBe('ready')
    })

    fireEvent.click(screen.getByRole('button', { name: '提交' }))
    await waitFor(() => {
      expect(screen.getByTestId('run-status').textContent).toBe('failed')
    })

    runtimeEventHandler?.({
      type: 'run_completed',
      timestamp: '2026-04-26T00:00:02.000Z',
      runId: 'run-3',
      payload: {
        sessionId: 'session-3',
      },
    })

    expect(screen.getByTestId('run-status').textContent).toBe('failed')
    expect(screen.getByTestId('current-run-step').textContent).toBe('运行失败')
  })

  it('event.runId 不匹配 currentRunId 时，不会改当前 runStatus', async () => {
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
        submit: vi.fn(() => {
          runtimeEventHandler?.({
            type: 'run_started',
            timestamp: '2026-04-26T00:00:00.000Z',
            runId: 'run-4',
          })
          return new Promise(() => undefined)
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
        getSnapshot: vi.fn(async () => createShellSnapshot(null)),
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

    render(<HookHarness />)
    await waitFor(() => {
      expect(screen.getByTestId('shell-status').textContent).toBe('ready')
    })

    fireEvent.click(screen.getByRole('button', { name: '提交' }))
    await waitFor(() => {
      expect(screen.getByTestId('run-status').textContent).toBe('running')
    })

    runtimeEventHandler?.({
      type: 'run_failed',
      timestamp: '2026-04-26T00:00:01.000Z',
      runId: 'run-999',
      payload: {
        message: 'other run failed',
      },
    })

    expect(screen.getByTestId('run-status').textContent).toBe('running')
    expect(screen.getByTestId('current-run-step').textContent).toBe('正在调用模型')
  })

  it('thinking -> tool_start 时会 finalize 前一个 thinking block', async () => {
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
        submit: vi.fn(() => {
          runtimeEventHandler?.({
            type: 'run_started',
            timestamp: '2026-04-26T00:00:00.000Z',
            runId: 'run-5',
          })
          runtimeEventHandler?.({
            type: 'thinking',
            timestamp: '2026-04-26T00:00:01.000Z',
            runId: 'run-5',
            payload: {
              text: '先分析目录',
            },
          })
          runtimeEventHandler?.({
            type: 'tool_start',
            timestamp: '2026-04-26T00:00:02.000Z',
            runId: 'run-5',
            payload: {
              toolCallId: 'tool-1',
              toolName: 'read_file',
              args: {
                path: 'src/index.ts',
              },
            },
          })
          return new Promise(() => undefined)
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
        getSnapshot: vi.fn(async () => createShellSnapshot(null)),
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

    render(<HookHarness />)
    await waitFor(() => {
      expect(screen.getByTestId('shell-status').textContent).toBe('ready')
    })

    fireEvent.click(screen.getByRole('button', { name: '提交' }))

    await waitFor(() => {
      expect(screen.getByTestId('live-blocks').textContent).toContain('tool:read_file:running')
    })

    const blocks = JSON.parse(screen.getByTestId('live-conversation-json').textContent ?? '[]') as Array<Record<string, unknown>>
    const thinkingBlock = blocks.find((block) => block['type'] === 'thinking')
    expect(thinkingBlock?.['endedAt']).toEqual(expect.any(Number))
    expect(thinkingBlock?.['durationMs']).toEqual(expect.any(Number))
  })

  it('run_cancelled 后会 finalize thinking block，并停止 live 状态', async () => {
    const raf = installManualRaf()
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
        submit: vi.fn(() => {
          runtimeEventHandler?.({
            type: 'run_started',
            timestamp: '2026-04-26T00:00:00.000Z',
            runId: 'run-6',
          })
          runtimeEventHandler?.({
            type: 'thinking',
            timestamp: '2026-04-26T00:00:01.000Z',
            runId: 'run-6',
            payload: {
              text: '继续思考中',
            },
          })
          return new Promise(() => undefined)
        }),
        cancel: vi.fn(async () => {
          runtimeEventHandler?.({
            type: 'run_cancelled',
            timestamp: '2026-04-26T00:00:02.000Z',
            runId: 'run-6',
            payload: {
              message: '已停止当前运行',
            },
          })
          return {
            ok: true as const,
            runId: 'run-6',
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
        getSnapshot: vi.fn(async () => createShellSnapshot(null)),
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

    render(<HookHarness />)
    await waitFor(() => {
      expect(screen.getByTestId('shell-status').textContent).toBe('ready')
    })

    fireEvent.click(screen.getByRole('button', { name: '提交' }))
    act(() => {
      raf.flushAll()
    })
    expect(screen.getByTestId('live-blocks').textContent).toContain('thinking:继续思考中')

    fireEvent.click(screen.getByRole('button', { name: '停止' }))
    await waitFor(() => {
      expect(screen.getByTestId('run-status').textContent).toBe('cancelled')
    })

    const blocks = JSON.parse(screen.getByTestId('live-conversation-json').textContent ?? '[]') as Array<Record<string, unknown>>
    const thinkingBlock = blocks.find((block) => block['type'] === 'thinking')
    expect(thinkingBlock?.['endedAt']).toEqual(expect.any(Number))
    expect(thinkingBlock?.['durationMs']).toEqual(expect.any(Number))
  })

  it('model_request_* 事件会驱动模型请求阶段状态，并在失败后恢复输入', async () => {
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
        submit: vi.fn(() => {
          runtimeEventHandler?.({
            type: 'run_started',
            timestamp: '2026-04-26T00:00:00.000Z',
            runId: 'run-7',
          })
          runtimeEventHandler?.({
            type: 'model_request_started',
            timestamp: '2026-04-26T00:00:01.000Z',
            runId: 'run-7',
            payload: {
              providerId: 'minimax',
              modelId: 'MiniMax-M2.7',
              phase: 'initial',
            },
          })
          runtimeEventHandler?.({
            type: 'model_first_chunk',
            timestamp: '2026-04-26T00:00:02.000Z',
            runId: 'run-7',
            payload: {
              elapsedMs: 1200,
            },
          })
          runtimeEventHandler?.({
            type: 'model_request_failed',
            timestamp: '2026-04-26T00:00:03.000Z',
            runId: 'run-7',
            payload: {
              message: '模型请求失败',
            },
          })
          return new Promise(() => undefined)
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
        getSnapshot: vi.fn(async () => createShellSnapshot(null)),
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

    render(<HookHarness />)
    await waitFor(() => {
      expect(screen.getByTestId('shell-status').textContent).toBe('ready')
    })

    fireEvent.click(screen.getByRole('button', { name: '提交' }))

    await waitFor(() => {
      expect(screen.getByTestId('current-run-step').textContent).toBe('运行失败')
    })
    expect(screen.getByTestId('run-status').textContent).toBe('failed')
    expect(screen.getByTestId('submitting').textContent).toBe('no')
  })

  it('running 长时间没有新 runtime event 时显示可停止提示', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let runtimeEventHandler: ((event: {
      type: string
      timestamp: string
      runId?: string
      payload?: Record<string, unknown>
    }) => void) | null = null

    try {
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
          submit: vi.fn(() => {
            runtimeEventHandler?.({
              type: 'run_started',
              timestamp: '2026-04-26T00:00:00.000Z',
              runId: 'run-1',
              payload: {
                status: 'running',
              },
            })
            return new Promise(() => undefined)
          }),
          cancel: vi.fn(async () => ({
            ok: true as const,
            runId: 'run-1',
          })),
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
          getSnapshot: vi.fn(async () => createShellSnapshot(null)),
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

      render(<HookHarness />)

      await waitFor(() => {
        expect(screen.getByTestId('shell-status').textContent).toBe('ready')
      })

      fireEvent.click(screen.getByRole('button', { name: '提交' }))

      await waitFor(() => {
        expect(screen.getByTestId('run-status').textContent).toBe('running')
      })

      await act(async () => {
        await vi.advanceTimersByTimeAsync(90_000)
      })

      await waitFor(() => {
        expect(screen.getByTestId('run-idle-warning').textContent).toBe(
          '运行长时间没有新进展，可以停止后重试',
        )
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('Bootstrap 阶段的 timing_mark 会驱动 currentRunStep 显示中文步骤', async () => {
    let runtimeEventHandler: ((event: {
      type: string
      timestamp: string
      runId?: string
      payload?: Record<string, unknown>
    }) => void) | null = null
    const submit = vi.fn(() => {
      runtimeEventHandler?.({
        type: 'run_started',
        timestamp: '2026-04-26T00:00:00.000Z',
        runId: 'run-bootstrap',
      })
      runtimeEventHandler?.({
        type: 'timing_mark',
        timestamp: '2026-04-26T00:00:01.000Z',
        runId: 'run-bootstrap',
        payload: { stage: 'runtime_bootstrap_start' },
      })
      // 阻塞 submit，让我们在 model_request_started 之前断言
      return new Promise(() => undefined)
    })

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
        submit,
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
        getSnapshot: vi.fn(async () => createShellSnapshot(null)),
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

    render(<HookHarness />)

    await waitFor(() => {
      expect(screen.getByTestId('shell-status').textContent).toBe('ready')
    })

    fireEvent.click(screen.getByRole('button', { name: '提交' }))

    // bootstrap 阶段应该看到中文步骤文案
    await waitFor(() => {
      expect(screen.getByTestId('current-run-step').textContent).toBe(
        '正在加载工作区配置',
      )
    })

    // 后续阶段：tool_registry_ready → 工具与插件已就绪
    await act(async () => {
      runtimeEventHandler?.({
        type: 'timing_mark',
        timestamp: '2026-04-26T00:00:02.000Z',
        runId: 'run-bootstrap',
        payload: { stage: 'tool_registry_ready' },
      })
    })
    expect(screen.getByTestId('current-run-step').textContent).toBe(
      '工具与插件已就绪',
    )

    // model_request_started 接管：步骤切到"正在请求模型"
    await act(async () => {
      runtimeEventHandler?.({
        type: 'model_request_started',
        timestamp: '2026-04-26T00:00:03.000Z',
        runId: 'run-bootstrap',
        payload: {},
      })
    })
    expect(screen.getByTestId('current-run-step').textContent).toBe(
      '正在请求模型',
    )
  })

  it('submit 完成后 refreshStateAsync 仍在 await 时切换会话，后到的 setSelectedSessionId 不会冲掉用户的新选择', async () => {
    let runtimeEventHandler: ((event: {
      type: string
      timestamp: string
      runId?: string
      payload?: Record<string, unknown>
    }) => void) | null = null

    // 第一次 getSnapshot（hook 初始化）：立刻返回。
    // 第二次 getSnapshot（refreshStateAsync 内）：手动控制何时 resolve，模拟"在 await 中间"窗口。
    let releaseRefreshSnapshot: ((snapshot: ReturnType<typeof createShellSnapshot>) => void) = () => {}
    const refreshSnapshotPromise = new Promise<ReturnType<typeof createShellSnapshot>>((resolve) => {
      releaseRefreshSnapshot = resolve
    })
    // 第三次 getSnapshot（selectSession 内）：立刻返回切到目标会话的快照
    const selectSessionSnapshot = createShellSnapshot('session-other')

    const getSnapshot = vi.fn<
      (request?: unknown) => Promise<ReturnType<typeof createShellSnapshot>>
    >()
    getSnapshot.mockResolvedValueOnce(createShellSnapshot(null))
    getSnapshot.mockReturnValueOnce(refreshSnapshotPromise)
    getSnapshot.mockResolvedValue(selectSessionSnapshot)

    const inspect = vi.fn(async () => createRuntimeInspectResult())
    const submit = vi.fn(async () => {
      runtimeEventHandler?.({
        type: 'run_completed',
        timestamp: '2026-04-26T00:00:01.000Z',
        runId: 'run-refresh-race',
        payload: { sessionId: 'session-original' },
      })
      return {
        ok: true as const,
        sessionId: 'session-original',
      }
    })

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
        inspect,
        submit,
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
      shell: { getSnapshot },
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

    render(<HookHarness />)

    await waitFor(() => {
      expect(screen.getByTestId('shell-status').textContent).toBe('ready')
    })

    fireEvent.click(screen.getByRole('button', { name: '提交' }))

    // submit 已成功 resolve，refreshStateAsync 已经发起 getSnapshot 但仍在 pending
    await waitFor(() => {
      expect(submit).toHaveBeenCalledTimes(1)
    })
    await waitFor(() => {
      expect(getSnapshot).toHaveBeenCalledTimes(2) // 初始化 + refresh
    })

    // 用户在 refresh 还没回来时切换到另一个会话
    fireEvent.click(screen.getByRole('button', { name: '切换会话' }))
    await waitFor(() => {
      expect(screen.getByTestId('selected-session-id').textContent).toBe(
        'session-other',
      )
    })

    // 现在 refresh 终于 resolve，企图把 selectedSessionId 写回 'session-original'
    await act(async () => {
      releaseRefreshSnapshot(createShellSnapshot('session-original'))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    // epoch 守卫应该挡住 stale 写入：用户的 'session-other' 选择仍然生效
    expect(screen.getByTestId('selected-session-id').textContent).toBe(
      'session-other',
    )
  })

  it('Stop 触发 cancelling 后，晚到的 text_delta / tool_start / permission.request 都不会把 runStatus 翻回活跃态', async () => {
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
        submit: vi.fn(() => {
          runtimeEventHandler?.({
            type: 'run_started',
            timestamp: '2026-04-26T00:00:00.000Z',
            runId: 'run-cancel-flicker',
          })
          return new Promise(() => undefined)
        }),
        // cancel 故意不 resolve：模拟"abort 信号还在传播"的窗口，
        // 这是 cancelling 状态最容易被晚到事件冲刷的时间段。
        cancel: vi.fn(() => new Promise(() => undefined)),
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
        getSnapshot: vi.fn(async () => createShellSnapshot(null)),
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

    render(<HookHarness />)

    await waitFor(() => {
      expect(screen.getByTestId('shell-status').textContent).toBe('ready')
    })

    fireEvent.click(screen.getByRole('button', { name: '提交' }))
    await waitFor(() => {
      expect(screen.getByTestId('run-status').textContent).toBe('running')
    })

    fireEvent.click(screen.getByRole('button', { name: '停止' }))
    await waitFor(() => {
      expect(screen.getByTestId('run-status').textContent).toBe('cancelling')
    })
    expect(screen.getByTestId('current-run-step').textContent).toBe(
      '正在停止当前运行',
    )

    // 模拟 abort 还在传播时，runtime 端继续 emit 各种活跃事件
    await act(async () => {
      runtimeEventHandler?.({
        type: 'text_delta',
        timestamp: '2026-04-26T00:00:01.000Z',
        runId: 'run-cancel-flicker',
        payload: { text: '晚到的文本片段' },
      })
      runtimeEventHandler?.({
        type: 'model_first_chunk',
        timestamp: '2026-04-26T00:00:02.000Z',
        runId: 'run-cancel-flicker',
        payload: {},
      })
      runtimeEventHandler?.({
        type: 'tool_start',
        timestamp: '2026-04-26T00:00:03.000Z',
        runId: 'run-cancel-flicker',
        payload: {
          toolCallId: 'tool-late',
          toolName: 'read_file',
          args: { path: 'src/late.ts' },
        },
      })
      runtimeEventHandler?.({
        type: 'permission.request',
        timestamp: '2026-04-26T00:00:04.000Z',
        runId: 'run-cancel-flicker',
        payload: {},
      })
    })

    // 关键断言：runStatus 不能被翻回任何活跃态
    expect(screen.getByTestId('run-status').textContent).toBe('cancelling')
    expect(screen.getByTestId('current-run-step').textContent).toBe(
      '正在停止当前运行',
    )
  })
})
