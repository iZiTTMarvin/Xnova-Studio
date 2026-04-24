// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { App } from '../src/renderer/App'
import { resolveModeSelection } from '../src/renderer/utils/mode-resolver'
import { writeProjectWorkPreference } from '../src/renderer/utils/work-preferences'

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
            providerId: 'openai',
            modelId: 'gpt-4o',
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
          availablePrimaryAgentIds: ['general', 'planner'],
          availableModelIds: ['claude-sonnet-4-6', 'gpt-4o'],
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

  it('顶部存在唯一的 标准模式 / XForge 切换入口，且切换 mode 不清空项目 / 会话', async () => {
    writeProjectWorkPreference('D:/workspace/demo', {
      mode: 'xforge',
    })

    ;(window as Window & { xnovaStudio?: unknown }).xnovaStudio = createBridge()

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('已恢复最近工作会话')).toBeTruthy()
    })

    expect(screen.getAllByRole('button', { name: '标准模式' })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'XForge' })).toHaveLength(1)
    expect(screen.getByRole('heading', { name: '继续实现 project-aware shell' })).toBeTruthy()
    expect(screen.getAllByText('D:/workspace/demo').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: '标准模式' }))

    expect(screen.getByRole('heading', { name: '继续实现 project-aware shell' })).toBeTruthy()
    expect(screen.getAllByText('D:/workspace/demo').length).toBeGreaterThan(0)
  })

  it('最近工作偏好可跨重启恢复，并支持一键回到项目推荐值', async () => {
    writeProjectWorkPreference('D:/workspace/demo', {
      sessionId: 'session-1',
      mode: 'standard',
      agentId: 'planner',
      modelId: 'gpt-4o',
    })

    ;(window as Window & { xnovaStudio?: unknown }).xnovaStudio = createBridge()

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('已恢复最近工作状态。')).toBeTruthy()
    })

    expect(screen.getAllByText('planner').length).toBeGreaterThan(0)
    expect(screen.getAllByText('gpt-4o').length).toBeGreaterThan(0)
    expect(
      screen.getByRole('button', { name: '回到项目推荐值' }).hasAttribute('disabled'),
    ).toBe(false)
    expect(
      screen.getByRole('button', { name: '标准模式' }).getAttribute('aria-pressed'),
    ).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: '回到项目推荐值' }))

    await waitFor(() => {
      expect(screen.getByText('已回到项目推荐值。')).toBeTruthy()
    })

    expect(screen.getAllByText('general').length).toBeGreaterThan(0)
    expect(screen.getAllByText('claude-sonnet-4-6').length).toBeGreaterThan(0)
    expect(
      screen.getByRole('button', { name: 'XForge' }).getAttribute('aria-pressed'),
    ).toBe('true')
  })
})
