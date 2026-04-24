// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/renderer/App'
import type { StudioMcpOverviewSnapshot } from '../src/shared/studio-bridge-contract'

function clearBridge() {
  delete (window as Window & { xnovaStudio?: unknown }).xnovaStudio
}

function createMcpSnapshot(): StudioMcpOverviewSnapshot {
  return {
    status: 'failed',
    statusMessage: 'MCP 状态异常，至少一个 Server 连接失败。',
    writableConfigPath: 'C:/Users/demo/.xnovacode/.mcp.json',
    servers: [
      {
        name: 'mysql',
        transport: 'stdio',
        status: 'connected',
        source: 'C:/Users/demo/.xnovacode/.mcp.json',
        writable: true,
        toolCount: 4,
        toolNames: ['query', 'schema'],
      },
      {
        name: 'deepwiki',
        transport: 'http',
        status: 'failed',
        source: 'C:/Users/demo/.xnovacode/.mcp.json',
        writable: true,
        toolCount: 0,
        toolNames: [],
        error: 'connection refused',
      },
    ],
    warnings: [],
  }
}

function createBridge() {
  const mcp = {
    getOverview: vi.fn(async () => createMcpSnapshot()),
    addServer: vi.fn(async () => ({
      success: true as const,
      message: 'MCP Server 已添加。',
      snapshot: createMcpSnapshot(),
    })),
    deleteServer: vi.fn(async () => ({
      success: true as const,
      message: 'MCP Server 已删除。',
      snapshot: createMcpSnapshot(),
    })),
  }

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
    mcp,
  }
}

afterEach(() => {
  cleanup()
  clearBridge()
  window.localStorage.clear()
})

describe('mcp settings page', () => {
  it('在工具页显示 MCP 成功 / 失败信息与轻量管理入口', async () => {
    const bridge = createBridge()
    ;(window as Window & { xnovaStudio?: unknown }).xnovaStudio = bridge

    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: '工具' }))

    await waitFor(() => {
      expect(screen.getByText('MCP 状态异常，至少一个 Server 连接失败。')).toBeTruthy()
    })

    expect(screen.getByText('mysql')).toBeTruthy()
    expect(screen.getByText('deepwiki')).toBeTruthy()
    expect(screen.getByText('connection refused')).toBeTruthy()
    expect(screen.getByRole('button', { name: '管理 MCP Servers' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '删除 mysql' }))

    await waitFor(() => {
      expect(bridge.mcp.deleteServer).toHaveBeenCalledTimes(1)
    })
  })
})
