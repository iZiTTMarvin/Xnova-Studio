// src/runtime/__tests__/create-runtime.test.ts

/**
 * createRuntime 单元测试
 *
 * 测试 factory 输入校验、bridge 事件路由、NoopBridge / CallbackBridge 行为。
 * 不启动真实 LLM / MCP，只验证 runtime 骨架的结构正确性。
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect, vi } from 'vitest'
import { NoopBridge, CallbackBridge } from '../bridge.js'
import { makeEvent, makeWarningEvent, makeErrorEvent } from '../events.js'
import type { RuntimeEvent, PermissionRequest, UserQuestionRequest } from '../types.js'

// ── NoopBridge ─────────────────────────────────────────────────────────────
describe('NoopBridge', () => {
  it('emit() 不抛出', () => {
    const bridge = new NoopBridge()
    expect(() => bridge.emit(makeEvent('text_delta', { text: 'hello' }))).not.toThrow()
  })

  it('requestPermission() 自动返回 allow=true', async () => {
    const bridge = new NoopBridge()
    const result = await bridge.requestPermission({
      toolName: 'bash',
      args: { command: 'ls' },
      sessionId: 'test-session',
    })
    expect(result.allow).toBe(true)
  })

  it('requestUserInput() 返回 cancelled=false 和空 answers', async () => {
    const bridge = new NoopBridge()
    const result = await bridge.requestUserInput({
      questions: [{ key: 'q1', title: 'Test?', type: 'text' }],
      sessionId: 'test-session',
    })
    expect(result.cancelled).toBe(false)
    expect(result.answers).toEqual({})
  })
})

// ── CallbackBridge ─────────────────────────────────────────────────────────
describe('CallbackBridge', () => {
  it('emit() 转发事件到 onEvent 回调', () => {
    const received: RuntimeEvent[] = []
    const bridge = new CallbackBridge({
      onEvent: (e) => received.push(e),
      onPermission: async () => ({ allow: true }),
    })

    const event = makeEvent('text_delta', { text: 'hello' }, 'sid-1')
    bridge.emit(event)

    expect(received).toHaveLength(1)
    expect(received[0]!.type).toBe('text_delta')
    expect(received[0]!.sessionId).toBe('sid-1')
  })

  it('requestPermission() 转发到 onPermission 回调', async () => {
    const requests: PermissionRequest[] = []
    const bridge = new CallbackBridge({
      onEvent: () => {},
      onPermission: async (req) => {
        requests.push(req)
        return { allow: false }
      },
    })

    const result = await bridge.requestPermission({
      toolName: 'bash',
      args: { command: 'rm -rf /' },
      sessionId: 'test-session',
    })

    expect(result.allow).toBe(false)
    expect(requests).toHaveLength(1)
    expect(requests[0]!.toolName).toBe('bash')
  })

  it('requestUserInput() 转发到 onUserInput 回调', async () => {
    const bridge = new CallbackBridge({
      onEvent: () => {},
      onPermission: async () => ({ allow: true }),
      onUserInput: async () => ({ answers: { q1: 'answer' }, cancelled: false }),
    })

    const result = await bridge.requestUserInput({
      questions: [{ key: 'q1', title: 'Test?', type: 'text' }],
      sessionId: 'test-session',
    })

    expect(result.cancelled).toBe(false)
    expect(result.answers!['q1']).toBe('answer')
  })

  it('requestUserInput() 无 onUserInput 时降级返回 cancelled=false', async () => {
    const bridge = new CallbackBridge({
      onEvent: () => {},
      onPermission: async () => ({ allow: true }),
    })

    const result = await bridge.requestUserInput({
      questions: [],
      sessionId: 'test-session',
    })

    expect(result.cancelled).toBe(false)
    expect(result.answers).toEqual({})
  })
})

describe('createRuntime 权限桥接契约', () => {
  it('permission_request 需要把 PermissionResolution.reason 透传给 AgentLoop', () => {
    const currentDir = dirname(fileURLToPath(import.meta.url))
    const content = readFileSync(resolve(currentDir, '../create-runtime.ts'), 'utf-8')

    expect(content).toContain('event.resolve({')
    expect(content).toContain('reason: resolution.reason')
    expect(content).not.toContain('event.resolve(resolution.allow)')
  })
})

// ── events 工厂函数 ────────────────────────────────────────────────────────
describe('events 工厂函数', () => {
  it('makeEvent() 生成正确结构', () => {
    const event = makeEvent('tool_start', { toolName: 'bash' }, 'sid-1', 'agent-1')
    expect(event.type).toBe('tool_start')
    expect(event.sessionId).toBe('sid-1')
    expect(event.agentId).toBe('agent-1')
    expect(event.payload?.['toolName']).toBe('bash')
    expect(typeof event.timestamp).toBe('string')
  })

  it('makeWarningEvent() 生成 warning 类型', () => {
    const event = makeWarningEvent('embedding 不可用', 'sid-1')
    expect(event.type).toBe('warning')
    expect(event.payload?.['message']).toBe('embedding 不可用')
  })

  it('makeErrorEvent() 生成 error 类型', () => {
    const event = makeErrorEvent('连接失败', 'sid-1')
    expect(event.type).toBe('error')
    expect(event.payload?.['error']).toBe('连接失败')
  })

  it('makeEvent() 不传 sessionId 时不含 sessionId 字段', () => {
    const event = makeEvent('turn_end')
    expect(event.sessionId).toBeUndefined()
    expect(event.agentId).toBeUndefined()
    expect(event.payload).toBeUndefined()
  })
})
