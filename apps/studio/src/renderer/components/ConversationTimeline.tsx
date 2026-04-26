import { useEffect, useRef, useState } from 'react'
import type {
  StudioActiveSessionDetail,
  StudioConversationMessage,
} from '../../shared/studio-bridge-contract'
import type {
  LiveConversationBlock,
  LiveConversationState,
} from '../hooks/useStudioBridge'
import { IconChevronRight, IconChevronDown, IconCheck, IconCross } from './Icons'
import {
  createToolArgumentDetails,
  createToolEventSummary,
} from '../utils/tool-event-summary'
import { MarkdownContent } from '../utils/markdown-renderer'

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
  resultFull?: string | undefined
}

function ToolCallRow(props: ToolCallRowProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const summary = createToolEventSummary(props.toolName, props.args, props.resultSummary)
  const argumentDetails = createToolArgumentDetails(props.toolName, props.args)
  const isRunning = props.status === 'running'
  const isSuccess = props.status === 'done' && props.success !== false
  const isError = props.status === 'done' && props.success === false
  const statusText = isRunning ? '进行中' : isError ? '失败' : '成功'
  const hasResultFull =
    typeof props.resultFull === 'string' &&
    props.resultFull.trim().length > 0 &&
    props.resultFull !== props.resultSummary

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

        <span className={`tool-call-verb ${!isRunning ? 'tool-call-verb--done' : ''}`}>
          {summary.title}
        </span>
        {summary.target ? (
          <span className="tool-call-target">{summary.target}</span>
        ) : null}
        {summary.detail ? (
          <span className="tool-call-target">{summary.detail}</span>
        ) : null}
        <span className="tool-call-duration">{statusText}</span>

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
          {argumentDetails.length > 0 ? (
            <div className="tool-call-detail-section">
              <span className="tool-call-detail-label">参数</span>
              <div className="tool-call-detail-result">
                {argumentDetails.map((detail) => (
                  <div key={`${detail.label}:${detail.value}`}>
                    <strong>{detail.label}</strong>
                    {': '}
                    <span>{detail.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {props.resultSummary ? (
            <div className="tool-call-detail-section">
              <span className="tool-call-detail-label">结果</span>
              <div className="tool-call-detail-result">{props.resultSummary}</div>
            </div>
          ) : null}
          {hasResultFull ? (
            <details className="tool-call-detail-section">
              <summary className="tool-call-detail-label">完整结果</summary>
              <pre className="tool-call-detail-code">{props.resultFull}</pre>
            </details>
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
          resultFull={toolEvent.resultFull}
        />
      ))}
    </div>
  )
}

function renderPersistedMessage(message: StudioConversationMessage) {
  // 用户消息
  if (message.role === 'user') {
    return (
      <article
        key={message.id}
        className="conversation-message conversation-message-user"
      >
        <div className="conversation-message-label">你</div>
        <div className="conversation-message-body">{message.content}</div>
        {message.toolEvents && message.toolEvents.length > 0
          ? renderPersistedToolEvents(message.toolEvents)
          : null}
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
        {message.toolEvents && message.toolEvents.length > 0
          ? renderPersistedToolEvents(message.toolEvents)
          : null}
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
      {message.toolEvents && message.toolEvents.length > 0
        ? renderPersistedToolEvents(message.toolEvents)
        : null}
    </article>
  )
}

function renderLiveBlock(block: LiveConversationBlock, showTypingCursor: boolean) {
  switch (block.type) {
    case 'text':
      return (
        <div key={block.id} className="conversation-live-block conversation-live-text">
          <MarkdownContent text={block.content} />
          {showTypingCursor ? <span className="typing-cursor">▋</span> : null}
        </div>
      )
    case 'thinking':
      return <ThinkingBlock key={block.id} text={block.content} isLive={true} />
    case 'tool':
      return (
        <div key={block.id} className="tool-call-group tool-call-group--live">
          <ToolCallRow
            toolName={block.toolName}
            args={block.args}
            status={block.status}
            success={block.success}
            durationMs={block.durationMs}
            resultSummary={block.resultSummary}
            resultFull={block.resultFull}
          />
        </div>
      )
    case 'status':
      return (
        <div key={block.id} className="conversation-live-status">
          {block.content}
        </div>
      )
    case 'system':
      return (
        <div
          key={block.id}
          className={`conversation-live-system conversation-live-system--${block.level}`}
        >
          {block.content}
        </div>
      )
  }
}

// ============================================================
// ConversationTimeline — 主时间线
// ============================================================

export function ConversationTimeline(props: ConversationTimelineProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const persistedMessages = props.session?.messages ?? []
  const liveBlocks = props.liveConversation.blocks
  const hasLiveContent =
    props.liveConversation.pendingUserText !== null ||
    liveBlocks.length > 0

  useEffect(() => {
    const bottomElement = bottomRef.current
    if (typeof bottomElement?.scrollIntoView !== 'function') {
      return
    }
    bottomElement.scrollIntoView({ behavior: 'smooth' })
  }, [
    persistedMessages.length,
    liveBlocks,
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

      {/* 实时 Xnova turn：按 runtime event 到达顺序渲染文本、思考、工具与状态 */}
      {liveBlocks.length > 0 ? (
        <article className="conversation-message conversation-message-assistant conversation-message-live">
          <div className="conversation-message-label">Xnova</div>
          <div className="conversation-message-body">
            {liveBlocks.map((block, index) =>
              renderLiveBlock(
                block,
                block.type === 'text' && index === liveBlocks.length - 1,
              ))}
          </div>
        </article>
      ) : null}
      <div ref={bottomRef} />
    </section>
  )
}
