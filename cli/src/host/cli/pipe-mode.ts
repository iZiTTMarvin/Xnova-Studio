// src/host/cli/pipe-mode.ts

/**
 * CLI Host — Pipe Mode 入口
 *
 * 职责：封装 pipe-runner 调用，供 ccli.ts 薄入口消费。
 * 约束：不得 import runtime/ 内部模块
 */

export interface PipeModeOptions {
  prompt: string
  model?: string
  provider?: string
  yes?: boolean
  noTools?: boolean
  json?: boolean
  verbose?: boolean
}

/** 运行 Pipe Mode（单次提问，纯文本输出，执行完退出） */
export async function runPipeMode(opts: PipeModeOptions): Promise<void> {
  const { runPipe, readStdin } = await import('../../core/pipe-runner.js')
  const stdinContent = await readStdin()
  await runPipe({
    prompt: opts.prompt,
    stdinContent: stdinContent || undefined,
    model: opts.model,
    provider: opts.provider,
    yes: opts.yes ?? false,
    noTools: opts.noTools ?? false,
    json: opts.json ?? false,
    verbose: opts.verbose ?? false,
  })
}
