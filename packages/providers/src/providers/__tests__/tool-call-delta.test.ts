import { describe, expect, it } from 'vitest'
import {
  createOpenAICompatToolDeltaState,
  extractOpenAICompatToolCallDeltaChunks,
} from '../openai-compat.js'
import { extractAnthropicToolCallDeltaEvent } from '../anthropic.js'

describe('provider tool call delta extraction', () => {
  it('OpenAI-compatible 后续参数片段只有 index 时仍能映射到同一个 toolCallId', () => {
    const state = createOpenAICompatToolDeltaState()

    const first = extractOpenAICompatToolCallDeltaChunks([
      {
        id: 'call-1',
        index: 0,
        name: 'write_file',
        args: '{"path":"README',
      },
    ], state)
    const second = extractOpenAICompatToolCallDeltaChunks([
      {
        index: 0,
        args: '.md","content":"hello"}',
      },
    ], state)

    expect(first).toEqual([
      {
        type: 'tool_call_delta',
        toolCallDelta: {
          toolCallId: 'call-1',
          toolName: 'write_file',
          argumentsDelta: '{"path":"README',
        },
      },
    ])
    expect(second).toEqual([
      {
        type: 'tool_call_delta',
        toolCallDelta: {
          toolCallId: 'call-1',
          argumentsDelta: '.md","content":"hello"}',
        },
      },
    ])
  })

  it('Anthropic tool_use start 和 input_json_delta 能关联到同一个 toolCallId', () => {
    const contentBlockToolCallIds = new Map<number, string>()

    const start = extractAnthropicToolCallDeltaEvent({
      type: 'content_block_start',
      index: 2,
      content_block: {
        type: 'tool_use',
        id: 'toolu-1',
        name: 'bash',
      },
    }, contentBlockToolCallIds)

    const delta = extractAnthropicToolCallDeltaEvent({
      type: 'content_block_delta',
      index: 2,
      delta: {
        type: 'input_json_delta',
        partial_json: '{"command":"pnpm test"}',
      },
    }, contentBlockToolCallIds)

    expect(start).toEqual({
      type: 'tool_call_delta',
      toolCallDelta: {
        toolCallId: 'toolu-1',
        toolName: 'bash',
      },
    })
    expect(delta).toEqual({
      type: 'tool_call_delta',
      toolCallDelta: {
        toolCallId: 'toolu-1',
        argumentsDelta: '{"command":"pnpm test"}',
      },
    })
  })
})
