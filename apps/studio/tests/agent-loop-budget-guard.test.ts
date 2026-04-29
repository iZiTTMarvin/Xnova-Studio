import { describe, expect, it } from 'vitest'
import { AgentLoop, type AgentEvent } from '@core/agent-loop'
import { ToolRegistry } from '@tools/core/registry.js'
import type { LLMProvider } from '@providers/provider.js'
import type { Tool, ToolContext, ToolResult } from '@tools/core/types.js'
import type { Message } from '@core/types'

function createBudgetTestRegistry(): ToolRegistry {
  const registry = new ToolRegistry()
  const tool: Tool = {
    name: 'read_file',
    dangerous: false,
    description: 'read file',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
      },
      required: ['path'],
    },
    async execute(
      args: Record<string, unknown>,
      _ctx: ToolContext,
    ): Promise<ToolResult> {
      return {
        success: true,
        output: `读取成功: ${String(args.path ?? 'unknown')}`,
      }
    },
  }
  registry.register(tool)
  return registry
}

describe('AgentLoop 轮次预算与卡死保护', () => {
  it('after_tool_result 超过预算前先收束，仍继续调用工具时安全停止', async () => {
    let chatCalls = 0
    const provider: LLMProvider = {
      name: 'budget-test-provider',
      protocol: 'openai-compat',
      async *chat() {
        chatCalls += 1
        yield {
          type: 'tool_call',
          toolCall: {
            type: 'tool_call',
            toolCallId: `tool-${chatCalls}`,
            toolName: 'read_file',
            args: { path: `file-${chatCalls}.ts` },
          },
        } as const
        yield { type: 'done', stopReason: 'tool_calls' } as const
      },
      async countTokens() {
        return 0
      },
      isModelSupported() {
        return true
      },
    }

    const history: Message[] = [{ role: 'user', content: '持续读取文件' }]
    const loop = new AgentLoop(provider, createBudgetTestRegistry(), {
      cwd: 'D:/workspace/demo',
      model: 'fake-model',
      provider: provider.name,
      maxTurns: 10,
      maxAfterToolResultRequests: 2,
      maxLowProgressRounds: 99,
    })

    const events: AgentEvent[] = []
    for await (const event of loop.run(history)) {
      events.push(event)
    }

    const guardEvents = getLoopGuardEvents(events)
    expect(guardEvents.map((event) => event.reason)).toEqual([
      'budget_near_limit',
      'budget_exceeded',
    ])
    expect(guardEvents.map((event) => event.level)).toEqual(['warning', 'stopped'])
    expect(events.at(-1)).toMatchObject({ type: 'done', reason: 'budget_exceeded' })
    expect(chatCalls).toBe(3)
    expect(JSON.stringify(history)).toContain('接近本次运行的工具反馈轮次上限')
  })

  it('软收束后模型停止工具调用时正常完成', async () => {
    let chatCalls = 0
    const provider: LLMProvider = {
      name: 'budget-converge-provider',
      protocol: 'openai-compat',
      async *chat(request) {
        chatCalls += 1
        if (JSON.stringify(request.messages).includes('接近本次运行的工具反馈轮次上限')) {
          yield { type: 'text', text: '基于已有结果总结完成。' } as const
          yield { type: 'done', stopReason: 'end_turn' } as const
          return
        }
        yield {
          type: 'tool_call',
          toolCall: {
            type: 'tool_call',
            toolCallId: `tool-${chatCalls}`,
            toolName: 'read_file',
            args: { path: `file-${chatCalls}.ts` },
          },
        } as const
        yield { type: 'done', stopReason: 'tool_calls' } as const
      },
      async countTokens() {
        return 0
      },
      isModelSupported() {
        return true
      },
    }

    const loop = new AgentLoop(provider, createBudgetTestRegistry(), {
      cwd: 'D:/workspace/demo',
      model: 'fake-model',
      provider: provider.name,
      maxTurns: 6,
      maxAfterToolResultRequests: 1,
      maxLowProgressRounds: 99,
    })

    const events: AgentEvent[] = []
    for await (const event of loop.run([{ role: 'user', content: '读取后总结' }])) {
      events.push(event)
    }

    expect(events.some((event) => event.type === 'text')).toBe(true)
    expect(events.filter((event) => event.type === 'loop_guard')).toHaveLength(1)
    expect(events.at(-1)).toMatchObject({ type: 'done', reason: 'complete' })
    expect(chatCalls).toBe(2)
  })

  it('连续低进展工具轮次会先提示收束，再安全停止为 stalled', async () => {
    let chatCalls = 0
    const provider: LLMProvider = {
      name: 'stalled-test-provider',
      protocol: 'openai-compat',
      async *chat() {
        chatCalls += 1
        yield {
          type: 'tool_call',
          toolCall: {
            type: 'tool_call',
            toolCallId: `tool-${chatCalls}`,
            toolName: 'read_file',
            args: { path: `stalled-${chatCalls}.ts` },
          },
        } as const
        yield { type: 'done', stopReason: 'tool_calls' } as const
      },
      async countTokens() {
        return 0
      },
      isModelSupported() {
        return true
      },
    }

    const loop = new AgentLoop(provider, createBudgetTestRegistry(), {
      cwd: 'D:/workspace/demo',
      model: 'fake-model',
      provider: provider.name,
      maxTurns: 8,
      maxAfterToolResultRequests: 6,
      maxLowProgressRounds: 1,
    })

    const events: AgentEvent[] = []
    for await (const event of loop.run([{ role: 'user', content: '不要输出文字，只读文件' }])) {
      events.push(event)
    }

    const guardEvents = getLoopGuardEvents(events)
    expect(guardEvents.map((event) => event.reason)).toEqual(['stalled', 'stalled'])
    expect(guardEvents.map((event) => event.level)).toEqual(['warning', 'stopped'])
    expect(events.at(-1)).toMatchObject({ type: 'done', reason: 'stalled' })
    expect(chatCalls).toBe(2)
  })
})

function getLoopGuardEvents(
  events: AgentEvent[],
): Array<Extract<AgentEvent, { type: 'loop_guard' }>> {
  return events.filter(
    (event): event is Extract<AgentEvent, { type: 'loop_guard' }> =>
      event.type === 'loop_guard',
  )
}
