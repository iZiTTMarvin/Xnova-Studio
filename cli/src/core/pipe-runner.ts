// src/core/pipe-runner.ts

/**
 * PipeRunner — 非交互模式执行器。
 *
 * Phase 1 修复点：
 * - Pipe Mode 不再直接 new AgentLoop
 * - 统一改由 runtime/createRuntime() 驱动单轮执行
 * - PipeRunner 只负责：组装输入、桥接 stdout/stderr、计算退出码
 */

import { buildArgsSummary, formatDuration } from '../ui/format-utils.js'
import { loadEffectiveRuntimeConfig } from '../config/resolver.js'
import { closeDb } from '../persistence/db.js'
import { createRuntime } from '../runtime/index.js'
import type { RuntimeEvent, RuntimeHostBridge } from '../runtime/types.js'
import type { Message } from './types.js'

export interface PipeOptions {
  prompt: string
  /** stdin 管道读取到的内容（为空表示无管道输入） */
  stdinContent?: string | undefined
  model?: string | undefined
  provider?: string | undefined
  /** 自动批准所有工具执行 */
  yes?: boolean | undefined
  /** 禁用工具调用 */
  noTools?: boolean | undefined
  /** JSON 格式输出 */
  json?: boolean | undefined
  /** 在 stderr 输出工具执行进度 */
  verbose?: boolean | undefined
}

export async function runPipe(options: PipeOptions): Promise<void> {
  // Phase 2 fix-A：主链路必须消费 resolved config（project > user > builtin），
  // 不再裸调 `configManager.load()`，否则 project.toml 无法影响运行时。
  const config = loadEffectiveRuntimeConfig(process.cwd())
  const providerName = options.provider ?? config.defaultProvider ?? ''
  const modelName = options.model ?? config.defaultModel ?? ''

  let userContent = options.prompt
  if (options.stdinContent) {
    userContent = `<stdin>\n${options.stdinContent}\n</stdin>\n\n${options.prompt}`
  }

  const history: Message[] = [{ role: 'user', content: userContent }]
  let exitCode = 0

  const bridge: RuntimeHostBridge = {
    emit(event: RuntimeEvent): void {
      handlePipeEvent(event, options)
      if (event.type === 'error') {
        exitCode = 1
      }
    },

    async requestPermission(input) {
      if (options.noTools) {
        return { allow: false }
      }
      return { allow: options.yes === true }
    },
  }

  const runtime = await createRuntime({
    cwd: process.cwd(),
    config,
    mode: 'standard',
  }, bridge)

  // SIGINT 时优雅中断本轮 runtime
  const onSigint = () => { runtime.abort() }
  process.on('SIGINT', onSigint)

  try {
    const result = await runtime.submit({
      text: userContent,
      provider: providerName,
      model: modelName,
      history,
      loggedUserContent: userContent,
      nonInteractive: true,
      waitForMcp: options.noTools !== true,
    })

    if (result.error) {
      exitCode = 1
      if (!options.json) {
        process.stderr.write(`Error: ${result.error}\n`)
      }
    }

    if (options.json) {
      const output = {
        response: result.text,
        model: modelName,
        provider: providerName,
        usage: {
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          cacheReadTokens: result.usage.cacheReadTokens,
          cacheWriteTokens: result.usage.cacheWriteTokens,
        },
        exitCode,
      }
      process.stdout.write(JSON.stringify(output, null, 2) + '\n')
    } else if (result.text && !result.text.endsWith('\n')) {
      process.stdout.write('\n')
    }
  } finally {
    process.off('SIGINT', onSigint)
    await runtime.dispose()
    closeDb()
  }

  process.exit(exitCode)
}

function handlePipeEvent(event: RuntimeEvent, options: PipeOptions): void {
  if (event.type === 'text_delta') {
    const text = typeof event.payload?.['text'] === 'string' ? event.payload['text'] : ''
    if (!options.json && text) {
      process.stdout.write(text)
    }
    return
  }

  if (event.type === 'tool_start' && options.verbose) {
    const toolName = typeof event.payload?.['toolName'] === 'string' ? event.payload['toolName'] : 'unknown'
    const args = isObjectRecord(event.payload?.['args']) ? event.payload['args'] : {}
    const summary = buildArgsSummary(toolName, args)
    process.stderr.write(`[tool] ${toolName}: ${summary}...`)
    return
  }

  if (event.type === 'tool_end' && options.verbose) {
    const success = event.payload?.['success'] === true
    const durationMs = typeof event.payload?.['durationMs'] === 'number' ? event.payload['durationMs'] : 0
    const resultSummary = typeof event.payload?.['resultSummary'] === 'string' ? event.payload['resultSummary'] : ''
    const icon = success ? '✓' : '✗'
    const duration = formatDuration(durationMs)
    const meta = resultSummary ? `  ${resultSummary.split('\n')[0]!.slice(0, 60)}` : ''
    process.stderr.write(` ${icon}${meta}  ${duration}\n`)
    return
  }

  if (event.type === 'error' && !options.json) {
    const message = typeof event.payload?.['error'] === 'string' ? event.payload['error'] : 'unknown error'
    process.stderr.write(`Error: ${message}\n`)
  }
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** 从 stdin 读取管道内容（非 TTY 时） */
export function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      resolve('')
      return
    }
    const chunks: Buffer[] = []
    process.stdin.on('data', (chunk: Buffer) => chunks.push(chunk))
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    process.stdin.resume()
  })
}
