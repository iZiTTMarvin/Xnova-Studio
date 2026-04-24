import type { MainLogger } from './logger'
import type { MainWindowManager } from './window'

export interface ElectronAppLike {
  whenReady(): Promise<void>
  on(event: 'activate' | 'window-all-closed', handler: () => void): this
  quit(): void
}

export interface RuntimeProcessLike {
  on(event: 'uncaughtException' | 'unhandledRejection', handler: (reason: unknown) => void): this
}

export interface StartMainProcessOptions {
  app: ElectronAppLike
  logger: Pick<MainLogger, 'info' | 'error'>
  mainWindowManager: Pick<MainWindowManager, 'showMainWindow'>
  platform?: NodeJS.Platform
  runtimeProcess?: RuntimeProcessLike
}

export async function startMainProcess(options: StartMainProcessOptions): Promise<void> {
  const runtimeProcess = options.runtimeProcess ?? process
  const platform = options.platform ?? process.platform

  runtimeProcess.on('uncaughtException', (error) => {
    options.logger.error('主进程未捕获异常', error)
  })

  runtimeProcess.on('unhandledRejection', (reason) => {
    options.logger.error('主进程未处理 Promise 拒绝', reason)
  })

  options.app.on('window-all-closed', () => {
    options.logger.info('所有主窗口已关闭')
    if (platform !== 'darwin') {
      options.app.quit()
    }
  })

  options.app.on('activate', () => {
    options.logger.info('应用重新激活，尝试恢复主窗口')
    options.mainWindowManager.showMainWindow()
  })

  try {
    await options.app.whenReady()
    options.logger.info('Electron 主进程已就绪')
    options.mainWindowManager.showMainWindow()
  } catch (error) {
    options.logger.error('Electron 主进程启动失败', error)
    throw error
  }
}
