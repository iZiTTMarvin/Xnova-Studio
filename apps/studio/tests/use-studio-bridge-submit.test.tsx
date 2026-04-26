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

function HookHarness() {
  const bridgeState = useStudioBridge()
  const [submitResult, setSubmitResult] = useState('')

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
      <div data-testid="shell-status">{bridgeState.shellStatus}</div>
      <div data-testid="run-status">{bridgeState.runStatus}</div>
      <div data-testid="run-active">{bridgeState.isRunActive ? 'yes' : 'no'}</div>
      <div data-testid="submitting">{bridgeState.isSubmitting ? 'yes' : 'no'}</div>
      <div data-testid="submit-result">{submitResult}</div>
      <div data-testid="assistant-text">{bridgeState.liveConversation.assistantText}</div>
      <div data-testid="tool-events">
        {bridgeState.liveConversation.toolEvents
          .map((toolEvent) => `${toolEvent.toolName}:${toolEvent.status}`)
          .join('|')}
      </div>
      <div data-testid="system-messages">
        {bridgeState.liveConversation.systemMessages.join('|')}
      </div>
      <div data-testid="run-idle-warning">{bridgeState.runIdleWarning ?? ''}</div>
      <div data-testid="current-run-step">{bridgeState.currentRunStep ?? ''}</div>
    </div>
  )
}

afterEach(() => {
  cleanup()
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

  it('submit 成功后若 runtime inspect 刷新失败，不应提前清空 liveConversation', async () => {
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
})
