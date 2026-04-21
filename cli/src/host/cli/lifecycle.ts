// src/host/cli/lifecycle.ts

/**
 * CLI Host Lifecycle — 终端专属生命周期管理
 *
 * 职责：
 * - SIGINT / Ctrl+C 处理
 * - 备用屏幕（alternate screen）还原
 * - 退出时打印 resume 提示
 * - 文件监听 / DB / session 清理
 *
 * 约束：不得 import runtime/ 内部模块（只消费 runtime 公共接口）
 */

import { APP_VERSION } from '../../version.js'

/** 生成 resume 命令字符串 */
export function getResumeCommand(sessionId: string): string {
  const entry = process.argv[1] ?? ''
  if (entry.endsWith('ccli.js') || entry.endsWith('xnova') || entry.endsWith('ccli')) {
    return `xnova --resume ${sessionId}`
  }
  return `pnpm run dev -- --resume ${sessionId}`
}

/** 打印 resume 提示（幂等，只打印一次） */
let resumeHintPrinted = false
export function printResumeHint(getSessionId: () => string | null): void {
  if (resumeHintPrinted) return
  resumeHintPrinted = true
  const sessionId = getSessionId()
  if (sessionId) {
    const cmd = getResumeCommand(sessionId)
    process.stdout.write(`\nResume this session with:\n  ${cmd}\n\n`)
  }
}

export interface LifecycleOptions {
  /** 获取当前 sessionId（mount 后才有值） */
  getSessionId: () => string | null
  /** 卸载 Ink 渲染 */
  unmount: () => void
  /** 停止文件监听 */
  stopFileWatcher: () => void
  /** 结束 session 日志 */
  finalizeSession: () => void
  /** 关闭数据库 */
  closeDb: () => void
  /** 还原备用屏幕 */
  leaveAlternateScreen: () => void
}

/** 注册 CLI 退出 lifecycle（SIGINT + process.on('exit')） */
export function registerLifecycle(opts: LifecycleOptions): void {
  const exitGracefully = () => {
    opts.stopFileWatcher()
    opts.finalizeSession()
    opts.closeDb()
    opts.unmount()
    opts.leaveAlternateScreen()
    printResumeHint(opts.getSessionId)
    process.exit(0)
  }

  process.on('SIGINT', exitGracefully)
  process.on('exit', () => {
    opts.leaveAlternateScreen()
    printResumeHint(opts.getSessionId)
  })
}
