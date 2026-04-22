import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { BrowserWindowConstructorOptions } from 'electron'
import { createMainWindowOptions, resolveRendererTarget } from './app-shell'
import type { MainLogger } from './logger'

export interface BrowserWindowLike {
  loadURL(url: string): Promise<unknown> | unknown
  loadFile(filePath: string): Promise<unknown> | unknown
  on(event: 'closed', handler: () => void): this
  focus?(): void
  webContents?: {
    send(channel: string, payload: unknown): void
    executeJavaScript?(script: string): Promise<unknown>
    once?(event: 'did-finish-load', listener: () => void): void
  }
}

export interface BrowserWindowConstructor {
  new (options: BrowserWindowConstructorOptions): BrowserWindowLike
}

export interface MainWindowManager {
  getMainWindow(): BrowserWindowLike | null
  showMainWindow(): BrowserWindowLike
}

export interface MainWindowManagerOptions {
  BrowserWindow: BrowserWindowConstructor
  dirname?: string
  env?: {
    ELECTRON_RENDERER_URL?: string | undefined
  }
  logger: Pick<MainLogger, 'info' | 'error'>
  pathUtils?: Pick<typeof path, 'join'>
}

export function createMainWindowManager(options: MainWindowManagerOptions): MainWindowManager {
  const pathUtils = options.pathUtils ?? path
  const dirname = options.dirname ?? __dirname
  const env = options.env ?? process.env
  let mainWindow: BrowserWindowLike | null = null

  function createWindow(): BrowserWindowLike {
    const preloadPath = pathUtils.join(dirname, '../preload/index.js')
    const rendererHtmlPath = pathUtils.join(dirname, '../renderer/index.html')
    const windowInstance = new options.BrowserWindow(createMainWindowOptions(preloadPath))
    const rendererTarget = resolveRendererTarget({
      rendererHtmlPath,
      ...(env.ELECTRON_RENDERER_URL ? { devServerUrl: env.ELECTRON_RENDERER_URL } : {}),
    })

    windowInstance.on('closed', () => {
      mainWindow = null
      options.logger.info('主窗口已关闭')
    })

    const loadPromise =
      rendererTarget.type === 'url'
        ? Promise.resolve(windowInstance.loadURL(rendererTarget.value))
        : Promise.resolve(
            windowInstance.loadURL(pathToFileURL(rendererTarget.value).toString()),
          )

    void loadPromise.catch((error) => {
      options.logger.error('主窗口内容加载失败', error)
    })

    options.logger.info('主窗口已创建', {
      target: rendererTarget.value,
      targetType: rendererTarget.type,
    })

    return windowInstance
  }

  return {
    getMainWindow() {
      return mainWindow
    },
    showMainWindow() {
      if (mainWindow) {
        mainWindow.focus?.()
        options.logger.info('主窗口已存在，执行聚焦')
        return mainWindow
      }

      mainWindow = createWindow()
      return mainWindow
    },
  }
}
