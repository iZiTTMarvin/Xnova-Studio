// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/renderer/App'
import type { StudioProviderSettingsSnapshot } from '../src/shared/studio-bridge-contract'

function clearBridge() {
  delete (window as Window & { xnovaStudio?: unknown }).xnovaStudio
}

function createProviderSnapshot(): StudioProviderSettingsSnapshot {
  return {
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
          models: ['claude-sonnet-4-6', 'claude-opus-4-6'],
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
      projectToml: 'D:/workspace/demo/.xnovacode/project.toml',
    },
    warnings: ['legacy migration retained'],
  }
}

function createBridge() {
  const settings = {
    getProviderSettings: vi.fn(async () => createProviderSnapshot()),
    saveProviderSettings: vi.fn(async (input: {
      defaultProvider: string
      defaultModel: string
      subAgentModel: string | null
      providers: StudioProviderSettingsSnapshot['editableConfig']['providers']
    }) => ({
      success: true as const,
      snapshot: {
        ...createProviderSnapshot(),
        editableConfig: {
          ...createProviderSnapshot().editableConfig,
          ...input,
        },
        effectiveDefaults: {
          defaultProvider: input.defaultProvider,
          defaultModel: input.defaultModel,
        },
      },
    })),
    testProviderConnection: vi.fn(async (input: {
      providerId: string
      config: { models: string[] }
    }) => ({
      success: true as const,
      providerId: input.providerId,
      model: input.config.models[0] ?? 'claude-sonnet-4-6',
      durationMs: 12,
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
    settings,
  }
}

afterEach(() => {
  cleanup()
  clearBridge()
  window.localStorage.clear()
})

describe('provider settings page', () => {
  it('从 settings bridge 回显 resolved provider/model，并保存 TOML 草稿', async () => {
    const bridge = createBridge()
    ;(window as Window & { xnovaStudio?: unknown }).xnovaStudio = bridge

    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: '设置' }))

    await waitFor(() => {
      expect(screen.getByLabelText('默认 Provider')).toBeTruthy()
    })

    expect((screen.getByLabelText('默认 Provider') as HTMLSelectElement).value).toBe('anthropic')
    expect((screen.getByLabelText('默认模型') as HTMLInputElement).value).toBe('claude-sonnet-4-6')
    expect(screen.getByText('legacy migration retained')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('默认模型'), {
      target: { value: 'claude-opus-4-6' },
    })
    fireEvent.click(screen.getByRole('button', { name: '保存 Provider 配置' }))

    await waitFor(() => {
      expect(bridge.settings.saveProviderSettings).toHaveBeenCalledTimes(1)
    })

    expect(bridge.settings.saveProviderSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultProvider: 'anthropic',
        defaultModel: 'claude-opus-4-6',
      }),
    )
  })

  it('支持新增 provider，并触发测试连接反馈', async () => {
    const bridge = createBridge()
    ;(window as Window & { xnovaStudio?: unknown }).xnovaStudio = bridge

    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: '设置' }))

    await waitFor(() => {
      expect(screen.getByLabelText('新增 Provider ID')).toBeTruthy()
    })

    fireEvent.change(screen.getByLabelText('新增 Provider ID'), {
      target: { value: 'deepseek' },
    })
    fireEvent.click(screen.getByRole('button', { name: '新增 Provider' }))

    expect(screen.getByRole('heading', { name: 'deepseek' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '测试 anthropic' }))

    await waitFor(() => {
      expect(bridge.settings.testProviderConnection).toHaveBeenCalledTimes(1)
    })

    expect(screen.getByText('✅ claude-sonnet-4-6 连通成功（12ms）')).toBeTruthy()
  })
})
