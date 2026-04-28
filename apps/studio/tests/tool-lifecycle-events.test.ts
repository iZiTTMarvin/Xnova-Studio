/**
 * 工具生命周期事件测试。
 *
 * 验证 AgentLoop 在不同 provider 场景下发出的事件顺序：
 * - 支持 tool_call_delta 的 provider：tool_intent -> tool_args_delta* -> tool_ready -> tool_start -> tool_done
 * - 不支持 delta 的旧 provider：tool_intent -> tool_ready -> tool_start -> tool_done
 */

import { describe, expect, it } from 'vitest'
import { AgentLoop } from '@core/agent-loop'
import { ToolRegistry } from '@tools/core/registry.js'
import type { LLMProvider } from '@providers/provider.js'
import type { Tool, ToolContext, ToolResult } from '@tools/core/types.js'
import type { StreamChunk } from '@core/types.js'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function createWriteFileTool(): Tool {
  return {
    name: 'write_file',
    dangerous: true,
    description: 'write file',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        content: { type: 'string' },
      },
    },
    async execute(args: Record<string, unknown>): Promise<ToolResult> {
      return { success: true, output: 'write ok' }
    },
  }
}

describe('工具生命周期事件', () => {
  it('支持 delta 的 provider：事件顺序为 tool_intent -> tool_args_delta -> tool_ready -> tool_start -> tool_done', async () => {
    const events: string[] = []
    const argsDeltas: Array<Record<string, unknown>> = []
    let chatCallCount = 0

    // 模拟支持 tool_call_delta 的 provider
    const provider: LLMProvider = {
      name: 'fake-delta-provider',
      protocol: 'openai-compat',
      async *chat(): AsyncIterable<StreamChunk> {
        chatCallCount++
        if (chatCallCount === 1) {
          yield { type: 'text', text: '我来写个文件。' }

          // 先发 tool_call_delta（工具名）
          yield {
            type: 'tool_call_delta',
            toolCallDelta: {
              toolCallId: 'tc-1',
              toolName: 'write_file',
            },
          }

          // 再发参数增量
          yield {
            type: 'tool_call_delta',
            toolCallDelta: {
              toolCallId: 'tc-1',
              argumentsDelta: '{"path":"test.txt","content":"',
            },
          }

          yield {
            type: 'tool_call_delta',
            toolCallDelta: {
              toolCallId: 'tc-1',
              argumentsDelta: 'hello"}',
            },
          }

          // 最终 tool_call（参数完整）
          yield {
            type: 'tool_call',
            toolCall: {
              type: 'tool_call',
              toolCallId: 'tc-1',
              toolName: 'write_file',
              args: { path: 'test.txt', content: 'hello' },
            },
          }

          yield { type: 'done', stopReason: 'tool_calls' }
          return
        }
        yield { type: 'done', stopReason: 'end_turn' }
      },
      async countTokens() { return 0 },
      isModelSupported() { return true },
    }

    const registry = new ToolRegistry()
    registry.register(createWriteFileTool())

    const loop = new AgentLoop(provider, registry, {
      cwd: '/tmp',
      model: 'fake',
      provider: 'fake-delta-provider',
      isSidechain: true,
    })

    for await (const event of loop.run([{ role: 'user', content: '写个文件' }])) {
      if (
        event.type === 'tool_intent' ||
        event.type === 'tool_args_delta' ||
        event.type === 'tool_ready' ||
        event.type === 'tool_start' ||
        event.type === 'tool_done'
      ) {
        events.push(event.type)
        if (event.type === 'tool_args_delta') {
          argsDeltas.push(event.argsSoFar)
        }
      }
    }

    // 验证事件顺序
    expect(events).toEqual([
      'tool_intent',
      'tool_args_delta',
      'tool_args_delta',
      'tool_ready',
      'tool_start',
      'tool_done',
    ])
    expect(argsDeltas).toEqual([
      { path: 'test.txt' },
      { path: 'test.txt', content: 'hello' },
    ])
  })

  it('不支持 delta 的旧 provider：事件顺序为 tool_intent -> tool_ready -> tool_start -> tool_done', async () => {
    const events: string[] = []
    let chatCallCount = 0

    // 模拟不支持 delta 的旧 provider（只发最终 tool_call）
    const provider: LLMProvider = {
      name: 'fake-legacy-provider',
      protocol: 'openai-compat',
      async *chat(): AsyncIterable<StreamChunk> {
        chatCallCount++
        if (chatCallCount === 1) {
          yield { type: 'text', text: '我来写个文件。' }

          // 直接发最终 tool_call，没有 delta
          yield {
            type: 'tool_call',
            toolCall: {
              type: 'tool_call',
              toolCallId: 'tc-1',
              toolName: 'write_file',
              args: { path: 'test.txt', content: 'hello' },
            },
          }

          yield { type: 'done', stopReason: 'tool_calls' }
          return
        }
        yield { type: 'done', stopReason: 'end_turn' }
      },
      async countTokens() { return 0 },
      isModelSupported() { return true },
    }

    const registry = new ToolRegistry()
    registry.register(createWriteFileTool())

    const loop = new AgentLoop(provider, registry, {
      cwd: '/tmp',
      model: 'fake',
      provider: 'fake-legacy-provider',
      isSidechain: true,
    })

    for await (const event of loop.run([{ role: 'user', content: '写个文件' }])) {
      if (
        event.type === 'tool_intent' ||
        event.type === 'tool_args_delta' ||
        event.type === 'tool_ready' ||
        event.type === 'tool_start' ||
        event.type === 'tool_done'
      ) {
        events.push(event.type)
      }
    }

    // 旧路径：没有 delta，但仍有 intent 和 ready
    expect(events).toEqual([
      'tool_intent',
      'tool_ready',
      'tool_start',
      'tool_done',
    ])
  })

  it('tool_ready 必须在 tool_start 之前', async () => {
    const events: Array<{ type: string; toolCallId?: string }> = []
    let chatCallCount = 0

    const provider: LLMProvider = {
      name: 'fake',
      protocol: 'openai-compat',
      async *chat(): AsyncIterable<StreamChunk> {
        chatCallCount++
        if (chatCallCount === 1) {
          yield {
            type: 'tool_call',
            toolCall: {
              type: 'tool_call',
              toolCallId: 'tc-1',
              toolName: 'write_file',
              args: { path: 'a.txt', content: 'x' },
            },
          }
          yield { type: 'done', stopReason: 'tool_calls' }
          return
        }
        yield { type: 'done', stopReason: 'end_turn' }
      },
      async countTokens() { return 0 },
      isModelSupported() { return true },
    }

    const registry = new ToolRegistry()
    registry.register(createWriteFileTool())

    const loop = new AgentLoop(provider, registry, {
      cwd: '/tmp',
      model: 'fake',
      provider: 'fake',
      isSidechain: true,
    })

    for await (const event of loop.run([{ role: 'user', content: 'go' }])) {
      if ('toolCallId' in event) {
        events.push({ type: event.type, toolCallId: (event as { toolCallId: string }).toolCallId })
      }
    }

    const readyIdx = events.findIndex((e) => e.type === 'tool_ready')
    const startIdx = events.findIndex((e) => e.type === 'tool_start')
    expect(readyIdx).toBeGreaterThanOrEqual(0)
    expect(startIdx).toBeGreaterThan(readyIdx)
  })
})
