import { describe, expect, it, vi } from 'vitest'
import { createStudioBridgeApi } from '../src/preload/studio-bridge-api'
import {
  STUDIO_BRIDGE_CHANNELS,
  type StudioSkillsPluginsOverviewSnapshot,
} from '../src/shared/studio-bridge-contract'

class FakeIpcRenderer {
  readonly invoke = vi.fn(async (channel: string) => {
    if (channel === STUDIO_BRIDGE_CHANNELS.skillsPluginsGetOverview) {
      return createOverview()
    }

    throw new Error(`unexpected channel: ${channel}`)
  })

  on(): this {
    return this
  }

  removeListener(): this {
    return this
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

describe('studio skills/plugins preload bridge', () => {
  it('通过 IPC 读取 Skills / Plugins 概览', async () => {
    const api = createStudioBridgeApi({
      ipcRenderer: new FakeIpcRenderer(),
    })

    await expect(api.skillsPlugins.getOverview()).resolves.toEqual(createOverview())
  })
})
