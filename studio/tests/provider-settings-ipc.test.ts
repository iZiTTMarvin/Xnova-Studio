import { describe, expect, it, vi } from 'vitest'
import { registerStudioMainIpcHandlers } from '../src/main/studio-ipc'
import {
  STUDIO_BRIDGE_CHANNELS,
  type StudioProviderSettingsSnapshot,
} from '../src/shared/studio-bridge-contract'

function createLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }
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
  }
}

describe('studio provider settings main ipc handlers', () => {
  it('通过 main process 委托 provider settings 读取、保存与测试', async () => {
    const handlers = new Map<string, (_event: unknown, payload: unknown) => unknown>()
    const getProviderSettings = vi.fn(async () => createProviderSnapshot())
    const saveProviderSettings = vi.fn(async () => ({
      success: true,
      snapshot: createProviderSnapshot(),
    }))
    const testProviderConnection = vi.fn(async () => ({
      success: true,
      providerId: 'anthropic',
      model: 'claude-sonnet-4-6',
      durationMs: 18,
    }))

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
      getProviderSettings,
      saveProviderSettings,
      testProviderConnection,
      logger: createLogger(),
    })

    await expect(
      Promise.resolve(
        handlers.get(STUDIO_BRIDGE_CHANNELS.settingsGetProviderSettings)?.({}, undefined),
      ),
    ).resolves.toEqual(createProviderSnapshot())

    await expect(
      Promise.resolve(
        handlers.get(STUDIO_BRIDGE_CHANNELS.settingsSaveProviderSettings)?.({}, {
          defaultProvider: 'anthropic',
          defaultModel: 'claude-sonnet-4-6',
          subAgentModel: null,
          providers: createProviderSnapshot().editableConfig.providers,
        }),
      ),
    ).resolves.toEqual({
      success: true,
      snapshot: createProviderSnapshot(),
    })

    await expect(
      Promise.resolve(
        handlers.get(STUDIO_BRIDGE_CHANNELS.settingsTestProviderConnection)?.({}, {
          providerId: 'anthropic',
          config: createProviderSnapshot().editableConfig.providers[0],
        }),
      ),
    ).resolves.toEqual({
      success: true,
      providerId: 'anthropic',
      model: 'claude-sonnet-4-6',
      durationMs: 18,
    })

    await expect(
      Promise.resolve(
        handlers.get(STUDIO_BRIDGE_CHANNELS.settingsSaveProviderSettings)?.({}, {
          defaultProvider: 123,
        }),
      ),
    ).rejects.toThrow('studio.settings.saveProviderSettings.defaultProvider 必须是字符串')
  })
})
