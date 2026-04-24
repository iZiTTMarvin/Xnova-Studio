import { describe, expect, it, vi } from 'vitest'
import { createStudioBridgeApi } from '../src/preload/studio-bridge-api'
import {
  STUDIO_BRIDGE_CHANNELS,
  type StudioProviderSettingsSnapshot,
} from '../src/shared/studio-bridge-contract'

class FakeIpcRenderer {
  readonly invoke = vi.fn(async (channel: string, payload?: unknown) => {
    if (channel === STUDIO_BRIDGE_CHANNELS.settingsGetProviderSettings) {
      return createProviderSnapshot()
    }

    if (channel === STUDIO_BRIDGE_CHANNELS.settingsSaveProviderSettings) {
      return {
        success: true,
        snapshot: {
          ...createProviderSnapshot(),
          editableConfig: {
            ...createProviderSnapshot().editableConfig,
            ...payload as Record<string, unknown>,
          },
          effectiveDefaults: {
            defaultProvider: (payload as { defaultProvider: string }).defaultProvider,
            defaultModel: (payload as { defaultModel: string }).defaultModel,
          },
        },
      }
    }

    if (channel === STUDIO_BRIDGE_CHANNELS.settingsTestProviderConnection) {
      return {
        success: true,
        providerId: (payload as { providerId: string }).providerId,
        model: 'claude-sonnet-4-6',
        durationMs: 18,
      }
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

describe('studio provider settings preload bridge', () => {
  it('通过 IPC 读取 provider settings，并校验保存与测试连通性 payload', async () => {
    const ipcRenderer = new FakeIpcRenderer()
    const api = createStudioBridgeApi({
      ipcRenderer,
    })

    await expect(api.settings.getProviderSettings()).resolves.toEqual(
      createProviderSnapshot(),
    )

    await expect(
      api.settings.saveProviderSettings({
        defaultProvider: 'anthropic',
        defaultModel: 'claude-opus-4-6',
        subAgentModel: null,
        providers: createProviderSnapshot().editableConfig.providers,
      }),
    ).resolves.toEqual({
      success: true,
      snapshot: expect.objectContaining({
        effectiveDefaults: {
          defaultProvider: 'anthropic',
          defaultModel: 'claude-opus-4-6',
        },
      }),
    })

    expect(ipcRenderer.invoke).toHaveBeenCalledWith(
      STUDIO_BRIDGE_CHANNELS.settingsSaveProviderSettings,
      expect.objectContaining({
        defaultProvider: 'anthropic',
        defaultModel: 'claude-opus-4-6',
      }),
    )

    await expect(
      api.settings.testProviderConnection({
        providerId: 'anthropic',
        config: createProviderSnapshot().editableConfig.providers[0]!,
      }),
    ).resolves.toEqual({
      success: true,
      providerId: 'anthropic',
      model: 'claude-sonnet-4-6',
      durationMs: 18,
    })

    await expect(
      (api.settings.saveProviderSettings as (payload: unknown) => Promise<unknown>)({
        defaultProvider: 123,
      }),
    ).rejects.toThrow('settings.saveProviderSettings.defaultProvider 必须是字符串')
  })
})
