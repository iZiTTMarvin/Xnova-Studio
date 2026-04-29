import { stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { loadResolvedConfig } from '@config/resolver.js'
import { agentCatalog } from '@tools/agent/catalog.js'
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { registerStudioMainIpcHandlers } from './studio-ipc'
import { startMainProcess } from './lifecycle'
import { createMainLogger } from './logger'
import { readSmokeConfig, runSmokeScenario } from './smoke'
import { createStudioProviderSettingsService } from './studio-provider-settings'
import { createStudioMemoryService } from './studio-memory-service'
import { createStudioMcpService } from './studio-mcp-service'
import { createStudioSkillsPluginsService } from './studio-skills-plugins-service'
import { createStudioShellInspector } from './studio-shell-inspector'
import { createStudioRuntimeInspector } from './studio-runtime-inspector'
import { createStudioRuntimeManager } from './studio-runtime-manager'
import { createStudioRuntimeService } from './studio-runtime-service'
import {
  buildWarmupCacheKey,
  buildConfigFingerprint,
  buildProviderFingerprint,
  createRuntimeWarmupManager,
} from './studio-runtime-warmup'
import { normalizeRuntimePath } from './normalize-runtime-path'
import { createMainWindowManager } from './window'
import { selectWorkspaceDirectory } from './workspace'
import {
  STUDIO_BRIDGE_CHANNELS,
  type RuntimeWarmupPrepareRequest,
  type RuntimeWarmupPrepareResult,
} from '../shared/studio-bridge-contract'

function waitForLogFlush(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 20)
  })
}

const logger = createMainLogger()
const smokeConfig = readSmokeConfig(process.env)
const warmupSelectionKeys = new Map<string, string>()
const runtimeManager = createStudioRuntimeManager()
const warmupManager = createRuntimeWarmupManager({
  onStatusChanged(event) {
    logger.info('[Warmup] 状态变更', {
      status: event.status,
      cwd: event.cwd,
      cacheKey: event.cacheKey,
      ...(event.durationMs !== undefined ? { durationMs: event.durationMs } : {}),
      ...(event.error !== undefined ? { error: event.error } : {}),
    })

    // 广播安全的 warmup 状态到 renderer（不含 cwd、cacheKey 等内部标识）
    const safeEvent: import('../shared/studio-bridge-contract').RuntimeWarmupStatusChangedEvent = {
      status: event.status,
      ...(warmupSelectionKeys.get(event.cacheKey)
        ? { selectionKey: warmupSelectionKeys.get(event.cacheKey) }
        : {}),
      ...(event.durationMs !== undefined ? { durationMs: event.durationMs } : {}),
      // error 只保留摘要，截断到 200 字符，不透出堆栈或敏感配置
      ...(event.error !== undefined
        ? { error: event.error.length > 200 ? event.error.slice(0, 200) : event.error }
        : {}),
    }
    mainWindowManager
      .getMainWindow()
      ?.webContents?.send(
        STUDIO_BRIDGE_CHANNELS.runtimeWarmupStatusChanged,
        safeEvent,
      )
  },
})
const runtimeInspector = createStudioRuntimeInspector({
  getRuntimeSnapshot(hostState) {
    return runtimeManager.getRuntimeSnapshot(hostState)
  },
})
let runtimeServiceRef: ReturnType<typeof createStudioRuntimeService> | null = null
const mainWindowManager = createMainWindowManager({
  BrowserWindow,
  logger,
  onBeforeWindowClose() {
    void runtimeServiceRef?.dispose()
  },
})
const runtimeService = createStudioRuntimeService({
  runtimeManager,
  warmupManager,
  mainWindowManager,
  logger,
})
runtimeServiceRef = runtimeService
const shellInspector = createStudioShellInspector({
  onPerformanceSample(sample) {
    logger.info('shell inspector 性能采样', sample)
  },
})
const providerSettingsService = createStudioProviderSettingsService()
const memoryService = createStudioMemoryService({
  resolveEngineServiceApi(hostState) {
    const workspacePath = hostState.workspacePath?.trim()
    return workspacePath
      ? runtimeManager.getEngineServiceApi(workspacePath)
      : undefined
  },
})
const mcpService = createStudioMcpService({
  resolveEngineServiceApi(hostState) {
    const workspacePath = hostState.workspacePath?.trim()
    return workspacePath
      ? runtimeManager.getEngineServiceApi(workspacePath)
      : undefined
  },
})
const skillsPluginsService = createStudioSkillsPluginsService({
  resolveEngineServiceApi(hostState) {
    const workspacePath = hostState.workspacePath?.trim()
    return workspacePath
      ? runtimeManager.getEngineServiceApi(workspacePath)
      : undefined
  },
})

function createWarmupSelectionKey(cacheKey: string): string {
  return createHash('sha256').update(cacheKey).digest('hex').slice(0, 16)
}

function startWorkspaceWarmup(
  input: {
    workspacePath: string
    agentId?: string | null | undefined
    providerId?: string | null | undefined
    modelId?: string | null | undefined
    mode?: 'standard' | 'xforge' | undefined
  },
): RuntimeWarmupPrepareResult {
  const workspacePath = normalizeRuntimePath(input.workspacePath)
  if (!workspacePath) {
    return {
      ok: false,
      status: 'failed',
      error: 'workspacePath 为空，无法启动 runtime warmup。',
    }
  }

  try {
    const config = loadResolvedConfig(workspacePath).effective
    const warmupAgentId =
      input.agentId?.trim() ||
      config.agent?.default ||
      agentCatalog.resolvePrimaryAgent().agent.agentType
    const warmupRuntimeConfig = {
      ...config,
      agent: {
        ...(config.agent ?? {}),
        default: warmupAgentId,
      },
    }
    const provider = input.providerId?.trim() || warmupRuntimeConfig.defaultProvider
    const model =
      input.modelId?.trim() ||
      (provider === warmupRuntimeConfig.defaultProvider
        ? warmupRuntimeConfig.defaultModel
        : warmupRuntimeConfig.providers[provider]?.models[0]) ||
      warmupRuntimeConfig.defaultModel
    const providerFingerprint = buildProviderFingerprint({
      provider,
      model,
      baseURL: warmupRuntimeConfig.providers[provider]?.baseURL ?? null,
    })
    const configFingerprint = buildConfigFingerprint(
      warmupRuntimeConfig as unknown as Record<string, unknown>,
    )
    const cacheKey = buildWarmupCacheKey({
      cwd: workspacePath,
      workspaceRoot: workspacePath,
      agentId: warmupAgentId,
      mode: input.mode,
      providerFingerprint,
      configFingerprint,
    })
    const selectionKey = createWarmupSelectionKey(cacheKey)
    warmupSelectionKeys.set(cacheKey, selectionKey)
    warmupManager.startWarmup({
      cwd: workspacePath,
      workspaceRoot: workspacePath,
      agentId: warmupAgentId,
      mode: input.mode,
      providerFingerprint,
      configFingerprint,
    })
    return {
      ok: true,
      status: warmupManager.getStatus(cacheKey),
      selectionKey,
    }
  } catch (error) {
    logger.warn('[Warmup] workspace 预热启动失败，submit 将回退 slow path', {
      workspacePath,
      error: error instanceof Error ? error.message : String(error),
    })
    return {
      ok: false,
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

function prepareWarmupSelection(
  request: RuntimeWarmupPrepareRequest,
): RuntimeWarmupPrepareResult {
  return startWorkspaceWarmup({
    workspacePath: request.projectPath,
    agentId: request.agentId,
    providerId: request.providerId,
    modelId: request.modelId,
    mode: request.mode,
  })
}

function invalidateWorkspaceWarmup(
  workspacePath: string | null | undefined,
  reason: Parameters<typeof warmupManager.invalidateSnapshot>[1],
): void {
  const normalizedWorkspace = workspacePath?.trim()
  if (normalizedWorkspace) {
    warmupManager.invalidateSnapshot(normalizedWorkspace, reason)
  }
}

app.on('before-quit', () => {
  warmupManager.dispose()
  void runtimeService.dispose()
})

registerStudioMainIpcHandlers({
  ipcMainLike: ipcMain,
  selectWorkspaceDirectory: () =>
    smokeConfig.workspacePath
      ? Promise.resolve({
          ok: true as const,
          code: 'selected' as const,
          path: smokeConfig.workspacePath,
        })
      : selectWorkspaceDirectory({
          dialog: {
            showOpenDialog(browserWindow, options) {
              return browserWindow
                ? dialog.showOpenDialog(browserWindow, options)
                : dialog.showOpenDialog(options)
            },
          },
          fileSystem: {
            stat,
          },
          logger,
        }),
  mainWindowManager,
  inspectRuntime: (request, state) => runtimeInspector.inspect(request, state),
  submitRuntime: (request, state, emitRuntimeEvent) =>
    runtimeService.submit(request, state, emitRuntimeEvent),
  cancelRuntime: (request) => runtimeService.cancel(request),
  respondPermission: (response) =>
    runtimeService.respondToPermissionRequest(response),
  respondUserInput: (response) =>
    runtimeService.respondToUserInputRequest(response),
  inspectShell: (request, state) => shellInspector.inspect(request, state),
  getProviderSettings: (state) => providerSettingsService.getSnapshot(state),
  saveProviderSettings: async (input, state) => {
    const result = await providerSettingsService.save(input, state)
    if (result.success) {
      warmupManager.invalidateAll('provider-changed')
    }
    return result
  },
  testProviderConnection: (input, state) =>
    providerSettingsService.testConnection(input, state),
  getMemoryOverview: (state) => memoryService.getOverview(state),
  rebuildMemory: async (state) => {
    const result = await memoryService.rebuild(state)
    if (result.success) {
      invalidateWorkspaceWarmup(state.workspacePath, 'memory-changed')
    }
    return result
  },
  getMcpOverview: (state) => mcpService.getOverview(state),
  addMcpServer: async (input, state) => {
    const result = await mcpService.addServer(input, state)
    if (result.success) {
      warmupManager.invalidateAll('mcp-changed')
    }
    return result
  },
  deleteMcpServer: async (name, state) => {
    const result = await mcpService.deleteServer(name, state)
    if (result.success) {
      warmupManager.invalidateAll('mcp-changed')
    }
    return result
  },
  getSkillsPluginsOverview: (state) => skillsPluginsService.getOverview(state),
  prepareWarmupSelection: (request) => prepareWarmupSelection(request),
  onWorkspaceChanged: (() => {
    // 跟踪上一个 warmup workspace，切换时先 abort 旧路径再 start 新路径
    let previousWarmupWorkspace: string | null = null
    return (workspacePath: string) => {
      const normalizedWorkspace = normalizeRuntimePath(workspacePath)
      if (!normalizedWorkspace) {
        return
      }
      if (previousWarmupWorkspace && previousWarmupWorkspace !== normalizedWorkspace) {
        warmupManager.abortWarmup(previousWarmupWorkspace)
      }
      previousWarmupWorkspace = normalizedWorkspace
      startWorkspaceWarmup({ workspacePath: normalizedWorkspace })
    }
  })(),
  logger,
})

void startMainProcess({
  app,
  logger,
  mainWindowManager,
  platform: process.platform,
  runtimeProcess: process,
})
  .then(async () => {
    if (!smokeConfig.enabled) {
      return
    }

    const mainWindow = mainWindowManager.getMainWindow()
    const webContents = mainWindow?.webContents
    if (!webContents?.executeJavaScript) {
      throw new Error('Smoke 模式下无法访问 renderer webContents。')
    }
    const executeJavaScript = webContents.executeJavaScript.bind(webContents)

    try {
      await runSmokeScenario(
        {
          executeJavaScript,
          waitUntilReady: () => mainWindowManager.waitForMainWindowLoad(),
        },
        logger,
      )
      logger.info('Smoke 验证通过')
      await waitForLogFlush()
    } finally {
      app.quit()
    }
  })
  .catch((error) => {
    logger.error('Electron Host 启动或 smoke 失败', error)
    if (smokeConfig.enabled) {
      app.exit(1)
      return
    }
    process.exitCode = 1
  })
