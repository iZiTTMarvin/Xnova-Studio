// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
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
  shellSnapshot?: unknown
}) {
  const getState = vi.fn(async () => ({
    workspacePath: null,
    lastSelection: null,
    ...(options?.hostState ?? {}),
  }))

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
    runtime: {
      inspect: vi.fn(async () => ({
        ok: true as const,
        snapshot: {
          sessionId: null,
          isRunning: false,
          provider: 'anthropic',
          model: 'claude-sonnet-4-6',
          warnings: [],
        },
        workspacePath: options?.hostState?.workspacePath ?? null,
        configWarnings: [],
      })),
      onEvent: () => () => {},
    },
    shell: {
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
        },
        warnings: [],
      }),
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
    expect(screen.getByText('开始一个新项目')).toBeTruthy()
    expect(screen.queryByText('Overview')).toBeNull()
  })

  it('没有最近项目时默认进入空白聊天页，而不是 Overview', async () => {
    ;(window as Window & { xnovaStudio?: unknown }).xnovaStudio = createBridge()

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('从空白聊天开始')).toBeTruthy()
    })

    expect(screen.getByText('继续一个已有项目')).toBeTruthy()
    expect(screen.getByText('分析当前项目结构')).toBeTruthy()
    expect(screen.queryByText('Overview')).toBeNull()
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

    expect(screen.getByText('从空白聊天开始')).toBeTruthy()
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
