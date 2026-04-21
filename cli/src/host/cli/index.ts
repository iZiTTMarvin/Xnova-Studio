// src/host/cli/index.ts

/**
 * CLI Host 公共导出
 *
 * Host 消费方（ccli.ts）通过此文件使用 CLI host 能力。
 */

export { startRepl } from './repl.js'
export { runPipeMode } from './pipe-mode.js'
export { runCliHost } from './launcher.js'
export { registerLifecycle, printResumeHint, getResumeCommand } from './lifecycle.js'
export type { ReplOptions, ReplHandle } from './repl.js'
export type { PipeModeOptions } from './pipe-mode.js'
export type { CliHostArgs } from './launcher.js'
export type { LifecycleOptions } from './lifecycle.js'
