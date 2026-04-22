// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/renderer/App'

function clearBridge() {
  delete (window as Window & { xnovaStudio?: unknown }).xnovaStudio
}

afterEach(() => {
  vi.useRealTimers()
  clearBridge()
  cleanup()
})

describe('renderer minimal shell', () => {
  it('bridge 缺失时展示 disabled 态并禁用交互按钮', () => {
    clearBridge()

    render(<App />)

    expect(screen.getAllByText('宿主桥接不可用').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: '打开 Workspace' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: '检查 Runtime' }).hasAttribute('disabled')).toBe(true)
  })

  it('加载 host state 后展示空态，并支持打开 workspace 与 runtime inspect', async () => {
    const getState = vi.fn(async () => ({
      workspacePath: null,
      lastSelection: null,
    }))
    const openWorkspace = vi.fn(async () => ({
      selection: {
        ok: true as const,
        code: 'selected' as const,
        path: 'D:/workspace/demo',
      },
      state: {
        workspacePath: 'D:/workspace/demo',
        lastSelection: {
          ok: true as const,
          code: 'selected' as const,
          path: 'D:/workspace/demo',
        },
      },
    }))
    const inspect = vi.fn(async () => ({
      ok: true as const,
      snapshot: {
        sessionId: null,
        isRunning: false,
        provider: 'anthropic',
        model: 'claude-sonnet-4-6',
        warnings: [],
      },
      workspacePath: 'D:/workspace/demo',
      configWarnings: [],
    }))

    ;(window as Window & {
      xnovaStudio?: {
        host: {
          getState: typeof getState
          openWorkspace: typeof openWorkspace
          onStateChanged: (listener: (state: unknown) => void) => () => void
        }
        runtime: {
          inspect: typeof inspect
          onEvent: (listener: (event: unknown) => void) => () => void
        }
      }
    }).xnovaStudio = {
      host: {
        getState,
        openWorkspace,
        onStateChanged: () => () => {},
      },
      runtime: {
        inspect,
        onEvent: () => () => {},
      },
    }

    render(<App />)

    await waitFor(() => {
      expect(screen.getAllByText('尚未选择 Workspace').length).toBeGreaterThan(0)
    })

    fireEvent.click(screen.getByRole('button', { name: '打开 Workspace' }))
    await screen.findByText('D:/workspace/demo')

    fireEvent.click(screen.getByRole('button', { name: '检查 Runtime' }))

    await waitFor(() => {
      expect(inspect).toHaveBeenCalledWith({
        refresh: true,
      })
    })
    expect(screen.getByText('anthropic / claude-sonnet-4-6')).toBeTruthy()
  })

  it('bridge 初始缺失时会重试探测并在后续注入后恢复为 ready', async () => {
    vi.useFakeTimers()

    const getState = vi.fn(async () => ({
      workspacePath: 'D:/workspace/recovered',
      lastSelection: null,
    }))

    render(<App />)

    expect(screen.getAllByText('宿主桥接不可用').length).toBeGreaterThan(0)

    ;(window as Window & {
      xnovaStudio?: {
        host: {
          getState: typeof getState
          openWorkspace: () => Promise<unknown>
          onStateChanged: (listener: (state: unknown) => void) => () => void
        }
        runtime: {
          inspect: () => Promise<unknown>
          onEvent: (listener: (event: unknown) => void) => () => void
        }
      }
    }).xnovaStudio = {
      host: {
        getState,
        openWorkspace: async () => ({
          selection: {
            ok: false as const,
            code: 'cancelled' as const,
            message: '用户取消了 workspace 目录选择',
          },
          state: {
            workspacePath: 'D:/workspace/recovered',
            lastSelection: null,
          },
        }),
        onStateChanged: () => () => {},
      },
      runtime: {
        inspect: async () => ({
          ok: false as const,
          error: 'not called',
          workspacePath: 'D:/workspace/recovered',
          configWarnings: [],
        }),
        onEvent: () => () => {},
      },
    }

    await act(async () => {
      await vi.advanceTimersByTimeAsync(150)
    })
    await act(async () => {
      await Promise.resolve()
    })

    expect(screen.getByText('D:/workspace/recovered')).toBeTruthy()
  })
})
