// src/host/cli/launcher.ts

/**
 * CLI Host Launcher
 *
 * 负责把 ccli.ts 中与宿主相关的装配细节下沉到 host 层：
 * - 初始化目录与提示
 * - Pipe Mode / REPL 模式选择
 * - 工作区信任检查
 * - REPL 生命周期依赖装配
 */

import { initialize } from '../../core/initializer.js'
import { stopFileWatcher } from '../../core/bootstrap.js'
import { closeDb } from '../../persistence/index.js'
import { leaveAlternateScreen } from '../../ui/terminal-screen.js'
import { getCurrentSessionId, sessionLogger } from '../../ui/useChat.js'
import { registerLifecycle } from './lifecycle.js'
import { runPipeMode, type PipeModeOptions } from './pipe-mode.js'
import { startRepl } from './repl.js'

export interface CliHostArgs {
  prompt: string | null
  model: string | null
  provider: string | null
  resumeSessionId: string | undefined
  showResumeOnStart: boolean
  yes: boolean
  noTools: boolean
  json: boolean
  verbose: boolean
  web: boolean
  help: boolean
  version: boolean
}

export async function runCliHost(args: CliHostArgs): Promise<void> {
  // 过滤 Node.js 内部警告，不泄露到用户终端
  process.on('warning', (warning) => {
    if (warning.name === 'MaxListenersExceededWarning') return
  })

  const initResult = initialize()
  if (initResult.created.length > 0) {
    process.stderr.write(`[init] 已创建: ${initResult.created.join(', ')}\n`)
  }
  for (const warn of initResult.warnings) {
    process.stderr.write(`[init] ⚠ ${warn}\n`)
  }

  if (args.prompt != null) {
    await runPipeMode({
      prompt: args.prompt,
      ...(args.model != null ? { model: args.model } : {}),
      ...(args.provider != null ? { provider: args.provider } : {}),
      yes: args.yes,
      noTools: args.noTools,
      json: args.json,
      verbose: args.verbose,
    } satisfies PipeModeOptions)
    return
  }

  const { isSensitiveDirectory, confirmWorkspaceTrust } = await import('../../core/workspace-trust.js')
  if (isSensitiveDirectory(process.cwd())) {
    const trusted = await confirmWorkspaceTrust(process.cwd())
    if (!trusted) {
      process.exit(0)
      return
    }
  }

  const { unmount } = await startRepl({
    ...(args.resumeSessionId != null ? { resumeSessionId: args.resumeSessionId } : {}),
    showResumeOnStart: args.showResumeOnStart,
    ...(args.model != null ? { model: args.model } : {}),
    ...(args.provider != null ? { provider: args.provider } : {}),
    web: args.web,
    getSessionId: () => getCurrentSessionId(),
  })

  registerLifecycle({
    getSessionId: () => getCurrentSessionId(),
    unmount,
    stopFileWatcher,
    finalizeSession: () => sessionLogger.finalize(),
    closeDb,
    leaveAlternateScreen,
  })
}
