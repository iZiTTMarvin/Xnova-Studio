// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { App } from '../src/renderer/App'
import { resolveModeSelection } from '../src/renderer/utils/mode-resolver'

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  delete (window as Window & { xnovaStudio?: unknown }).xnovaStudio
})

function createBridge() {
  return {
    host: {
      getState: async () => ({
        workspacePath: 'D:/workspace/demo',
        lastSelection: null,
      }),
      openWorkspace: async () => ({
        selection: {
          ok: true as const,
          code: 'selected' as const,
          path: 'D:/workspace/demo',
        },
        state: {
          workspacePath: 'D:/workspace/demo',
          lastSelection: null,
        },
      }),
      onStateChanged: () => () => {},
    },
    runtime: {
      inspect: async () => ({
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
      }),
      onEvent: () => () => {},
    },
    shell: {
      getSnapshot: async () => ({
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
          recommendedMode: 'xforge' as const,
          allowedModes: ['standard', 'xforge'] as const,
        },
        warnings: [],
      }),
    },
  }
}

describe('mode switch and recovery', () => {
  it('mode 恢复优先级为：最近选择 > project 推荐 > builtin fallback', () => {
    expect(
      resolveModeSelection({
        recentMode: 'standard',
        recommendedMode: 'xforge',
        allowedModes: ['standard', 'xforge'],
      }),
    ).toBe('standard')

    expect(
      resolveModeSelection({
        recentMode: null,
        recommendedMode: 'xforge',
        allowedModes: ['standard', 'xforge'],
      }),
    ).toBe('xforge')

    expect(
      resolveModeSelection({
        recentMode: null,
        recommendedMode: null,
        allowedModes: ['standard'],
      }),
    ).toBe('standard')
  })

  it('顶部存在唯一的 Standard / XForge 切换入口，且切换 mode 不清空项目 / 会话', async () => {
    window.localStorage.setItem(
      'xnova.studio.project-mode.v1',
      JSON.stringify({
        'D:/workspace/demo': 'xforge',
      }),
    )

    ;(window as Window & { xnovaStudio?: unknown }).xnovaStudio = createBridge()

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('已恢复最近工作会话')).toBeTruthy()
    })

    expect(screen.getAllByRole('button', { name: 'Standard' })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'XForge' })).toHaveLength(1)
    expect(screen.getByRole('heading', { name: '继续实现 project-aware shell' })).toBeTruthy()
    expect(screen.getAllByText('D:/workspace/demo').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'Standard' }))

    expect(screen.getByRole('heading', { name: '继续实现 project-aware shell' })).toBeTruthy()
    expect(screen.getAllByText('D:/workspace/demo').length).toBeGreaterThan(0)
  })
})
