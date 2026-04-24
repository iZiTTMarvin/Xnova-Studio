// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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

  return (
    <div>
      <button onClick={() => void bridgeState.submitPrompt('  分析当前项目结构  ')}>
        提交
      </button>
      <div data-testid="shell-status">{bridgeState.shellStatus}</div>
      <div data-testid="submitting">{bridgeState.isSubmitting ? 'yes' : 'no'}</div>
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
})
