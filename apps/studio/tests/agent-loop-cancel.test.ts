import { describe, expect, it, vi } from 'vitest'
import { AgentLoop } from '@xnova/core'
import { ToolRegistry } from '@tools/core/registry.js'
import type { LLMProvider } from '@providers/provider.js'
import type { Tool, ToolContext, ToolResult } from '@tools/core/types.js'
import type { AgentEvent } from '@xnova/core'

describe('AgentLoop cancel', () => {
  it('requestStop 后不再继续执行后续危险工具', async () => {
    const registry = new ToolRegistry()
    const executedTools: string[] = []
    let loop: AgentLoop | null = null

    const createDangerousTool = (name: string): Tool => ({
      name,
      dangerous: true,
      description: name,
      parameters: {
        type: 'object',
        properties: {},
      },
      async execute(_args: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> {
        executedTools.push(name)
        if (name === 'write_file') {
          loop?.requestStop()
        }
        return {
          success: true,
          output: `${name} done`,
        }
      },
    })

    registry.register(createDangerousTool('write_file'))
    registry.register(createDangerousTool('read_file'))

    const provider: LLMProvider = {
      name: 'fake',
      protocol: 'openai-compat',
      async *chat() {
        yield {
          type: 'tool_call' as const,
          toolCall: {
            type: 'tool_call' as const,
            toolCallId: 'tool-1',
            toolName: 'write_file',
            args: { path: 'SPEC.md' },
          },
        }
        yield {
          type: 'tool_call' as const,
          toolCall: {
            type: 'tool_call' as const,
            toolCallId: 'tool-2',
            toolName: 'read_file',
            args: { path: 'SPEC.md' },
          },
        }
        yield {
          type: 'done' as const,
          stopReason: 'tool_calls',
        }
      },
      countTokens: vi.fn(async () => 0),
      isModelSupported: vi.fn(() => true),
    }

    loop = new AgentLoop(provider, registry, {
      model: 'fake-model',
      provider: 'fake',
      cwd: 'D:/workspace/demo',
      isSidechain: true,
    })

    const events: AgentEvent[] = []
    for await (const event of loop.run([{ role: 'user', content: '继续' }])) {
      events.push(event)
    }

    expect(executedTools).toEqual(['write_file'])
    expect(events.map((event) => event.type)).toContain('done')
    expect(events.at(-1)).toEqual({
      type: 'done',
      reason: 'stopped',
    })
  })
})
