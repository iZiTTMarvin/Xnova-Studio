/**
 * runtime-store 工具生命周期状态机测试。
 *
 * 验证 handleRuntimeEvent 对新事件的处理：
 * - tool_intent 创建 pending 工具壳
 * - tool_args_delta 合并参数并生成安全摘要
 * - tool_ready 更新完整参数
 * - tool_start 切 running（复用已有 pending 壳或新建）
 * - tool_end 切 done/error
 * - write_file.content 不被完整渲染
 * - 旧 tool_start/tool_end 路径仍正常
 */

import { describe, expect, it, beforeEach } from 'vitest'
import { useRuntimeStore } from '../src/renderer/stores/runtime-store'
import type { StudioRuntimeEvent } from '../src/shared/studio-bridge-contract'

function makeEvent(
  type: string,
  payload?: Record<string, unknown>,
): StudioRuntimeEvent {
  return {
    type: type as StudioRuntimeEvent['type'],
    timestamp: new Date().toISOString(),
    ...(payload !== undefined ? { payload } : {}),
  }
}

function getToolBlocks() {
  const { liveConversation } = useRuntimeStore.getState()
  return liveConversation.blocks.filter((b) => b.type === 'tool')
}

describe('runtime-store 工具生命周期', () => {
  beforeEach(() => {
    useRuntimeStore.getState().resetRuntimeState()
    // 模拟 run 已开始
    useRuntimeStore.getState().handleRuntimeEvent(
      makeEvent('run_started', {}),
    )
  })

  it('tool_intent 创建 pending 工具壳', () => {
    useRuntimeStore.getState().handleRuntimeEvent(
      makeEvent('tool_intent', {
        toolName: 'write_file',
        toolCallId: 'tc-1',
      }),
    )

    const tools = getToolBlocks()
    expect(tools).toHaveLength(1)
    expect(tools[0]).toMatchObject({
      type: 'tool',
      toolCallId: 'tc-1',
      toolName: 'write_file',
      status: 'pending',
    })
  })

  it('tool_args_delta 更新 pending 壳的参数', () => {
    useRuntimeStore.getState().handleRuntimeEvent(
      makeEvent('tool_intent', {
        toolName: 'write_file',
        toolCallId: 'tc-1',
      }),
    )

    useRuntimeStore.getState().handleRuntimeEvent(
      makeEvent('tool_args_delta', {
        toolCallId: 'tc-1',
        argsSoFar: { path: 'README.md' },
      }),
    )

    const tools = getToolBlocks()
    expect(tools).toHaveLength(1)
    expect(tools[0]).toMatchObject({
      status: 'pending',
      args: { path: 'README.md' },
    })
  })

  it('tool_ready 更新完整参数', () => {
    useRuntimeStore.getState().handleRuntimeEvent(
      makeEvent('tool_intent', {
        toolName: 'write_file',
        toolCallId: 'tc-1',
      }),
    )

    useRuntimeStore.getState().handleRuntimeEvent(
      makeEvent('tool_ready', {
        toolName: 'write_file',
        toolCallId: 'tc-1',
        args: { path: 'README.md', content: 'hello world' },
      }),
    )

    const tools = getToolBlocks()
    expect(tools).toHaveLength(1)
    // content 应被安全过滤
    const tool = tools[0]!
    expect(tool.status).toBe('pending')
    if (tool.type === 'tool') {
      expect(tool.args.path).toBe('README.md')
      // write_file.content 不应包含原始内容
      expect(tool.args.content).not.toBe('hello world')
      expect(typeof tool.args.content).toBe('string')
      expect((tool.args.content as string)).toContain('字符')
    }
  })

  it('tool_start 将 pending 壳切换为 running', () => {
    useRuntimeStore.getState().handleRuntimeEvent(
      makeEvent('tool_intent', {
        toolName: 'write_file',
        toolCallId: 'tc-1',
      }),
    )

    useRuntimeStore.getState().handleRuntimeEvent(
      makeEvent('tool_start', {
        toolName: 'write_file',
        toolCallId: 'tc-1',
        args: { path: 'README.md', content: 'hello' },
      }),
    )

    const tools = getToolBlocks()
    expect(tools).toHaveLength(1)
    expect(tools[0]).toMatchObject({
      status: 'running',
      toolCallId: 'tc-1',
    })
  })

  it('tool_end 将 running 切换为 done', () => {
    useRuntimeStore.getState().handleRuntimeEvent(
      makeEvent('tool_intent', {
        toolName: 'write_file',
        toolCallId: 'tc-1',
      }),
    )
    useRuntimeStore.getState().handleRuntimeEvent(
      makeEvent('tool_start', {
        toolName: 'write_file',
        toolCallId: 'tc-1',
        args: { path: 'README.md', content: 'hello' },
      }),
    )
    useRuntimeStore.getState().handleRuntimeEvent(
      makeEvent('tool_end', {
        toolName: 'write_file',
        toolCallId: 'tc-1',
        durationMs: 150,
        success: true,
        resultSummary: 'wrote README.md',
      }),
    )

    const tools = getToolBlocks()
    expect(tools).toHaveLength(1)
    expect(tools[0]).toMatchObject({
      status: 'done',
      success: true,
    })
  })

  it('完整生命周期：intent -> args_delta -> ready -> start -> end', () => {
    const store = useRuntimeStore.getState()

    store.handleRuntimeEvent(makeEvent('tool_intent', {
      toolName: 'bash',
      toolCallId: 'tc-2',
    }))

    store.handleRuntimeEvent(makeEvent('tool_args_delta', {
      toolCallId: 'tc-2',
      argsSoFar: { command: 'ls -la' },
    }))

    store.handleRuntimeEvent(makeEvent('tool_ready', {
      toolName: 'bash',
      toolCallId: 'tc-2',
      args: { command: 'ls -la /tmp' },
    }))

    store.handleRuntimeEvent(makeEvent('tool_start', {
      toolName: 'bash',
      toolCallId: 'tc-2',
      args: { command: 'ls -la /tmp' },
    }))

    store.handleRuntimeEvent(makeEvent('tool_end', {
      toolName: 'bash',
      toolCallId: 'tc-2',
      durationMs: 200,
      success: true,
      resultSummary: 'total 8\ndrwxr-xr-x ...',
    }))

    const tools = getToolBlocks()
    expect(tools).toHaveLength(1)
    expect(tools[0]).toMatchObject({
      status: 'done',
      toolCallId: 'tc-2',
      success: true,
    })
  })

  it('旧路径：没有 intent/ready，直接 tool_start -> tool_end 仍正常', () => {
    const store = useRuntimeStore.getState()

    store.handleRuntimeEvent(makeEvent('tool_start', {
      toolName: 'read_file',
      toolCallId: 'tc-legacy',
      args: { path: 'package.json' },
    }))

    let tools = getToolBlocks()
    expect(tools).toHaveLength(1)
    expect(tools[0]).toMatchObject({
      status: 'running',
      toolCallId: 'tc-legacy',
    })

    store.handleRuntimeEvent(makeEvent('tool_end', {
      toolName: 'read_file',
      toolCallId: 'tc-legacy',
      durationMs: 50,
      success: true,
    }))

    tools = getToolBlocks()
    expect(tools).toHaveLength(1)
    expect(tools[0]).toMatchObject({
      status: 'done',
    })
  })

  it('write_file.content 不被完整渲染到 args', () => {
    const longContent = 'x'.repeat(5000)
    const store = useRuntimeStore.getState()

    store.handleRuntimeEvent(makeEvent('tool_intent', {
      toolName: 'write_file',
      toolCallId: 'tc-wf',
    }))

    store.handleRuntimeEvent(makeEvent('tool_args_delta', {
      toolCallId: 'tc-wf',
      argsSoFar: { path: 'big.txt', content: longContent },
    }))

    const tools = getToolBlocks()
    const tool = tools[0]!
    if (tool.type === 'tool') {
      // content 应被替换为安全摘要，不包含原始内容
      expect((tool.args.content as string).length).toBeLessThan(200)
      expect((tool.args.content as string)).toContain('字符')
      expect((tool.args.content as string)).not.toContain('xxxxx')
    }
  })

  it('敏感字段（token/secret/password）被隐藏', () => {
    const store = useRuntimeStore.getState()

    store.handleRuntimeEvent(makeEvent('tool_intent', {
      toolName: 'custom_tool',
      toolCallId: 'tc-sens',
    }))

    store.handleRuntimeEvent(makeEvent('tool_args_delta', {
      toolCallId: 'tc-sens',
      argsSoFar: {
        url: 'https://api.example.com',
        api_token: 'sk-secret-123',
        password: 'hunter2',
        authorization: 'Bearer xxx',
        normal_field: 'visible',
      },
    }))

    const tools = getToolBlocks()
    const tool = tools[0]!
    if (tool.type === 'tool') {
      expect(tool.args.url).toBe('https://api.example.com')
      expect(tool.args.api_token).toBe('(已隐藏)')
      expect(tool.args.password).toBe('(已隐藏)')
      expect(tool.args.authorization).toBe('(已隐藏)')
      expect(tool.args.normal_field).toBe('visible')
    }
  })

  it('tool_end 失败时正确设置 error 状态', () => {
    const store = useRuntimeStore.getState()

    store.handleRuntimeEvent(makeEvent('tool_intent', {
      toolName: 'bash',
      toolCallId: 'tc-fail',
    }))
    store.handleRuntimeEvent(makeEvent('tool_start', {
      toolName: 'bash',
      toolCallId: 'tc-fail',
      args: { command: 'exit 1' },
    }))
    store.handleRuntimeEvent(makeEvent('tool_end', {
      toolName: 'bash',
      toolCallId: 'tc-fail',
      durationMs: 100,
      success: false,
      resultSummary: 'exit code 1',
    }))

    const tools = getToolBlocks()
    expect(tools[0]).toMatchObject({
      status: 'error',
      success: false,
    })
  })
})
