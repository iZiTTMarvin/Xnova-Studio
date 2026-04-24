// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StudioSettingsDialog } from '../src/renderer/components/StudioSettingsDialog'
import type { StudioMemoryApi, StudioMemoryOverviewSnapshot } from '../src/shared/studio-bridge-contract'

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

function createMemoryApi(): StudioMemoryApi {
  return {
    getOverview: vi.fn(async () => createMemorySnapshot()),
    rebuild: vi.fn(async () => ({
      success: true,
      message: 'Memory 索引已完成重建。',
      snapshot: {
        ...createMemorySnapshot(),
        status: 'ready',
        statusMessage: 'Embedding 已就绪。',
        embedding: {
          configured: true,
          dimension: 1536,
          missingFields: [],
        },
      },
    })),
  }
}

afterEach(() => {
  cleanup()
})

describe('memory settings dialog', () => {
  it('全局记忆模块显示开关与状态，并支持重建入口', async () => {
    const memoryApi = createMemoryApi()

    render(
      <StudioSettingsDialog
        open
        onClose={vi.fn()}
        settingsApi={null}
        memoryApi={memoryApi}
        workspacePath="D:/workspace/demo"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '全局记忆' }))

    await waitFor(() => {
      expect(screen.getByText('Embedding 未完整配置，当前降级为 BM25 关键词检索。')).toBeTruthy()
    })

    expect(screen.getByText('已启用')).toBeTruthy()
    expect(screen.getByText('全局 2')).toBeTruthy()
    expect(screen.getByText('项目 1')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '重建索引' }))

    await waitFor(() => {
      expect(memoryApi.rebuild).toHaveBeenCalledTimes(1)
    })

    expect(screen.getByText('Memory 索引已完成重建。')).toBeTruthy()
  })
})
