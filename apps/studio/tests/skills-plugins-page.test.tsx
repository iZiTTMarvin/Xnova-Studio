// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/renderer/App'
import type { StudioSkillsPluginsOverviewSnapshot } from '../src/shared/studio-bridge-contract'

function clearBridge() {
  delete (window as Window & { xnovaStudio?: unknown }).xnovaStudio
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

function createBridge() {
  return {
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
      inspect: vi.fn(async () => ({
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
      })),
      onEvent: () => () => {},
    },
    shell: {
      getSnapshot: vi.fn(async () => ({
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
        warnings: [],
      })),
    },
    settings: {
      getProviderSettings: vi.fn(async () => ({
        editableConfig: {
          defaultProvider: 'anthropic',
          defaultModel: 'claude-sonnet-4-6',
          subAgentModel: null,
          providers: [],
        },
        effectiveDefaults: {
          defaultProvider: 'anthropic',
          defaultModel: 'claude-sonnet-4-6',
        },
        source: {},
        warnings: [],
      })),
      saveProviderSettings: vi.fn(async () => ({
        success: true as const,
        snapshot: {
          editableConfig: {
            defaultProvider: 'anthropic',
            defaultModel: 'claude-sonnet-4-6',
            subAgentModel: null,
            providers: [],
          },
          effectiveDefaults: {
            defaultProvider: 'anthropic',
            defaultModel: 'claude-sonnet-4-6',
          },
          source: {},
          warnings: [],
        },
      })),
      testProviderConnection: vi.fn(async () => ({
        success: true as const,
        providerId: 'anthropic',
        model: 'claude-sonnet-4-6',
        durationMs: 12,
      })),
    },
    memory: {
      getOverview: vi.fn(async () => ({
        enabled: false,
        status: 'disabled' as const,
        statusMessage: 'Memory 当前未启用。',
        embedding: {
          configured: false,
          dimension: null,
          missingFields: [],
        },
        overview: {
          projectPath: 'D:/workspace/demo',
          globalEntries: 0,
          projectEntries: 0,
          vectorChunks: 0,
        },
        source: {},
        warnings: [],
      })),
      rebuild: vi.fn(async () => ({
        success: false as const,
        message: 'Memory 未启用，无法重建索引。',
      })),
    },
    mcp: {
      getOverview: vi.fn(async () => ({
        status: 'unconfigured' as const,
        statusMessage: '尚未配置 MCP Server。',
        writableConfigPath: 'C:/Users/demo/.xnovacode/.mcp.json',
        servers: [],
        warnings: [],
      })),
      addServer: vi.fn(async () => ({
        success: true as const,
        message: 'MCP Server 已添加。',
      })),
      deleteServer: vi.fn(async () => ({
        success: true as const,
        message: 'MCP Server 已删除。',
      })),
    },
    skillsPlugins: {
      getOverview: vi.fn(async () => createOverview()),
    },
  }
}

afterEach(() => {
  cleanup()
  clearBridge()
  window.localStorage.clear()
})

describe('skills/plugins tools page', () => {
  it('显示来源分布、最近 / 常用 skill 和轻量管理入口', async () => {
    const bridge = createBridge()
    ;(window as Window & { xnovaStudio?: unknown }).xnovaStudio = bridge

    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: '工具' }))

    await waitFor(() => {
      expect(screen.getByText('Skills / Plugins 状态已加载。')).toBeTruthy()
    })

    expect(screen.getByText('builtin')).toBeTruthy()
    expect(screen.getAllByText('plugin').length).toBeGreaterThan(0)
    expect(screen.getByText('repo-plugin:deploy')).toBeTruthy()
    expect(screen.getByText('commit')).toBeTruthy()
    expect(screen.getByRole('button', { name: '管理 Skills / Plugins' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '管理 Skills / Plugins' }))

    expect(screen.getByText('repo-plugin')).toBeTruthy()
  })
})
