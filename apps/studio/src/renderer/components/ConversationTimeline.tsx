import {
  forwardRef,
  memo,
  useCallback,
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
import { IconChevronDown } from './Icons'
import { ReasoningRow } from './ReasoningRow'
import { SubAgentCard } from './SubAgentCard'
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

/**
 * 三态滚动模式：
 * - following：自动跟随底部（默认，流式输出时）
 * - paused：用户主动上滚，暂停跟随，显示"回到底部"按钮
 * - locked：用户正在查看历史，完全锁定（上滚超过 200px）
 */
type ScrollMode = 'following' | 'paused' | 'locked'

/** 用户上滚超过此距离时进入 paused/locked 模式 */
const SCROLL_PAUSE_THRESHOLD = 200

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
  | {
      id: 'live-activity-indicator'
      type: 'activity-indicator'
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
    case 'subagent':
      return (
        <SubAgentCard
          key={row.id}
          agent={row.agent}
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
    // 用户消息：右对齐气泡布局（参考 OpenCowork UserMessage）
    // 使用 flex items-end 让气泡靠右，不再显示"你"标签
    <article
      className={[
        'conversation-user-row',
        isLive ? 'conversation-user-row--live' : '',
      ].filter(Boolean).join(' ')}
    >
      <div className="conversation-user-bubble">
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
  // system 消息保留独立样式，assistant 消息改为全宽左对齐内容流，不用大卡片包裹
  const isSystem = message.role !== 'assistant'

  if (isSystem) {
    return (
      <article className="conversation-message conversation-message-system">
        <div className="conversation-message-label">系统</div>
        <div className="conversation-message-body">
          {rows.map((row) =>
            renderConversationRow(row, {
              showTypingCursor: false,
              expandedRows,
              interactedRows,
              onExpandedChange,
              onInteractedChange,
            }),
          )}
        </div>
      </article>
    )
  }

  return (
    // Agent 消息：全宽左对齐，"Xnova" 标签在顶部以小字行内形式显示
    // 不再使用大卡片边框包裹，参考 OpenCowork AssistantMessage 的布局
    <article
      className={[
        'conversation-assistant-row',
        isLiveMessage ? 'conversation-assistant-row--live' : '',
      ].filter(Boolean).join(' ')}
    >
      <div className="conversation-assistant-header">
        <span className="conversation-assistant-label">Xnova</span>
        {isLiveMessage ? <span className="spinner conversation-assistant-spinner" aria-hidden /> : null}
      </div>
      <div className="conversation-assistant-body">
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

const TimelineBottomSpacer = memo(function TimelineBottomSpacer() {
  return <div className="conversation-bottom-spacer" aria-hidden="true" />
})

const TimelineLoadMoreRow = memo(function TimelineLoadMoreRow(props: {
  hiddenCount: number
  isLoading: boolean
  onLoadMore: () => void
}) {
  return (
    <div className="conversation-load-more-row">
      {props.isLoading ? (
        <div className="conversation-load-more-skeleton">
          <div className="conversation-skeleton-line" />
          <div className="conversation-skeleton-line conversation-skeleton-line--short" />
        </div>
      ) : (
        <button
          type="button"
          className="conversation-load-more-button"
          onClick={props.onLoadMore}
        >
          加载更早消息
          {' '}
          <span className="mono">剩余 {props.hiddenCount} 条</span>
        </button>
      )}
    </div>
  )
})

const ThinkingPlaceholderRow = memo(function ThinkingPlaceholderRow(props: {
  label: string
}) {
  return (
    // 等待模型响应/思考中：与 Agent 消息同款结构，无大卡片边框
    <article
      className="conversation-assistant-row conversation-assistant-row--live"
      aria-label="Xnova 正在思考"
      data-testid="conversation-thinking-placeholder"
    >
      <div className="conversation-assistant-header">
        <span className="conversation-assistant-label">Xnova</span>
        <span className="spinner conversation-assistant-spinner" aria-hidden />
      </div>
      <div className="conversation-assistant-body">
        <div className="conversation-thinking-placeholder">
          <span className="conversation-thinking-placeholder-dots" aria-hidden>
            <span /><span /><span />
          </span>
          <span className="conversation-thinking-placeholder-label">
            {props.label}
          </span>
        </div>
      </div>
    </article>
  )
})

/**
 * 尾部活动指示器：当模型正在运行且已有输出内容时显示。
 *
 * 解决的场景：模型输出 "让我创建博客" 后开始生成 tool 参数
 * （如整个 HTML 文件内容），这个过程可能持续 30-90 秒，
 * 期间没有任何事件推给 renderer。这个指示器让用户知道模型仍在工作。
 */
const LiveActivityIndicator = memo(function LiveActivityIndicator(props: {
  label: string
}) {
  return (
    <div
      className="conversation-activity-indicator"
      data-testid="conversation-activity-indicator"
    >
      <span className="conversation-thinking-placeholder-dots" aria-hidden>
        <span /><span /><span />
      </span>
      <span className="conversation-activity-indicator-label">
        {props.label}
      </span>
    </div>
  )
})

/**
 * "回到底部"按钮：带未读消息计数 badge、向下箭头、入场/退场动画。
 */
const ScrollToBottomButton = memo(function ScrollToBottomButton(props: {
  unreadCount: number
  visible: boolean
  onClick: () => void
}) {
  if (!props.visible) {
    return null
  }

  return (
    <button
      type="button"
      className="conversation-scroll-bottom conversation-scroll-bottom--animated"
      onClick={props.onClick}
    >
      <IconChevronDown />
      <span>回到底部</span>
      {props.unreadCount > 0 ? (
        <span className="conversation-scroll-bottom-badge">{props.unreadCount}</span>
      ) : null}
    </button>
  )
})

function canUseVirtualizedTimeline(): boolean {
  return typeof window !== 'undefined' && typeof window.ResizeObserver === 'function'
}

function renderTimelineItem(
  item: TimelineItem,
  input: {
    isRunActive: boolean
    isLoadingMore: boolean
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
          isLoading={input.isLoadingMore}
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
    case 'activity-indicator':
      return <LiveActivityIndicator label={item.label} />
  }
}

export function ConversationTimeline(props: ConversationTimelineProps) {
  const virtuosoRef = useRef<VirtuosoHandle | null>(null)
  const fallbackScrollerRef = useRef<HTMLElement | null>(null)
  const fallbackBottomRef = useRef<HTMLDivElement>(null)
  const pendingPrependScrollIndexRef = useRef<number | null>(null)
  const persistedMessages = props.session?.messages ?? []
  const liveBlocks = props.liveConversation.blocks
  const [visiblePersistedCount, setVisiblePersistedCount] = useState(
    MAX_TIMELINE_PERSISTED_MESSAGES,
  )
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({})
  const [interactedRows, setInteractedRows] = useState<Record<string, boolean>>({})
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  // 三态滚动模式
  const [scrollMode, setScrollMode] = useState<ScrollMode>('following')
  // 未读消息计数：paused/locked 模式下新到达的消息数
  const [unreadCount, setUnreadCount] = useState(0)
  const previousItemCountRef = useRef(0)

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
    setScrollMode('following')
    setUnreadCount(0)
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

    // 当模型正在运行且已有输出内容时，在 live message 末尾显示活动指示器。
    if (props.isRunActive && liveBlocks.length > 0 && !showThinkingPlaceholder) {
      items.push({
        id: 'live-activity-indicator',
        type: 'activity-indicator',
        label: props.currentRunStep ?? '模型正在处理…',
      })
    }

    return items
  }, [
    hiddenPersistedCount,
    liveBlocks,
    props.currentRunStep,
    props.isRunActive,
    props.liveConversation.pendingUserText,
    showThinkingPlaceholder,
    visiblePersistedMessages,
  ])

  // 追踪新消息到达，更新未读计数
  useEffect(() => {
    const currentCount = timelineItems.length
    const prevCount = previousItemCountRef.current
    if (currentCount > prevCount && scrollMode !== 'following') {
      setUnreadCount((c) => c + (currentCount - prevCount))
    }
    previousItemCountRef.current = currentCount
  }, [timelineItems.length, scrollMode])

  useEffect(() => {
    const pendingIndex = pendingPrependScrollIndexRef.current
    if (pendingIndex === null || !canUseVirtualizedTimeline()) {
      return
    }
    pendingPrependScrollIndexRef.current = null
    setIsLoadingMore(false)
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
    if (scrollMode !== 'following') {
      return
    }
    const bottomElement = fallbackBottomRef.current
    if (typeof bottomElement?.scrollIntoView !== 'function') {
      return
    }
    bottomElement.scrollIntoView({ behavior: 'smooth' })
  }, [scrollMode, liveBlocks, timelineItems.length])

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
    setIsLoadingMore(true)
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

  /**
   * Virtuoso 的 atBottomStateChange 回调。
   * 根据是否在底部来更新滚动模式。
   */
  const handleAtBottomChange = (atBottom: boolean) => {
    if (atBottom) {
      setScrollMode('following')
      setUnreadCount(0)
    } else if (scrollMode === 'following') {
      // 用户离开底部，进入 paused
      setScrollMode('paused')
    }
  }

  const handleFallbackScroll = () => {
    const scroller = fallbackScrollerRef.current
    if (!scroller) {
      return
    }

    const distanceToBottom =
      scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight

    if (distanceToBottom < 56) {
      setScrollMode('following')
      setUnreadCount(0)
    } else if (distanceToBottom > SCROLL_PAUSE_THRESHOLD) {
      setScrollMode('locked')
    } else if (scrollMode === 'following') {
      setScrollMode('paused')
    }
  }

  const handleScrollToBottom = () => {
    setScrollMode('following')
    setUnreadCount(0)
    if (canUseVirtualizedTimeline()) {
      virtuosoRef.current?.scrollTo({
        top: Number.MAX_SAFE_INTEGER,
        behavior: 'smooth',
      })
      return
    }

    fallbackBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const showScrollButton = scrollMode !== 'following'

  if (!canUseVirtualizedTimeline()) {
    return (
      <section
        ref={fallbackScrollerRef}
        className="conversation-timeline"
        aria-label="项目会话聊天流"
        onScroll={handleFallbackScroll}
      >
        <div className="conversation-timeline-list">
          {timelineItems.map((item) => (
            <div key={item.id} className="conversation-timeline-item">
              {renderTimelineItem(item, {
                isRunActive: props.isRunActive,
                isLoadingMore,
                onLoadMore: handleLoadMore,
                expandedRows,
                interactedRows,
                onExpandedChange: handleExpandedChange,
                onInteractedChange: handleInteractedChange,
              })}
            </div>
          ))}
          <TimelineBottomSpacer />
        </div>
        <div ref={fallbackBottomRef} />
        <ScrollToBottomButton
          visible={showScrollButton}
          unreadCount={unreadCount}
          onClick={handleScrollToBottom}
        />
      </section>
    )
  }

  return (
    <>
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
          Footer: TimelineBottomSpacer,
        }}
        atBottomStateChange={handleAtBottomChange}
        atBottomThreshold={56}
        followOutput={() =>
          (hasLiveContent || props.isRunActive) && scrollMode === 'following' ? 'smooth' : false
        }
        increaseViewportBy={{ top: 320, bottom: 720 }}
        initialTopMostItemIndex={Math.max(0, timelineItems.length - 1)}
        itemContent={(_index, item) => (
          <div className="conversation-timeline-item">
            {renderTimelineItem(item, {
              isRunActive: props.isRunActive,
              isLoadingMore,
              onLoadMore: handleLoadMore,
              expandedRows,
              interactedRows,
              onExpandedChange: handleExpandedChange,
              onInteractedChange: handleInteractedChange,
            })}
          </div>
        )}
      />
      <ScrollToBottomButton
        visible={showScrollButton}
        unreadCount={unreadCount}
        onClick={handleScrollToBottom}
      />
    </>
  )
}
