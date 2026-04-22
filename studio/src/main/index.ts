import { stat } from 'node:fs/promises'
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { registerStudioMainIpcHandlers } from './studio-ipc'
import { startMainProcess } from './lifecycle'
import { createMainLogger } from './logger'
import { readSmokeConfig, runSmokeScenario } from './smoke'
import { createMainWindowManager } from './window'
import { selectWorkspaceDirectory } from './workspace'

const logger = createMainLogger()
const smokeConfig = readSmokeConfig(process.env)
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
    const executeJavaScript = mainWindow?.webContents?.executeJavaScript
    const once = mainWindow?.webContents?.once
    if (!executeJavaScript) {
      throw new Error('Smoke 模式下无法访问 renderer webContents。')
    }

    try {
      await runSmokeScenario(
        {
          executeJavaScript,
          ...(once ? { once } : {}),
        },
        logger,
      )
    } finally {
      app.quit()
    }
  })
  .catch(() => {
    if (smokeConfig.enabled) {
      app.quit()
    }
    process.exitCode = 1
  })
