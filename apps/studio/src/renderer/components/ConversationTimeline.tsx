import type {
  StudioActiveSessionDetail,
  StudioConversationMessage,
} from '../../shared/studio-bridge-contract'

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

function renderToolEventSummary(
  toolEvent: NonNullable<StudioConversationMessage['toolEvents']>[number],
) {
  const argsText = Object.keys(toolEvent.args ?? {}).length > 0
    ? JSON.stringify(toolEvent.args)
    : '无参数'

  return (
    <div key={toolEvent.toolCallId} className="conversation-tool-event">
      <div className="conversation-tool-header">
        <strong>{toolEvent.toolName}</strong>
        {toolEvent.success === undefined ? null : (
          <span>{toolEvent.success ? '成功' : '失败'}</span>
        )}
      </div>
      <div className="conversation-tool-meta mono">{argsText}</div>
      {toolEvent.resultSummary ? (
        <div className="conversation-tool-result">{toolEvent.resultSummary}</div>
      ) : null}
    </div>
  )
}

function renderPersistedMessage(message: StudioConversationMessage) {
  if (message.toolEvents && message.toolEvents.length > 0) {
    return (
      <article
        key={message.id}
        className="conversation-message conversation-message-system"
      >
        <div className="conversation-message-label">工具执行</div>
        <div className="conversation-tool-list">
          {message.toolEvents.map((toolEvent) => renderToolEventSummary(toolEvent))}
        </div>
      </article>
    )
  }

  return (
    <article
      key={message.id}
      className={`conversation-message conversation-message-${message.role}`}
    >
      <div className="conversation-message-label">
        {message.role === 'user'
          ? '你'
          : message.role === 'assistant'
            ? 'Xnova'
            : '系统'}
      </div>
      <div className="conversation-message-body">{message.content}</div>
      {message.thinking ? (
        <div className="conversation-message-thinking">{message.thinking}</div>
      ) : null}
    </article>
  )
}

export function ConversationTimeline(props: ConversationTimelineProps) {
  const persistedMessages = props.session?.messages ?? []
  const hasLiveContent =
    props.liveConversation.pendingUserText !== null ||
    props.liveConversation.toolEvents.length > 0 ||
    props.liveConversation.assistantText.length > 0 ||
    props.liveConversation.thinkingText.length > 0 ||
    props.liveConversation.systemMessages.length > 0

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

      {props.liveConversation.pendingUserText ? (
        <article className="conversation-message conversation-message-user conversation-message-live">
          <div className="conversation-message-label">你</div>
          <div className="conversation-message-body">
            {props.liveConversation.pendingUserText}
          </div>
        </article>
      ) : null}

      {props.liveConversation.toolEvents.length > 0 ? (
        <article className="conversation-message conversation-message-system conversation-message-live">
          <div className="conversation-message-label">运行中</div>
          <div className="conversation-tool-list">
            {props.liveConversation.toolEvents.map((toolEvent) =>
              renderToolEventSummary(toolEvent),
            )}
          </div>
        </article>
      ) : null}

      {props.liveConversation.thinkingText ? (
        <article className="conversation-message conversation-message-system conversation-message-live">
          <div className="conversation-message-label">思考中</div>
          <div className="conversation-message-thinking">
            {props.liveConversation.thinkingText}
          </div>
        </article>
      ) : null}

      {props.liveConversation.assistantText ? (
        <article className="conversation-message conversation-message-assistant conversation-message-live">
          <div className="conversation-message-label">Xnova</div>
          <div className="conversation-message-body">
            {props.liveConversation.assistantText}
          </div>
        </article>
      ) : null}

      {props.liveConversation.systemMessages.map((message, index) => (
        <article
          key={`live-system-${index}`}
          className="conversation-message conversation-message-system conversation-message-live"
        >
          <div className="conversation-message-label">系统</div>
          <div className="conversation-message-body">{message}</div>
        </article>
      ))}
    </section>
  )
}
