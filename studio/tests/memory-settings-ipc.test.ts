import { describe, expect, it, vi } from 'vitest'
import { registerStudioMainIpcHandlers } from '../src/main/studio-ipc'
import {
  STUDIO_BRIDGE_CHANNELS,
  type StudioMemoryOverviewSnapshot,
} from '../src/shared/studio-bridge-contract'

function createLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
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

describe('studio memory main ipc handlers', () => {
  it('通过 main process 委托 memory 概览与 rebuild', async () => {
    const handlers = new Map<string, (_event: unknown, payload: unknown) => unknown>()
    const getMemoryOverview = vi.fn(async () => createMemorySnapshot())
    const rebuildMemory = vi.fn(async () => ({
      success: true,
      message: 'Memory 索引已完成重建。',
      snapshot: createMemorySnapshot(),
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
      getProviderSettings: vi.fn(),
      saveProviderSettings: vi.fn(),
      testProviderConnection: vi.fn(),
      getMemoryOverview,
      rebuildMemory,
      logger: createLogger(),
    })

    await expect(
      Promise.resolve(
        handlers.get(STUDIO_BRIDGE_CHANNELS.memoryGetOverview)?.({}, undefined),
      ),
    ).resolves.toEqual(createMemorySnapshot())

    await expect(
      Promise.resolve(
        handlers.get(STUDIO_BRIDGE_CHANNELS.memoryRebuild)?.({}, undefined),
      ),
    ).resolves.toEqual({
      success: true,
      message: 'Memory 索引已完成重建。',
      snapshot: createMemorySnapshot(),
    })
  })
})
