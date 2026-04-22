import { describe, expect, it, vi } from 'vitest'
import type { BrowserWindowConstructorOptions } from 'electron'
import { createMainWindowManager } from '../src/main/window'

class FakeBrowserWindow {
  static instances: FakeBrowserWindow[] = []

  readonly loadURL = vi.fn<(url: string) => Promise<void>>().mockResolvedValue(undefined)
  readonly loadFile = vi.fn<(filePath: string) => Promise<void>>().mockResolvedValue(undefined)
  readonly focus = vi.fn()

  readonly options: BrowserWindowConstructorOptions

  private closedHandler?: () => void

  constructor(options: BrowserWindowConstructorOptions) {
    this.options = options
    FakeBrowserWindow.instances.push(this)
  }

  on(event: 'closed', handler: () => void): this {
    if (event === 'closed') {
      this.closedHandler = handler
    }

    return this
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
    const logger = createLogger()
    const manager = createMainWindowManager({
      BrowserWindow: FakeBrowserWindow,
      dirname: 'D:/studio/dist/main',
      env: {},
      logger,
    })

    const mainWindow = manager.showMainWindow()

    expect(FakeBrowserWindow.instances).toHaveLength(1)
    expect(mainWindow).toBe(FakeBrowserWindow.instances[0])
    expect(FakeBrowserWindow.instances[0]?.options.webPreferences?.contextIsolation).toBe(true)
    expect(FakeBrowserWindow.instances[0]?.options.webPreferences?.nodeIntegration).toBe(false)
    expect(FakeBrowserWindow.instances[0]?.loadURL).toHaveBeenCalledWith(
      expect.stringMatching(/^file:\/\/\/D:\/studio\/dist\/renderer\/index\.html$/),
    )
    expect(logger.info).toHaveBeenCalled()
  })

  it('开发环境重复显示主窗口时复用现有窗口并聚焦', async () => {
    FakeBrowserWindow.instances = []
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
    const secondWindow = manager.showMainWindow()

    expect(FakeBrowserWindow.instances).toHaveLength(1)
    expect(secondWindow).toBe(firstWindow)
    expect(FakeBrowserWindow.instances[0]?.loadURL).toHaveBeenCalledWith('http://127.0.0.1:5173')
    expect(FakeBrowserWindow.instances[0]?.focus).toHaveBeenCalledTimes(1)
  })

  it('窗口关闭后再次显示会重新创建窗口实例', () => {
    FakeBrowserWindow.instances = []
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
})
