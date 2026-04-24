import { describe, expect, it, vi } from 'vitest'
import type { Message } from '@xnova/core'

vi.mock('@xnova/core', () => ({
  contextManager: {
    getHistoryRef: () => [],
    getStrategyName: () => 'full-replace',
    compact: vi.fn(),
    replaceHistory: vi.fn(),
    clearHistory: vi.fn(),
    restoreHistory: vi.fn(),
  },
  contextTracker: {
    getState: () => ({
      totalWindow: 128000,
      outputReserve: 16384,
      effectiveWindow: 111616,
      lastInputTokens: 0,
      usedPercentage: 0,
      remaining: 111616,
      level: 'normal',
    }),
  },
  ensureSkillsDiscovered: vi.fn(async () => undefined),
  getMcpStatus: vi.fn(async () => []),
  getMemoryManager: vi.fn(() => null),
  pluginRegistry: {
    list: vi.fn(() => []),
  },
  sessionLogger: {
    sessionId: null,
    lastEventUuid: null,
    bind: vi.fn(),
  },
  skillStore: {
    getAll: vi.fn(() => []),
    getContent: vi.fn(async () => null),
  },
  tokenMeter: {
    getSessionStats: vi.fn(() => ({
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCacheReadTokens: 0,
      totalCacheWriteTokens: 0,
      costByCurrency: {},
      callCount: 0,
      lastTtftMs: 0,
      lastTps: 0,
    })),
    getTodayStats: vi.fn(() => []),
    getMonthStats: vi.fn(() => []),
    getCacheHitRate: vi.fn(() => 0),
  },
  getCleanupStats: vi.fn(() => ({
    sessions: {
      totalFiles: 0,
      totalSizeBytes: 0,
      expiredFiles: 0,
      expiredSizeBytes: 0,
    },
    usage: {
      totalRows: 0,
      expiredRows: 0,
    },
    images: {
      totalFiles: 0,
      expiredFiles: 0,
    },
  })),
  executeCleanup: vi.fn(() => ({
    deletedSessionFiles: 0,
    deletedSessionBytes: 0,
    deletedUsageRows: 0,
    deletedImages: 0,
  })),
}))

vi.mock('@xnova/config', () => ({
  ConfigManager: class ConfigManager {
    load() {
      return {
        defaultProvider: 'anthropic',
        defaultModel: 'claude-sonnet-4-6',
        providers: {},
      }
    }

    getLastWarnings() {
      return []
    }

    getPaths() {
      return {
        tomlPath: '',
        jsonPath: '',
      }
    }
  },
  loadEffectiveRuntimeConfig: () => ({
    defaultProvider: 'anthropic',
    defaultModel: 'claude-sonnet-4-6',
    providers: {},
  }),
}))

vi.mock('@xnova/mcp', () => ({
  readMcpOverview: vi.fn(async () => ({
    status: 'unconfigured',
    statusMessage: '尚未配置 MCP Server。',
    writableConfigPath: 'D:/workspace/.xnovacode/.mcp.json',
    servers: [],
    warnings: [],
  })),
  addMcpServer: vi.fn(async () => ({
    success: true,
    message: 'ok',
  })),
  deleteMcpServer: vi.fn(async () => ({
    success: true,
    message: 'ok',
  })),
}))

vi.mock('@xnova/memory', () => ({
  readMemoryOverview: vi.fn(async () => ({
    enabled: false,
    status: 'disabled',
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
  rebuildMemoryIndex: vi.fn(async () => ({
    success: false,
    message: 'Memory 未启用，无法重建索引。',
  })),
}))

vi.mock('@xnova/persistence', () => ({
  sessionStore: {
    list: vi.fn(() => []),
    listBranches: vi.fn(() => []),
    loadMessages: vi.fn(() => ({
      sessionId: 'session-1',
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      cwd: 'D:/workspace',
      messages: [],
      leafEventUuid: null,
    })),
    append: vi.fn(),
  },
  generateEventId: () => 'event-1',
}))

vi.mock('@xnova/providers', () => ({
  getOrCreateProvider: vi.fn(() => ({})),
}))

vi.mock('@xnova/skills', () => ({
  readSkillsPluginsOverview: vi.fn(async () => ({
    status: 'empty',
    statusMessage: '当前没有可见的 Skills / Plugins。',
    sourceDistribution: [],
    recentSkills: [],
    frequentSkills: [],
    plugins: [],
    warnings: [],
  })),
}))

import {
  createEngineServiceApi,
  LEGACY_COMMAND_CAPABILITY_MAP,
  type RuntimeCompactContextResult,
} from '../engine-service-api.js'

function createHarness() {
  const history: Message[] = [
    { role: 'user', content: 'hi' },
    { role: 'assistant', content: 'hello' },
  ]

  const contextManagerRef = {
    getHistoryRef: vi.fn(() => history),
    getStrategyName: vi.fn(() => 'full-replace'),
    compact: vi.fn(async () => ({
      history: [{ role: 'user' as const, content: 'summary' }] as Message[],
      summary: 'summary',
      tokensBefore: 1000,
      compactedMessageCount: 2,
    })),
    replaceHistory: vi.fn(),
    clearHistory: vi.fn(),
    restoreHistory: vi.fn(),
  }

  const contextTrackerRef = {
    getState: vi.fn(() => ({
      totalWindow: 128000,
      outputReserve: 16384,
      effectiveWindow: 111616,
      lastInputTokens: 1024,
      usedPercentage: 1024 / 111616,
      remaining: 111616 - 1024,
      level: 'normal' as const,
    })),
  }

  const sessionStoreRef = {
    list: vi.fn(() => []),
    listBranches: vi.fn(() => []),
    loadMessages: vi.fn(() => ({
      sessionId: 'session-1',
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      cwd: 'D:/workspace',
      messages: [
        { id: 'u1', role: 'user' as const, content: 'Q' },
        { id: 'a1', role: 'assistant' as const, content: 'A' },
      ],
      leafEventUuid: 'leaf-1',
    })),
    append: vi.fn(),
  }

  const sessionLoggerRef = {
    sessionId: null as string | null,
    lastEventUuid: 'leaf-1' as string | null,
    bind: vi.fn(),
  }

  const tokenMeterRef = {
    getSessionStats: vi.fn(() => ({
      totalInputTokens: 1,
      totalOutputTokens: 2,
      totalCacheReadTokens: 3,
      totalCacheWriteTokens: 4,
      costByCurrency: { USD: 0.1234 },
      callCount: 1,
      lastTtftMs: 111,
      lastTps: 22,
    })),
    getTodayStats: vi.fn(() => [
      {
        totalInputTokens: 10,
        totalOutputTokens: 20,
        totalCost: 1.2,
        currency: 'USD',
        callCount: 2,
      },
    ]),
    getMonthStats: vi.fn(() => [
      {
        totalInputTokens: 30,
        totalOutputTokens: 40,
        totalCost: 2.5,
        currency: 'USD',
        callCount: 4,
      },
    ]),
    getCacheHitRate: vi.fn(() => 0.5),
  }

  const memoryManager = {
    list: vi.fn(async () => []),
    search: vi.fn(async () => []),
    delete: vi.fn(async () => undefined),
    write: vi.fn(async () => ({
      id: 'project:note-1',
      scope: 'project' as const,
      title: 'note',
      content: 'content',
      type: 'user' as const,
      tags: [],
      source: 'user' as const,
      created: '2026-04-24T00:00:00.000Z',
      updated: '2026-04-24T00:00:00.000Z',
      filePath: 'D:/workspace/.xnovacode/memory/note.md',
    })),
    rebuild: vi.fn(async () => undefined),
  }

  const readMemoryOverviewFn = vi.fn(async () => ({
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
  }))

  const rebuildMemoryIndexFn = vi.fn(async () => ({
    success: false,
    message: 'Memory 未启用，无法重建索引。',
  }))

  const getMcpStatusFn = vi.fn(async () => [])
  const readMcpOverviewFn = vi.fn(async () => ({
    status: 'unconfigured' as const,
    statusMessage: '尚未配置 MCP Server。',
    writableConfigPath: 'D:/workspace/.xnovacode/.mcp.json',
    servers: [],
    warnings: [],
  }))
  const addMcpServerFn = vi.fn(async () => ({
    success: true,
    message: 'ok',
  }))
  const deleteMcpServerFn = vi.fn(async () => ({
    success: true,
    message: 'ok',
  }))

  const ensureSkillsDiscoveredFn = vi.fn(async () => undefined)
  const skillStoreRef = {
    getAll: vi.fn(() => []),
    getContent: vi.fn(async () => null),
  }
  const readSkillsPluginsOverviewFn = vi.fn(async () => ({
    status: 'empty' as const,
    statusMessage: '当前没有可见的 Skills / Plugins。',
    sourceDistribution: [],
    recentSkills: [],
    frequentSkills: [],
    plugins: [],
    warnings: [],
  }))

  const pluginRegistryRef = {
    list: vi.fn(() => []),
  }

  const getCleanupStatsFn = vi.fn(() => ({
    sessions: {
      totalFiles: 0,
      totalSizeBytes: 0,
      expiredFiles: 0,
      expiredSizeBytes: 0,
    },
    usage: {
      totalRows: 0,
      expiredRows: 0,
    },
    images: {
      totalFiles: 0,
      expiredFiles: 0,
    },
  }))
  const executeCleanupFn = vi.fn(() => ({
    deletedSessionFiles: 0,
    deletedSessionBytes: 0,
    deletedUsageRows: 0,
    deletedImages: 0,
  }))

  const api = createEngineServiceApi({
    cwd: 'D:/workspace',
    loadConfigFn: () => ({
      defaultProvider: 'anthropic',
      defaultModel: 'claude-sonnet-4-6',
      providers: {},
    }),
    createProviderFn: vi.fn(() => ({}) as never),
    contextManagerRef,
    contextTrackerRef,
    sessionStoreRef,
    sessionLoggerRef,
    generateEventIdFn: () => 'resume-1',
    tokenMeterRef,
    getMemoryManagerFn: () => memoryManager,
    readMemoryOverviewFn,
    rebuildMemoryIndexFn,
    getMcpStatusFn,
    readMcpOverviewFn,
    addMcpServerFn,
    deleteMcpServerFn,
    ensureSkillsDiscoveredFn,
    skillStoreRef,
    readSkillsPluginsOverviewFn,
    pluginRegistryRef,
    getCleanupStatsFn,
    executeCleanupFn,
  })

  return {
    api,
    history,
    contextManagerRef,
    sessionStoreRef,
    sessionLoggerRef,
    tokenMeterRef,
    memoryManager,
    readMemoryOverviewFn,
    rebuildMemoryIndexFn,
    getMcpStatusFn,
    readMcpOverviewFn,
    addMcpServerFn,
    deleteMcpServerFn,
    ensureSkillsDiscoveredFn,
    skillStoreRef,
    readSkillsPluginsOverviewFn,
    pluginRegistryRef,
    getCleanupStatsFn,
    executeCleanupFn,
  }
}

describe('engine service api contract', () => {
  it('暴露 runtime 与各领域 service API', () => {
    const { api } = createHarness()
    expect(api.runtime).toBeDefined()
    expect(api.sessionService).toBeDefined()
    expect(api.memoryService).toBeDefined()
    expect(api.mcpService).toBeDefined()
    expect(api.skillsService).toBeDefined()
    expect(api.usageService).toBeDefined()
    expect(api.pluginService).toBeDefined()
    expect(api.maintenanceService).toBeDefined()
  })

  it('runtime.setModel + runtime.getContextSnapshot 应共享同一模型状态', () => {
    const { api } = createHarness()

    const switched = api.runtime.setModel({
      provider: 'openai',
      model: 'gpt-4.1-mini',
    })
    expect(switched).toEqual({
      provider: 'openai',
      model: 'gpt-4.1-mini',
    })

    const context = api.runtime.getContextSnapshot()
    expect(context.provider).toBe('openai')
    expect(context.model).toBe('gpt-4.1-mini')
    expect(context.historyLength).toBe(2)
    expect(context.strategy).toBe('full-replace')
  })

  it('runtime.compactContext 在空历史时返回 empty-history', async () => {
    const { api, contextManagerRef } = createHarness()
    contextManagerRef.getHistoryRef.mockReturnValue([])

    const result = await api.runtime.compactContext()
    const typedResult: RuntimeCompactContextResult = result

    expect(typedResult.ok).toBe(false)
    if (typedResult.ok) {
      throw new Error('empty-history 场景不应返回成功结果')
    }
    expect(typedResult.reason).toBe('empty-history')
    expect(contextManagerRef.compact).not.toHaveBeenCalled()
  })

  it('sessionService 恢复、分叉与清空会话应复用既有能力', () => {
    const { api, sessionStoreRef, contextManagerRef, sessionLoggerRef } = createHarness()

    const resume = api.sessionService.resumeSession({
      sessionId: 'session-1',
      leafEventUuid: 'leaf-1',
      provider: 'openai',
      model: 'gpt-4.1-mini',
      cwd: 'D:/workspace/demo',
      accumulatedMs: 10,
    })
    expect(resume.resumeEventId).toBe('resume-1')
    expect(contextManagerRef.restoreHistory).toHaveBeenCalled()
    expect(sessionStoreRef.append).toHaveBeenCalledWith(
      'session-1',
      expect.objectContaining({
        type: 'session_resume',
        parentUuid: 'leaf-1',
        provider: 'openai',
        model: 'gpt-4.1-mini',
      }),
    )
    expect(sessionLoggerRef.bind).toHaveBeenCalledWith('session-1', 'resume-1')

    const fork = api.sessionService.forkFromEvent({
      sessionId: 'session-1',
      eventUuid: 'leaf-1',
    })
    expect(fork.resumeEventId).toBe('resume-1')
    expect(sessionStoreRef.loadMessages).toHaveBeenCalledWith('session-1', 'leaf-1')

    api.sessionService.clearConversation()
    expect(contextManagerRef.clearHistory).toHaveBeenCalledTimes(1)
  })

  it('memory/mcp/skills/usage/plugin/maintenance service 应委托对应底层能力', async () => {
    const {
      api,
      memoryManager,
      readMemoryOverviewFn,
      rebuildMemoryIndexFn,
      getMcpStatusFn,
      readMcpOverviewFn,
      addMcpServerFn,
      deleteMcpServerFn,
      ensureSkillsDiscoveredFn,
      skillStoreRef,
      readSkillsPluginsOverviewFn,
      tokenMeterRef,
      pluginRegistryRef,
      getCleanupStatsFn,
      executeCleanupFn,
    } = createHarness()

    await api.memoryService.list('project')
    expect(memoryManager.list).toHaveBeenCalledWith('project')
    await api.memoryService.search({ query: 'hello', topK: 5 })
    expect(memoryManager.search).toHaveBeenCalledWith({
      query: 'hello',
      topK: 5,
    })
    await api.memoryService.delete('memory-1')
    expect(memoryManager.delete).toHaveBeenCalledWith('memory-1')
    await api.memoryService.write({ content: '新的记忆内容' })
    expect(memoryManager.write).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'project',
        content: '新的记忆内容',
      }),
    )
    await api.memoryService.rebuild()
    expect(memoryManager.rebuild).toHaveBeenCalledTimes(1)
    await api.memoryService.getOverview('D:/workspace/demo')
    expect(readMemoryOverviewFn).toHaveBeenCalledTimes(1)
    await api.memoryService.rebuildIndex('D:/workspace/demo')
    expect(rebuildMemoryIndexFn).toHaveBeenCalledTimes(1)

    await api.mcpService.getStatus()
    expect(getMcpStatusFn).toHaveBeenCalledTimes(1)
    await api.mcpService.getOverview()
    expect(readMcpOverviewFn).toHaveBeenCalledTimes(1)
    await api.mcpService.addServer({
      name: 'mysql',
      config: { transport: 'stdio', command: 'npx' },
    })
    expect(addMcpServerFn).toHaveBeenCalledTimes(1)
    await api.mcpService.deleteServer('mysql')
    expect(deleteMcpServerFn).toHaveBeenCalledWith('mysql')

    await api.skillsService.list()
    await api.skillsService.getContent('commit')
    await api.skillsService.getOverview()
    expect(ensureSkillsDiscoveredFn).toHaveBeenCalledTimes(2)
    expect(skillStoreRef.getAll).toHaveBeenCalledTimes(1)
    expect(skillStoreRef.getContent).toHaveBeenCalledWith('commit')
    expect(readSkillsPluginsOverviewFn).toHaveBeenCalledTimes(1)

    const usage = api.usageService.getSummary()
    expect(usage.cacheHitRate).toBe(0.5)
    expect(tokenMeterRef.getSessionStats).toHaveBeenCalledTimes(1)
    expect(tokenMeterRef.getTodayStats).toHaveBeenCalledTimes(1)
    expect(tokenMeterRef.getMonthStats).toHaveBeenCalledTimes(1)
    expect(tokenMeterRef.getCacheHitRate).toHaveBeenCalledTimes(1)

    api.pluginService.list()
    expect(pluginRegistryRef.list).toHaveBeenCalledTimes(1)

    api.maintenanceService.getStats({ target: 'all' })
    expect(getCleanupStatsFn).toHaveBeenCalledWith({ target: 'all' })
    api.maintenanceService.cleanup({ target: 'sessions' })
    expect(executeCleanupFn).toHaveBeenCalledWith({ target: 'sessions' })
  })

  it('旧 commands 到新 service API 的映射应完整', () => {
    expect(LEGACY_COMMAND_CAPABILITY_MAP).toEqual({
      model: 'runtime.setModel',
      compact: 'runtime.compactContext',
      context: 'runtime.getContextSnapshot',
      resume: 'sessionService.resumeSession',
      fork: 'sessionService.forkFromEvent',
      remember: 'memoryService',
      mcp: 'mcpService',
      skills: 'skillsService',
      plugins: 'pluginService',
      usage: 'usageService',
      gc: 'maintenanceService',
      clear: 'sessionService.clearConversation',
    })
  })
})
