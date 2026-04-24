import { readFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { dbg } from '../debug.js'
import { HookRunner } from './hook-runner.js'
import type {
  HookEventType,
  HooksConfig,
  ResolvedHookEntry,
  HookContext,
} from './types.js'

export class HookManager {
  #entries: ResolvedHookEntry[] = []
  readonly #runner: HookRunner

  constructor(runner?: HookRunner) {
    this.#runner = runner ?? new HookRunner()
  }

  async discoverFromFile(
    filePath: string,
    source: ResolvedHookEntry['source'],
    pluginName?: string,
  ): Promise<void> {
    try {
      const raw = await readFile(filePath, 'utf-8')
      const config: HooksConfig = JSON.parse(raw)
      const cwd = dirname(filePath)

      for (const [eventStr, rules] of Object.entries(config.hooks)) {
        const event = eventStr as HookEventType
        if (!rules) {
          continue
        }
        for (const rule of rules) {
          const matcher = new RegExp(rule.matcher)
          for (const action of rule.hooks) {
            const entry: ResolvedHookEntry = { source, event, matcher, action, cwd }
            if (pluginName) {
              entry.pluginName = pluginName
            }
            this.#entries.push(entry)
          }
        }
      }
    } catch (error) {
      dbg(
        `[HookManager] hook 配置加载失败 source=${source}: ${
          error instanceof Error ? error.message : String(error)
        }\n`,
      )
    }
  }

  getHooks(event: HookEventType): ResolvedHookEntry[] {
    return this.#entries.filter((entry) => entry.event === event)
  }

  getMatchedHooks(event: HookEventType, trigger: string): ResolvedHookEntry[] {
    return this.#entries.filter((entry) => entry.event === event && entry.matcher.test(trigger))
  }

  async run(
    event: HookEventType,
    ctx: HookContext,
  ): Promise<Array<Record<string, unknown> | null>> {
    const matched = this.getMatchedHooks(event, ctx.trigger)
    const results: Array<Record<string, unknown> | null> = []

    for (const entry of matched) {
      const env: Record<string, string> = { ...ctx.env }
      if (entry.pluginName) {
        env.CCODE_PLUGIN_ROOT = entry.cwd
      }
      const runOpts: import('./hook-runner.js').RunOptions = {
        command: entry.action.command,
        cwd: entry.cwd,
        env,
        timeout: entry.action.timeout ?? 10000,
      }
      if (ctx.stdin) {
        runOpts.stdin = ctx.stdin
      }
      const result = await this.#runner.run(runOpts)
      results.push(result)
    }

    return results
  }
}
