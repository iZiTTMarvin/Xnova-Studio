import { describe, expect, it, vi } from 'vitest'
import { registerStudioMainIpcHandlers } from '../src/main/studio-ipc'
import {
  STUDIO_BRIDGE_CHANNELS,
  type StudioSkillsPluginsOverviewSnapshot,
} from '../src/shared/studio-bridge-contract'

function createLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }
}

function createOverview(): StudioSkillsPluginsOverviewSnapshot {
  return {
    status: 'ready',
    statusMessage: 'Skills / Plugins 状态已加载。',
    sourceDistribution: [
      { source: 'builtin', count: 1 },
      { source: 'plugin', count: 1 },
    ],
    recentSkills: [
      {
        name: 'repo-plugin:deploy',
        source: 'plugin',
        lastUsedAt: '2026-04-23T10:00:00.000Z',
      },
    ],
    frequentSkills: [
      {
        name: 'commit',
        source: 'builtin',
        useCount: 2,
      },
    ],
    plugins: [
      {
        name: 'repo-plugin',
        source: 'xnova',
        version: '1.0.0',
        skillCount: 2,
        hasHooks: true,
        description: 'deploy helpers',
      },
    ],
    warnings: [],
  }
}

describe('studio skills/plugins main ipc handlers', () => {
  it('通过 main process 委托 Skills / Plugins 概览', async () => {
    const handlers = new Map<string, (_event: unknown, payload: unknown) => unknown>()
    const getSkillsPluginsOverview = vi.fn(async () => createOverview())

    registerStudioMainIpcHandlers({
      ipcMainLike: {
        handle(channel, handler) {
          handlers.set(channel, handler)
        },
      },
      selectWorkspaceDirectory: vi.fn(async () => ({
        ok: false as const,
        code: 'cancelled' as const,
        message: '用户取消了 workspace 目录选择',
      })),
      mainWindowManager: {
        getMainWindow: () => null,
      },
      inspectRuntime: vi.fn(),
      inspectShell: vi.fn(),
      getProviderSettings: vi.fn(),
      saveProviderSettings: vi.fn(),
      testProviderConnection: vi.fn(),
      getMemoryOverview: vi.fn(),
      rebuildMemory: vi.fn(),
      getMcpOverview: vi.fn(),
      addMcpServer: vi.fn(),
      deleteMcpServer: vi.fn(),
      getSkillsPluginsOverview,
      logger: createLogger(),
    })

    await expect(
      Promise.resolve(
        handlers.get(STUDIO_BRIDGE_CHANNELS.skillsPluginsGetOverview)?.({}, undefined),
      ),
    ).resolves.toEqual(createOverview())
  })
})
