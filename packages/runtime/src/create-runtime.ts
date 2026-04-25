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
  let activeProvider: { dispose?: () => void } | null = null
  let lastSessionId: string | null = null
  let lastProvider = input.config.defaultProvider
  let lastModel = input.config.defaultModel
  let warnings: string[] = []

  const instance: RuntimeInstance = {
    async submit(submitInput: RuntimeSubmitInput): Promise<RuntimeTurnResult> {
      if (isRunning) {
        return emptyTurnResult(lastSessionId)
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

      try {
        const bootstrapResult = await bootstrapAll(input.cwd)
        warnings = [...bootstrapResult.warnings]
        agentCatalog.ensureInitialized()

        if (submitInput.waitForMcp) {
          await ensureMcpInitialized()
        }

        const registry = getRegistry()
        registerMcpTools(registry)

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
        const rawHistory = syncContextHistoryForSubmit(submitInput)
        const { history, compacted } = await contextManager.prepare(
          rawHistory,
          activeProvider as never,
          {
            model: modelName,
            ...(systemPrompt !== undefined ? { systemPrompt } : {}),
          },
        )
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

        for await (const event of loop.run(history)) {
          sessionLogger.consume(event)
          tokenMeter.consume(event)

          switch (event.type) {
            case 'text':
              result.text += event.text
              bridge.emit(makeEvent('text_delta', { text: event.text }, lastSessionId ?? undefined))
              break

            case 'thinking':
              result.thinking += event.text
              bridge.emit(makeEvent('thinking', { text: event.text }, lastSessionId ?? undefined))
              break

            case 'tool_start':
              bridge.emit(makeEvent('tool_start', {
                toolName: event.toolName,
                toolCallId: event.toolCallId,
                args: event.args,
              }, lastSessionId ?? undefined))
              break

            case 'tool_done':
              result.toolCallCount++
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
              event.resolve(resolution.allow)
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
              bridge.emit(makeEvent('context_update', {
                usedPercentage: contextTracker.getState().usedPercentage,
                lastInputTokens: contextTracker.getState().lastInputTokens,
                effectiveWindow: contextTracker.getState().effectiveWindow,
                level: contextTracker.getState().level,
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
              bridge.emit(makeErrorEvent(event.error, lastSessionId ?? undefined))
              break

            case 'done':
              break

            default:
              break
          }
        }

        if (result.text) {
          sessionLogger.logAssistantMessage(result.text, modelName, providerName, {
            usage: { ...result.usage },
            stopReason: result.stopReason,
            llmCallCount: result.llmCallCount,
            toolCallCount: result.toolCallCount,
            ...(result.thinking ? { thinking: result.thinking } : {}),
          })
        }
      } catch (error) {
        if (isAbortError(error)) {
          result.aborted = true
          result.stopReason = 'abort'
          if (result.text) {
            sessionLogger.logAssistantMessage(result.text, modelName, providerName, {
              usage: { ...result.usage },
              stopReason: result.stopReason,
              llmCallCount: result.llmCallCount,
              toolCallCount: result.toolCallCount,
              ...(result.thinking ? { thinking: result.thinking } : {}),
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
        abortController = null
        isRunning = false
      }

      return result
    },

    abort(): void {
      abortController?.abort()
    },

    async dispose(): Promise<void> {
      abortController?.abort()
      activeProvider?.dispose?.()
      activeProvider = null
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
