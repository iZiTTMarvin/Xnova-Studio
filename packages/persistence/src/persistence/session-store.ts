// src/persistence/session-store.ts

import {
  mkdirSync,
  readFileSync,
  appendFileSync,
  readdirSync,
  statSync,
  rmSync,
  existsSync,
} from 'node:fs'
import { join } from 'node:path'
import { dbg } from '../debug.js'
import type { SessionEvent, SessionSnapshot, SessionSummary, BranchInfo, SubagentSnapshot, SubagentSnapshotEvent } from './session-types.js'
import {
  getMessagePlainText,
  SESSION_CONVERSATION_SCHEMA_VERSION,
} from './conversation-blocks.js'
import {
  toProjectSlug,
  generateSessionId,
  generateEventId,
  formatSessionFilename,
  extractSessionId,
  getGitBranch,
} from './session-utils.js'

const DEFAULT_LIST_LIMIT = 10
const DEFAULT_RETENTION_DAYS = 30
const FIRST_MESSAGE_MAX_LENGTH = 80

export class SessionStore {
  readonly baseDir: string
  #pathCache = new Map<string, string>()

  constructor(baseDir: string) {
    this.baseDir = baseDir
  }

  /** Create a new session, write session_start event, return sessionId */
  create(cwd: string, provider: string, model: string): string {
    const sessionId = generateSessionId()
    const projectSlug = toProjectSlug(cwd)
    const projectDir = join(this.baseDir, projectSlug)
    mkdirSync(projectDir, { recursive: true })

    const filename = formatSessionFilename(sessionId)
    const filePath = join(projectDir, filename)

    const gitBranch = getGitBranch(cwd)
    const eventId = generateEventId()

    const event: SessionEvent = {
      sessionId,
      type: 'session_start',
      timestamp: new Date().toISOString(),
      uuid: eventId,
      parentUuid: null,
      cwd,
      conversationSchemaVersion: SESSION_CONVERSATION_SCHEMA_VERSION,
      gitBranch,
      provider,
      model,
    }

    appendFileSync(filePath, JSON.stringify(event) + '\n', 'utf-8')
    this.#pathCache.set(sessionId, filePath)

    return sessionId
  }

  /** Append an event line to the session's JSONL file */
  append(sessionId: string, event: SessionEvent): void {
    const filePath = this.#resolveFilePath(sessionId)
    if (!filePath) {
      throw new Error(`Session not found: ${sessionId}`)
    }
    appendFileSync(filePath, JSON.stringify(event) + '\n', 'utf-8')
  }

  /** Read JSONL, extract user/assistant text messages along a branch path, return snapshot */
  loadMessages(sessionId: string, leafEventUuid?: string): SessionSnapshot {
    const filePath = this.#resolveFilePath(sessionId)
    if (!filePath) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    const content = readFileSync(filePath, 'utf-8')
    const lines = content.trim().split('\n').filter(Boolean)
    const allEvents: SessionEvent[] = lines.map(l => JSON.parse(l) as SessionEvent)
    const conversationSchemaVersion = this.#resolveConversationSchemaVersion(allEvents)

    if (conversationSchemaVersion !== SESSION_CONVERSATION_SCHEMA_VERSION) {
      return this.#buildEmptySnapshot(sessionId, conversationSchemaVersion, allEvents)
    }

    // Determine the leaf to trace from
    let targetLeafUuid = leafEventUuid
    if (!targetLeafUuid) {
      const latestLeaf = this.#findLatestLeaf(allEvents)
      if (!latestLeaf) {
        // Fallback: empty session
        return {
          conversationSchemaVersion,
          sessionId,
          provider: '',
          model: '',
          cwd: '',
          messages: [],
          leafEventUuid: null,
        }
      }
      targetLeafUuid = latestLeaf.uuid
    }

    // Walk the tree from leaf to root
    const path = this.#buildEventPath(allEvents, targetLeafUuid)

    let provider = ''
    let model = ''
    let cwd = ''
    const messages: SessionSnapshot['messages'] = []

    for (const event of path) {
      if (event.type === 'session_start' || event.type === 'session_resume') {
        if (event.provider) provider = event.provider
        if (event.model) model = event.model
        if (event.cwd) cwd = event.cwd
      }

      if (
        (event.type === 'user' ||
          event.type === 'assistant' ||
          event.type === 'system') &&
        event.message &&
        Array.isArray(event.message.blocks)
      ) {
        const message: SessionSnapshot['messages'][number] = {
          id: event.uuid,
          role: event.type,
          blocks: event.message.blocks,
        }
        if (event.message.model) message.model = String(event.message.model)
        if (event.message.provider) message.provider = String(event.message.provider)
        if (event.message.assistantUsage) {
          message.usage = event.message.assistantUsage
        }
        if (event.message.stopReason) message.stopReason = String(event.message.stopReason)
        if (event.message.llmCallCount !== undefined) {
          message.llmCallCount = Number(event.message.llmCallCount)
        }
        if (event.message.toolCallCount !== undefined) {
          message.toolCallCount = Number(event.message.toolCallCount)
        }
        messages.push(message)
      }
    }

    return {
      conversationSchemaVersion,
      sessionId,
      provider,
      model,
      cwd,
      messages,
      leafEventUuid: targetLeafUuid,
    }
  }

  /** List all branches in a session (each leaf event = one branch) */
  listBranches(sessionId: string): BranchInfo[] {
    const filePath = this.#resolveFilePath(sessionId)
    if (!filePath) throw new Error(`Session not found: ${sessionId}`)

    const content = readFileSync(filePath, 'utf-8')
    const lines = content.trim().split('\n').filter(Boolean)
    const events: SessionEvent[] = lines.map(l => JSON.parse(l) as SessionEvent)
    if (this.#resolveConversationSchemaVersion(events) !== SESSION_CONVERSATION_SCHEMA_VERSION) {
      return []
    }

    // Build parent→children and uuid→event maps
    const childrenOf = new Set<string>() // set of all parentUuids that have children

    for (const ev of events) {
      if (ev.parentUuid) childrenOf.add(ev.parentUuid)
    }

    // Leaf events: events whose uuid is NOT in childrenOf
    const leaves = events.filter(ev => !childrenOf.has(ev.uuid))

    // Count children for each event (used to find fork points)
    const childCount = new Map<string, number>()
    for (const ev of events) {
      if (ev.parentUuid) {
        childCount.set(ev.parentUuid, (childCount.get(ev.parentUuid) ?? 0) + 1)
      }
    }

    // For each leaf, walk up to find branch info
    const branches: BranchInfo[] = leaves.map(leaf => {
      const path = this.#buildEventPath(events, leaf.uuid)

      // Count user+assistant messages
      const msgs = path.filter(e =>
        (e.type === 'user' || e.type === 'assistant') &&
        e.message && Array.isArray(e.message.blocks)
      )

      const lastMsg = msgs.length > 0 ? msgs[msgs.length - 1]! : null
      const lastMessageText = lastMsg?.message
        ? getMessagePlainText({
            blocks: lastMsg.message.blocks,
          })
        : ''
      const lastMessage = typeof lastMessageText === 'string'
        ? (lastMessageText.length > 80 ? lastMessageText.slice(0, 80) + '...' : lastMessageText)
        : ''

      // Find fork point: the deepest event in the path that has multiple children
      let forkPoint: string | null = null
      for (let i = path.length - 1; i >= 0; i--) {
        if ((childCount.get(path[i]!.uuid) ?? 0) > 1) {
          forkPoint = path[i]!.uuid
          break
        }
      }

      return {
        leafEventUuid: leaf.uuid,
        lastMessage,
        messageCount: msgs.length,
        updatedAt: leaf.timestamp,
        forkPoint,
      }
    })

    // Sort by updatedAt descending
    branches.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

    return branches
  }

  /** List sessions, optionally filtered by projectSlug, sorted by updatedAt desc */
  list(options?: { projectSlug?: string; limit?: number }): SessionSummary[] {
    const limit = options?.limit ?? DEFAULT_LIST_LIMIT
    const slugs = options?.projectSlug
      ? [options.projectSlug]
      : this.#listProjectSlugs()

    const summaries: SessionSummary[] = []

    for (const slug of slugs) {
      const projectDir = join(this.baseDir, slug)
      if (!existsSync(projectDir)) continue

      let entries: string[]
      try {
        entries = readdirSync(projectDir).filter((f) => f.endsWith('.jsonl'))
      } catch {
        continue  // 目录读取失败（已删除/无权限），跳过该项目
      }

      for (const entry of entries) {
        const filePath = join(projectDir, entry)
        const sessionId = extractSessionId(entry)

        // Cache for future lookups
        this.#pathCache.set(sessionId, filePath)

        const stat = statSync(filePath)
        const extracted = this.#extractSummary(filePath)
        if (extracted.conversationSchemaVersion !== SESSION_CONVERSATION_SCHEMA_VERSION) {
          continue
        }

        summaries.push({
          sessionId,
          projectSlug: slug,
          cwd: extracted.cwd,
          firstMessage: extracted.firstMessage,
          updatedAt: extracted.updatedAt || stat.mtime.toISOString(),
          gitBranch: extracted.gitBranch,
          fileSize: stat.size,
          filePath,
        })
      }
    }

    // Sort by updatedAt descending
    summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

    return summaries.slice(0, limit)
  }

  /** Delete JSONL files older than retentionDays */
  cleanup(retentionDays: number = DEFAULT_RETENTION_DAYS): void {
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000
    const slugs = this.#listProjectSlugs()

    for (const slug of slugs) {
      const projectDir = join(this.baseDir, slug)
      let entries: string[]
      try {
        entries = readdirSync(projectDir).filter((f) => f.endsWith('.jsonl'))
      } catch {
        continue  // 目录读取失败，跳过该项目
      }

      for (const entry of entries) {
        const filePath = join(projectDir, entry)
        try {
          const stat = statSync(filePath)
          if (stat.mtime.getTime() < cutoff) {
            rmSync(filePath)
            // Remove from cache
            const sessionId = extractSessionId(entry)
            this.#pathCache.delete(sessionId)
          }
        } catch {
          // 文件可能被并发删除，跳过（cleanup 场景下预期行为）
        }
      }

      // Remove empty project directories
      try {
        const remaining = readdirSync(projectDir)
        if (remaining.length === 0) {
          rmSync(projectDir, { recursive: true })
        }
      } catch {
        // 空目录删除失败（可能有新文件写入），不影响正常流程
      }
    }
  }

  /**
   * 创建子 Agent JSONL 文件，写入 session_start 事件。
   *
   * 目录结构（与 Claude Code 对齐）:
   *   <baseDir>/<projectSlug>/<parentSessionId>/subagents/agent-<agentId>.jsonl
   *
   * 返回虚拟 sessionId = `subagent-<agentId>`，用于后续 append 操作。
   */
  createSubagent(
    agentId: string,
    parentSessionId: string,
    cwd: string,
    provider: string,
    model: string,
  ): string {
    const projectSlug = toProjectSlug(cwd)
    const subagentDir = join(this.baseDir, projectSlug, parentSessionId, 'subagents')
    mkdirSync(subagentDir, { recursive: true })

    const virtualSessionId = `subagent-${agentId}`
    const filePath = join(subagentDir, `agent-${agentId}.jsonl`)

    const gitBranch = getGitBranch(cwd)
    const eventId = generateEventId()

    const event: SessionEvent = {
      sessionId: virtualSessionId,
      type: 'session_start',
      timestamp: new Date().toISOString(),
      uuid: eventId,
      parentUuid: null,
      cwd,
      conversationSchemaVersion: SESSION_CONVERSATION_SCHEMA_VERSION,
      gitBranch,
      provider,
      model,
      isSidechain: true,
      agentId,
      parentSessionId,
    }

    appendFileSync(filePath, JSON.stringify(event) + '\n', 'utf-8')
    this.#pathCache.set(virtualSessionId, filePath)

    return virtualSessionId
  }

  /**
   * 加载指定会话的所有 SubAgent 数据（从 JSONL 回放）。
   *
   * 扫描 `<baseDir>/<projectSlug>/<sessionId>/subagents/` 目录，
   * 解析每个 agent-<agentId>.jsonl，提取描述、状态和详细事件。
   */
  loadSubagents(sessionId: string, cwd: string): SubagentSnapshot[] {
    const projectSlug = toProjectSlug(cwd)
    const subagentDir = join(this.baseDir, projectSlug, sessionId, 'subagents')
    if (!existsSync(subagentDir)) return []

    const results: SubagentSnapshot[] = []
    const files = readdirSync(subagentDir).filter(f => f.startsWith('agent-') && f.endsWith('.jsonl'))

    for (const file of files) {
      try {
        const filePath = join(subagentDir, file)
        const lines = readFileSync(filePath, 'utf-8').split('\n').filter(Boolean)
        const events: SessionEvent[] = lines.map(l => JSON.parse(l) as SessionEvent)
        if (this.#resolveConversationSchemaVersion(events) !== SESSION_CONVERSATION_SCHEMA_VERSION) {
          continue
        }

        // 从 session_start 提取 agentId
        const startEvent = events.find(e => e.type === 'session_start')
        if (!startEvent?.agentId) continue

        const agentId = startEvent.agentId
        const endEvent = events.find(e => e.type === 'session_end')
        const userEvent = events.find(e => e.type === 'user')

        // 提取描述：从父会话 dispatch_agent 的 description 参数获取不到，
        // 用 user message 的前 50 字符作为 fallback
        const description = userEvent?.message?.blocks
          ? getMessagePlainText({
              blocks: userEvent.message.blocks,
            }).slice(0, 50) || agentId
          : agentId

        // 提取详细事件
        const detailEvents: SubagentSnapshotEvent[] = []
        for (const ev of events) {
          if (ev.type === 'tool_call_start' && ev.toolName) {
            detailEvents.push({
              kind: 'tool_start',
              toolName: ev.toolName,
              toolCallId: ev.toolCallId ?? '',
              ...(ev.args !== undefined ? { args: ev.args } : {}),
            })
          } else if (ev.type === 'tool_call_end' && ev.toolName) {
            detailEvents.push({
              kind: 'tool_done',
              toolName: ev.toolName,
              toolCallId: ev.toolCallId ?? '',
              ...(ev.durationMs !== undefined ? { durationMs: ev.durationMs } : {}),
              ...(ev.success !== undefined ? { success: ev.success } : {}),
              ...(ev.resultSummary !== undefined ? { resultSummary: ev.resultSummary } : {}),
              ...(ev.resultFull !== undefined ? { resultFull: ev.resultFull } : {}),
            })
          } else if (ev.type === 'assistant' && Array.isArray(ev.message?.blocks)) {
            const text = getMessagePlainText({
              blocks: ev.message.blocks,
            })
            if (text) {
              detailEvents.push({
                kind: 'text',
                text,
              })
            }
          } else if (ev.type === 'error') {
            detailEvents.push({
              kind: 'error',
              error: ev.error ?? 'unknown error',
            })
          }
        }

        const status: 'done' | 'error' | 'running' | 'stopped' = endEvent
          ? endEvent.status === 'stopped'
            ? 'stopped'
            : (endEvent.totalErrors && endEvent.totalErrors > 0 ? 'error' : 'done')
          : 'running' // 没有 session_end 说明还在运行或异常退出

        results.push({
          agentId,
          description,
          status,
          events: detailEvents,
        })
      } catch (err) {
        dbg(`[SessionStore] SubAgent JSONL 解析失败 file=${file}: ${err instanceof Error ? err.message : String(err)}\n`)
      }
    }

    return results
  }

  /**
   * 以轻量方式读取会话摘要，避免恢复树形列表时构造完整消息快照。
   *
   * 返回：
   * - messageCount: user + assistant 消息数
   * - provider/model: 以最后一次 assistant/session_resume 为准
   */
  inspectSession(sessionId: string): {
    messageCount: number
    provider: string | null
    model: string | null
  } {
    const filePath = this.#resolveFilePath(sessionId)
    if (!filePath) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    const content = readFileSync(filePath, 'utf-8')
    const lines = content.trim().split('\n').filter(Boolean)
    const events = lines.map((line) => JSON.parse(line) as SessionEvent)
    if (this.#resolveConversationSchemaVersion(events) !== SESSION_CONVERSATION_SCHEMA_VERSION) {
      return {
        messageCount: 0,
        provider: null,
        model: null,
      }
    }

    let messageCount = 0
    let provider: string | null = null
    let model: string | null = null

    for (const event of events) {
      if (event.type === 'user' || event.type === 'assistant') {
        messageCount += 1
      }

      if (event.type === 'assistant') {
        if (typeof event.message?.provider === 'string') {
          provider = event.message.provider
        }
        if (typeof event.message?.model === 'string') {
          model = event.message.model
        }
      }

      if (
        (event.type === 'session_start' || event.type === 'session_resume') &&
        typeof event.provider === 'string'
      ) {
        provider = event.provider
      }
      if (
        (event.type === 'session_start' || event.type === 'session_resume') &&
        typeof event.model === 'string'
      ) {
        model = event.model
      }
    }

    return {
      messageCount,
      provider,
      model,
    }
  }

  /**
   * 从 JSONL 中提取最后一个 session_end 事件的 accumulatedMs。
   * 用于 resume 时恢复累计运行时长。找不到则返回 0。
   *
   * 优化：只读取文件尾部（最后 4KB），避免长会话全量加载到内存。
   * session_end 事件是 JSONL 最后一行，4KB 足以覆盖。
   */
  getLastAccumulatedMs(sessionId: string): number {
    try {
      const dirs = readdirSync(this.baseDir, { withFileTypes: true }).filter(d => d.isDirectory())
      for (const dir of dirs) {
        const projectDir = join(this.baseDir, dir.name)
        const files = readdirSync(projectDir).filter(f => f.endsWith('.jsonl'))
        for (const file of files) {
          if (extractSessionId(file) === sessionId) {
            const filePath = join(projectDir, file)
            const fileSize = statSync(filePath).size

            // 只读尾部 4KB（session_end 事件单行远小于此）
            const TAIL_BYTES = 4096
            const start = Math.max(0, fileSize - TAIL_BYTES)
            const buf = Buffer.alloc(Math.min(TAIL_BYTES, fileSize))
            const fd = require('node:fs').openSync(filePath, 'r')
            try {
              require('node:fs').readSync(fd, buf, 0, buf.length, start)
            } finally {
              require('node:fs').closeSync(fd)
            }

            const tail = buf.toString('utf-8')
            const lines = tail.split('\n').filter(Boolean)

            // 从尾部向前找第一个 session_end
            for (let i = lines.length - 1; i >= 0; i--) {
              try {
                const event = JSON.parse(lines[i]!) as SessionEvent
                if (event.type === 'session_end' && event.accumulatedMs != null) {
                  return event.accumulatedMs
                }
              } catch { continue }  // 尾部读取可能截断首行 JSON，解析失败是预期行为
            }
            return 0
          }
        }
      }
      return 0
    } catch (err) {
      dbg(`[SessionStore] getLastAccumulatedMs 失败 sid=${sessionId}: ${err instanceof Error ? err.message : String(err)}\n`)
      return 0
    }
  }

  /** Walk from leafUuid up to root via parentUuid, return chronological path */
  #buildEventPath(events: SessionEvent[], leafUuid: string): SessionEvent[] {
    const eventMap = new Map<string, SessionEvent>()
    for (const ev of events) eventMap.set(ev.uuid, ev)

    const path: SessionEvent[] = []
    let current: SessionEvent | undefined = eventMap.get(leafUuid)
    while (current) {
      path.push(current)
      current = current.parentUuid ? eventMap.get(current.parentUuid) : undefined
    }
    path.reverse()
    return path
  }

  /** Find the latest leaf event (event with no children) */
  #findLatestLeaf(events: SessionEvent[]): SessionEvent | undefined {
    const hasChildren = new Set<string>()
    for (const ev of events) {
      if (ev.parentUuid) hasChildren.add(ev.parentUuid)
    }
    const leaves = events.filter(ev => !hasChildren.has(ev.uuid))
    if (leaves.length === 0) return undefined
    // Pick the one with the latest timestamp
    return leaves.reduce((latest, ev) =>
      ev.timestamp > latest.timestamp ? ev : latest
    )
  }

  /** Extract cwd / firstMessage / updatedAt / gitBranch from JSONL content */
  #extractSummary(filePath: string): {
    conversationSchemaVersion: number
    cwd: string
    firstMessage: string
    updatedAt: string
    gitBranch: string
  } {
    let conversationSchemaVersion = 0
    let cwd = ''
    let firstMessage = ''
    let updatedAt = ''
    let gitBranch = 'unknown'

    try {
      const content = readFileSync(filePath, 'utf-8')
      const lines = content.trim().split('\n').filter(Boolean)
      const events = lines.map((line) => JSON.parse(line) as SessionEvent)
      conversationSchemaVersion = this.#resolveConversationSchemaVersion(events)

      for (const event of events) {
        // Track latest timestamp
        if (event.timestamp) {
          updatedAt = event.timestamp
        }

        if (!cwd && typeof event.cwd === 'string') {
          cwd = event.cwd
        }

        // Extract gitBranch from first event that has it
        if (event.gitBranch && gitBranch === 'unknown') {
          gitBranch = event.gitBranch
        }

        // Extract first user message
        if (
          !firstMessage &&
          event.type === 'user' &&
          event.message &&
          Array.isArray(event.message.blocks)
        ) {
          const plainText = getMessagePlainText({
            blocks: event.message.blocks,
          })
          firstMessage =
            plainText.length > FIRST_MESSAGE_MAX_LENGTH
              ? plainText.slice(0, FIRST_MESSAGE_MAX_LENGTH) + '...'
              : plainText
        }
      }
    } catch (err) {
      dbg(`[SessionStore] JSONL 摘要提取失败 file=${filePath}: ${err instanceof Error ? err.message : String(err)}\n`)
    }

    return { conversationSchemaVersion, cwd, firstMessage, updatedAt, gitBranch }
  }

  #resolveConversationSchemaVersion(events: SessionEvent[]): number {
    const startEvent = events.find((event) => event.type === 'session_start')
    return startEvent?.conversationSchemaVersion ?? 0
  }

  #buildEmptySnapshot(
    sessionId: string,
    conversationSchemaVersion: number,
    events: SessionEvent[],
  ): SessionSnapshot {
    const startEvent = events.find((event) => event.type === 'session_start')
    return {
      conversationSchemaVersion,
      sessionId,
      provider: startEvent?.provider ?? '',
      model: startEvent?.model ?? '',
      cwd: startEvent?.cwd ?? '',
      messages: [],
      leafEventUuid: startEvent?.uuid ?? null,
    }
  }

  /** Find JSONL file by sessionId — cache first, then scan directories */
  #resolveFilePath(sessionId: string): string | undefined {
    const cached = this.#pathCache.get(sessionId)
    if (cached && existsSync(cached)) {
      return cached
    }

    // Scan all project directories
    const slugs = this.#listProjectSlugs()
    for (const slug of slugs) {
      const projectDir = join(this.baseDir, slug)
      let entries: string[]
      try {
        entries = readdirSync(projectDir)
      } catch {
        continue  // 目录读取失败，跳过
      }

      for (const entry of entries) {
        if (extractSessionId(entry) === sessionId) {
          const filePath = join(projectDir, entry)
          this.#pathCache.set(sessionId, filePath)
          return filePath
        }
      }
    }

    return undefined
  }

  /** List subdirectories (project slugs) under baseDir */
  #listProjectSlugs(): string[] {
    if (!existsSync(this.baseDir)) return []

    try {
      return readdirSync(this.baseDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
    } catch {
      return []  // baseDir 不存在或无权限，返回空列表
    }
  }
}
