import path from 'node:path'
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
  waitForMainWindowLoad(): Promise<void>
}

export interface MainWindowManagerOptions {
  BrowserWindow: BrowserWindowConstructor
  dirname?: string
  env?: {
    ELECTRON_RENDERER_URL?: string | undefined
  }
  logger: Pick<MainLogger, 'info' | 'warn' | 'error'>
  maxUrlLoadAttempts?: number
  pathUtils?: Pick<typeof path, 'join'>
  sleep?: (ms: number) => Promise<void>
  urlRetryDelayMs?: number
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

export function createMainWindowManager(options: MainWindowManagerOptions): MainWindowManager {
  const pathUtils = options.pathUtils ?? path
  const dirname = options.dirname ?? __dirname
  const env = options.env ?? process.env
  const sleep = options.sleep ?? delay
  const maxUrlLoadAttempts = options.maxUrlLoadAttempts ?? 4
  const urlRetryDelayMs = options.urlRetryDelayMs ?? 150
  let mainWindow: BrowserWindowLike | null = null
  let mainWindowLoadPromise: Promise<void> = Promise.resolve()

  async function loadRendererContent(
    windowInstance: BrowserWindowLike,
    rendererTarget: ReturnType<typeof resolveRendererTarget>,
  ): Promise<void> {
    if (rendererTarget.type === 'file') {
      await Promise.resolve(windowInstance.loadFile(rendererTarget.value))
      return
    }

    for (let attempt = 1; attempt <= maxUrlLoadAttempts; attempt += 1) {
      try {
        await Promise.resolve(windowInstance.loadURL(rendererTarget.value))
        return
      } catch (error) {
        if (attempt === maxUrlLoadAttempts) {
          throw error
        }

        options.logger.warn('开发态 renderer 地址暂不可用，准备重试', {
          attempt,
          target: rendererTarget.value,
        })
        await sleep(urlRetryDelayMs)
      }
    }
  }

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
      mainWindowLoadPromise = Promise.resolve()
      options.logger.info('主窗口已关闭')
    })

    mainWindowLoadPromise = loadRendererContent(windowInstance, rendererTarget)
    void mainWindowLoadPromise.catch((error) => {
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
    waitForMainWindowLoad() {
      return mainWindowLoadPromise
    },
  }
}
