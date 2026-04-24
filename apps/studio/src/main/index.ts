import { stat } from 'node:fs/promises'
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
import { createStudioRuntimeService } from './studio-runtime-service'
import { createMainWindowManager } from './window'
import { selectWorkspaceDirectory } from './workspace'
import { createEngineServiceApi } from '@xnova/runtime'

function waitForLogFlush(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 20)
  })
}

const logger = createMainLogger()
const smokeConfig = readSmokeConfig(process.env)
const engineServiceApi = createEngineServiceApi()
const runtimeInspector = createStudioRuntimeInspector()
const runtimeService = createStudioRuntimeService({
  engineServiceApi,
  logger,
})
const shellInspector = createStudioShellInspector({
  onPerformanceSample(sample) {
    logger.info('shell inspector 性能采样', sample)
  },
})
const providerSettingsService = createStudioProviderSettingsService()
const memoryService = createStudioMemoryService({
  engineServiceApi,
})
const mcpService = createStudioMcpService({
  engineServiceApi,
})
const skillsPluginsService = createStudioSkillsPluginsService({
  engineServiceApi,
})
const mainWindowManager = createMainWindowManager({
  BrowserWindow,
  logger,
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
  inspectShell: (request, state) => shellInspector.inspect(request, state),
  getProviderSettings: (state) => providerSettingsService.getSnapshot(state),
  saveProviderSettings: (input, state) => providerSettingsService.save(input, state),
  testProviderConnection: (input, state) =>
    providerSettingsService.testConnection(input, state),
  getMemoryOverview: (state) => memoryService.getOverview(state),
  rebuildMemory: (state) => memoryService.rebuild(state),
  getMcpOverview: (state) => mcpService.getOverview(state),
  addMcpServer: (input, state) => mcpService.addServer(input, state),
  deleteMcpServer: (name, state) => mcpService.deleteServer(name, state),
  getSkillsPluginsOverview: (state) => skillsPluginsService.getOverview(state),
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
