import {
  forwardRef,
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
} from 'react'
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso'
import type {
  StudioActiveSessionDetail,
  StudioConversationMessage,
} from '../../shared/studio-bridge-contract'
import type { LiveConversationState } from '../stores/runtime-store'
import {
  MAX_TIMELINE_PERSISTED_MESSAGES,
  TIMELINE_LOAD_MORE_PAGE_SIZE,
} from '../utils/conversation-memory-guards'
import { MarkdownContent } from '../utils/markdown-renderer'
import {
  buildConversationRenderRows,
  type ConversationRenderRow,
} from '../utils/conversation-render-rows'
import { ReasoningRow } from './ReasoningRow'
import { ToolActionRow } from './ToolActionRow'
import { ToolActivityGroupRow } from './ToolActivityGroupRow'

export interface ConversationTimelineProps {
  session: StudioActiveSessionDetail | null
  liveConversation: LiveConversationState
  isRunActive: boolean
  /**
   * 当前运行步骤的中文文案。
   * 用于 model 尚未输出首个 block 时填补空窗期。
   */
  currentRunStep?: string | null
}

type TimelineItem =
  | {
      id: string
      type: 'persisted-message'
      message: StudioConversationMessage
    }
  | {
      id: 'timeline-load-more'
      type: 'load-more'
      hiddenCount: number
    }
  | {
      id: 'live-pending-user'
      type: 'pending-user'
      text: string
    }
  | {
      id: 'live-assistant-message'
      type: 'live-message'
      message: StudioConversationMessage
    }
  | {
      id: 'live-thinking-placeholder'
      type: 'thinking-placeholder'
      label: string
    }

function renderConversationRow(
  row: ConversationRenderRow,
  input: {
    showTypingCursor: boolean
    expandedRows: Record<string, boolean>
    interactedRows: Record<string, boolean>
    onExpandedChange: (rowId: string, nextExpanded: boolean) => void
    onInteractedChange: (rowId: string, nextHasInteracted: boolean) => void
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
          {...(row.startedAt === undefined ? {} : { startedAt: row.startedAt })}
          {...(row.endedAt === undefined ? {} : { endedAt: row.endedAt })}
          {...(row.id in input.expandedRows
            ? { isExpanded: input.expandedRows[row.id] }
            : {})}
          onExpandedChange={(nextExpanded) => {
            input.onExpandedChange(row.id, nextExpanded)
          }}
        />
      )
    case 'tool_activity_group':
      return (
        <ToolActivityGroupRow
          key={row.id}
          title={row.title}
          running={row.running}
          tools={row.tools}
          {...(row.id in input.expandedRows
            ? { isExpanded: input.expandedRows[row.id] }
            : {})}
          {...(row.id in input.interactedRows
            ? { hasInteracted: input.interactedRows[row.id] }
            : {})}
          onExpandedChange={(nextExpanded) => {
            input.onExpandedChange(row.id, nextExpanded)
          }}
          onInteractedChange={(nextHasInteracted) => {
            input.onInteractedChange(row.id, nextHasInteracted)
          }}
        />
      )
    case 'tool_action':
      return (
        <ToolActionRow
          key={row.id}
          tool={row.tool}
          {...(row.id in input.expandedRows
            ? { isExpanded: input.expandedRows[row.id] }
            : {})}
          onExpandedChange={(nextExpanded) => {
            input.onExpandedChange(row.id, nextExpanded)
          }}
        />
      )
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
  isLive?: boolean
}) {
  const { message, isLive = false } = props
  const textContent = message.blocks
    .filter(
      (block): block is Extract<StudioConversationMessage['blocks'][number], { type: 'text' }> =>
        block.type === 'text',
    )
    .map((block) => block.content)
    .join('')

  return (
    <article
      className={[
        'conversation-message',
        'conversation-message-user',
        isLive ? 'conversation-message-live' : '',
      ].filter(Boolean).join(' ')}
    >
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
  expandedRows: Record<string, boolean>
  interactedRows: Record<string, boolean>
  onExpandedChange: (rowId: string, nextExpanded: boolean) => void
  onInteractedChange: (rowId: string, nextHasInteracted: boolean) => void
}) {
  const {
    message,
    isRunActive,
    isLiveMessage,
    expandedRows,
    interactedRows,
    onExpandedChange,
    onInteractedChange,
  } = props
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
            expandedRows,
            interactedRows,
            onExpandedChange,
            onInteractedChange,
          }),
        )}
      </div>
    </article>
  )
})

const TimelineScroller = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<'div'>>(
  function TimelineScroller(props, ref) {
    const { className, ...rest } = props
    return (
      <div
        {...rest}
        ref={ref}
        className={['conversation-timeline', className].filter(Boolean).join(' ')}
      />
    )
  },
)

const TimelineList = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<'div'>>(
  function TimelineList(props, ref) {
    const { className, ...rest } = props
    return (
      <div
        {...rest}
        ref={ref}
        className={['conversation-timeline-list', className].filter(Boolean).join(' ')}
      />
    )
  },
)

const TimelineLoadMoreRow = memo(function TimelineLoadMoreRow(props: {
  hiddenCount: number
  onLoadMore: () => void
}) {
  return (
    <div className="conversation-load-more-row">
      <button
        type="button"
        className="conversation-load-more-button"
        onClick={props.onLoadMore}
      >
        加载更早消息
        {' '}
        <span className="mono">剩余 {props.hiddenCount} 条</span>
      </button>
    </div>
  )
})

const ThinkingPlaceholderRow = memo(function ThinkingPlaceholderRow(props: {
  label: string
}) {
  return (
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
            {props.label}
          </span>
        </div>
      </div>
    </article>
  )
})

function canUseVirtualizedTimeline(): boolean {
  return typeof window !== 'undefined' && typeof window.ResizeObserver === 'function'
}

function renderTimelineItem(
  item: TimelineItem,
  input: {
    isRunActive: boolean
    onLoadMore: () => void
    expandedRows: Record<string, boolean>
    interactedRows: Record<string, boolean>
    onExpandedChange: (rowId: string, nextExpanded: boolean) => void
    onInteractedChange: (rowId: string, nextHasInteracted: boolean) => void
  },
) {
  switch (item.type) {
    case 'load-more':
      return (
        <TimelineLoadMoreRow
          hiddenCount={item.hiddenCount}
          onLoadMore={input.onLoadMore}
        />
      )
    case 'persisted-message':
      return item.message.role === 'user'
        ? <UserMessageView message={item.message} />
        : (
            <StructuredMessageView
              message={item.message}
              isRunActive={false}
              isLiveMessage={false}
              expandedRows={input.expandedRows}
              interactedRows={input.interactedRows}
              onExpandedChange={input.onExpandedChange}
              onInteractedChange={input.onInteractedChange}
            />
          )
    case 'pending-user':
      return (
        <UserMessageView
          isLive={true}
          message={{
            id: item.id,
            role: 'user',
            blocks: [
              {
                id: `${item.id}-text`,
                type: 'text',
                content: item.text,
              },
            ],
          }}
        />
      )
    case 'live-message':
      return (
        <StructuredMessageView
          message={item.message}
          isRunActive={input.isRunActive}
          isLiveMessage={true}
          expandedRows={input.expandedRows}
          interactedRows={input.interactedRows}
          onExpandedChange={input.onExpandedChange}
          onInteractedChange={input.onInteractedChange}
        />
      )
    case 'thinking-placeholder':
      return <ThinkingPlaceholderRow label={item.label} />
  }
}

export function ConversationTimeline(props: ConversationTimelineProps) {
  const virtuosoRef = useRef<VirtuosoHandle | null>(null)
  const fallbackBottomRef = useRef<HTMLDivElement>(null)
  const pendingPrependScrollIndexRef = useRef<number | null>(null)
  const persistedMessages = props.session?.messages ?? []
  const liveBlocks = props.liveConversation.blocks
  const [visiblePersistedCount, setVisiblePersistedCount] = useState(
    MAX_TIMELINE_PERSISTED_MESSAGES,
  )
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({})
  const [interactedRows, setInteractedRows] = useState<Record<string, boolean>>({})
  const [isAtBottom, setIsAtBottom] = useState(true)

  const hasLiveContent =
    props.liveConversation.pendingUserText !== null ||
    liveBlocks.length > 0
  const showThinkingPlaceholder =
    props.isRunActive &&
    props.liveConversation.pendingUserText !== null &&
    liveBlocks.length === 0

  useEffect(() => {
    setVisiblePersistedCount(MAX_TIMELINE_PERSISTED_MESSAGES)
    pendingPrependScrollIndexRef.current = null
    setExpandedRows({})
    setInteractedRows({})
    setIsAtBottom(true)
  }, [props.session?.sessionId])

  const hiddenPersistedCount = Math.max(
    0,
    persistedMessages.length - visiblePersistedCount,
  )
  const visiblePersistedMessages = useMemo(
    () => persistedMessages.slice(hiddenPersistedCount),
    [hiddenPersistedCount, persistedMessages],
  )

  const timelineItems = useMemo(() => {
    const items: TimelineItem[] = []

    if (hiddenPersistedCount > 0) {
      items.push({
        id: 'timeline-load-more',
        type: 'load-more',
        hiddenCount: hiddenPersistedCount,
      })
    }

    for (const message of visiblePersistedMessages) {
      items.push({
        id: `persisted:${message.id}`,
        type: 'persisted-message',
        message,
      })
    }

    if (props.liveConversation.pendingUserText) {
      items.push({
        id: 'live-pending-user',
        type: 'pending-user',
        text: props.liveConversation.pendingUserText,
      })
    }

    if (liveBlocks.length > 0) {
      items.push({
        id: 'live-assistant-message',
        type: 'live-message',
        message: {
          id: 'live-assistant-message',
          role: 'assistant',
          blocks: liveBlocks,
        },
      })
    }

    if (showThinkingPlaceholder) {
      items.push({
        id: 'live-thinking-placeholder',
        type: 'thinking-placeholder',
        label: props.currentRunStep ?? 'Xnova 正在思考…',
      })
    }

    return items
  }, [
    hiddenPersistedCount,
    liveBlocks,
    props.currentRunStep,
    props.liveConversation.pendingUserText,
    showThinkingPlaceholder,
    visiblePersistedMessages,
  ])

  useEffect(() => {
    const pendingIndex = pendingPrependScrollIndexRef.current
    if (pendingIndex === null || !canUseVirtualizedTimeline()) {
      return
    }
    pendingPrependScrollIndexRef.current = null
    virtuosoRef.current?.scrollToIndex({
      index: pendingIndex,
      align: 'start',
      behavior: 'auto',
    })
  }, [timelineItems.length])

  useEffect(() => {
    if (canUseVirtualizedTimeline()) {
      return
    }
    const bottomElement = fallbackBottomRef.current
    if (typeof bottomElement?.scrollIntoView !== 'function') {
      return
    }
    bottomElement.scrollIntoView({ behavior: 'smooth' })
  }, [liveBlocks, timelineItems.length])

  if (persistedMessages.length === 0 && !hasLiveContent) {
    return (
      <section className="conversation-empty-state">
        <strong>当前会话还没有消息</strong>
        <span>从下方输入继续当前项目工作。</span>
      </section>
    )
  }

  const handleLoadMore = () => {
    if (hiddenPersistedCount <= 0) {
      return
    }
    const nextAddedCount = Math.min(
      TIMELINE_LOAD_MORE_PAGE_SIZE,
      hiddenPersistedCount,
    )
    const remainingHiddenCount = hiddenPersistedCount - nextAddedCount
    pendingPrependScrollIndexRef.current =
      nextAddedCount + (remainingHiddenCount > 0 ? 1 : 0)
    setVisiblePersistedCount((current) =>
      Math.min(persistedMessages.length, current + TIMELINE_LOAD_MORE_PAGE_SIZE),
    )
  }

  const handleExpandedChange = (rowId: string, nextExpanded: boolean) => {
    setExpandedRows((current) => {
      if (current[rowId] === nextExpanded) {
        return current
      }
      return {
        ...current,
        [rowId]: nextExpanded,
      }
    })
  }

  const handleInteractedChange = (rowId: string, nextHasInteracted: boolean) => {
    setInteractedRows((current) => {
      if (current[rowId] === nextHasInteracted) {
        return current
      }
      return {
        ...current,
        [rowId]: nextHasInteracted,
      }
    })
  }

  if (!canUseVirtualizedTimeline()) {
    return (
      <section className="conversation-timeline" aria-label="项目会话聊天流">
        <div className="conversation-timeline-list">
          {timelineItems.map((item) => (
            <div key={item.id} className="conversation-timeline-item">
              {renderTimelineItem(item, {
                isRunActive: props.isRunActive,
                onLoadMore: handleLoadMore,
                expandedRows,
                interactedRows,
                onExpandedChange: handleExpandedChange,
                onInteractedChange: handleInteractedChange,
              })}
            </div>
          ))}
        </div>
        <div ref={fallbackBottomRef} />
      </section>
    )
  }

  return (
    <Virtuoso
      ref={virtuosoRef}
      aria-label="项目会话聊天流"
      className="conversation-timeline-virtuoso"
      style={{ flex: 1, minHeight: 0 }}
      data={timelineItems}
      computeItemKey={(_index, item) => item.id}
      components={{
        Scroller: TimelineScroller,
        List: TimelineList,
      }}
      atBottomStateChange={setIsAtBottom}
      followOutput={() =>
        (hasLiveContent || props.isRunActive) && isAtBottom ? 'smooth' : false
      }
      increaseViewportBy={{ top: 320, bottom: 720 }}
      initialTopMostItemIndex={Math.max(0, timelineItems.length - 1)}
      itemContent={(_index, item) => (
        <div className="conversation-timeline-item">
          {renderTimelineItem(item, {
            isRunActive: props.isRunActive,
            onLoadMore: handleLoadMore,
            expandedRows,
            interactedRows,
            onExpandedChange: handleExpandedChange,
            onInteractedChange: handleInteractedChange,
          })}
        </div>
      )}
    />
  )
}
