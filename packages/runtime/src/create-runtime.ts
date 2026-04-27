// src/runtime/create-runtime.ts

/**
 * createRuntime() — shared runtime 的过渡期执行门面。
 *
 * Phase 1 的目标不是一次性重写所有 bootstrap 细节，而是先把
 * “谁来驱动一轮运行时执行” 统一收口到 runtime 层。
 *
 * 当前实现策略：
 * - 对外：Host 只通过 createRuntime() + bridge 交互
 * - 对内：复用 bootstrap.ts 里已经稳定的单例与装配结果
 * - 好处：先消除 useChat / pipe-runner 直连 AgentLoop 的路径分叉，
 *   再在后续 phase 继续把 bootstrap 细节逐步下沉到 runtime/
 *
 * 约束：不得 import ink / electron / ui/*
 */

import {
  AgentLoop,
  bootstrapAll,
  contextManager,
  contextTracker,
  ensureMcpInitialized,
  getRegistry,
  getSystemPrompt,
  hookManager,
  isAbortError,
  registerMcpTools,
  sessionLogger,
  tokenMeter,
} from '@xnova/core'
import type { SessionConversationBlock } from '@persistence/index.js'
import { agentCatalog } from '@tools/agent/catalog.js'
import { getOrCreateProvider } from '@providers/registry.js'
import { makeErrorEvent, makeEvent } from './events.js'
import type {
  RuntimeConfigInput,
  RuntimeHostBridge,
  RuntimeInstance,
  RuntimeSubmitInput,
  RuntimeSnapshot,
  RuntimeTurnResult,
} from './types.js'

function appendAssistantTextBlock(
  blocks: SessionConversationBlock[],
  id: string,
  content: string,
): SessionConversationBlock[] {
  if (!content) {
    return blocks
  }
  const lastBlock = blocks.at(-1)
  if (lastBlock?.type === 'text') {
    return [
      ...blocks.slice(0, -1),
      {
        ...lastBlock,
        content: lastBlock.content + content,
      },
    ]
  }
  return [
    ...blocks,
    {
      id,
      type: 'text',
      content,
    },
  ]
}

function appendAssistantThinkingBlock(
  blocks: SessionConversationBlock[],
  id: string,
  content: string,
): SessionConversationBlock[] {
  if (!content) {
    return blocks
  }
  const lastBlock = blocks.at(-1)
  if (lastBlock?.type === 'thinking') {
    return [
      ...blocks.slice(0, -1),
      {
        ...lastBlock,
        content: lastBlock.content + content,
      },
    ]
  }
  return [
    ...blocks,
    {
      id,
      type: 'thinking',
      content,
    },
  ]
}

function appendAssistantSystemBlock(
  blocks: SessionConversationBlock[],
  id: string,
  content: string,
  level: 'info' | 'warning' | 'error',
): SessionConversationBlock[] {
  if (!content) {
    return blocks
  }
  return [
    ...blocks,
    {
      id,
      type: 'system',
      content,
      level,
    },
  ]
}

function startAssistantToolBlock(
  blocks: SessionConversationBlock[],
  input: {
    id: string
    toolCallId: string
    toolName: string
    args: Record<string, unknown>
  },
): SessionConversationBlock[] {
  return [
    ...blocks,
    {
      id: input.id,
      type: 'tool',
      toolCallId: input.toolCallId,
      toolName: input.toolName,
      args: input.args,
      status: 'running',
    },
  ]
}

function finishAssistantToolBlock(
  blocks: SessionConversationBlock[],
  input: {
    id: string
    toolCallId: string
    toolName: string
    durationMs: number
    success: boolean
    resultSummary?: string
    resultFull?: string
    agentId?: string
  },
): SessionConversationBlock[] {
  let found = false
  const nextBlocks = blocks.map((block) => {
    if (block.type !== 'tool' || block.toolCallId !== input.toolCallId) {
      return block
    }
    found = true
    return {
      ...block,
      status: input.success ? ('done' as const) : ('error' as const),
      durationMs: input.durationMs,
      success: input.success,
      ...(input.resultSummary === undefined ? {} : { resultSummary: input.resultSummary }),
      ...(input.resultFull === undefined ? {} : { resultFull: input.resultFull }),
      ...(input.agentId === undefined ? {} : { agentId: input.agentId }),
    }
  })
  if (found) {
    return nextBlocks
  }
  return [
    ...blocks,
    {
      id: input.id,
      type: 'tool',
      toolCallId: input.toolCallId,
      toolName: input.toolName,
      args: {},
      status: input.success ? ('done' as const) : ('error' as const),
      durationMs: input.durationMs,
      success: input.success,
      ...(input.resultSummary === undefined ? {} : { resultSummary: input.resultSummary }),
      ...(input.resultFull === undefined ? {} : { resultFull: input.resultFull }),
      ...(input.agentId === undefined ? {} : { agentId: input.agentId }),
    },
  ]
}

function syncContextHistoryForSubmit(
  submitInput: RuntimeSubmitInput,
) {
  if (submitInput.history) {
    contextManager.restoreHistory(submitInput.history)
    return contextManager.getHistoryRef()
  }

  if (Array.isArray(submitInput.loggedUserContent)) {
    contextManager.pushUserContent(submitInput.loggedUserContent)
  } else {
    contextManager.pushUser(submitInput.text)
  }

  return contextManager.getHistoryRef()
}

/**
 * 创建一个 RuntimeInstance。
 *
 * 注意：
 * - 这里的实例是“可中断的一轮执行控制器”，而不是会话级状态容器
 * - 会话、token、context history 仍复用当前主链路的单例
 */
export async function createRuntime(
  input: RuntimeConfigInput,
  bridge: RuntimeHostBridge,
): Promise<RuntimeInstance> {
  let isRunning = false
  let abortController: AbortController | null = null
  let activeLoop: AgentLoop | null = null
  let activeProvider: { dispose?: () => void } | null = null
  let lastSessionId: string | null = null
  let lastProvider = input.config.defaultProvider
  let lastModel = input.config.defaultModel
  let warnings: string[] = []

  const instance: RuntimeInstance = {
    async submit(submitInput: RuntimeSubmitInput): Promise<RuntimeTurnResult> {
      // 复用同一 RuntimeInstance 时禁止并发提交：
      // 旧实现静默返回 emptyTurnResult 会让上层把"什么都没发生"当成成功，
      // 既丢事件又导致 UI 看不到任何输出。改为返回带 error 字段的 turn result，
      // 并补发 error + turn_end 事件，让 host 走"失败"分支。
      if (isRunning) {
        const errorMessage = 'runtime busy: previous submit still running'
        const result = emptyTurnResult(lastSessionId)
        result.stopReason = 'rejected'
        result.error = errorMessage
        bridge.emit(makeErrorEvent(errorMessage, lastSessionId ?? undefined))
        bridge.emit(makeEvent('turn_end', {
          stopReason: 'rejected',
          aborted: false,
          error: errorMessage,
        }, lastSessionId ?? undefined))
        return result
      }

      isRunning = true
      abortController = new AbortController()

      const providerName = submitInput.provider ?? input.config.defaultProvider
      const modelName = submitInput.model ?? input.config.defaultModel
      lastProvider = providerName
      lastModel = modelName

      const config = {
        ...input.config,
        defaultProvider: providerName,
        defaultModel: modelName,
      }
      sessionLogger.setCwd(input.cwd)

      const result = emptyTurnResult(lastSessionId)
      result.stopReason = 'end_turn'
      let assistantBlocks: SessionConversationBlock[] = []
      let assistantBlockSequence = 0
      let modelRequestCount = 0
      let currentModelRequestPhase: 'initial' | 'after_tool_result' | 'retry' = 'initial'
      const emitTimingMark = (
        stage: string,
        payload?: Record<string, unknown>,
      ) => {
        bridge.emit(makeEvent('timing_mark', {
          stage,
          ...(payload ?? {}),
        }, lastSessionId ?? undefined))
      }
      const nextAssistantBlockId = (type: SessionConversationBlock['type']) => {
        assistantBlockSequence += 1
        return `assistant-${type}-${assistantBlockSequence}`
      }

      try {
        emitTimingMark('createRuntime.submit_start')
        emitTimingMark('runtime_bootstrap_start')
        const bootstrapResult = await bootstrapAll(input.cwd)
        emitTimingMark('runtime_bootstrap_done')
        warnings = [...bootstrapResult.warnings]
        agentCatalog.ensureInitialized()

        if (submitInput.waitForMcp) {
          await ensureMcpInitialized()
        }

        const registry = getRegistry()
        registerMcpTools(registry)
        emitTimingMark('tool_registry_ready')

        const globalProvider = getOrCreateProvider(providerName, config)
        activeProvider = globalProvider.createSession?.() ?? globalProvider

        const sessionId = sessionLogger.ensureSession(providerName, modelName)
        lastSessionId = sessionId || null
        result.sessionId = lastSessionId
        if (sessionId) {
          tokenMeter.bind(sessionId, providerName, modelName)
        }

        const loggedUserContent = submitInput.loggedUserContent ?? submitInput.text
        sessionLogger.logUserMessage(loggedUserContent)

        const primaryAgent = agentCatalog.resolvePrimaryAgent(config.agent?.default)
        warnings = [...warnings, ...primaryAgent.warnings]
        const systemPrompt = [
          getSystemPrompt(),
          primaryAgent.agent.getSystemPrompt(),
        ].filter(Boolean).join('\n\n') || undefined
        emitTimingMark('history_hydration_start')
        const rawHistory = syncContextHistoryForSubmit(submitInput)
        emitTimingMark('history_hydration_done')
        emitTimingMark('context_build_start')
        const { history, compacted } = await contextManager.prepare(
          rawHistory,
          activeProvider as never,
          {
            model: modelName,
            ...(systemPrompt !== undefined ? { systemPrompt } : {}),
          },
        )
        emitTimingMark('context_build_done')
        result.historyCompacted = compacted

        const loop = new AgentLoop(activeProvider as never, registry, {
          cwd: input.cwd,
          model: modelName,
          provider: providerName,
          signal: abortController.signal,
          hookManager,
          config,
          ...(systemPrompt !== undefined ? { systemPrompt } : {}),
          ...(sessionId ? { sessionId } : {}),
          ...(submitInput.nonInteractive ? { nonInteractive: true } : {}),
        })
        activeLoop = loop

        for await (const event of loop.run(history)) {
          sessionLogger.consume(event)
          tokenMeter.consume(event)

          switch (event.type) {
            case 'llm_start':
              currentModelRequestPhase =
                modelRequestCount === 0 ? 'initial' : 'after_tool_result'
              modelRequestCount += 1
              bridge.emit(makeEvent('model_request_started', {
                providerId: event.provider,
                modelId: event.model,
                phase: currentModelRequestPhase,
              }, lastSessionId ?? undefined))
              break

            case 'llm_first_chunk':
              bridge.emit(makeEvent('model_first_chunk', {
                providerId: providerName,
                modelId: modelName,
                phase: currentModelRequestPhase,
                chunkType: event.chunkType,
                elapsedMs: event.elapsedMs,
              }, lastSessionId ?? undefined))
              break

            case 'timing_mark':
              bridge.emit(makeEvent('timing_mark', {
                stage: event.stage,
                ...(event.elapsedMs !== undefined ? { elapsedMs: event.elapsedMs } : {}),
              }, lastSessionId ?? undefined))
              break

            case 'text':
              result.text += event.text
              assistantBlocks = appendAssistantTextBlock(
                assistantBlocks,
                nextAssistantBlockId('text'),
                event.text,
              )
              bridge.emit(makeEvent('text_delta', { text: event.text }, lastSessionId ?? undefined))
              break

            case 'thinking':
              result.thinking += event.text
              assistantBlocks = appendAssistantThinkingBlock(
                assistantBlocks,
                nextAssistantBlockId('thinking'),
                event.text,
              )
              bridge.emit(makeEvent('thinking', { text: event.text }, lastSessionId ?? undefined))
              break

            case 'tool_start':
              assistantBlocks = startAssistantToolBlock(assistantBlocks, {
                id: nextAssistantBlockId('tool'),
                toolCallId: event.toolCallId,
                toolName: event.toolName,
                args: event.args,
              })
              bridge.emit(makeEvent('tool_start', {
                toolName: event.toolName,
                toolCallId: event.toolCallId,
                args: event.args,
              }, lastSessionId ?? undefined))
              break

            case 'tool_done':
              result.toolCallCount++
              assistantBlocks = finishAssistantToolBlock(assistantBlocks, {
                id: nextAssistantBlockId('tool'),
                toolCallId: event.toolCallId,
                toolName: event.toolName,
                durationMs: event.durationMs,
                success: event.success,
                ...(event.resultSummary === undefined ? {} : { resultSummary: event.resultSummary }),
                ...(event.resultFull === undefined ? {} : { resultFull: event.resultFull }),
                ...(event.meta?.type === 'dispatch-agent'
                  ? { agentId: event.meta.agentId }
                  : {}),
              })
              bridge.emit(makeEvent('tool_end', {
                toolName: event.toolName,
                toolCallId: event.toolCallId,
                durationMs: event.durationMs,
                success: event.success,
                ...(event.resultSummary !== undefined ? { resultSummary: event.resultSummary } : {}),
                ...(event.resultFull !== undefined ? { resultFull: event.resultFull } : {}),
                ...(event.meta !== undefined ? { meta: event.meta } : {}),
              }, lastSessionId ?? undefined))
              break

            case 'permission_request': {
              const resolution = await bridge.requestPermission({
                toolName: event.toolName,
                args: event.args,
                sessionId: lastSessionId ?? '',
              })
              event.resolve({
                allow: resolution.allow,
                ...(resolution.reason === undefined ? {} : { reason: resolution.reason }),
              })
              break
            }

            case 'user_question_request':
              if (bridge.requestUserInput) {
                const answer = await bridge.requestUserInput({
                  questions: event.questions,
                  sessionId: lastSessionId ?? '',
                })
                event.resolve(answer)
              } else {
                event.resolve({ answers: {}, cancelled: true })
              }
              break

            case 'llm_done':
              result.llmCallCount++
              result.stopReason = event.stopReason
              result.usage.inputTokens += event.inputTokens
              result.usage.outputTokens += event.outputTokens
              result.usage.cacheReadTokens += event.cacheReadTokens
              result.usage.cacheWriteTokens += event.cacheWriteTokens
              bridge.emit(makeEvent('model_request_finished', {
                providerId: providerName,
                modelId: modelName,
                phase: currentModelRequestPhase,
                ttftMs: event.ttftMs,
                elapsedMs: event.e2eMs,
              }, lastSessionId ?? undefined))
              bridge.emit(makeEvent('context_update', {
                usedPercentage: contextTracker.getState().usedPercentage,
                lastInputTokens: contextTracker.getState().lastInputTokens,
                effectiveWindow: contextTracker.getState().effectiveWindow,
                level: contextTracker.getState().level,
              }, lastSessionId ?? undefined))
              break

            case 'llm_error':
              bridge.emit(makeEvent('model_request_failed', {
                providerId: providerName,
                modelId: modelName,
                phase: currentModelRequestPhase,
                message: event.error,
              }, lastSessionId ?? undefined))
              break

            case 'subagent_spawn':
              bridge.emit(makeEvent('subagent_spawn', {
                parentToolCallId: event.parentToolCallId,
                agentId: event.agentId,
                name: event.name,
                agentType: event.agentType,
                description: event.description,
                maxTurns: event.maxTurns,
              }, lastSessionId ?? undefined, event.agentId))
              break

            case 'subagent_progress':
              bridge.emit(makeEvent('subagent_progress', {
                agentId: event.agentId,
                name: event.name,
                agentType: event.agentType,
                description: event.description,
                turn: event.turn,
                maxTurns: event.maxTurns,
                ...(event.currentTool !== undefined ? { currentTool: event.currentTool } : {}),
              }, lastSessionId ?? undefined, event.agentId))
              break

            case 'subagent_done':
              bridge.emit(makeEvent('subagent_done', {
                agentId: event.agentId,
                name: event.name,
                description: event.description,
                success: event.success,
                output: event.output,
              }, lastSessionId ?? undefined, event.agentId))
              break

            case 'error':
              result.error = event.error
              assistantBlocks = appendAssistantSystemBlock(
                assistantBlocks,
                nextAssistantBlockId('system'),
                event.error,
                'error',
              )
              bridge.emit(makeErrorEvent(event.error, lastSessionId ?? undefined))
              break

            case 'done':
              break

            default:
              break
          }
        }

        if (assistantBlocks.length > 0) {
          sessionLogger.logAssistantMessage(assistantBlocks, modelName, providerName, {
            usage: { ...result.usage },
            stopReason: result.stopReason,
            llmCallCount: result.llmCallCount,
            toolCallCount: result.toolCallCount,
          })
        }
      } catch (error) {
        if (isAbortError(error)) {
          result.aborted = true
          result.stopReason = 'abort'
          if (assistantBlocks.length > 0) {
            sessionLogger.logAssistantMessage(assistantBlocks, modelName, providerName, {
              usage: { ...result.usage },
              stopReason: result.stopReason,
              llmCallCount: result.llmCallCount,
              toolCallCount: result.toolCallCount,
            })
          }
          sessionLogger.logUserMessage('[Request interrupted by user]')
        } else {
          result.error = error instanceof Error ? error.message : String(error)
          bridge.emit(makeErrorEvent(result.error, lastSessionId ?? undefined))
        }
      } finally {
        bridge.emit(makeEvent('turn_end', {
          stopReason: result.stopReason,
          ...(result.error ? { error: result.error } : {}),
          aborted: result.aborted,
        }, lastSessionId ?? undefined))

        activeProvider?.dispose?.()
        activeProvider = null
        activeLoop = null
        abortController = null
        isRunning = false
      }

      return result
    },

    abort(): void {
      activeLoop?.requestStop()
      abortController?.abort()
    },

    async dispose(): Promise<void> {
      activeLoop?.requestStop()
      abortController?.abort()
      activeProvider?.dispose?.()
      activeProvider = null
      activeLoop = null
      isRunning = false
    },

    getSnapshot(): RuntimeSnapshot {
      return {
        sessionId: lastSessionId,
        isRunning,
        provider: lastProvider,
        model: lastModel,
        warnings: [...warnings],
      }
    },
  }

  return instance
}

function emptyTurnResult(sessionId: string | null): RuntimeTurnResult {
  return {
    text: '',
    thinking: '',
    stopReason: '',
    llmCallCount: 0,
    toolCallCount: 0,
    usage: {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    },
    aborted: false,
    historyCompacted: false,
    sessionId,
  }
}
