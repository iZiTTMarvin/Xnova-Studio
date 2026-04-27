import { memo, useEffect, useRef } from 'react'
import type {
  StudioActiveSessionDetail,
  StudioConversationMessage,
} from '../../shared/studio-bridge-contract'
import type {
  LiveConversationState,
} from '../stores/runtime-store'
import { MarkdownContent } from '../utils/markdown-renderer'
import {
  buildConversationRenderRows,
  type ConversationRenderRow,
} from '../utils/conversation-render-rows'
import { ToolActivityGroupRow } from './ToolActivityGroupRow'
import { ToolActionRow } from './ToolActionRow'
import { ReasoningRow } from './ReasoningRow'

export interface ConversationTimelineProps {
  session: StudioActiveSessionDetail | null
  liveConversation: LiveConversationState
  isRunActive: boolean
  /**
   * 当前运行步骤的中文文案（来自 useStudioBridge.currentRunStep）。
   * 用于"用户已发出消息但模型还没开始流式输出"的空窗期，
   * 在 Timeline 末尾展示"Xnova 正在思考 — <步骤>"占位。
   */
  currentRunStep?: string | null
}

function renderConversationRow(
  row: ConversationRenderRow,
  input: {
    showTypingCursor: boolean
  },
) {
  switch (row.type) {
    case 'text':
      return (
        <div key={row.id} className="conversation-render-row conversation-render-row-text">
          <MarkdownContent text={row.content} />
          {input.showTypingCursor ? <span className="typing-cursor">▋</span> : null}
        </div>
      )
    case 'reasoning':
      return (
        <ReasoningRow
          key={row.id}
          content={row.content}
          isLive={row.isLive}
          {...(row.durationMs === undefined ? {} : { durationMs: row.durationMs })}
        />
      )
    case 'tool_activity_group':
      return (
        <ToolActivityGroupRow
          key={row.id}
          title={row.title}
          running={row.running}
          tools={row.tools}
        />
      )
    case 'tool_action':
      return <ToolActionRow key={row.id} tool={row.tool} />
    case 'status':
      return (
        <div key={row.id} className="conversation-status-row">
          {row.content}
        </div>
      )
    case 'system':
      return (
        <div
          key={row.id}
          className={`conversation-system-row conversation-system-row--${row.level}`}
        >
          {row.content}
        </div>
      )
  }
}

const UserMessageView = memo(function UserMessageView(props: {
  message: StudioConversationMessage
}) {
  const { message } = props
  const textContent = message.blocks
    .filter(
      (block): block is Extract<StudioConversationMessage['blocks'][number], { type: 'text' }> =>
        block.type === 'text',
    )
    .map((block) => block.content)
    .join('')

  return (
    <article className="conversation-message conversation-message-user">
      <div className="conversation-message-label">你</div>
      <div className="conversation-message-body">
        <MarkdownContent text={textContent} />
      </div>
    </article>
  )
})

const StructuredMessageView = memo(function StructuredMessageView(props: {
  message: StudioConversationMessage
  isRunActive: boolean
  isLiveMessage: boolean
}) {
  const { message, isRunActive, isLiveMessage } = props
  const rows = buildConversationRenderRows(message.blocks, {
    isRunActive,
  })
  const className =
    message.role === 'assistant'
      ? 'conversation-message conversation-message-assistant'
      : 'conversation-message conversation-message-system'
  const label = message.role === 'assistant' ? 'Xnova' : '系统'

  return (
    <article
      className={`${className}${isLiveMessage ? ' conversation-message-live' : ''}`}
    >
      <div className="conversation-message-label">{label}</div>
      <div className="conversation-message-body">
        {rows.map((row, index) =>
          renderConversationRow(row, {
            showTypingCursor:
              isLiveMessage &&
              row.type === 'text' &&
              index === rows.length - 1,
          }),
        )}
      </div>
    </article>
  )
})

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
  // "Xnova 正在思考"占位条件：
  // 1) Run 仍在活跃中
  // 2) 用户消息已发出（pendingUserText 存在）但 assistant 还没产出任何 block
  // 这填补 model_request_started → model_first_chunk 之间的空白。
  const showThinkingPlaceholder =
    props.isRunActive &&
    props.liveConversation.pendingUserText !== null &&
    liveBlocks.length === 0

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
      {persistedMessages.map((message) =>
        message.role === 'user'
          ? <UserMessageView key={message.id} message={message} />
          : (
              <StructuredMessageView
                key={message.id}
                message={message}
                isRunActive={false}
                isLiveMessage={false}
              />
            ),
      )}

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
        <StructuredMessageView
          message={{
            id: 'live-assistant-message',
            role: 'assistant',
            blocks: liveBlocks,
          }}
          isRunActive={props.isRunActive}
          isLiveMessage={true}
        />
      ) : null}

      {/* "正在思考" 占位：model_request_started → model_first_chunk 之间的空窗期 */}
      {showThinkingPlaceholder ? (
        <article
          className="conversation-message conversation-message-assistant conversation-message-live conversation-message-thinking"
          aria-label="Xnova 正在思考"
          data-testid="conversation-thinking-placeholder"
        >
          <div className="conversation-message-label">Xnova</div>
          <div className="conversation-message-body">
            <div className="conversation-thinking-placeholder">
              <span className="spinner" aria-hidden />
              <span className="conversation-thinking-placeholder-label">
                {props.currentRunStep ?? 'Xnova 正在思考…'}
              </span>
            </div>
          </div>
        </article>
      ) : null}

      <div ref={bottomRef} />
    </section>
  )
}
