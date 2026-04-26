import { describe, expect, it } from 'vitest'
import type { StudioConversationBlock } from '../src/shared/studio-bridge-contract'
import {
  buildConversationRenderRows,
  type ToolRowModel,
} from '../src/renderer/utils/conversation-render-rows'

function createToolBlock(
  id: string,
  toolName: string,
  overrides: Partial<Extract<StudioConversationBlock, { type: 'tool' }>> = {},
): Extract<StudioConversationBlock, { type: 'tool' }> {
  return {
    id,
    type: 'tool',
    toolCallId: `${id}-call`,
    toolName,
    args: {},
    status: 'done',
    success: true,
    ...overrides,
  }
}

function expectToolActivityRow(row: unknown): asserts row is {
  type: 'tool_activity_group'
  tools: ToolRowModel[]
} {
  expect(row).toMatchObject({
    type: 'tool_activity_group',
  })
}

function expectToolActionRow(row: unknown): asserts row is {
  type: 'tool_action'
  tool: ToolRowModel
} {
  expect(row).toMatchObject({
    type: 'tool_action',
  })
}

describe('buildConversationRenderRows', () => {
  it('将连续 exploration tools 合并为 tool_activity_group', () => {
    const rows = buildConversationRenderRows(
      [
        createToolBlock('tool-1', 'read_file', {
          args: { path: 'D:/workspace/demo/README.md' },
        }),
        createToolBlock('tool-2', 'grep', {
          args: { pattern: 'TODO' },
        }),
        createToolBlock('tool-3', 'glob', {
          args: { pattern: '**/*.ts' },
        }),
      ],
      { isRunActive: false },
    )

    expect(rows).toHaveLength(1)
    expectToolActivityRow(rows[0])
    expect(rows[0].tools.map((tool) => tool.toolName)).toEqual([
      'read_file',
      'grep',
      'glob',
    ])
  })

  it('write_file / edit_file / bash 不合并，保持为独立 tool_action', () => {
    const rows = buildConversationRenderRows(
      [
        createToolBlock('tool-1', 'write_file'),
        createToolBlock('tool-2', 'edit_file'),
        createToolBlock('tool-3', 'bash'),
      ],
      { isRunActive: false },
    )

    expect(rows).toHaveLength(3)
    rows.forEach((row) => expectToolActionRow(row))
  })

  it('failed exploration tool 不进入 activity group，而是单独显示为失败 action', () => {
    const rows = buildConversationRenderRows(
      [
        createToolBlock('tool-1', 'grep', {
          status: 'error',
          success: false,
          resultSummary: 'pattern syntax error',
        }),
      ],
      { isRunActive: false },
    )

    expect(rows).toHaveLength(1)
    expectToolActionRow(rows[0])
    expect(rows[0].tool.status).toBe('error')
    expect(rows[0].tool.success).toBe(false)
  })

  it('thinking -> tool -> thinking 时，只有最后一个 thinking 在 active run 中标记为 live', () => {
    const rows = buildConversationRenderRows(
      [
        {
          id: 'thinking-1',
          type: 'thinking',
          content: '先分析目录结构。',
        },
        createToolBlock('tool-1', 'bash', {
          status: 'running',
        }),
        {
          id: 'thinking-2',
          type: 'thinking',
          content: '继续整理结论。',
        },
      ],
      { isRunActive: true },
    )

    expect(rows).toHaveLength(3)
    expect(rows[0]).toMatchObject({
      type: 'reasoning',
      isLive: false,
    })
    expect(rows[1]).toMatchObject({
      type: 'tool_action',
    })
    expect(rows[2]).toMatchObject({
      type: 'reasoning',
      isLive: true,
    })
  })

  it('已结束 thinking 或 thinking 后面已有可见 block 时，不应继续标记为 live', () => {
    const rows = buildConversationRenderRows(
      [
        {
          id: 'thinking-1',
          type: 'thinking',
          content: '先分析目录结构。',
          startedAt: 10,
          endedAt: 20,
          durationMs: 10,
        },
        {
          id: 'text-1',
          type: 'text',
          content: '接着输出结果。',
        },
      ],
      { isRunActive: true },
    )

    expect(rows[0]).toMatchObject({
      type: 'reasoning',
      isLive: false,
      durationMs: 10,
    })
  })
})
