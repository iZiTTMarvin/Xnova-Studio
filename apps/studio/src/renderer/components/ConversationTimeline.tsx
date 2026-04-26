import { useEffect, useRef, useState } from 'react'
import type {
  StudioActiveSessionDetail,
  StudioConversationMessage,
} from '../../shared/studio-bridge-contract'
import { IconChevronRight, IconChevronDown, IconCheck, IconCross } from './Icons'
import { getToolDisplayLabel } from '../utils/tool-display-utils'
import { MarkdownContent } from '../utils/markdown-renderer'

interface LiveConversationState {
  pendingUserText: string | null
  assistantText: string
  thinkingText: string
  toolEvents: Array<{
    toolCallId: string
    toolName: string
    args: Record<string, unknown>
    status: 'running' | 'done'
    durationMs?: number
    success?: boolean
    resultSummary?: string
  }>
  systemMessages: string[]
}

export interface ConversationTimelineProps {
  session: StudioActiveSessionDetail | null
  liveConversation: LiveConversationState
}

// ============================================================
// ThinkingBlock — 可折叠思考块（Claude 风格）
// ============================================================

interface ThinkingBlockProps {
  text: string
  /** 是否处于实时流式状态 */
  isLive: boolean
}

function ThinkingBlock(props: ThinkingBlockProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const startTimeRef = useRef(Date.now())
  const wasLiveRef = useRef(props.isLive)

  // 计时器：仅在 isLive 时运行
  useEffect(() => {
    if (!props.isLive) {
      return
    }
    startTimeRef.current = Date.now()
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [props.isLive])

  // 从 live → 非 live 时自动折叠
  useEffect(() => {
    if (wasLiveRef.current && !props.isLive) {
      setIsCollapsed(true)
    }
    wasLiveRef.current = props.isLive
  }, [props.isLive])

  const displayTime = props.isLive
    ? `${elapsedSeconds}s`
    : `${elapsedSeconds}s`

  return (
    <div className={`thinking-block ${isCollapsed ? 'thinking-block--collapsed' : ''}`}>
      <button
        type="button"
        className="thinking-block-header"
        onClick={() => setIsCollapsed((prev) => !prev)}
        aria-expanded={!isCollapsed}
        aria-label="展开/折叠思考过程"
      >
        <span className="thinking-block-chevron">
          {isCollapsed ? <IconChevronRight /> : <IconChevronDown />}
        </span>
        {props.isLive ? <span className="spinner" /> : null}
        <span className="thinking-block-title">
          {props.isLive ? '思考中…' : '思考过程'}
        </span>
        <span className="thinking-block-timer">⏱ {displayTime}</span>
      </button>
      <div className="thinking-block-content">
        <div className="thinking-block-text">{props.text}</div>
      </div>
    </div>
  )
}

// ============================================================
// ToolCallRow — 紧凑工具调用行（Claude Code 风格）
// ============================================================

interface ToolCallRowProps {
  toolName: string
  args: Record<string, unknown>
  status: 'running' | 'done'
  success?: boolean | undefined
  durationMs?: number | undefined
  resultSummary?: string | undefined
}

function ToolCallRow(props: ToolCallRowProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const display = getToolDisplayLabel(props.toolName, props.args)
  const isRunning = props.status === 'running'
  const isSuccess = props.status === 'done' && props.success !== false
  const isError = props.status === 'done' && props.success === false

  const durationText = props.durationMs !== undefined
    ? `${(props.durationMs / 1000).toFixed(1)}s`
    : null

  return (
    <div className={`tool-call-row ${isRunning ? 'tool-call-row--running' : 'tool-call-row--done'}`}>
      <button
        type="button"
        className="tool-call-row-main"
        onClick={() => setIsExpanded((prev) => !prev)}
        aria-expanded={isExpanded}
      >
        {/* 状态指示器 */}
        <span className="tool-call-status">
          {isRunning ? (
            <span className="spinner" />
          ) : isSuccess ? (
            <IconCheck className="tool-call-icon-success" />
          ) : isError ? (
            <IconCross className="tool-call-icon-error" />
          ) : (
            <IconCheck className="tool-call-icon-success" />
          )}
        </span>

        {/* 动词 + 目标 */}
        <span className={`tool-call-verb ${!isRunning ? 'tool-call-verb--done' : ''}`}>
          {display.verb}
        </span>
        {display.target ? (
          <span className="tool-call-target">{display.target}</span>
        ) : null}

        {/* 耗时 */}
        {durationText ? (
          <span className="tool-call-duration">{durationText}</span>
        ) : null}

        {/* 展开箭头 */}
        <span className="tool-call-expand-chevron">
          {isExpanded ? <IconChevronDown /> : <IconChevronRight />}
        </span>
      </button>

      {/* 展开详情 */}
      {isExpanded ? (
        <div className="tool-call-details">
          {Object.keys(props.args).length > 0 ? (
            <div className="tool-call-detail-section">
              <span className="tool-call-detail-label">参数</span>
              <pre className="tool-call-detail-code">{JSON.stringify(props.args, null, 2)}</pre>
            </div>
          ) : null}
          {props.resultSummary ? (
            <div className="tool-call-detail-section">
              <span className="tool-call-detail-label">结果</span>
              <div className="tool-call-detail-result">{props.resultSummary}</div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

// ============================================================
// 渲染持久化消息
// ============================================================

function renderPersistedToolEvents(
  toolEvents: NonNullable<StudioConversationMessage['toolEvents']>,
) {
  return (
    <div className="tool-call-group">
      {toolEvents.map((toolEvent) => (
        <ToolCallRow
          key={toolEvent.toolCallId}
          toolName={toolEvent.toolName}
          args={toolEvent.args ?? {}}
          status="done"
          success={toolEvent.success}
          durationMs={toolEvent.durationMs}
          resultSummary={toolEvent.resultSummary}
        />
      ))}
    </div>
  )
}

function renderPersistedMessage(message: StudioConversationMessage) {
  // 工具调用消息
  if (message.toolEvents && message.toolEvents.length > 0) {
    return (
      <article
        key={message.id}
        className="conversation-message conversation-message-system"
      >
        {renderPersistedToolEvents(message.toolEvents)}
      </article>
    )
  }

  // 用户消息
  if (message.role === 'user') {
    return (
      <article
        key={message.id}
        className="conversation-message conversation-message-user"
      >
        <div className="conversation-message-label">你</div>
        <div className="conversation-message-body">{message.content}</div>
      </article>
    )
  }

  // 助手消息
  if (message.role === 'assistant') {
    return (
      <article
        key={message.id}
        className="conversation-message conversation-message-assistant"
      >
        <div className="conversation-message-label">Xnova</div>
        <div className="conversation-message-body">
          <MarkdownContent text={message.content} />
        </div>
        {message.thinking ? (
          <ThinkingBlock text={message.thinking} isLive={false} />
        ) : null}
      </article>
    )
  }

  // 系统消息
  return (
    <article
      key={message.id}
      className="conversation-message conversation-message-system"
    >
      <div className="conversation-message-label">系统</div>
      <div className="conversation-message-body">{message.content}</div>
    </article>
  )
}

function createStableSystemMessageKey(message: string, occurrence: number): string {
  let hash = 0
  for (let index = 0; index < message.length; index += 1) {
    hash = (hash * 31 + message.charCodeAt(index)) >>> 0
  }

  return `live-system-${hash.toString(36)}-${occurrence}`
}

// ============================================================
// ConversationTimeline — 主时间线
// ============================================================

export function ConversationTimeline(props: ConversationTimelineProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const persistedMessages = props.session?.messages ?? []
  const hasLiveContent =
    props.liveConversation.pendingUserText !== null ||
    props.liveConversation.toolEvents.length > 0 ||
    props.liveConversation.assistantText.length > 0 ||
    props.liveConversation.thinkingText.length > 0 ||
    props.liveConversation.systemMessages.length > 0

  useEffect(() => {
    const bottomElement = bottomRef.current
    if (typeof bottomElement?.scrollIntoView !== 'function') {
      return
    }
    bottomElement.scrollIntoView({ behavior: 'smooth' })
  }, [
    persistedMessages.length,
    props.liveConversation.assistantText,
    props.liveConversation.thinkingText,
    props.liveConversation.toolEvents.length,
    props.liveConversation.systemMessages.length,
  ])

  if (persistedMessages.length === 0 && !hasLiveContent) {
    return (
      <section className="conversation-empty-state">
        <strong>当前会话还没有消息</strong>
        <span>从下方输入继续当前项目工作。</span>
      </section>
    )
  }

  return (
    <section className="conversation-timeline" aria-label="项目会话聊天流">
      {persistedMessages.map((message) => renderPersistedMessage(message))}

      {/* 实时用户消息 */}
      {props.liveConversation.pendingUserText ? (
        <article className="conversation-message conversation-message-user conversation-message-live">
          <div className="conversation-message-label">你</div>
          <div className="conversation-message-body">
            {props.liveConversation.pendingUserText}
          </div>
        </article>
      ) : null}

      {/* 实时思考块 */}
      {props.liveConversation.thinkingText ? (
        <ThinkingBlock
          text={props.liveConversation.thinkingText}
          isLive={true}
        />
      ) : null}

      {/* 实时工具调用 */}
      {props.liveConversation.toolEvents.length > 0 ? (
        <div className="tool-call-group tool-call-group--live">
          {props.liveConversation.toolEvents.map((toolEvent) => (
            <ToolCallRow
              key={toolEvent.toolCallId}
              toolName={toolEvent.toolName}
              args={toolEvent.args}
              status={toolEvent.status}
              success={toolEvent.success}
              durationMs={toolEvent.durationMs}
              resultSummary={toolEvent.resultSummary}
            />
          ))}
        </div>
      ) : null}

      {/* 实时 AI 回复 + 打字光标 */}
      {props.liveConversation.assistantText ? (
        <article className="conversation-message conversation-message-assistant conversation-message-live">
          <div className="conversation-message-label">Xnova</div>
          <div className="conversation-message-body">
            <MarkdownContent text={props.liveConversation.assistantText} />
            <span className="typing-cursor">▋</span>
          </div>
        </article>
      ) : null}

      {/* 实时系统消息 */}
      {props.liveConversation.systemMessages.map((message, index, messages) => {
        const occurrence = messages
          .slice(0, index + 1)
          .filter((candidate) => candidate === message).length

        return (
          <article
            key={createStableSystemMessageKey(message, occurrence)}
            className="conversation-message conversation-message-system conversation-message-live"
          >
            <div className="conversation-message-label">⚠️ 系统</div>
            <div className="conversation-message-body">{message}</div>
          </article>
        )
      })}
      <div ref={bottomRef} />
    </section>
  )
}
