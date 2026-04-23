import { describe, expect, it, vi } from 'vitest'
import { createStudioBridgeApi } from '../src/preload/studio-bridge-api'
import {
  STUDIO_BRIDGE_CHANNELS,
  type StudioMemoryOverviewSnapshot,
} from '../src/shared/studio-bridge-contract'

class FakeIpcRenderer {
  readonly invoke = vi.fn(async (channel: string) => {
    if (channel === STUDIO_BRIDGE_CHANNELS.memoryGetOverview) {
      return createMemorySnapshot()
    }

    if (channel === STUDIO_BRIDGE_CHANNELS.memoryRebuild) {
      return {
        success: true,
        message: 'Memory 索引已完成重建。',
        snapshot: createMemorySnapshot(),
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

describe('studio memory preload bridge', () => {
  it('通过 IPC 读取 memory 概览，并校验 rebuild 请求与响应', async () => {
    const api = createStudioBridgeApi({
      ipcRenderer: new FakeIpcRenderer(),
    })

    await expect(api.memory.getOverview()).resolves.toEqual(createMemorySnapshot())

    await expect(api.memory.rebuild()).resolves.toEqual({
      success: true,
      message: 'Memory 索引已完成重建。',
      snapshot: createMemorySnapshot(),
    })
  })
})
