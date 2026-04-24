// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StudioSettingsDialog } from '../src/renderer/components/StudioSettingsDialog'
import type { StudioProviderSettingsSnapshot, StudioSettingsApi } from '../src/shared/studio-bridge-contract'

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

function createSettingsApi(): StudioSettingsApi {
  return {
    getProviderSettings: vi.fn(async () => createProviderSnapshot()),
    saveProviderSettings: vi.fn(async (input) => ({
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
    testProviderConnection: vi.fn(async () => ({
      success: true,
      providerId: 'anthropic',
      model: 'claude-sonnet-4-6',
      durationMs: 10,
    })),
  }
}

afterEach(() => {
  cleanup()
})

describe('settings dialog shell', () => {
  it('open=false 时不渲染悬浮窗', () => {
    render(
      <StudioSettingsDialog
        open={false}
        onClose={vi.fn()}
        settingsApi={null}
        memoryApi={null}
        workspacePath={null}
      />,
    )

    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('渲染为 role=dialog，并含三段入口与关闭操作', async () => {
    const onClose = vi.fn()
    render(
      <StudioSettingsDialog
        open
        onClose={onClose}
        settingsApi={createSettingsApi()}
        memoryApi={null}
        workspacePath="D:/workspace/demo"
      />,
    )

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: '设置' })).toBeTruthy()
    })

    expect(screen.getByRole('button', { name: '模型服务' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '默认模型' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '全局记忆' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '关闭设置' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('默认模型模块可简洁编辑并保存', async () => {
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

    fireEvent.click(screen.getByRole('button', { name: '默认模型' }))

    await waitFor(() => {
      expect(screen.getByLabelText('默认模型')).toBeTruthy()
    })

    fireEvent.change(screen.getByLabelText('默认模型'), {
      target: { value: 'claude-opus-4-6' },
    })
    fireEvent.click(screen.getByRole('button', { name: '保存默认模型' }))

    await waitFor(() => {
      expect(settingsApi.saveProviderSettings).toHaveBeenCalledTimes(1)
    })

    expect(settingsApi.saveProviderSettings).toHaveBeenCalledWith(
      expect.objectContaining({ defaultModel: 'claude-opus-4-6' }),
    )
  })
})
