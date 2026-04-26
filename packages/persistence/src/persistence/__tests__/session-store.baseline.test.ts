// src/persistence/__tests__/session-store.baseline.test.ts
/**
 * SessionStore 基线测试
 * 固化会话写入 / 恢复主路径行为。
 * 不锁 UUID、时间戳等易变输出，只锁结构和关键字段。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { SessionStore } from '../session-store.js'
import { SESSION_CONVERSATION_SCHEMA_VERSION } from '../conversation-blocks.js'

function makeTempDir(): string {
  const dir = join(tmpdir(), `xnova-session-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

describe('SessionStore — 基线行为', () => {
  let tempDir: string
  let store: SessionStore

  beforeEach(() => {
    tempDir = makeTempDir()
    store = new SessionStore(tempDir)
  })

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  // ── 主路径：create 写入 session_start 事件 ────────────────────────────
  it('create() 返回非空 sessionId 并写入 JSONL 文件', () => {
    const cwd = process.cwd()
    const sessionId = store.create(cwd, 'anthropic', 'claude-sonnet-4-6')

    expect(typeof sessionId).toBe('string')
    expect(sessionId.length).toBeGreaterThan(0)

    // 文件应存在于 baseDir 下某个子目录
    const snapshot = store.loadMessages(sessionId)
    expect(snapshot.conversationSchemaVersion).toBe(
      SESSION_CONVERSATION_SCHEMA_VERSION,
    )
    expect(snapshot.sessionId).toBe(sessionId)
    expect(snapshot.provider).toBe('anthropic')
    expect(snapshot.model).toBe('claude-sonnet-4-6')
    expect(snapshot.cwd).toBe(cwd)
  })

  // ── 主路径：append + loadMessages 恢复消息 ────────────────────────────
  it('append() user/assistant 事件后 loadMessages() 能恢复消息列表', () => {
    const cwd = process.cwd()
    const sessionId = store.create(cwd, 'anthropic', 'claude-sonnet-4-6')

    // 获取 session_start 事件的 uuid 作为 parentUuid
    const initial = store.loadMessages(sessionId)
    // session_start 后 messages 为空，leafEventUuid 指向 session_start
    const startUuid = initial.leafEventUuid!

    const userUuid = `user-uuid-${Date.now()}`
    const assistantUuid = `assistant-uuid-${Date.now()}`

    store.append(sessionId, {
      sessionId,
      type: 'user',
      timestamp: new Date().toISOString(),
      uuid: userUuid,
      parentUuid: startUuid,
      cwd: process.cwd(),
      conversationSchemaVersion: SESSION_CONVERSATION_SCHEMA_VERSION,
      message: {
        role: 'user',
        blocks: [
          {
            id: 'user-text-1',
            type: 'text',
            content: '你好',
          },
        ],
      },
    })

    store.append(sessionId, {
      sessionId,
      type: 'assistant',
      timestamp: new Date().toISOString(),
      uuid: assistantUuid,
      parentUuid: userUuid,
      cwd: process.cwd(),
      conversationSchemaVersion: SESSION_CONVERSATION_SCHEMA_VERSION,
      message: {
        role: 'assistant',
        blocks: [
          {
            id: 'assistant-text-1',
            type: 'text',
            content: '你好！有什么可以帮你的？',
          },
        ],
      },
    })

    const snapshot = store.loadMessages(sessionId)
    const userMsgs = snapshot.messages.filter(m => m.role === 'user')
    const assistantMsgs = snapshot.messages.filter(m => m.role === 'assistant')

    expect(userMsgs).toHaveLength(1)
    expect(userMsgs[0]!.blocks).toEqual([
      {
        id: 'user-text-1',
        type: 'text',
        content: '你好',
      },
    ])
    expect(assistantMsgs).toHaveLength(1)
    expect(assistantMsgs[0]!.blocks).toEqual([
      {
        id: 'assistant-text-1',
        type: 'text',
        content: '你好！有什么可以帮你的？',
      },
    ])
  })

  it('inspectSession() 以轻量摘要返回 messageCount / provider / model', () => {
    const cwd = process.cwd()
    const sessionId = store.create(cwd, 'anthropic', 'claude-sonnet-4-6')
    const initial = store.loadMessages(sessionId)
    const startUuid = initial.leafEventUuid!

    store.append(sessionId, {
      sessionId,
      type: 'user',
      timestamp: new Date().toISOString(),
      uuid: 'user-1',
      parentUuid: startUuid,
      cwd,
      conversationSchemaVersion: SESSION_CONVERSATION_SCHEMA_VERSION,
      message: {
        role: 'user',
        blocks: [
          {
            id: 'user-text-1',
            type: 'text',
            content: '分析 renderer',
          },
        ],
      },
    })
    store.append(sessionId, {
      sessionId,
      type: 'assistant',
      timestamp: new Date().toISOString(),
      uuid: 'assistant-1',
      parentUuid: 'user-1',
      cwd,
      message: {
        role: 'assistant',
        blocks: [
          {
            id: 'assistant-text-1',
            type: 'text',
            content: '已完成',
          },
        ],
        provider: 'openai',
        model: 'gpt-4o',
      },
      conversationSchemaVersion: SESSION_CONVERSATION_SCHEMA_VERSION,
    })

    expect(store.inspectSession(sessionId)).toEqual({
      messageCount: 2,
      provider: 'openai',
      model: 'gpt-4o',
    })
  })

  // ── 主路径：list() 能列出已创建的会话 ────────────────────────────────
  it('list() 返回已创建的会话摘要', () => {
    const cwd = process.cwd()
    const sessionId = store.create(cwd, 'anthropic', 'claude-sonnet-4-6')

    const summaries = store.list({ limit: 10 })
    const found = summaries.find(s => s.sessionId === sessionId)
    expect(found).toBeDefined()
    expect(found!.sessionId).toBe(sessionId)
  })

  // ── 失败路径：loadMessages 找不到 sessionId 时抛出 ───────────────────
  it('loadMessages() 对不存在的 sessionId 抛出错误', () => {
    expect(() => store.loadMessages('nonexistent-session-id')).toThrow()
  })

  // ── 失败路径：append 找不到 sessionId 时抛出 ─────────────────────────
  it('append() 对不存在的 sessionId 抛出错误', () => {
    expect(() => store.append('nonexistent-id', {
      sessionId: 'nonexistent-id',
      type: 'user',
      timestamp: new Date().toISOString(),
      uuid: 'some-uuid',
      parentUuid: null,
      cwd: process.cwd(),
      conversationSchemaVersion: SESSION_CONVERSATION_SCHEMA_VERSION,
      message: {
        role: 'user',
        blocks: [
          {
            id: 'user-text-1',
            type: 'text',
            content: 'test',
          },
        ],
      },
    })).toThrow()
  })

  // ── 主路径：空 baseDir 时 list() 返回空数组 ───────────────────────────
  it('空 baseDir 时 list() 返回空数组（不抛出）', () => {
    const emptyDir = join(tempDir, 'empty-store')
    mkdirSync(emptyDir, { recursive: true })
    const emptyStore = new SessionStore(emptyDir)

    expect(() => emptyStore.list()).not.toThrow()
    expect(emptyStore.list()).toEqual([])
  })

  it('loadSubagents() 能把 stopped 会话恢复成 stopped 状态并保留部分结果文本', () => {
    const cwd = process.cwd()
    const parentSessionId = store.create(cwd, 'anthropic', 'claude-sonnet-4-6')
    const subagentSessionId = store.createSubagent(
      'agent-1',
      parentSessionId,
      cwd,
      'anthropic',
      'claude-sonnet-4-6',
    )

    const initial = store.loadMessages(subagentSessionId)
    const startUuid = initial.leafEventUuid!

    store.append(subagentSessionId, {
      sessionId: subagentSessionId,
      type: 'assistant',
      timestamp: new Date().toISOString(),
      uuid: 'assistant-subagent-1',
      parentUuid: startUuid,
      cwd,
      message: {
        role: 'assistant',
        blocks: [
          {
            id: 'assistant-text-1',
            type: 'text',
            content: '已经扫完 renderer 的一半文件。',
          },
        ],
      },
      conversationSchemaVersion: SESSION_CONVERSATION_SCHEMA_VERSION,
    })

    store.append(subagentSessionId, {
      sessionId: subagentSessionId,
      type: 'session_end',
      timestamp: new Date().toISOString(),
      uuid: 'session-end-subagent-1',
      parentUuid: 'assistant-subagent-1',
      cwd,
      status: 'stopped',
      totalErrors: 0,
    })

    expect(store.loadSubagents(parentSessionId, cwd)).toEqual([
      expect.objectContaining({
        agentId: 'agent-1',
        status: 'stopped',
        events: expect.arrayContaining([
          {
            kind: 'text',
            text: '已经扫完 renderer 的一半文件。',
          },
        ]),
      }),
    ])
  })

  it('旧 schemaVersion 会在 list() 中被忽略，并且 loadMessages() 返回空会话', () => {
    const cwd = process.cwd()
    const sessionId = store.create(cwd, 'anthropic', 'claude-sonnet-4-6')
    const initial = store.loadMessages(sessionId)
    const filePath = store.list({ limit: 10 })[0]!.filePath

    const legacyEvent = {
      sessionId,
      type: 'session_start' as const,
      timestamp: new Date().toISOString(),
      uuid: initial.leafEventUuid!,
      parentUuid: null,
      cwd,
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
    }

    rmSync(filePath, { force: true })
    writeFileSync(filePath, `${JSON.stringify(legacyEvent)}\n`, 'utf-8')

    expect(store.list({ limit: 10 })).toEqual([])
    expect(store.loadMessages(sessionId)).toMatchObject({
      conversationSchemaVersion: 0,
      messages: [],
    })
  })
})
