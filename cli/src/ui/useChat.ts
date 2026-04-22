// src/ui/useChat.ts

/**
 * useChat — 核心业务 hook，管理对话状态与 AgentLoop 生命周期。
 *
 * 职责：
 * - 维护消息列表（ChatMessage[]）、流式内容、工具事件、错误信息
 * - 管理当前 provider/model（session 级，不持久化到 config）
 * - 驱动 AgentLoop：发起请求、处理事件流、暂停等待权限确认
 * - 提供 clearMessages / appendSystemMessage / switchModel 供指令系统调用
 * - 自动持久化对话到 session JSONL 文件（additive，不影响已有功能）
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { randomUUID } from 'node:crypto'
import { configManager } from '@config/config-manager.js'
import { loadEffectiveRuntimeConfig } from '@config/resolver.js'
import { getOrCreateProvider } from '@providers/registry.js'
import {
  sessionLogger, tokenMeter, getCurrentSessionId,
  getMcpStatus,
} from '@core/bootstrap.js'
import type { ChatMessage } from './ChatView.js'
import type { Message, MessageContent } from '@core/types.js'
import type { UserQuestion, UserQuestionResult } from '@core/agent-loop.js'
import type { ToolEvent, SubAgentEvent } from './ToolStatusLine.js'
import type { ServerInfo } from '@mcp/mcp-manager.js'
import type { ToolResultMeta } from '@tools/core/types.js'
import { createRuntime } from '../runtime/index.js'
import type { RuntimeEvent, RuntimeInstance } from '../runtime/types.js'
import { sessionStore, generateEventId } from '@persistence/index.js'
import { getTodos } from '@tools/ext/todo-store.js'
import { stopAgent } from '@tools/agent/store.js'
import { PermissionManager } from '@config/permissions.js'
import { eventBus } from '@core/event-bus.js'
import type { ContextWindowState } from '@core/context-tracker.js'
import { contextManager } from '@core/context-manager.js'
import { updateBridgeSession, isBridgeConnected } from '@server/bridge/client.js'

// 从 bootstrap 重导出，供 bin/ccli.ts 和 App.tsx 使用
export { sessionLogger, tokenMeter, getCurrentSessionId }

/** 待用户确认的权限请求，暂停 AgentLoop 直到 resolve 被调用 */
interface PendingPermission {
  toolName: string
  args: Record<string, unknown>
  /** resolve 后解除 runtime 的权限等待 */
  resolve: (result: { allow: boolean; remember?: boolean }) => void
}

/** 待用户回答的问题表单，暂停 AgentLoop 直到 resolve 被调用 */
interface PendingQuestion {
  questions: UserQuestion[]
  resolve: (result: UserQuestionResult) => void
}

/** useChat 的完整返回接口 */
export interface UseChatReturn {
  messages: ChatMessage[]
  /** null = 空闲；'' = 等待首 token；非空 = 流式内容累积中 */
  streamingMessage: string | null
  toolEvents: ToolEvent[]
  /** SubAgent 进度事件（动态区实时显示） */
  subAgentEvents: SubAgentEvent[]
  isStreaming: boolean
  error: string | null
  pendingPermission: PendingPermission | null
  /** 待用户回答的问题表单 */
  pendingQuestion: PendingQuestion | null
  /** session 级工具白名单（选择"always"后写入） */
  allowedTools: Set<string>
  currentProvider: string
  currentModel: string
  /** 当前任务计划列表（todo_write 工具写入，session 级） */
  todos: Array<{ id: string; content: string; status: 'pending' | 'in_progress' | 'completed'; activeForm: string }>
  /** 上下文窗口状态（每次 LLM 调用后更新） */
  contextState: ContextWindowState | null
  /** 发送用户消息，启动 AgentLoop */
  submit: (text: string) => void
  /** 中止当前流式请求 */
  abort: () => void
  /** 中断当前流式请求并发送新消息 */
  interruptAndSubmit: (text: string, source?: 'cli' | 'web') => void
  /**
   * 解决权限确认。
   * @param allow  是否允许工具执行
   * @param always 是否将工具加入 session 白名单
   */
  resolvePermission: (allow: boolean, always?: boolean) => void
  /** 解决问题表单回答 */
  resolveQuestion: (result: UserQuestionResult) => void
  /** 清空所有消息（/clear 指令调用） */
  clearMessages: () => void
  /** 追加 system 角色消息，仅用于 UI 展示，不发送给 LLM */
  appendSystemMessage: (text: string) => void
  /** 切换 provider 和 model（session 级，不写回主配置 config.toml） */
  switchModel: (provider: string, model: string) => void
  /** 初始化 MCP 并返回状态信息（用于 /mcp 指令，会主动触发连接） */
  getMcpInfo: () => Promise<ServerInfo[]>
  /** 加载历史 session 并恢复消息（/resume 指令用），可指定分支叶节点 */
  loadSession: (sessionId: string, leafEventUuid?: string) => void
  /** 从指定消息处分叉（message.id = event uuid） */
  forkFromEvent: (messageId: string) => void
  /** 压缩对话上下文 */
  compactMessages: (options?: { strategy?: string; focus?: string }) => Promise<void>
  /** 历史累计运行时长 ms（跨 resume） */
  accumulatedMs: number
  /** 本次 session 启动时间戳 */
  sessionStartTime: number
}


/**
 * 核心对话 hook。
 * 所有 UI 组件通过此 hook 访问对话状态，不直接调用 AgentLoop 或 Provider。
 */
export function useChat(): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [streamingMessage, setStreamingMessage] = useState<string | null>(null)
  const [toolEvents, setToolEvents] = useState<ToolEvent[]>([])
  const [subAgentEvents, setSubAgentEvents] = useState<SubAgentEvent[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingPermission, setPendingPermission] = useState<PendingPermission | null>(null)
  const [pendingQuestion, setPendingQuestion] = useState<PendingQuestion | null>(null)
  const [allowedTools, setAllowedTools] = useState<Set<string>>(new Set())
  // Phase 2 fix-A：初始 provider/model 来自 resolved config（project > user > builtin），
  // 让 project.toml 能真正影响运行时默认值。isVisionEnabled 仍走 ConfigManager（user 级白名单）。
  const [currentProvider, setCurrentProvider] = useState<string>(() => loadEffectiveRuntimeConfig(process.cwd()).defaultProvider ?? '')
  const [currentModel, setCurrentModel] = useState<string>(() => loadEffectiveRuntimeConfig(process.cwd()).defaultModel ?? '')
  const [todos, setTodosState] = useState<Array<{ id: string; content: string; status: 'pending' | 'in_progress' | 'completed'; activeForm: string }>>([])
  const [contextState, setContextState] = useState<ContextWindowState | null>(null)
  const [accumulatedMs, setAccumulatedMs] = useState(0)
  const [sessionStartTime] = useState(() => Date.now())

  // useRef 双轨：xxxRef 供 async 回调读取最新值（避免闭包捕获陈旧 state）；
  // 对应的 state 驱动 UI 重渲染
  const allowedToolsRef = useRef<Set<string>>(new Set())
  const toolEventsRef = useRef<ToolEvent[]>([])
  const runtimeRef = useRef<RuntimeInstance | null>(null)
  // Ref 守卫：同步判断是否处于 streaming，避免 React state 异步更新导致的闭包陷阱
  const isStreamingRef = useRef(false)
  // 每次 submit 分配递增 generation，finally 只清除属于自己 generation 的 ref，
  // 防止旧 loop 的 finally 覆盖新 loop 已设为 true 的 ref
  const submitGenerationRef = useRef(0)

  // 项目级权限白名单（lazy 初始化：首次 submit 时基于实际注册工具构建）
  const permissionManagerRef = useRef<PermissionManager | null>(null)

  // 组件卸载时自动中止进行中的流式请求，防止更新已卸载组件的状态
  useEffect(() => {
    return () => { runtimeRef.current?.abort() }
  }, [])

  // 预创建 session（不等首次 submit），让 Bridge Server 连接时就能拿到 sessionId
  // ensureSession 幂等：后续 submit 调用不会重复创建
  useEffect(() => {
    if (currentProvider && currentModel) {
      sessionLogger.ensureSession(currentProvider, currentModel)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // 订阅 eventBus 上的后台 subagent 事件（run_in_background 模式不经过 AgentLoop yield）
  useEffect(() => {
    const unsub = eventBus.on((event) => {
      if (event.type === 'subagent_progress') {
        setSubAgentEvents(prev => {
          const idx = prev.findIndex(e => e.agentId === event.agentId)
          const updated: SubAgentEvent = {
            id: event.agentId,
            agentId: event.agentId,
            name: event.name,
            agentType: event.agentType,
            description: event.description,
            status: 'running',
            turn: event.turn,
            maxTurns: event.maxTurns,
            ...(event.currentTool !== undefined ? { currentTool: event.currentTool } : {}),
          }
          if (idx >= 0) {
            const next = [...prev]
            next[idx] = updated
            return next
          }
          return [...prev, updated]
        })
      } else if (event.type === 'subagent_done') {
        setSubAgentEvents(prev =>
          prev.map(e => e.agentId === event.agentId
            ? { ...e, status: 'done' as const, durationMs: Date.now() - (e.durationMs ?? 0) }
            : e
          )
        )
      }
    })
    return unsub
  }, [])


  /**
   * 处理权限确认结果。
   * always=true 时同步更新 ref（立即生效）和 state（触发重渲染）。
   */
  const resolvePermission = useCallback((allow: boolean, always = false) => {
    setPendingPermission(prev => {
      if (!prev) return null
      if (allow && always) {
        const newSet = new Set([...allowedToolsRef.current, prev.toolName])
        allowedToolsRef.current = newSet
        setAllowedTools(newSet)
      }
      prev.resolve({ allow, ...(always ? { remember: true } : {}) })
      return null
    })
  }, [])

  /**
   * 处理用户问题表单回答。
   */
  const resolveQuestion = useCallback((result: UserQuestionResult) => {
    setPendingQuestion(prev => {
      if (!prev) return null
      prev.resolve(result)
      return null
    })
  }, [])

  /**
   * 发送用户消息并启动 AgentLoop。
   * system 消息在构建 history 前被过滤，不发送给 LLM。
   */
  const submit = useCallback((text: string, _source: 'cli' | 'web' = 'cli', imageIds?: string[]) => {
    if (isStreamingRef.current) return
    isStreamingRef.current = true
    const generation = ++submitGenerationRef.current

    // Phase 2 fix-A：submit 流程消费 resolved config，保证 providers/memory/defaults 带上 project 合并。
    const config = loadEffectiveRuntimeConfig(process.cwd())
    // 首次 submit 时加载项目级权限白名单
    if (!permissionManagerRef.current) {
      permissionManagerRef.current = PermissionManager.fromProjectDir(process.cwd())
    }

    const userMsg: ChatMessage = { id: randomUUID(), role: 'user', content: text }

    // LLM history 由 ContextManager 管理（完整的结构化 Message[]），
    // 不再从 UI 的 ChatMessage[] 重建——ChatMessage 是渲染模型，有损转换会丢失工具过程。
    // 构建用户消息：有图片 + vision 启用时用结构化格式
    const hasImages = imageIds && imageIds.length > 0
    const visionEnabled = hasImages && configManager.isVisionEnabled(currentProvider, currentModel)
    let loggedUserContent: string | MessageContent[] = text

    if (hasImages && visionEnabled) {
      // 结构化内容：文本 + 图片引用（base64 延迟到 Provider 层加载）
      const content: MessageContent[] = [
        { type: 'text' as const, text },
        ...imageIds.map(id => ({
          type: 'image' as const,
          imageId: id,
          mediaType: 'image/jpeg' as const,  // 前端统一压缩为 JPEG
        })),
      ]
      loggedUserContent = content
      contextManager.pushUserContent(content)
    } else {
      contextManager.pushUser(text)
      // vision 未启用但有图片 → 提示用户
      if (hasImages && !visionEnabled) {
        setMessages(prev => [...prev, {
          id: randomUUID(),
          role: 'system',
          content: `当前模型 ${currentModel} 未启用图片理解，${imageIds.length} 张图片已忽略`,
        }])
      }
    }

    setMessages(prev => [...prev, userMsg])
    // 只有 CLI 端直接输入时广播（Web 端触发的 submit 已由 EventBus 广播过）
    if (_source === 'cli') {
      eventBus.emit({ type: 'user_input', text, source: 'cli' })
    }
    setStreamingMessage('')
    toolEventsRef.current = []
    setToolEvents([])
    setSubAgentEvents([])
    setIsStreaming(true)
    setError(null)
    setStreamingMessage('⏳ 思考中...')

    // toolCallId → eventId 映射，保证多次调用同名工具时状态更新精确匹配
    const pendingToolIds = new Map<string, string>()

    ;(async () => {
      let runtime: RuntimeInstance | null = null
      let streamingAccumulated = ''
      let thinkingAccumulated = ''
      try {
        runtime = await createRuntime({
          cwd: process.cwd(),
          config,
          mode: 'standard',
        }, {
          emit: (event: RuntimeEvent) => {
            if (event.type === 'thinking') {
              const chunk = typeof event.payload?.['text'] === 'string' ? event.payload['text'] : ''
              thinkingAccumulated += chunk
              eventBus.emit({ type: 'thinking', text: chunk })
              return
            }

            if (event.type === 'text_delta') {
              const chunk = typeof event.payload?.['text'] === 'string' ? event.payload['text'] : ''
              streamingAccumulated += chunk
              setStreamingMessage(streamingAccumulated)
              eventBus.emit({ type: 'text', text: chunk })
              return
            }

            if (event.type === 'tool_start') {
              const toolCallId = typeof event.payload?.['toolCallId'] === 'string' ? event.payload['toolCallId'] : randomUUID()
              const toolName = typeof event.payload?.['toolName'] === 'string' ? event.payload['toolName'] : 'unknown'
              const args = isObjectRecord(event.payload?.['args']) ? event.payload['args'] : {}
              const id = randomUUID()
              pendingToolIds.set(toolCallId, id)
              const newEvent: ToolEvent = { id, toolName, args, status: 'running', startedAt: Date.now() }
              toolEventsRef.current = [...toolEventsRef.current, newEvent]
              setToolEvents(toolEventsRef.current)
              eventBus.emit({ type: 'tool_start', toolName, toolCallId, args })
              return
            }

            if (event.type === 'tool_end') {
              const toolCallId = typeof event.payload?.['toolCallId'] === 'string' ? event.payload['toolCallId'] : ''
              const toolName = typeof event.payload?.['toolName'] === 'string' ? event.payload['toolName'] : 'unknown'
              const matchId = pendingToolIds.get(toolCallId)
              if (matchId) pendingToolIds.delete(toolCallId)
              const matchedEvent = toolEventsRef.current.find(e => e.id === matchId)
              toolEventsRef.current = toolEventsRef.current.filter(e => e.id !== matchId)
              setToolEvents(toolEventsRef.current)

              const durationMs = typeof event.payload?.['durationMs'] === 'number' ? event.payload['durationMs'] : 0
              const success = event.payload?.['success'] === true
              const resultSummary = typeof event.payload?.['resultSummary'] === 'string' ? event.payload['resultSummary'] : undefined
              const resultFull = typeof event.payload?.['resultFull'] === 'string' ? event.payload['resultFull'] : undefined
              const meta = isObjectRecord(event.payload?.['meta'])
                ? event.payload['meta'] as ToolResultMeta
                : undefined

              const toolMsg: ChatMessage = {
                id: matchId ?? randomUUID(),
                role: 'tool',
                content: '',
                toolCall: {
                  toolName,
                  args: matchedEvent?.args ?? {},
                  durationMs,
                  success,
                  ...(resultSummary !== undefined ? { resultSummary } : {}),
                  ...(resultFull !== undefined ? { resultFull } : {}),
                  ...(meta !== undefined ? { meta } : {}),
                },
              }
              setMessages(prev => [...prev, toolMsg])
              eventBus.emit({
                type: 'tool_done',
                toolName,
                toolCallId,
                durationMs,
                success,
                ...(resultSummary !== undefined ? { resultSummary } : {}),
                ...(resultFull !== undefined ? { resultFull } : {}),
                ...(meta !== undefined ? { meta } : {}),
              })

              if (toolName === 'todo_write') {
                const currentTodos = getTodos()
                setTodosState(currentTodos)
                eventBus.emit({ type: 'todo_update', todos: currentTodos })
              }
              return
            }

            if (event.type === 'subagent_spawn') {
              eventBus.emit({
                type: 'subagent_spawn',
                parentToolCallId: String(event.payload?.['parentToolCallId'] ?? ''),
                agentId: String(event.payload?.['agentId'] ?? ''),
                name: String(event.payload?.['name'] ?? ''),
                agentType: String(event.payload?.['agentType'] ?? ''),
                description: String(event.payload?.['description'] ?? ''),
                maxTurns: Number(event.payload?.['maxTurns'] ?? 0),
              })
              return
            }

            if (event.type === 'subagent_progress') {
              const payload = {
                agentId: String(event.payload?.['agentId'] ?? ''),
                name: String(event.payload?.['name'] ?? ''),
                agentType: String(event.payload?.['agentType'] ?? ''),
                description: String(event.payload?.['description'] ?? ''),
                turn: Number(event.payload?.['turn'] ?? 0),
                maxTurns: Number(event.payload?.['maxTurns'] ?? 0),
                ...(typeof event.payload?.['currentTool'] === 'string' ? { currentTool: event.payload['currentTool'] } : {}),
              }
              setSubAgentEvents(prev => {
                const idx = prev.findIndex(e => e.agentId === payload.agentId)
                const updated: SubAgentEvent = {
                  id: payload.agentId,
                  agentId: payload.agentId,
                  name: payload.name,
                  agentType: payload.agentType,
                  description: payload.description,
                  status: 'running',
                  turn: payload.turn,
                  maxTurns: payload.maxTurns,
                  ...(payload.currentTool !== undefined ? { currentTool: payload.currentTool } : {}),
                }
                if (idx >= 0) {
                  const next = [...prev]
                  next[idx] = updated
                  return next
                }
                return [...prev, updated]
              })
              eventBus.emit({ type: 'subagent_progress', ...payload })
              return
            }

            if (event.type === 'subagent_done') {
              const payload = {
                agentId: String(event.payload?.['agentId'] ?? ''),
                name: String(event.payload?.['name'] ?? ''),
                description: String(event.payload?.['description'] ?? ''),
                success: event.payload?.['success'] === true,
                output: String(event.payload?.['output'] ?? ''),
              }
              setSubAgentEvents(prev =>
                prev.map(e => e.agentId === payload.agentId
                  ? { ...e, status: 'done' as const, durationMs: Date.now() - (e.durationMs ?? 0) }
                  : e
                )
              )
              eventBus.emit({ type: 'subagent_done', ...payload })
              return
            }

            if (event.type === 'context_update') {
              const ctxState = {
                usedPercentage: Number(event.payload?.['usedPercentage'] ?? 0),
                lastInputTokens: Number(event.payload?.['lastInputTokens'] ?? 0),
                effectiveWindow: Number(event.payload?.['effectiveWindow'] ?? 0),
                level: String(event.payload?.['level'] ?? 'normal'),
              }
              setContextState(ctxState as ContextWindowState)
              eventBus.emit({ type: 'context_update', ...ctxState })
              return
            }

            if (event.type === 'error') {
              const message = typeof event.payload?.['error'] === 'string' ? event.payload['error'] : 'unknown error'
              setError(message)
              eventBus.emit({ type: 'error', error: message })
            }
          },

          requestPermission: async (input) => {
            if (permissionManagerRef.current?.isAllowed(input.toolName)) {
              return { allow: true }
            }
            if (allowedToolsRef.current.has(input.toolName)) {
              return { allow: true }
            }
            eventBus.emit({
              type: 'permission_request',
              toolName: input.toolName,
              args: input.args,
              resolve: (_allow: boolean) => {},
            })
            return await new Promise<{ allow: boolean; remember?: boolean }>((resolve) => {
              setPendingPermission({
                toolName: input.toolName,
                args: input.args,
                resolve,
              })
            })
          },

          requestUserInput: async (input) => {
            eventBus.emit({
              type: 'user_question_request',
              questions: input.questions,
              resolve: (_result: UserQuestionResult) => {},
            })
            return await new Promise<UserQuestionResult>((resolve) => {
              setPendingQuestion({ questions: input.questions, resolve })
            })
          },
        })

        runtimeRef.current = runtime

        const result = await runtime.submit({
          text,
          provider: currentProvider,
          model: currentModel,
          history: contextManager.getHistoryRef(),
          loggedUserContent,
        })

        if (result.historyCompacted) {
          const compactedMsgs: ChatMessage[] = contextManager.getHistoryRef()
            .filter(m => m.role === 'user' || m.role === 'assistant')
            .map(m => ({
              id: randomUUID(),
              role: m.role as 'user' | 'assistant',
              content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
            }))
          setMessages(compactedMsgs)
        }

        if (result.text) {
          const assistantMsg: ChatMessage = {
            id: randomUUID(),
            role: 'assistant',
            content: result.text,
            model: currentModel,
            provider: currentProvider,
            ...(thinkingAccumulated ? { thinking: thinkingAccumulated } : {}),
          }
          setMessages(prev => [...prev, assistantMsg])
        }

        if (result.error) {
          setError(result.error)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (runtimeRef.current === runtime) {
          runtimeRef.current = null
        }
        setStreamingMessage(null)
        // 只有当前 generation 才清除 ref，防止旧 loop finally 覆盖新 loop 的状态
        if (submitGenerationRef.current === generation) {
          isStreamingRef.current = false
          setIsStreaming(false)
        }
      }
    })()
  }, [currentProvider, currentModel])

  /** 中止当前 runtime 请求（用户主动取消或超时） */
  const abort = useCallback(() => { runtimeRef.current?.abort() }, [])

  /** 中断当前流并提交新消息 */
  const interruptAndSubmit = useCallback((text: string, source: 'cli' | 'web' = 'cli') => {
    runtimeRef.current?.abort()
    isStreamingRef.current = false  // 同步清除，确保 submit 不被 ref 守卫拦截
    setTimeout(() => submit(text, source), 0)
  }, [submit])

  /** 清空消息列表（/clear 指令） */
  const clearMessages = useCallback((): void => {
    setMessages([])
    contextManager.clearHistory()
  }, [])

  /** 追加 UI 专用的 system 消息（不发送给 LLM） */
  const appendSystemMessage = useCallback((text: string): void => {
    const msg: ChatMessage = {
      id: randomUUID(),
      role: 'system',
      content: text,
    }
    setMessages(prev => [...prev, msg])
  }, [])

  /** 切换当前 provider 和 model（session 级，下次 submit 生效） */
  const switchModel = useCallback((provider: string, model: string): void => {
    setCurrentProvider(provider)
    setCurrentModel(model)
  }, [])

  /** 初始化 MCP 并返回所有 Server 状态（/mcp 指令用，会主动触发连接） */
  const getMcpInfo = useCallback(async (): Promise<ServerInfo[]> => {
    return getMcpStatus()
  }, [])

  /** 加载历史 session，恢复消息列表和 provider/model，可指定分支叶节点 */
  const loadSession = useCallback((sessionId: string, leafEventUuid?: string): void => {
    try {
      const snapshot = sessionStore.loadMessages(sessionId, leafEventUuid)

      // 绑定 SessionLogger 到恢复的会话
      sessionLogger.bind(sessionId, snapshot.leafEventUuid)

      // 提取历史累计时长
      const lastAccMs = sessionStore.getLastAccumulatedMs(sessionId)
      setAccumulatedMs(lastAccMs)
      sessionLogger.setAccumulatedMs(lastAccMs)

      // 恢复消息列表（UI）
      const restored: ChatMessage[] = snapshot.messages.map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
      }))
      setMessages(restored)

      // 恢复 LLM history（ContextManager）
      const structuredHistory: Message[] = snapshot.messages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))
      contextManager.restoreHistory(structuredHistory)

      // 不恢复 provider/model — 使用当前配置的模型继续对话
      // 历史消息中的 model/provider 仅用于展示，不影响后续请求

      // 追加 session_resume 事件（记录当前使用的 provider/model，而非历史的）
      const resumeEventId = generateEventId()
      sessionStore.append(sessionId, {
        sessionId,
        type: 'session_resume',
        timestamp: new Date().toISOString(),
        uuid: resumeEventId,
        parentUuid: sessionLogger.lastEventUuid,
        cwd: process.cwd(),
        provider: currentProvider,
        model: currentModel,
        accumulatedMs: lastAccMs,
      })
      // 更新 logger 的 lastEventUuid
      sessionLogger.bind(sessionId, resumeEventId)

      // 通知 Bridge 客户端切换到新 sessionId（Web 端感知 CLI 回来了）
      if (isBridgeConnected()) {
        updateBridgeSession(sessionId)
      }

      // CLI 端显示恢复提示（让用户明确感知到会话已切换）
      const msgCount = snapshot.messages.length
      appendSystemMessage(`已恢复会话 ${sessionId.slice(0, 8)}...，${msgCount} 条历史消息已加载，当前模型: ${currentModel}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      appendSystemMessage(`Failed to load session: ${msg}`)
    }
  }, [appendSystemMessage])

  /** 从指定消息处分叉，截断消息列表并开始新分支 */
  const forkFromEvent = useCallback((messageId: string): void => {
    const sid = sessionLogger.sessionId
    if (!sid) {
      appendSystemMessage('No active session to fork from')
      return
    }

    try {
      // 从分叉点重新加载消息
      const snapshot = sessionStore.loadMessages(sid, messageId)

      // 恢复消息到分叉点
      const restored: ChatMessage[] = snapshot.messages.map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
      }))
      setMessages(restored)

      // 恢复 LLM history（ContextManager）
      const structuredHistory: Message[] = snapshot.messages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))
      contextManager.restoreHistory(structuredHistory)

      // 将 lastEventUuid 设为分叉点，后续消息将从此处分支
      sessionLogger.bind(sid, messageId)

      // 追加 session_resume 事件标记分叉
      const resumeEventId = generateEventId()
      sessionStore.append(sid, {
        sessionId: sid,
        type: 'session_resume',
        timestamp: new Date().toISOString(),
        uuid: resumeEventId,
        parentUuid: messageId, // 分叉点！
        cwd: process.cwd(),
        provider: currentProvider,
        model: currentModel,
        accumulatedMs: 0, // 分叉时重置时间
      })
      sessionLogger.bind(sid, resumeEventId)

      appendSystemMessage('Forked from message — new branch started. Continue typing to diverge.')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      appendSystemMessage(`Failed to fork: ${msg}`)
    }
  }, [appendSystemMessage, currentProvider, currentModel])

  /** 压缩对话上下文 */
  const compactMessages = useCallback(async (options?: { strategy?: string; focus?: string }) => {
    if (isStreamingRef.current) return

    // Phase 2 fix-A：compact 链路也必须用 resolved config，避免与 submit 链路不一致。
    const config = loadEffectiveRuntimeConfig(process.cwd())
    const provider = getOrCreateProvider(currentProvider, config)

    // 从 ContextManager 取完整 history（不从 UI ChatMessage 重建）
    const history = contextManager.getHistoryRef()

    if (history.length === 0) {
      appendSystemMessage('No messages to compact.')
      return
    }

    const strategyName = options?.strategy ?? contextManager.getStrategyName()

    // 进入 streaming 状态，显示 compact 进度
    setIsStreaming(true)
    setStreamingMessage(`Compacting ${history.length} messages with strategy: ${strategyName}...`)
    eventBus.emit({ type: 'compact_status', status: 'start', strategy: strategyName, message: `Compacting ${history.length} messages...` })

    try {
      const result = await contextManager.compact(history, provider, {
        model: currentModel,
        ...(options?.strategy !== undefined ? { strategy: options.strategy } : {}),
        ...(options?.focus !== undefined ? { focus: options.focus } : {}),
      })

      // 退出 streaming
      setStreamingMessage(null)
      setIsStreaming(false)

      // 同步 ContextManager + UI messages
      contextManager.replaceHistory(result.history)
      const compactedMsgs: ChatMessage[] = result.history.map(m => ({
        id: randomUUID(),
        role: m.role as 'user' | 'assistant',
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      }))
      setMessages(compactedMsgs)

      // 记录 compact 事件到 JSONL
      const sid = sessionLogger.sessionId
      if (sid) {
        const compactEventId = generateEventId()
        sessionStore.append(sid, {
          sessionId: sid,
          type: 'compact',
          timestamp: new Date().toISOString(),
          uuid: compactEventId,
          parentUuid: sessionLogger.lastEventUuid,
          cwd: process.cwd(),
          compactSummary: result.summary,
          compactedMessageCount: result.compactedMessageCount,
          tokensBefore: result.tokensBefore,
          compactStrategy: strategyName,
        })
        sessionLogger.bind(sid, compactEventId)
      }

      const doneMsg = `Context compacted (${result.compactedMessageCount} messages → ${result.history.length}). Strategy: ${strategyName}`
      appendSystemMessage(doneMsg)
      eventBus.emit({ type: 'compact_status', status: 'done', strategy: strategyName, message: doneMsg })
    } catch (err) {
      setStreamingMessage(null)
      setIsStreaming(false)
      const errMsg = `Compact failed: ${err instanceof Error ? err.message : String(err)}`
      appendSystemMessage(errMsg)
      eventBus.emit({ type: 'compact_status', status: 'error', message: errMsg })
    }
  }, [messages, currentProvider, currentModel, appendSystemMessage])

  // ── Web 端输入回流：监听 EventBus，将 Web 侧事件桥接到 CLI hook ──

  /** Web 端聊天输入 → 触发 submit 或 interruptAndSubmit（过滤 source=web，避免 CLI submit 循环） */
  useEffect(() => {
    const off = eventBus.onType('user_input', (event) => {
      if (event.source === 'web' && event.text !== '__abort__') {
        if (isStreamingRef.current) {
          interruptAndSubmit(event.text, 'web')
        } else {
          submit(event.text, 'web', event.imageIds)
        }
      }
    })
    return off
  }, [submit, interruptAndSubmit])

  /** Web 端权限响应 → 触发 resolvePermission */
  useEffect(() => {
    const off = eventBus.onType('permission_response', (event) => {
      if (event.source === 'web' && pendingPermission) {
        resolvePermission(event.allow, event.always ?? false)
      }
    })
    return off
  }, [pendingPermission, resolvePermission])

  /** Web 端中止请求：发送特殊消息 __abort__ → 触发 abort */
  useEffect(() => {
    const off = eventBus.onType('user_input', (event) => {
      if (event.source === 'web' && event.text === '__abort__') {
        abort()
      }
    })
    return off
  }, [abort])

  /** Web 端会话恢复 → 触发 loadSession（等同 CLI /resume 指令） */
  useEffect(() => {
    const off = eventBus.onType('resume_session', (event) => {
      if (event.source === 'web' && event.sessionId) {
        loadSession(event.sessionId)
      }
    })
    return off
  }, [loadSession])

  /** Web 端问卷响应 → 触发 resolveQuestion */
  useEffect(() => {
    const off = eventBus.onType('question_response', (event) => {
      if (event.source === 'web' && pendingQuestion) {
        resolveQuestion({
          cancelled: event.cancelled,
          ...(event.answers ? { answers: event.answers } : {}),
        })
      }
    })
    return off
  }, [pendingQuestion, resolveQuestion])

  /** Web 端配置变更 → 刷新当前 provider/model（全局配置，影响所有 CLI 实例） */
  useEffect(() => {
    const off = eventBus.onType('config_changed', (event) => {
      if (event.provider) setCurrentProvider(event.provider)
      if (event.model) setCurrentModel(event.model)
      appendSystemMessage(`配置已更新: ${event.provider} / ${event.model}`)
    })
    return off
  }, [appendSystemMessage])

  /** Web 端停止子 Agent → 调用 stopAgent */
  useEffect(() => {
    const off = eventBus.onType('subagent_control', (event) => {
      if (event.action === 'stop' && event.agentId) {
        const source = event.source === 'web' ? 'user_web' as const : 'user_cli' as const
        stopAgent(event.agentId, source, event.reason)
      }
    })
    return off
  }, [])

  return {
    messages,
    streamingMessage,
    toolEvents,
    subAgentEvents,
    isStreaming,
    error,
    pendingPermission,
    pendingQuestion,
    allowedTools,
    currentProvider,
    currentModel,
    todos,
    contextState,
    submit,
    abort,
    interruptAndSubmit,
    resolvePermission,
    resolveQuestion,
    clearMessages,
    appendSystemMessage,
    switchModel,
    getMcpInfo,
    loadSession,
    forkFromEvent,
    compactMessages,
    accumulatedMs,
    sessionStartTime,
  }
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
