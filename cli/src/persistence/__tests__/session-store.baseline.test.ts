// src/persistence/__tests__/session-store.baseline.test.ts
/**
 * SessionStore 基线测试
 * 固化会话写入 / 恢复主路径行为。
 * 不锁 UUID、时间戳等易变输出，只锁结构和关键字段。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { SessionStore } from '../session-store.js'

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
      message: { role: 'user', content: '你好' },
    })

    store.append(sessionId, {
      sessionId,
      type: 'assistant',
      timestamp: new Date().toISOString(),
      uuid: assistantUuid,
      parentUuid: userUuid,
      cwd: process.cwd(),
      message: { role: 'assistant', content: '你好！有什么可以帮你的？' },
    })

    const snapshot = store.loadMessages(sessionId)
    const userMsgs = snapshot.messages.filter(m => m.role === 'user')
    const assistantMsgs = snapshot.messages.filter(m => m.role === 'assistant')

    expect(userMsgs).toHaveLength(1)
    expect(userMsgs[0]!.content).toBe('你好')
    expect(assistantMsgs).toHaveLength(1)
    expect(assistantMsgs[0]!.content).toBe('你好！有什么可以帮你的？')
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
      message: { role: 'user', content: 'test' },
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
})
