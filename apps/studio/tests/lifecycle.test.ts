import { describe, expect, it, vi } from 'vitest'
import { startMainProcess } from '../src/main/lifecycle'

type AppEvent = 'activate' | 'window-all-closed'
type ProcessEvent = 'uncaughtException' | 'unhandledRejection'

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })

  return { promise, resolve, reject }
}

class FakeApp {
  readonly quit = vi.fn()

  private readonly handlers = new Map<AppEvent, Array<() => void>>()
  private readonly readyDeferred = createDeferred<void>()

  whenReady(): Promise<void> {
    return this.readyDeferred.promise
  }

  on(event: AppEvent, handler: () => void): this {
    const existingHandlers = this.handlers.get(event) ?? []
    existingHandlers.push(handler)
    this.handlers.set(event, existingHandlers)
    return this
  }

  emit(event: AppEvent): void {
    for (const handler of this.handlers.get(event) ?? []) {
      handler()
    }
  }

  resolveReady(): void {
    this.readyDeferred.resolve()
  }

  rejectReady(error: unknown): void {
    this.readyDeferred.reject(error)
  }
}

class FakeProcess {
  exitCode: number | undefined

  private readonly handlers = new Map<ProcessEvent, Array<(reason: unknown) => void>>()

  on(event: ProcessEvent, handler: (reason: unknown) => void): this {
    const existingHandlers = this.handlers.get(event) ?? []
    existingHandlers.push(handler)
    this.handlers.set(event, existingHandlers)
    return this
  }

  emit(event: ProcessEvent, reason: unknown): void {
    for (const handler of this.handlers.get(event) ?? []) {
      handler(reason)
    }
  }
}

function createLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }
}

describe('main process lifecycle', () => {
  it('应用 ready 后显示主窗口并输出启动日志', async () => {
    const app = new FakeApp()
    const runtimeProcess = new FakeProcess()
    const logger = createLogger()
    const mainWindowManager = {
      showMainWindow: vi.fn(),
    }

    const startPromise = startMainProcess({
      app,
      platform: 'win32',
      runtimeProcess,
      logger,
      mainWindowManager,
    })

    app.resolveReady()
    await startPromise

    expect(mainWindowManager.showMainWindow).toHaveBeenCalledTimes(1)
    expect(logger.info).toHaveBeenCalledWith('Electron 主进程已就绪')
  })

  it('关闭所有窗口后在非 macOS 平台退出应用', async () => {
    const app = new FakeApp()
    const runtimeProcess = new FakeProcess()
    const logger = createLogger()
    const mainWindowManager = {
      showMainWindow: vi.fn(),
    }

    const startPromise = startMainProcess({
      app,
      platform: 'win32',
      runtimeProcess,
      logger,
      mainWindowManager,
    })

    app.resolveReady()
    await startPromise
    app.emit('window-all-closed')

    expect(app.quit).toHaveBeenCalledTimes(1)
  })

  it('macOS 激活应用时重新显示主窗口', async () => {
    const app = new FakeApp()
    const runtimeProcess = new FakeProcess()
    const logger = createLogger()
    const mainWindowManager = {
      showMainWindow: vi.fn(),
    }

    const startPromise = startMainProcess({
      app,
      platform: 'darwin',
      runtimeProcess,
      logger,
      mainWindowManager,
    })

    app.resolveReady()
    await startPromise
    app.emit('activate')

    expect(mainWindowManager.showMainWindow).toHaveBeenCalledTimes(2)
    expect(app.quit).not.toHaveBeenCalled()
  })

  it('启动失败时记录错误并向调用方抛出', async () => {
    const app = new FakeApp()
    const runtimeProcess = new FakeProcess()
    const logger = createLogger()
    const mainWindowManager = {
      showMainWindow: vi.fn(),
    }
    const startupError = new Error('ready failed')

    const startPromise = startMainProcess({
      app,
      platform: 'win32',
      runtimeProcess,
      logger,
      mainWindowManager,
    })

    app.rejectReady(startupError)

    await expect(startPromise).rejects.toThrow('ready failed')
    expect(logger.error).toHaveBeenCalled()
  })

  it('uncaughtException 与 unhandledRejection 会输出宿主错误日志', async () => {
    const app = new FakeApp()
    const runtimeProcess = new FakeProcess()
    const logger = createLogger()
    const mainWindowManager = {
      showMainWindow: vi.fn(),
    }

    const startPromise = startMainProcess({
      app,
      platform: 'win32',
      runtimeProcess,
      logger,
      mainWindowManager,
    })

    app.resolveReady()
    await startPromise

    runtimeProcess.emit('uncaughtException', new Error('boom'))
    runtimeProcess.emit('unhandledRejection', 'bad promise')

    expect(logger.error).toHaveBeenNthCalledWith(1, '主进程未捕获异常', new Error('boom'))
    expect(logger.error).toHaveBeenNthCalledWith(2, '主进程未处理 Promise 拒绝', 'bad promise')
  })
})
