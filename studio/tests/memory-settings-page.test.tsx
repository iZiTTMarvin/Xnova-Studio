// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/renderer/App'
import type { StudioMemoryOverviewSnapshot } from '../src/shared/studio-bridge-contract'

function clearBridge() {
  delete (window as Window & { xnovaStudio?: unknown }).xnovaStudio
}

function createMemorySnapshot(): StudioMemoryOverviewSnapshot {
  return {
    enabled: true,
    status: 'bm25',
    statusMessage: 'Embedding 未完整配置，当前降级为 BM25 关键词检索。',
    embedding: {
      configured: false,
      dimension: null,
      missingFields: ['api_key', 'base_url', 'model'],
    },
    overview: {
      projectPath: 'D:/workspace/demo',
      globalEntries: 2,
      projectEntries: 1,
      vectorChunks: 0,
    },
    source: {
      userToml: 'C:/Users/demo/.xnovacode/config.toml',
    },
    warnings: [],
  }
}

function createBridge() {
  const memory = {
    getOverview: vi.fn(async () => createMemorySnapshot()),
    rebuild: vi.fn(async () => ({
      success: true as const,
      message: 'Memory 索引已完成重建。',
      snapshot: {
        ...createMemorySnapshot(),
        status: 'ready' as const,
        statusMessage: 'Embedding 已就绪。',
        embedding: {
          configured: true,
          dimension: 1536,
          missingFields: [],
        },
        overview: {
          ...createMemorySnapshot().overview,
          vectorChunks: 4,
        },
      },
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
          providers: [
            {
              id: 'anthropic',
              apiKey: 'sk-ant',
              baseURL: null,
              protocol: 'anthropic',
              models: ['claude-sonnet-4-6'],
              visionModels: [],
            },
          ],
        },
        effectiveDefaults: {
          defaultProvider: 'anthropic',
          defaultModel: 'claude-sonnet-4-6',
        },
        source: {
          userToml: 'C:/Users/demo/.xnovacode/config.toml',
        },
        warnings: [],
      })),
      saveProviderSettings: vi.fn(async () => ({
        success: true as const,
      })),
      testProviderConnection: vi.fn(async () => ({
        success: true as const,
        providerId: 'anthropic',
        model: 'claude-sonnet-4-6',
        durationMs: 12,
      })),
    },
    memory,
  }
}

afterEach(() => {
  cleanup()
  clearBridge()
  window.localStorage.clear()
})

describe('memory settings page', () => {
  it('在设置页显示 memory 降级状态与全局 / 项目概览，并支持 rebuild 入口', async () => {
    const bridge = createBridge()
    ;(window as Window & { xnovaStudio?: unknown }).xnovaStudio = bridge

    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: '设置' }))

    await waitFor(() => {
      expect(screen.getByText('Embedding 未完整配置，当前降级为 BM25 关键词检索。')).toBeTruthy()
    })

    expect(screen.getByText('全局记忆')).toBeTruthy()
    expect(screen.getByText('项目记忆')).toBeTruthy()
    expect(screen.getByText('向量 chunk')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '重建 Memory 索引' }))

    await waitFor(() => {
      expect(bridge.memory.rebuild).toHaveBeenCalledTimes(1)
    })

    expect(screen.getByText('Memory 索引已完成重建。')).toBeTruthy()
  })
})
