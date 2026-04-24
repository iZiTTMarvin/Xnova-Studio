import { describe, expect, it, vi } from 'vitest'
import { createStudioMemoryService } from '../src/main/studio-memory-service'
import { createStudioMcpService } from '../src/main/studio-mcp-service'
import { createStudioRuntimeService } from '../src/main/studio-runtime-service'
import { createStudioSkillsPluginsService } from '../src/main/studio-skills-plugins-service'
import type { RuntimeHostBridge, RuntimeInstance } from '@xnova/runtime'

describe('studio engine service api adapters', () => {
  it('memory service 应优先委托 engineServiceApi.memoryService', async () => {
    const engineServiceApi = {
      memoryService: {
        list: vi.fn(async () => []),
        search: vi.fn(async () => []),
        delete: vi.fn(async () => undefined),
        write: vi.fn(async () => ({
          id: 'memory-1',
          scope: 'project' as const,
          title: 'memory',
          content: 'content',
          type: 'user' as const,
          tags: [],
          source: 'user' as const,
          created: '2026-04-24T00:00:00.000Z',
          updated: '2026-04-24T00:00:00.000Z',
          filePath: '',
        })),
        rebuild: vi.fn(async () => undefined),
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
            projectPath: null,
            globalEntries: 0,
            projectEntries: 0,
            vectorChunks: 0,
          },
          source: {},
          warnings: [],
        })),
        rebuildIndex: vi.fn(async () => ({
          success: false,
          message: 'Memory 未启用，无法重建索引。',
        })),
      },
    }

    const service = createStudioMemoryService({
      engineServiceApi,
      readMemoryOverviewFn: vi.fn(async () => {
        throw new Error('不应调用 fallback readMemoryOverviewFn')
      }),
      rebuildMemoryIndexFn: vi.fn(async () => {
        throw new Error('不应调用 fallback rebuildMemoryIndexFn')
      }),
    })

    await service.getOverview({
      workspacePath: 'D:/workspace/demo',
      lastSelection: null,
    })
    await service.rebuild({
      workspacePath: 'D:/workspace/demo',
      lastSelection: null,
    })

    expect(engineServiceApi.memoryService.getOverview).toHaveBeenCalledWith(
      'D:/workspace/demo',
    )
    expect(engineServiceApi.memoryService.rebuildIndex).toHaveBeenCalledWith(
      'D:/workspace/demo',
    )
  })

  it('mcp 与 skills service 应优先委托 engineServiceApi', async () => {
    const engineServiceApi = {
      mcpService: {
        getStatus: vi.fn(async () => []),
        getOverview: vi.fn(async () => ({
          status: 'unconfigured' as const,
          statusMessage: '尚未配置 MCP Server。',
          writableConfigPath: 'D:/workspace/.xnovacode/.mcp.json',
          servers: [],
          warnings: [],
        })),
        addServer: vi.fn(async () => ({
          success: true,
          message: 'MCP Server 已添加。',
        })),
        deleteServer: vi.fn(async () => ({
          success: true,
          message: 'MCP Server 已删除。',
        })),
      },
      skillsService: {
        list: vi.fn(async () => []),
        getContent: vi.fn(async () => null),
        getOverview: vi.fn(async () => ({
          status: 'empty' as const,
          statusMessage: '当前没有可见的 Skills / Plugins。',
          sourceDistribution: [],
          recentSkills: [],
          frequentSkills: [],
          plugins: [],
          warnings: [],
        })),
      },
    }

    const mcpService = createStudioMcpService({
      engineServiceApi,
    })
    const skillsService = createStudioSkillsPluginsService({
      engineServiceApi,
    })

    await mcpService.getOverview({
      workspacePath: 'D:/workspace/demo',
      lastSelection: null,
    })
    await mcpService.addServer(
      {
        name: 'mysql',
        config: {
          transport: 'stdio',
          command: 'npx',
        },
      },
      {
        workspacePath: 'D:/workspace/demo',
        lastSelection: null,
      },
    )
    await mcpService.deleteServer('mysql', {
      workspacePath: 'D:/workspace/demo',
      lastSelection: null,
    })
    await skillsService.getOverview({
      workspacePath: 'D:/workspace/demo',
      lastSelection: null,
    })

    expect(engineServiceApi.mcpService.getOverview).toHaveBeenCalledTimes(1)
    expect(engineServiceApi.mcpService.addServer).toHaveBeenCalledWith({
      name: 'mysql',
      config: {
        transport: 'stdio',
        command: 'npx',
      },
    })
    expect(engineServiceApi.mcpService.deleteServer).toHaveBeenCalledWith('mysql')
    expect(engineServiceApi.skillsService.getOverview).toHaveBeenCalledTimes(1)
  })

  it('runtime service 在收到 provider/model 时应调用 engineServiceApi.runtime.setModel', async () => {
    let runtimeBridge: RuntimeHostBridge | null = null
    const runtimeInstance: RuntimeInstance = {
      submit: vi.fn(async () => ({
        text: 'ok',
        thinking: '',
        stopReason: 'end_turn',
        llmCallCount: 1,
        toolCallCount: 0,
        usage: {
          inputTokens: 1,
          outputTokens: 1,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
        aborted: false,
        historyCompacted: false,
        sessionId: 'session-1',
      })),
      abort: vi.fn(),
      dispose: vi.fn(async () => undefined),
      getSnapshot: vi.fn(() => ({
        sessionId: 'session-1',
        isRunning: false,
        provider: 'openai',
        model: 'gpt-4.1-mini',
        warnings: [],
      })),
    }

    const createRuntimeFn = vi.fn(async (_input, bridge) => {
      runtimeBridge = bridge
      return runtimeInstance
    })

    const engineServiceApi = {
      runtime: {
        setModel: vi.fn(() => ({
          provider: 'openai',
          model: 'gpt-4.1-mini',
        })),
        getModelSelection: vi.fn(() => ({
          provider: 'openai',
          model: 'gpt-4.1-mini',
        })),
        compactContext: vi.fn(async () => ({
          ok: false as const,
          reason: 'empty-history' as const,
          message: 'No messages to compact.',
        })),
        getContextSnapshot: vi.fn(() => ({
          provider: 'openai',
          model: 'gpt-4.1-mini',
          strategy: 'full-replace',
          historyLength: 0,
          totalWindow: 128000,
          outputReserve: 16384,
          effectiveWindow: 111616,
          lastInputTokens: 0,
          usedPercentage: 0,
          remaining: 111616,
          level: 'normal' as const,
        })),
      },
    }

    const service = createStudioRuntimeService({
      engineServiceApi,
      createRuntimeFn,
      loadResolvedConfigFn: vi.fn(() => ({
        effective: {
          defaultProvider: 'anthropic',
          defaultModel: 'claude-sonnet-4-6',
          providers: {},
        },
        source: {},
        warnings: [],
      })),
    })

    await service.submit(
      {
        text: '继续',
        projectPath: 'D:/workspace/demo',
        providerId: 'openai',
        modelId: 'gpt-4.1-mini',
      },
      {
        workspacePath: 'D:/workspace/demo',
        lastSelection: null,
      },
      vi.fn(),
    )

    expect(runtimeBridge).toBeDefined()
    expect(engineServiceApi.runtime.setModel).toHaveBeenCalledWith({
      provider: 'openai',
      model: 'gpt-4.1-mini',
    })
  })
})
