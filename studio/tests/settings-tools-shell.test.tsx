// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/renderer/App'
import type { RuntimeInspectResult, StudioShellSnapshot } from '../src/shared/studio-bridge-contract'

function clearBridge() {
  delete (window as Window & { xnovaStudio?: unknown }).xnovaStudio
}

function createShellSnapshot(
  overrides?: Partial<StudioShellSnapshot>,
): StudioShellSnapshot {
  return {
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
    issues: [],
    warnings: [],
    ...overrides,
  }
}

function createBridge(options?: {
  hostState?: {
    workspacePath: string | null
    lastSelection: null
  }
  shellSnapshot?: StudioShellSnapshot
  runtimeInspectResult?: RuntimeInspectResult
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
      onEvent: () => () => {},
    },
    shell: {
      getSnapshot: vi.fn(async () => options?.shellSnapshot ?? createShellSnapshot()),
    },
  }
}

afterEach(() => {
  clearBridge()
  cleanup()
  window.localStorage.clear()
})

describe('settings and tools shell integration', () => {
  it('bridge 可用但 runtime 仅 not-ready 时，设置页显示全局空态而不是宿主桥接不可用', async () => {
    ;(window as Window & { xnovaStudio?: unknown }).xnovaStudio = createBridge({
      runtimeInspectResult: {
        ok: true,
        status: 'not-ready',
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
      expect(screen.getByText('要开始什么项目？')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: '设置' }))

    await waitFor(() => {
      expect(screen.getByText('尚未绑定 Workspace，当前只展示全局设置骨架。')).toBeTruthy()
    })

    expect(
      screen.queryByText('当前宿主桥接不可用，设置能力暂时不可读取。'),
    ).toBeNull()
  })

  it('在主壳中进入设置页骨架，并显示全局空态与后续 section 容器', async () => {
    ;(window as Window & { xnovaStudio?: unknown }).xnovaStudio = createBridge()

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('要开始什么项目？')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: '设置' }))

    expect(screen.getByRole('heading', { name: '设置与配置' })).toBeTruthy()
    expect(screen.getByText('尚未绑定 Workspace，当前只展示全局设置骨架。')).toBeTruthy()
    expect(screen.getByText('Provider 与模型')).toBeTruthy()
    expect(screen.getByText('Memory')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '标准模式' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'XForge' })).toBeNull()
  })

  it('宿主缺失时工具页显示 disabled 状态，且不渲染项目工作页专属 mode 入口', () => {
    clearBridge()

    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: '工具' }))

    expect(screen.getByRole('heading', { name: '工具状态与管理入口' })).toBeTruthy()
    expect(screen.getByText('当前宿主桥接不可用，工具状态暂时不可读取。')).toBeTruthy()
    expect(screen.getByText('MCP 状态')).toBeTruthy()
    expect(screen.getByText('Skills / Plugins')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '标准模式' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'XForge' })).toBeNull()
  })

  it('运行时读取失败时工具页给出可见错误，而不是静默失败', async () => {
    ;(window as Window & { xnovaStudio?: unknown }).xnovaStudio = createBridge({
      hostState: {
        workspacePath: 'D:/workspace/demo',
        lastSelection: null,
      },
      shellSnapshot: createShellSnapshot({
        defaults: {
          projectPath: 'D:/workspace/demo',
          branch: 'main',
          agentId: 'general',
          modelId: 'claude-sonnet-4-6',
          providerId: 'anthropic',
          recommendedMode: 'standard',
          allowedModes: ['standard', 'xforge'],
        },
      }),
      runtimeInspectResult: {
        ok: false,
        status: 'error',
        error: 'runtime service down',
        workspacePath: 'D:/workspace/demo',
        configWarnings: ['memory degraded'],
        issues: [],
      },
    })

    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: '工具' }))

    await waitFor(() => {
      expect(screen.getByText('运行时状态读取失败：runtime service down')).toBeTruthy()
    })

    expect(screen.getByText('memory degraded')).toBeTruthy()
  })
})
