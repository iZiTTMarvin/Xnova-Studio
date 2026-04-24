// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StudioSettingsDialog } from '../src/renderer/components/StudioSettingsDialog'
import type {
  StudioProviderSettingsSaveInput,
  StudioProviderSettingsSnapshot,
  StudioSettingsApi,
} from '../src/shared/studio-bridge-contract'

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
      projectToml: 'D:/workspace/demo/.xnovacode/project.toml',
    },
    warnings: [],
  }
}

function createSettingsApi(): StudioSettingsApi {
  return {
    getProviderSettings: vi.fn(async () => createProviderSnapshot()),
    saveProviderSettings: vi.fn(async (input: StudioProviderSettingsSaveInput) => ({
      success: true,
      snapshot: {
        ...createProviderSnapshot(),
        editableConfig: {
          ...input,
          subAgentModel: input.subAgentModel ?? null,
        },
        effectiveDefaults: {
          defaultProvider: input.defaultProvider,
          defaultModel: input.defaultModel,
        },
      },
    })),
    testProviderConnection: vi.fn(async (input) => ({
      success: true,
      providerId: input.providerId,
      model: input.model ?? 'claude-sonnet-4-6',
      durationMs: 12,
    })),
  }
}

afterEach(() => {
  cleanup()
})

describe('provider settings dialog', () => {
  it('模型服务支持添加平台、编辑配置、模型管理、测试连接与保存', async () => {
    const settingsApi = createSettingsApi()

    render(
      <StudioSettingsDialog
        open
        onClose={vi.fn()}
        settingsApi={settingsApi}
        memoryApi={null}
        workspacePath="D:/workspace/demo"
      />,
    )

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '模型服务' })).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: '添加平台' }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '添加平台' })).toBeTruthy()
    })

    const addDialog = screen.getByRole('dialog', { name: '添加平台' })
    const platformTypeSelect = within(addDialog).getByLabelText('平台类型') as HTMLSelectElement
    const typeLabels = Array.from(platformTypeSelect.options).map((option) => option.textContent)
    expect(typeLabels).toEqual(['openai compatible', 'anthropic compatible'])

    fireEvent.change(within(addDialog).getByLabelText('平台名称'), {
      target: { value: 'openrouter' },
    })
    fireEvent.change(platformTypeSelect, {
      target: { value: 'openai' },
    })
    fireEvent.click(screen.getByRole('button', { name: '确认添加' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /openrouter/ })).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /openrouter/ }))
    fireEvent.change(screen.getByLabelText('当前平台名称'), {
      target: { value: 'openrouter-prod' },
    })
    fireEvent.click(screen.getByRole('button', { name: '应用名称' }))
    fireEvent.change(screen.getByLabelText('API 密钥'), {
      target: { value: 'sk-openrouter' },
    })
    fireEvent.change(screen.getByLabelText('API 地址'), {
      target: { value: 'https://openrouter.ai/api/v1' },
    })

    fireEvent.click(screen.getByRole('button', { name: '添加模型' }))
    fireEvent.change(screen.getByLabelText('模型 #1'), {
      target: { value: 'openai/gpt-4.1-mini' },
    })

    fireEvent.click(screen.getByRole('button', { name: '测试连接' }))

    await waitFor(() => {
      expect(settingsApi.testProviderConnection).toHaveBeenCalledTimes(1)
    })

    fireEvent.click(screen.getByRole('button', { name: '保存配置' }))

    await waitFor(() => {
      expect(settingsApi.saveProviderSettings).toHaveBeenCalledTimes(1)
    })

    expect(settingsApi.saveProviderSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        providers: expect.arrayContaining([
          expect.objectContaining({
            id: 'openrouter-prod',
            protocol: 'openai',
            apiKey: 'sk-openrouter',
            baseURL: 'https://openrouter.ai/api/v1',
            models: ['openai/gpt-4.1-mini'],
          }),
        ]),
      }),
    )
  })
})
