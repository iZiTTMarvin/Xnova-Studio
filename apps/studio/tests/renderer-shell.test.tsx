// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/renderer/App'

function clearBridge() {
  delete (window as Window & { xnovaStudio?: unknown }).xnovaStudio
}

function createBridge(options?: {
  hostState?: {
    workspacePath: string | null
    lastSelection: null
  }
  runtimeInspectResult?: unknown
  runtimeEvent?: unknown
  memoryOverview?: unknown
  shellSnapshot?: unknown
  runtimeSubmit?: (
    input: unknown,
    emitRuntimeEvent: (event: unknown) => void,
  ) => Promise<unknown>
  runtimeCancel?: (input: unknown) => Promise<unknown>
}) {
  const getState = vi.fn(async () => ({
    workspacePath: null,
    lastSelection: null,
    ...(options?.hostState ?? {}),
  }))

  let runtimeEventListener: ((event: unknown) => void) | null = null
  const emitRuntimeEvent = (event: unknown) => {
    runtimeEventListener?.(event)
  }
  const runtimeApi = {
    inspect: vi.fn(async () => options?.runtimeInspectResult ?? {
      ok: true as const,
      status: 'ready' as const,
      snapshot: {
        sessionId: null,
        isRunning: false,
        provider: 'anthropic',
        model: 'claude-sonnet-4-6',
        warnings: [],
      },
      workspacePath: options?.hostState?.workspacePath ?? null,
      configWarnings: [],
      issues: [],
    }),
    onEvent: (listener: (event: unknown) => void) => {
      runtimeEventListener = listener
      if (options?.runtimeEvent) {
        queueMicrotask(() => {
          listener(options.runtimeEvent)
        })
      }
      return () => {
        if (runtimeEventListener === listener) {
          runtimeEventListener = null
        }
      }
    },
    submit: vi.fn(async (input) =>
      options?.runtimeSubmit
        ? options.runtimeSubmit(input, emitRuntimeEvent)
        : {
            ok: true as const,
            sessionId: 'session-1',
          }),
    cancel: vi.fn(async (input) =>
      options?.runtimeCancel
        ? options.runtimeCancel(input)
        : {
            ok: true as const,
            runId: null,
          }),
  }

  const shellApi = {
    getSnapshot: vi.fn(async () => options?.shellSnapshot ?? {
      startup: {
        recentProject: null,
        recentSession: null,
      },
      recentProjects: [],
      projectSessions: [],
      scratchpadEntries: [],
      defaults: {
        projectPath: null,
        branch: null,
        agentId: null,
        modelId: 'claude-sonnet-4-6',
        providerId: 'anthropic',
        recommendedMode: null,
        allowedModes: ['standard', 'xforge'],
        availablePrimaryAgentIds: ['general'],
      },
      issues: [],
      warnings: [],
    }),
  }

  return {
    host: {
      getState,
      openWorkspace: vi.fn(async () => ({
        selection: {
          ok: false as const,
          code: 'cancelled' as const,
          message: '用户取消了 workspace 目录选择',
        },
        state: await getState(),
      })),
      onStateChanged: () => () => {},
    },
    runtime: runtimeApi,
    shell: shellApi,
    memory: {
      getOverview: vi.fn(async () => options?.memoryOverview ?? {
        enabled: true,
        status: 'ready' as const,
        statusMessage: 'Embedding 已就绪（维度 1536）。',
        embedding: {
          configured: true,
          dimension: 1536,
          missingFields: [],
        },
        overview: {
          projectPath: options?.hostState?.workspacePath ?? null,
          globalEntries: 3,
          projectEntries: 2,
          vectorChunks: 10,
        },
        source: {},
        warnings: [],
      }),
      rebuild: vi.fn(async () => ({
        success: true as const,
        message: 'Memory 索引已完成重建。',
      })),
    },
  }
}

afterEach(() => {
  vi.useRealTimers()
  clearBridge()
  cleanup()
  window.localStorage.clear()
})

describe('renderer project-aware shell', () => {
  it('bridge 缺失时显示宿主不可用提示，并退化到空白聊天页', () => {
    clearBridge()

    render(<App />)

    expect(screen.getByRole('heading', { name: 'Xnova Studio' })).toBeTruthy()
    expect(screen.getByText('宿主桥接不可用')).toBeTruthy()
    expect(screen.getByText('要开始什么项目？')).toBeTruthy()
    expect(screen.queryByText('Overview')).toBeNull()
  })

  it('runtime 未就绪时显示明确提示，而不是静默 ready', async () => {
    ;(window as Window & { xnovaStudio?: unknown }).xnovaStudio = createBridge({
      runtimeInspectResult: {
        ok: true as const,
        status: 'not-ready' as const,
        snapshot: {
          sessionId: null,
          isRunning: false,
          provider: 'anthropic',
          model: 'claude-sonnet-4-6',
          warnings: [],
        },
        workspacePath: null,
        configWarnings: [],
        issues: [
          {
            code: 'runtime-not-ready',
            severity: 'warning',
            message: '当前尚未绑定 Workspace，runtime 未就绪。',
          },
        ],
      },
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('当前尚未绑定 Workspace，runtime 未就绪。')).toBeTruthy()
    })
  })

  it('没有最近项目且未绑定 workspace 时，默认进入项目层的新对话页，而不是 Overview', async () => {
    ;(window as Window & { xnovaStudio?: unknown }).xnovaStudio = createBridge()

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('要开始什么项目？')).toBeTruthy()
    })

    const nav = screen.getByRole('navigation', { name: 'Studio 一级导航' })
    expect(within(nav).getByRole('button', { name: '新对话' })).toBeTruthy()
    expect(within(nav).getByRole('button', { name: '搜索' })).toBeTruthy()
    expect(within(nav).getByRole('button', { name: 'Agents' })).toBeTruthy()
    expect(within(nav).getByRole('button', { name: '项目' })).toBeTruthy()
    expect(within(nav).getByRole('button', { name: '工具' })).toBeTruthy()
    expect(within(nav).queryByRole('button', { name: '聊天' })).toBeNull()
    expect(within(nav).queryByRole('button', { name: '设置' })).toBeNull()

    expect(screen.getByRole('textbox', { name: '项目级新对话输入' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '发送提示词' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '标准模式' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'XForge' })).toBeTruthy()
    expect(screen.queryByText('快速聊天')).toBeNull()
    expect(screen.queryByText('Overview')).toBeNull()
  })

  it('新对话输入可编辑，并通过 runtime.submit 新 contract 触发提交', async () => {
    const runtimeSubmit = vi.fn(async () => ({
      ok: true as const,
      sessionId: 'session-1',
    }))
    ;(window as Window & { xnovaStudio?: unknown }).xnovaStudio = createBridge({
      hostState: {
        workspacePath: 'D:/workspace/demo',
        lastSelection: null,
      },
      runtimeSubmit,
    })

    render(<App />)

    const input = await screen.findByRole('textbox', { name: '项目级新对话输入' })
    fireEvent.change(input, { target: { value: '实现项目脚手架并补测试' } })
    fireEvent.click(screen.getByRole('button', { name: '发送提示词' }))

    await waitFor(() => {
      expect(runtimeSubmit).toHaveBeenCalled()
    })
    expect(runtimeSubmit.mock.calls[0]?.[0]).toEqual({
        text: '实现项目脚手架并补测试',
        projectPath: 'D:/workspace/demo',
        sessionId: null,
        agentId: null,
        providerId: 'anthropic',
        modelId: 'claude-sonnet-4-6',
        timing: {
          userSubmitClickedAt: expect.any(Number),
          rendererRuntimeSubmitInvokedAt: expect.any(Number),
        },
      })
  })

  it('run_started 后输入禁用，并把发送按钮切换为停止当前运行', async () => {
    let emitRuntimeEvent: ((event: unknown) => void) | null = null
    const runtimeSubmit = vi.fn(
      async (_input: unknown, emit: (event: unknown) => void) => {
        emitRuntimeEvent = emit
        emit({
          type: 'run_started',
          timestamp: '2026-04-26T00:00:00.000Z',
          runId: 'run-1',
          payload: {
            status: 'running',
          },
        })
        return new Promise(() => undefined)
      },
    )
    const runtimeCancel = vi.fn(async () => {
      emitRuntimeEvent?.({
        type: 'run_cancelled',
        timestamp: '2026-04-26T00:00:01.000Z',
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
    ;(window as Window & { xnovaStudio?: unknown }).xnovaStudio = createBridge({
      hostState: {
        workspacePath: 'D:/workspace/demo',
        lastSelection: null,
      },
      runtimeSubmit,
      runtimeCancel,
    })

    render(<App />)

    const input = await screen.findByRole('textbox', { name: '项目级新对话输入' })
    fireEvent.change(input, { target: { value: '实现项目脚手架并补测试' } })
    fireEvent.click(screen.getByRole('button', { name: '发送提示词' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '停止当前运行' })).toBeTruthy()
    })
    expect(screen.getByText('当前正在运行')).toBeTruthy()
    // run 进行中：composer 反馈区与 Timeline 思考占位都会展示当前步骤文案，
    // 用 getAllByText 兼容两处可见 (P1-7 引入)。
    expect(screen.getAllByText('正在调用模型').length).toBeGreaterThan(0)
    expect(screen.getByText(/^最后进展:/)).toBeTruthy()
    const runningInput = screen.getByRole('textbox', { name: '项目级新对话输入' })
    expect((runningInput as HTMLTextAreaElement).disabled).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: '停止当前运行' }))

    await waitFor(() => {
      expect(runtimeCancel).toHaveBeenCalledWith({
        runId: 'run-1',
        reason: 'user-requested',
      })
    })
    await waitFor(() => {
      expect(
        (screen.getByRole('textbox', { name: '项目级新对话输入' }) as HTMLTextAreaElement)
          .disabled,
      ).toBe(false)
    })
    expect(screen.getByText('已停止当前运行')).toBeTruthy()
  })

  it('首轮提交尚未生成持久化 session 时，仍会立即进入可见对话流', async () => {
    const runtimeSubmit = vi.fn(
      () =>
        new Promise(() => {
          return undefined
        }),
    )
    ;(window as Window & { xnovaStudio?: unknown }).xnovaStudio = createBridge({
      hostState: {
        workspacePath: 'D:/workspace/demo',
        lastSelection: null,
      },
      runtimeSubmit,
    })

    render(<App />)

    const input = await screen.findByRole('textbox', { name: '项目级新对话输入' })
    fireEvent.change(input, { target: { value: '实现项目脚手架并补测试' } })
    fireEvent.click(screen.getByRole('button', { name: '发送提示词' }))

    await waitFor(() => {
      expect(screen.getByRole('region', { name: '项目会话聊天流' })).toBeTruthy()
    })
    expect(screen.getByText('实现项目脚手架并补测试')).toBeTruthy()
    expect(screen.queryByText('绑定项目目录')).toBeNull()
  })

  it('收到用户问题请求时会弹出对话框，并通过桥接回传答案', async () => {
    const baseBridge = createBridge({
      hostState: {
        workspacePath: 'D:/workspace/demo',
        lastSelection: null,
      },
    })
    const userInputListeners = new Set<(request: unknown) => void>()
    const respond = vi.fn(async () => undefined)

    ;(window as Window & { xnovaStudio?: unknown }).xnovaStudio = {
      ...baseBridge,
      userInput: {
        onRequest(listener: (request: unknown) => void) {
          userInputListeners.add(listener)
          return () => {
            userInputListeners.delete(listener)
          }
        },
        respond,
      },
    }

    render(<App />)

    await waitFor(() => {
      expect(userInputListeners.size).toBe(1)
    })

    act(() => {
      const listener = [...userInputListeners][0]
      listener?.({
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
            ],
          },
        ],
      })
    })

    expect(screen.getByRole('dialog', { name: '用户问题确认' })).toBeTruthy()
    fireEvent.change(screen.getByLabelText('请补充说明'), {
      target: { value: '先打通 user-input IPC' },
    })
    fireEvent.click(screen.getByLabelText('renderer'))
    fireEvent.click(screen.getByLabelText('dialog'))
    fireEvent.click(screen.getByRole('button', { name: '提交回答' }))

    await waitFor(() => {
      expect(respond).toHaveBeenCalledWith({
        requestId: 'question-1',
        cancelled: false,
        answers: {
          details: '先打通 user-input IPC',
          focus: 'renderer',
          tasks: ['dialog'],
        },
      })
    })
  })

  it('搜索页可基于项目与会话筛选，并能跳转到项目会话视图', async () => {
    ;(window as Window & { xnovaStudio?: unknown }).xnovaStudio = createBridge({
      shellSnapshot: {
        startup: {
          recentProject: null,
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
        projectSessions: [
          {
            sessionId: 'session-1',
            projectPath: 'D:/workspace/demo',
            title: '实现搜索入口',
            updatedAt: '2026-04-22T10:00:00.000Z',
            gitBranch: 'main',
            messageCount: 8,
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
          availablePrimaryAgentIds: ['general', 'planner'],
        },
        warnings: [],
        issues: [],
      },
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '搜索' })).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: '搜索' }))
    expect(screen.getByRole('textbox', { name: '搜索项目与会话' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '会话 实现搜索入口' })).toBeTruthy()

    fireEvent.change(screen.getByRole('textbox', { name: '搜索项目与会话' }), {
      target: { value: 'demo' },
    })
    expect(screen.getByRole('button', { name: '项目 demo' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '会话 实现搜索入口' }))
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '实现搜索入口' })).toBeTruthy()
    })
  })

  it('Agents 页展示可用主 Agent，并支持切换当前 Agent', async () => {
    ;(window as Window & { xnovaStudio?: unknown }).xnovaStudio = createBridge({
      shellSnapshot: {
        startup: {
          recentProject: null,
          recentSession: null,
        },
        recentProjects: [],
        projectSessions: [],
        scratchpadEntries: [],
        defaults: {
          projectPath: null,
          branch: null,
          agentId: 'general',
          modelId: 'claude-sonnet-4-6',
          providerId: 'anthropic',
          recommendedMode: null,
          allowedModes: ['standard', 'xforge'],
          availablePrimaryAgentIds: ['general', 'planner', 'reviewer'],
        },
        warnings: [],
        issues: [],
      },
    })

    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'Agents' }))
    expect(screen.getByRole('button', { name: '切换到 planner' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '切换到 planner' }))
    expect(screen.getByText('当前 Agent: planner')).toBeTruthy()
  })

  it('已绑定 workspace 时，新对话标题会跟随当前项目名动态变化', async () => {
    ;(window as Window & { xnovaStudio?: unknown }).xnovaStudio = createBridge({
      hostState: {
        workspacePath: 'D:/workspace/codex',
        lastSelection: null,
      },
      shellSnapshot: {
        startup: {
          recentProject: null,
          recentSession: null,
        },
        recentProjects: [],
        projectSessions: [],
        scratchpadEntries: [],
        defaults: {
          projectPath: 'D:/workspace/codex',
          branch: 'main',
          agentId: 'general',
          modelId: 'claude-sonnet-4-6',
          providerId: 'anthropic',
          recommendedMode: null,
          allowedModes: ['standard', 'xforge'],
        },
        issues: [],
        warnings: [],
      },
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('要在 codex 中构建什么？')).toBeTruthy()
    })
  })

  it('有最近项目和最近会话时恢复最近工作会话', async () => {
    ;(window as Window & { xnovaStudio?: unknown }).xnovaStudio = createBridge({
      hostState: {
        workspacePath: 'D:/workspace/demo',
        lastSelection: null,
      },
      shellSnapshot: {
        startup: {
          recentProject: {
            path: 'D:/workspace/demo',
            lastActiveAt: 10,
            exists: true,
          },
          recentSession: {
            projectPath: 'D:/workspace/demo',
            sessionId: 'session-1',
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
        projectSessions: [
          {
            sessionId: 'session-1',
            projectPath: 'D:/workspace/demo',
            title: '继续实现 project-aware shell',
            updatedAt: '2026-04-22T10:00:00.000Z',
            gitBranch: 'main',
            messageCount: 12,
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
          recommendedMode: 'xforge',
          allowedModes: ['standard', 'xforge'],
        },
        warnings: [],
      },
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('已恢复最近工作会话')).toBeTruthy()
    })

    expect(screen.getByText('已恢复最近工作状态。')).toBeTruthy()
    expect(screen.getByRole('heading', { name: '继续实现 project-aware shell' })).toBeTruthy()
    expect(screen.queryByText('从空白聊天开始')).toBeNull()
  })

  it('最近项目路径失效时降级到空白聊天页并给出可见反馈', async () => {
    ;(window as Window & { xnovaStudio?: unknown }).xnovaStudio = createBridge({
      shellSnapshot: {
        startup: {
          recentProject: {
            path: 'D:/workspace/missing',
            lastActiveAt: 10,
            exists: false,
          },
          recentSession: {
            projectPath: 'D:/workspace/missing',
            sessionId: 'session-1',
            valid: true,
          },
        },
        recentProjects: [],
        projectSessions: [],
        scratchpadEntries: [],
        defaults: {
          projectPath: null,
          branch: null,
          agentId: null,
          modelId: 'claude-sonnet-4-6',
          providerId: 'anthropic',
          recommendedMode: null,
          allowedModes: ['standard', 'xforge'],
        },
        warnings: [],
      },
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('最近项目路径已失效，已回退到空白聊天页。')).toBeTruthy()
    })

    expect(screen.getByText('最近工作偏好存在不可恢复项，已回退到项目推荐值。')).toBeTruthy()
    expect(screen.getByText('要开始什么项目？')).toBeTruthy()
  })

  it('project config 损坏时显示明确提示，不会静默吞掉 warning', async () => {
    ;(window as Window & { xnovaStudio?: unknown }).xnovaStudio = createBridge({
      hostState: {
        workspacePath: 'D:/workspace/demo',
        lastSelection: null,
      },
      shellSnapshot: {
        startup: {
          recentProject: null,
          recentSession: null,
        },
        recentProjects: [],
        projectSessions: [],
        scratchpadEntries: [],
        defaults: {
          projectPath: 'D:/workspace/demo',
          branch: 'main',
          agentId: 'general',
          modelId: 'claude-sonnet-4-6',
          providerId: 'anthropic',
          recommendedMode: null,
          allowedModes: ['standard', 'xforge'],
        },
        issues: [
          {
            code: 'project-config-error',
            severity: 'error',
            message: '当前项目配置存在错误，已回退到 user + builtin 默认。',
          },
        ],
        warnings: ['project.toml parse error at line 1:1 — invalid value'],
      },
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('当前项目配置存在错误，已回退到 user + builtin 默认。')).toBeTruthy()
    })
  })

  it('memory 降级态会在主工作流中显式提示，而不只停留在设置页', async () => {
    vi.useFakeTimers()
    ;(window as Window & { xnovaStudio?: unknown }).xnovaStudio = createBridge({
      memoryOverview: {
        enabled: true,
        status: 'bm25',
        statusMessage: 'Embedding 未完整配置，当前降级为 BM25 关键词检索。',
        embedding: {
          configured: false,
          dimension: null,
          missingFields: ['api_key', 'base_url', 'model'],
        },
        overview: {
          projectPath: 'D:/workspace/demo',
          globalEntries: 2,
          projectEntries: 1,
          vectorChunks: 0,
        },
        source: {},
        warnings: [],
      },
    })

    render(<App />)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(screen.queryByText('Embedding 未完整配置，当前降级为 BM25 关键词检索。')).toBeNull()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
      await Promise.resolve()
    })

    vi.useRealTimers()

    expect(screen.getByText('Embedding 未完整配置，当前降级为 BM25 关键词检索。')).toBeTruthy()
  })

  it('memory degraded 会提示索引待恢复，并给出重建建议', async () => {
    vi.useFakeTimers()
    ;(window as Window & { xnovaStudio?: unknown }).xnovaStudio = createBridge({
      memoryOverview: {
        enabled: true,
        status: 'degraded',
        statusMessage: 'Embedding 已配置，但向量索引未就绪，当前降级为 BM25 关键词检索。',
        embedding: {
          configured: true,
          dimension: null,
          missingFields: [],
        },
        overview: {
          projectPath: 'D:/workspace/demo',
          globalEntries: 2,
          projectEntries: 1,
          vectorChunks: 0,
        },
        source: {},
        warnings: [],
      },
    })

    render(<App />)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(screen.queryByText('建议尽快进入设置页重建 Memory 索引，恢复向量检索。')).toBeNull()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
      await Promise.resolve()
    })

    vi.useRealTimers()

    expect(screen.getByText('索引待恢复')).toBeTruthy()
    expect(
      screen.getByText('建议动作: 建议尽快进入设置页重建 Memory 索引，恢复向量检索。'),
    ).toBeTruthy()
  })

  it('subagent 停止并带有 partial result 时在主工作流中有明确反馈', async () => {
    ;(window as Window & { xnovaStudio?: unknown }).xnovaStudio = createBridge({
      runtimeEvent: {
        type: 'subagent_done',
        timestamp: '2026-04-23T00:00:00.000Z',
        agentId: 'agent-1',
        payload: {
          agentId: 'agent-1',
          output: JSON.stringify({
            status: 'stopped',
            partialResult: '已经扫描到 renderer/hooks 目录。',
          }),
        },
      },
      shellSnapshot: {
        startup: {
          recentProject: {
            path: 'D:/workspace/demo',
            lastActiveAt: 10,
            exists: true,
          },
          recentSession: {
            projectPath: 'D:/workspace/demo',
            sessionId: 'session-1',
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
        projectSessions: [
          {
            sessionId: 'session-1',
            projectPath: 'D:/workspace/demo',
            title: '继续实现 project-aware shell',
            updatedAt: '2026-04-22T10:00:00.000Z',
            gitBranch: 'main',
            messageCount: 12,
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
          recommendedMode: 'xforge',
          allowedModes: ['standard', 'xforge'],
        },
        issues: [],
        warnings: [],
      },
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('子 Agent 已停止，保留部分结果。')).toBeTruthy()
    })

    expect(screen.getByText('已经扫描到 renderer/hooks 目录。')).toBeTruthy()
  })

  it('bridge 初始缺失时会重试探测，并在后续注入后恢复 startup route', async () => {
    vi.useFakeTimers()

    render(<App />)

    expect(screen.getByText('宿主桥接不可用')).toBeTruthy()

    ;(window as Window & { xnovaStudio?: unknown }).xnovaStudio = createBridge({
      hostState: {
        workspacePath: 'D:/workspace/recovered',
        lastSelection: null,
      },
      shellSnapshot: {
        startup: {
          recentProject: {
            path: 'D:/workspace/recovered',
            lastActiveAt: 10,
            exists: true,
          },
          recentSession: {
            projectPath: 'D:/workspace/recovered',
            sessionId: 'session-1',
            valid: true,
          },
        },
        recentProjects: [
          {
            path: 'D:/workspace/recovered',
            name: 'recovered',
            lastActiveAt: 10,
            exists: true,
            gitBranch: 'main',
          },
        ],
        projectSessions: [
          {
            sessionId: 'session-1',
            projectPath: 'D:/workspace/recovered',
            title: '恢复中的会话',
            updatedAt: '2026-04-22T10:00:00.000Z',
            gitBranch: 'main',
            messageCount: 3,
            providerId: 'anthropic',
            modelId: 'claude-sonnet-4-6',
            subagents: [],
          },
        ],
        scratchpadEntries: [],
        defaults: {
          projectPath: 'D:/workspace/recovered',
          branch: 'main',
          agentId: 'general',
          modelId: 'claude-sonnet-4-6',
          providerId: 'anthropic',
          recommendedMode: null,
          allowedModes: ['standard', 'xforge'],
        },
        warnings: [],
      },
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(150)
    })

    vi.useRealTimers()

    await waitFor(() => {
      expect(screen.getByText('已恢复最近工作会话')).toBeTruthy()
    })
  })
})
