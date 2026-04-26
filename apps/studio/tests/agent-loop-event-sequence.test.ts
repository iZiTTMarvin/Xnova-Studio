import { describe, expect, it } from 'vitest'
import { AgentLoop } from '@core/agent-loop'
import { ToolRegistry } from '@tools/core/registry.js'
import type { LLMProvider } from '@providers/provider.js'
import type { Tool, ToolContext, ToolResult } from '@tools/core/types.js'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

describe('AgentLoop event sequence', () => {
  it('tool_start 会早于 write_file 执行，且第二轮模型请求发生在 tool_end 之后', async () => {
    const startedAt = Date.now()
    const timeline: Array<{ label: string; at: number; detail?: string }> = []
    const mark = (label: string, detail?: string) => {
      timeline.push({
        label,
        at: Date.now() - startedAt,
        ...(detail === undefined ? {} : { detail }),
      })
    }

    let chatCallCount = 0
    let modelRequestCount = 0

    const provider: LLMProvider = {
      name: 'fake-openai-compat',
      protocol: 'openai-compat',
      async *chat() {
        chatCallCount += 1
        if (chatCallCount === 1) {
          await sleep(30)
          yield {
            type: 'text',
            text: '我来为你创建个人博客，先制定规范文档。',
          } as const

          await sleep(25)
          mark('tool_call_detected', 'write_file SPEC.md')
          yield {
            type: 'tool_call',
            toolCall: {
              type: 'tool_call',
              toolCallId: 'tool-spec',
              toolName: 'write_file',
              args: {
                path: 'D:/workspace/demo/SPEC.md',
                content: '# spec\\n...',
              },
            },
          } as const
          yield {
            type: 'done',
            stopReason: 'tool_calls',
          } as const
          return
        }

        await sleep(180)
        yield {
          type: 'done',
          stopReason: 'end_turn',
        } as const
      },
      async countTokens() {
        return 0
      },
      isModelSupported() {
        return true
      },
    }

    const registry = new ToolRegistry()
    const writeFileTool: Tool = {
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
      async execute(
        args: Record<string, unknown>,
        _ctx: ToolContext,
      ): Promise<ToolResult> {
        const path =
          typeof args.path === 'string' ? args.path : 'unknown-path'
        mark('write_file_started', path)
        await sleep(18)
        mark('write_file_finished', path)
        return {
          success: true,
          output: 'write ok',
        }
      },
    }
    registry.register(writeFileTool)

    const loop = new AgentLoop(provider, registry, {
      cwd: 'D:/workspace/demo',
      model: 'fake-model',
      provider: 'fake-openai-compat',
      isSidechain: true,
    })

    for await (const event of loop.run([
      { role: 'user', content: '在当前目录生成一个个人博客 HTML 网站' },
    ])) {
      switch (event.type) {
        case 'llm_start':
          modelRequestCount += 1
          mark(
            modelRequestCount === 1
              ? 'model_request_started'
              : 'model_request_started_after_tool',
          )
          break
        case 'llm_first_chunk':
          mark('model_first_chunk', event.chunkType)
          break
        case 'text':
          mark('text_delta', event.text)
          break
        case 'tool_start':
          mark('tool_start_emitted', `${event.toolName} ${event.toolCallId}`)
          break
        case 'tool_done':
          mark('tool_end_emitted', `${event.toolName} ${event.toolCallId}`)
          break
        case 'llm_done':
          mark(
            modelRequestCount === 1
              ? 'model_request_finished'
              : 'model_request_finished_after_tool',
            event.stopReason,
          )
          break
        case 'done':
          mark('run_completed', event.reason)
          break
        default:
          break
      }
    }

    const labels = timeline.map((item) => item.label)
    expect(labels).toEqual([
      'model_request_started',
      'model_first_chunk',
      'text_delta',
      'tool_call_detected',
      'model_request_finished',
      'tool_start_emitted',
      'write_file_started',
      'write_file_finished',
      'tool_end_emitted',
      'model_request_started_after_tool',
      'model_request_finished_after_tool',
      'run_completed',
    ])

    expect(
      labels.indexOf('tool_start_emitted'),
    ).toBeLessThan(labels.indexOf('write_file_started'))
    expect(
      labels.indexOf('write_file_finished'),
    ).toBeLessThan(labels.indexOf('tool_end_emitted'))
    expect(
      labels.indexOf('tool_end_emitted'),
    ).toBeLessThan(labels.indexOf('model_request_started_after_tool'))

    console.log(
      timeline
        .map((item) => {
          const suffix = item.detail ? ` ${item.detail}` : ''
          return `T+${item.at}ms ${item.label}${suffix}`
        })
        .join('\n'),
    )
  })
})
