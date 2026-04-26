import { describe, expect, it, vi } from 'vitest'
import type { BrowserWindowConstructorOptions } from 'electron'
import { createMainWindowManager } from '../src/main/window'

class FakeBrowserWindow {
  static instances: FakeBrowserWindow[] = []
  static loadUrlPlan: Array<() => Promise<void>> = []

  readonly loadURL = vi.fn<(url: string) => Promise<void>>().mockImplementation(async () => {
    const nextStep = FakeBrowserWindow.loadUrlPlan.shift()
    if (!nextStep) {
      return undefined
    }

    return nextStep()
  })
  readonly loadFile = vi.fn<(filePath: string) => Promise<void>>().mockResolvedValue(undefined)
  readonly focus = vi.fn()

  readonly options: BrowserWindowConstructorOptions

  private closedHandler?: () => void
  private closeHandler?: () => void

  constructor(options: BrowserWindowConstructorOptions) {
    this.options = options
    FakeBrowserWindow.instances.push(this)
  }

  on(event: 'closed' | 'close', handler: () => void): this {
    if (event === 'closed') {
      this.closedHandler = handler
    }
    if (event === 'close') {
      this.closeHandler = handler
    }

    return this
  }

  emitClose(): void {
    this.closeHandler?.()
  }

  emitClosed(): void {
    this.closedHandler?.()
  }
}

function createLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }
}

describe('main window manager', () => {
  it('首次显示主窗口时创建窗口并加载本地 renderer 产物', async () => {
    FakeBrowserWindow.instances = []
    FakeBrowserWindow.loadUrlPlan = []
    const logger = createLogger()
    const manager = createMainWindowManager({
      BrowserWindow: FakeBrowserWindow,
      dirname: 'D:/studio/dist/main',
      env: {},
      logger,
    })

    const mainWindow = manager.showMainWindow()
    await manager.waitForMainWindowLoad()

    expect(FakeBrowserWindow.instances).toHaveLength(1)
    expect(mainWindow).toBe(FakeBrowserWindow.instances[0])
    expect(FakeBrowserWindow.instances[0]?.options.webPreferences?.contextIsolation).toBe(true)
    expect(FakeBrowserWindow.instances[0]?.options.webPreferences?.nodeIntegration).toBe(false)
    expect(FakeBrowserWindow.instances[0]?.options.webPreferences?.sandbox).toBe(true)
    expect(FakeBrowserWindow.instances[0]?.loadFile).toHaveBeenCalledWith(
      'D:\\studio\\dist\\renderer\\index.html',
    )
    expect(FakeBrowserWindow.instances[0]?.loadURL).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalled()
  })

  it('开发环境 URL 首次加载失败后会重试并最终成功', async () => {
    FakeBrowserWindow.instances = []
    FakeBrowserWindow.loadUrlPlan = [
      () => Promise.reject(new Error('connect ECONNREFUSED 127.0.0.1:5173')),
      () => Promise.resolve(),
    ]
    const logger = createLogger()
    const sleep = vi.fn(async () => {})
    const manager = createMainWindowManager({
      BrowserWindow: FakeBrowserWindow,
      dirname: 'D:/studio/dist/main',
      env: {
        ELECTRON_RENDERER_URL: 'http://127.0.0.1:5173',
      },
      logger,
      sleep,
    })

    const window = manager.showMainWindow()
    await manager.waitForMainWindowLoad()

    expect(FakeBrowserWindow.instances).toHaveLength(1)
    expect(window).toBe(FakeBrowserWindow.instances[0])
    expect(FakeBrowserWindow.instances[0]?.loadURL).toHaveBeenCalledWith('http://127.0.0.1:5173')
    expect(FakeBrowserWindow.instances[0]?.loadURL).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledTimes(1)
    expect(logger.warn).toHaveBeenCalled()
  })

  it('开发环境重复显示主窗口时复用现有窗口并聚焦', async () => {
    FakeBrowserWindow.instances = []
    FakeBrowserWindow.loadUrlPlan = []
    const logger = createLogger()
    const manager = createMainWindowManager({
      BrowserWindow: FakeBrowserWindow,
      dirname: 'D:/studio/dist/main',
      env: {
        ELECTRON_RENDERER_URL: 'http://127.0.0.1:5173',
      },
      logger,
    })

    const firstWindow = manager.showMainWindow()
    await manager.waitForMainWindowLoad()
    const secondWindow = manager.showMainWindow()

    expect(FakeBrowserWindow.instances).toHaveLength(1)
    expect(secondWindow).toBe(firstWindow)
    expect(FakeBrowserWindow.instances[0]?.focus).toHaveBeenCalledTimes(1)
  })

  it('窗口关闭后再次显示会重新创建窗口实例', () => {
    FakeBrowserWindow.instances = []
    FakeBrowserWindow.loadUrlPlan = []
    const logger = createLogger()
    const manager = createMainWindowManager({
      BrowserWindow: FakeBrowserWindow,
      dirname: 'D:/studio/dist/main',
      env: {},
      logger,
    })

    const firstWindow = manager.showMainWindow() as FakeBrowserWindow
    firstWindow.emitClosed()
    const secondWindow = manager.showMainWindow()

    expect(FakeBrowserWindow.instances).toHaveLength(2)
    expect(secondWindow).not.toBe(firstWindow)
    expect(manager.getMainWindow()).toBe(secondWindow)
  })

  it('窗口关闭前会触发 active runtime 清理钩子', () => {
    FakeBrowserWindow.instances = []
    FakeBrowserWindow.loadUrlPlan = []
    const logger = createLogger()
    const onBeforeWindowClose = vi.fn()
    const manager = createMainWindowManager({
      BrowserWindow: FakeBrowserWindow,
      dirname: 'D:/studio/dist/main',
      env: {},
      logger,
      onBeforeWindowClose,
    })

    const window = manager.showMainWindow() as FakeBrowserWindow
    window.emitClose()

    expect(onBeforeWindowClose).toHaveBeenCalledTimes(1)
  })
})
