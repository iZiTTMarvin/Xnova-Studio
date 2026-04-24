import { describe, expect, it, vi } from 'vitest'
import { registerStudioMainIpcHandlers } from '../src/main/studio-ipc'
import {
  STUDIO_BRIDGE_CHANNELS,
  type StudioShellSnapshot,
} from '../src/shared/studio-bridge-contract'

describe('studio ipc runtime submit provider bridge', () => {
  it('会把 providerId 一起转发给 main runtime submit', async () => {
    const handlers = new Map<string, (_event: unknown, payload: unknown) => unknown>()
    const submitRuntime = vi.fn(async () => ({
      ok: true as const,
      sessionId: 'session-9',
    }))
    const shellSnapshot: StudioShellSnapshot = {
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
      issues: [],
      warnings: [],
    }

    registerStudioMainIpcHandlers({
      ipcMainLike: {
        handle(channel, handler) {
          handlers.set(channel, handler)
        },
      },
      selectWorkspaceDirectory: vi.fn(async () => ({
        ok: true as const,
        code: 'selected' as const,
        path: 'D:/workspace/demo',
      })),
      mainWindowManager: {
        getMainWindow: () => null,
      },
      inspectRuntime: vi.fn(),
      submitRuntime,
      inspectShell: vi.fn(async () => shellSnapshot),
      logger: {
        info: vi.fn(),
        error: vi.fn(),
      },
    })

    const openWorkspaceHandler = handlers.get(STUDIO_BRIDGE_CHANNELS.hostOpenWorkspace)
    await Promise.resolve(openWorkspaceHandler?.({}, undefined))

    const runtimeSubmitHandler = handlers.get(STUDIO_BRIDGE_CHANNELS.runtimeSubmit)
    await expect(
      Promise.resolve(
        runtimeSubmitHandler?.({}, {
          text: '继续当前项目',
          projectPath: 'D:/workspace/demo',
          providerId: 'openai',
          modelId: 'gpt-4.1-mini',
        }),
      ),
    ).resolves.toEqual({
      ok: true,
      sessionId: 'session-9',
    })

    expect(submitRuntime).toHaveBeenCalledWith(
      {
        text: '继续当前项目',
        projectPath: 'D:/workspace/demo',
        providerId: 'openai',
        modelId: 'gpt-4.1-mini',
      },
      {
        workspacePath: 'D:/workspace/demo',
        lastSelection: {
          ok: true,
          code: 'selected',
          path: 'D:/workspace/demo',
        },
      },
      expect.any(Function),
    )
  })
})
