import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type {
  PermissionDialogRequest,
  RuntimeInspectResult,
  RuntimeWarmupStatus,
  StudioConversationBlock,
  StudioRunStatus,
  StudioRuntimeEvent,
  UserQuestionDialogRequest,
} from '../../shared/studio-bridge-contract'
import { createToolRunningStep } from '../utils/tool-event-summary'
import {
  clampLiveConversationBlocks,
  MAX_TOOL_RESULT_FULL_CHARS,
  MAX_TOOL_RESULT_SUMMARY_CHARS,
  truncateConversationText,
} from '../utils/conversation-memory-guards'

export interface ContextState {
  usedPercentage: number
  lastInputTokens: number
  effectiveWindow: number
  level: 'normal' | 'warning' | 'critical' | 'overflow'
}

export type LiveConversationBlock = StudioConversationBlock

export interface LiveConversationState {
  pendingUserText: string | null
  blocks: LiveConversationBlock[]
}

type LiveConversationInput =
  | LiveConversationState
  | ((current: LiveConversationState) => LiveConversationState)
type StudioRunStatusInput =
  | StudioRunStatus
  | ((current: StudioRunStatus) => StudioRunStatus)
type NullableStringInput =
  | string
  | null
  | ((current: string | null) => string | null)
type PermissionRequestInput =
  | PermissionDialogRequest
  | null
  | ((current: PermissionDialogRequest | null) => PermissionDialogRequest | null)
type UserInputRequestInput =
  | UserQuestionDialogRequest
  | null
  | ((current: UserQuestionDialogRequest | null) => UserQuestionDialogRequest | null)

const INITIAL_CONTEXT_STATE: ContextState = {
  usedPercentage: 0,
  lastInputTokens: 0,
  effectiveWindow: 128_000,
  level: 'normal',
}

export const RUN_STEP_CALLING_MODEL = '正在调用模型'
export const RUN_STEP_STOPPING = '正在停止当前运行'

/**
 * 敏感字段名模式 — 匹配可能包含 token、密钥、密码等敏感信息的字段。
 * 这些字段的值在 UI 展示时会被替换为占位符。
 */
const SENSITIVE_KEY_PATTERN = /token|secret|password|authorization|api_?key|credential/i

/**
 * 安全过滤工具参数，用于 UI 展示。
 *
 * 安全规则：
 * - write_file.content 只显示长度和行数，不展示全文
 * - edit_file.old_str / new_str 只显示长度
 * - 任何包含 token / secret / password / authorization 的字段值被隐藏
 * - shell/bash command 保留截断摘要
 */
function sanitizeToolArgsForDisplay(
  toolName: string,
  args: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(args)) {
    // 敏感字段：隐藏值
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      result[key] = '(已隐藏)'
      continue
    }

    // write_file.content：只显示长度和行数
    if (toolName === 'write_file' && key === 'content' && typeof value === 'string') {
      const lines = value.split(/\r\n|\r|\n/).length
      result[key] = `(${value.length} 字符 / ${lines} 行)`
      continue
    }

    // edit_file 的大段内容：只显示长度
    if (toolName === 'edit_file' && (key === 'old_str' || key === 'new_str' || key === 'old_string' || key === 'new_string')) {
      if (typeof value === 'string' && value.length > 200) {
        result[key] = `(${value.length} 字符)`
        continue
      }
    }

    // 通用：大字符串截断
    if (typeof value === 'string' && value.length > 500) {
      result[key] = value.slice(0, 200) + `… (共 ${value.length} 字符)`
      continue
    }

    result[key] = value
  }
  return result
}

interface PendingLiveDeltaChunk {
  kind: 'text' | 'thinking'
  content: string
}

let liveBlockSequence = 0
let pendingLiveDeltaChunks: PendingLiveDeltaChunk[] = []
let pendingLiveDeltaRafId: number | null = null

export function createEmptyLiveConversation(
  pendingUserText: string | null = null,
): LiveConversationState {
  return {
    pendingUserText,
    blocks: [],
  }
}

export function deriveLiveConversation(
  pendingUserText: string | null,
  blocks: LiveConversationBlock[],
): LiveConversationState {
  return {
    pendingUserText,
    blocks: clampLiveConversationBlocks(blocks),
  }
}

export function replaceLiveBlocks(
  current: LiveConversationState,
  blocks: LiveConversationBlock[],
): LiveConversationState {
  return deriveLiveConversation(current.pendingUserText, blocks)
}

function createLiveBlockId(kind: LiveConversationBlock['type']): string {
  liveBlockSequence += 1
  return `live-${kind}-${liveBlockSequence}`
}

export function appendLiveTextBlock(
  current: LiveConversationState,
  id: string,
  content: string,
): LiveConversationState {
  if (!content) {
    return current
  }

  const lastBlock = current.blocks.at(-1)
  if (lastBlock?.type === 'text') {
    return replaceLiveBlocks(current, [
      ...current.blocks.slice(0, -1),
      {
        ...lastBlock,
        content: lastBlock.content + content,
      },
    ])
  }

  return replaceLiveBlocks(current, [
    ...current.blocks,
    {
      id,
      type: 'text',
      content,
    },
  ])
}

export function appendLiveThinkingBlock(
  current: LiveConversationState,
  id: string,
  content: string,
): LiveConversationState {
  if (!content) {
    return current
  }

  const lastBlock = current.blocks.at(-1)
  if (
    lastBlock?.type === 'thinking' &&
    lastBlock.endedAt === undefined &&
    lastBlock.durationMs === undefined
  ) {
    return replaceLiveBlocks(current, [
      ...current.blocks.slice(0, -1),
      {
        ...lastBlock,
        content: lastBlock.content + content,
      },
    ])
  }

  return replaceLiveBlocks(current, [
    ...current.blocks,
    {
      id,
      type: 'thinking',
      content,
      startedAt: Date.now(),
    },
  ])
}

export function finalizeOpenThinkingBlocks(
  current: LiveConversationState,
): LiveConversationState {
  const endedAt = Date.now()
  let changed = false
  const nextBlocks = current.blocks.map((block) => {
    if (block.type !== 'thinking') {
      return block
    }
    if (block.endedAt !== undefined || block.durationMs !== undefined) {
      return block
    }
    changed = true
    if (block.startedAt !== undefined) {
      return {
        ...block,
        endedAt,
        durationMs: Math.max(0, endedAt - block.startedAt),
      }
    }
    return {
      ...block,
      endedAt,
    }
  })

  return changed ? replaceLiveBlocks(current, nextBlocks) : current
}

export function appendLiveStatusBlock(
  current: LiveConversationState,
  id: string,
  content: string,
): LiveConversationState {
  if (!content) {
    return current
  }

  const lastBlock = current.blocks.at(-1)
  if (lastBlock?.type === 'status' && lastBlock.content === content) {
    return current
  }

  return replaceLiveBlocks(current, [
    ...current.blocks,
    {
      id,
      type: 'status',
      content,
    },
  ])
}

export function appendLiveSystemBlock(
  current: LiveConversationState,
  id: string,
  content: string,
  level: 'info' | 'warning' | 'error',
): LiveConversationState {
  if (!content) {
    return current
  }

  const hasSameMessage = current.blocks.some(
    (block) => block.type === 'system' && block.content === content,
  )
  if (hasSameMessage) {
    return current
  }

  return replaceLiveBlocks(current, [
    ...current.blocks,
    {
      id,
      type: 'system',
      content,
      level,
    },
  ])
}

export function applyBufferedLiveDeltaChunks(
  current: LiveConversationState,
  chunks: PendingLiveDeltaChunk[],
): LiveConversationState {
  let next = current
  for (const chunk of chunks) {
    if (!chunk.content) {
      continue
    }
    if (chunk.kind === 'text') {
      next = appendLiveTextBlock(
        finalizeOpenThinkingBlocks(next),
        createLiveBlockId('text'),
        chunk.content,
      )
      continue
    }
    next = appendLiveThinkingBlock(
      next,
      createLiveBlockId('thinking'),
      chunk.content,
    )
  }
  return next
}

function readEventText(event: StudioRuntimeEvent): string {
  return typeof event.payload?.text === 'string' ? event.payload.text : ''
}

function createRunningStepFromRuntimeEvent(event: StudioRuntimeEvent): string | null {
  const toolName =
    typeof event.payload?.toolName === 'string' ? event.payload.toolName : null
  const args =
    event.payload?.args && typeof event.payload.args === 'object'
      ? (event.payload.args as Record<string, unknown>)
      : {}

  return toolName ? createToolRunningStep(toolName, args) : null
}

function isActiveButNotCancelling(status: StudioRunStatus): boolean {
  return (
    status === 'starting' ||
    status === 'running' ||
    status === 'waiting_permission' ||
    status === 'waiting_user_input' ||
    status === 'tool_calling'
  )
}

function createInitialRuntimeState() {
  return {
    runtimeStatus: 'disabled' as
      | 'loading'
      | 'ready'
      | 'not-ready'
      | 'disabled'
      | 'error',
    runtimeInspectResult: null as RuntimeInspectResult | null,
    runtimeError: null as string | null,
    lastRuntimeEvent: null as StudioRuntimeEvent | null,
    pendingPermissionRequest: null as PermissionDialogRequest | null,
    pendingUserInputRequest: null as UserQuestionDialogRequest | null,
    isSubmitting: false,
    runStatus: 'idle' as StudioRunStatus,
    currentRunId: null as string | null,
    lastRuntimeEventAt: null as number | null,
    runIdleWarning: null as string | null,
    currentRunStep: null as string | null,
    liveConversation: createEmptyLiveConversation(),
    contextState: INITIAL_CONTEXT_STATE,
    /** warmup 状态 — 辅助提示，不影响 composer 可用性 */
    warmupStatus: 'idle' as RuntimeWarmupStatus,
  }
}

export interface RuntimeStoreState {
  runtimeStatus: 'loading' | 'ready' | 'not-ready' | 'disabled' | 'error'
  runtimeInspectResult: RuntimeInspectResult | null
  runtimeError: string | null
  lastRuntimeEvent: StudioRuntimeEvent | null
  pendingPermissionRequest: PermissionDialogRequest | null
  pendingUserInputRequest: UserQuestionDialogRequest | null
  isSubmitting: boolean
  runStatus: StudioRunStatus
  currentRunId: string | null
  lastRuntimeEventAt: number | null
  runIdleWarning: string | null
  currentRunStep: string | null
  liveConversation: LiveConversationState
  contextState: ContextState
  /** warmup 状态 — 辅助提示，不影响 composer 可用性 */
  warmupStatus: RuntimeWarmupStatus
}

export interface RuntimeStoreActions {
  setRuntimeStatus(
    status: RuntimeStoreState['runtimeStatus'],
  ): void
  setRuntimeInspectResult(result: RuntimeInspectResult | null): void
  setRuntimeError(error: string | null): void
  setLastRuntimeEvent(event: StudioRuntimeEvent | null): void
  setPendingPermissionRequest(input: PermissionRequestInput): void
  setPendingUserInputRequest(input: UserInputRequestInput): void
  setIsSubmitting(value: boolean): void
  setRunStatus(input: StudioRunStatusInput): void
  setCurrentRunId(runId: string | null): void
  setLastRuntimeEventAt(timestamp: number | null): void
  setRunIdleWarning(message: string | null): void
  setCurrentRunStep(input: NullableStringInput): void
  setLiveConversation(input: LiveConversationInput): void
  setContextState(state: ContextState): void
  setWarmupStatus(status: RuntimeWarmupStatus): void
  handleRuntimeEvent(event: StudioRuntimeEvent): void
  resetRuntimeState(): void
}

export const useRuntimeStore = create<RuntimeStoreState & RuntimeStoreActions>()(
  immer((set) => ({
    ...createInitialRuntimeState(),
    setRuntimeStatus(status) {
      set((state) => {
        state.runtimeStatus = status
      })
    },
    setRuntimeInspectResult(result) {
      set((state) => {
        state.runtimeInspectResult = result
      })
    },
    setRuntimeError(error) {
      set((state) => {
        state.runtimeError = error
      })
    },
    setLastRuntimeEvent(event) {
      set((state) => {
        state.lastRuntimeEvent = event
      })
    },
    setPendingPermissionRequest(input) {
      set((state) => {
        state.pendingPermissionRequest =
          typeof input === 'function'
            ? input(state.pendingPermissionRequest)
            : input
      })
    },
    setPendingUserInputRequest(input) {
      set((state) => {
        state.pendingUserInputRequest =
          typeof input === 'function'
            ? input(state.pendingUserInputRequest)
            : input
      })
    },
    setIsSubmitting(value) {
      set((state) => {
        state.isSubmitting = value
      })
    },
    setRunStatus(input) {
      set((state) => {
        state.runStatus =
          typeof input === 'function'
            ? input(state.runStatus)
            : input
      })
    },
    setCurrentRunId(runId) {
      set((state) => {
        state.currentRunId = runId
      })
    },
    setLastRuntimeEventAt(timestamp) {
      set((state) => {
        state.lastRuntimeEventAt = timestamp
      })
    },
    setRunIdleWarning(message) {
      set((state) => {
        state.runIdleWarning = message
      })
    },
    setCurrentRunStep(input) {
      set((state) => {
        state.currentRunStep =
          typeof input === 'function'
            ? input(state.currentRunStep)
            : input
      })
    },
    setLiveConversation(input) {
      set((state) => {
        state.liveConversation =
          typeof input === 'function'
            ? input(state.liveConversation)
            : input
      })
    },
    setContextState(nextState) {
      set((state) => {
        state.contextState = nextState
      })
    },
    setWarmupStatus(status) {
      set((state) => {
        state.warmupStatus = status
      })
    },
    handleRuntimeEvent(event) {
      if (event.type === 'text_delta' || event.type === 'thinking') {
        const text = readEventText(event)
        if (!text) {
          return
        }
        const lastChunk = pendingLiveDeltaChunks.at(-1)
        if (lastChunk?.kind === (event.type === 'text_delta' ? 'text' : 'thinking')) {
          lastChunk.content += text
        } else {
          pendingLiveDeltaChunks.push({
            kind: event.type === 'text_delta' ? 'text' : 'thinking',
            content: text,
          })
        }
        set((state) => {
          state.lastRuntimeEventAt = Date.now()
          state.runIdleWarning = null
          state.currentRunStep =
            state.currentRunStep === RUN_STEP_STOPPING
              ? state.currentRunStep
              : RUN_STEP_CALLING_MODEL
          state.runStatus =
            isActiveButNotCancelling(state.runStatus) || state.runStatus === 'idle'
              ? 'running'
              : state.runStatus
        })
        if (pendingLiveDeltaRafId !== null) {
          return
        }
        pendingLiveDeltaRafId = requestAnimationFrame(() => {
          const chunks = pendingLiveDeltaChunks
          pendingLiveDeltaChunks = []
          pendingLiveDeltaRafId = null
          if (chunks.length === 0) {
            return
          }
          set((state) => {
            state.liveConversation = applyBufferedLiveDeltaChunks(
              state.liveConversation,
              chunks,
            )
          })
        })
        return
      }

      if (pendingLiveDeltaRafId !== null) {
        cancelAnimationFrame(pendingLiveDeltaRafId)
        pendingLiveDeltaRafId = null
      }
      const pendingChunks = pendingLiveDeltaChunks
      pendingLiveDeltaChunks = []

      set((state) => {
        if (
          event.type !== 'text_delta' &&
          event.type !== 'thinking' &&
          event.type !== 'context_update'
        ) {
          state.lastRuntimeEvent = event
        }
        state.lastRuntimeEventAt = Date.now()
        state.runIdleWarning = null
        state.liveConversation = applyBufferedLiveDeltaChunks(
          state.liveConversation,
          pendingChunks,
        )

        switch (event.type) {
          case 'run_started':
            state.currentRunId = event.runId ?? null
            state.isSubmitting = true
            state.runStatus = 'running'
            state.currentRunStep = RUN_STEP_CALLING_MODEL
            state.liveConversation = deriveLiveConversation(
              state.liveConversation.pendingUserText,
              [],
            )
            return
          case 'timing_mark': {
            const stage =
              typeof event.payload?.stage === 'string'
                ? event.payload.stage
                : undefined

            // bootstrap 子阶段中文文案映射，避免 bootstrap 阶段 UI 死寂
            const stepMap: Record<string, string> = {
              runtime_bootstrap_start: '正在加载工作区配置',
              'bootstrap.skills': '正在发现 Skills',
              'bootstrap.instructions': '正在加载指令',
              'bootstrap.hooks': '正在发现 Hooks',
              'bootstrap.sessionStartHooks': '正在执行启动钩子',
              'bootstrap.fileIndex': '正在扫描文件索引',
              'bootstrap.plugins': '正在加载插件',
              'bootstrap.memory': '正在初始化记忆系统',
              'bootstrap.shellSnapshot': '正在创建 Shell 快照',
              'bootstrap.gitContext': '正在收集 Git 上下文',
              'bootstrap.systemPrompt': '正在构建系统提示词',
              'bootstrap.total': '启动编排已完成',
              tool_registry_ready: '工具与插件已就绪',
              history_hydration_start: '正在恢复对话上下文',
              context_build_start: '正在构建模型上下文',
            }
            const step = stage ? stepMap[stage] ?? null : null
            if (step) {
              state.currentRunStep =
                state.currentRunStep === RUN_STEP_STOPPING
                  ? state.currentRunStep
                  : step
            }
            return
          }
          case 'model_request_started':
            state.runStatus =
              isActiveButNotCancelling(state.runStatus) || state.runStatus === 'idle'
                ? 'running'
                : state.runStatus
            state.currentRunStep =
              state.currentRunStep === RUN_STEP_STOPPING
                ? state.currentRunStep
                : '正在请求模型'
            return
          case 'model_first_chunk':
            state.runStatus =
              isActiveButNotCancelling(state.runStatus) || state.runStatus === 'idle'
                ? 'running'
                : state.runStatus
            state.currentRunStep =
              state.currentRunStep === RUN_STEP_STOPPING
                ? state.currentRunStep
                : '模型已开始响应'
            return
          case 'model_request_finished':
            state.runStatus =
              isActiveButNotCancelling(state.runStatus) || state.runStatus === 'idle'
                ? 'running'
                : state.runStatus
            return
          case 'model_request_failed':
            state.isSubmitting = false
            state.runStatus = 'failed'
            state.currentRunId = null
            state.currentRunStep = '运行失败'
            break
          case 'context_update':
            state.currentRunStep =
              state.currentRunStep === RUN_STEP_STOPPING
                ? state.currentRunStep
                : RUN_STEP_CALLING_MODEL
            state.runStatus =
              isActiveButNotCancelling(state.runStatus) || state.runStatus === 'idle'
                ? 'running'
                : state.runStatus
            if (event.payload) {
              state.contextState = {
                usedPercentage:
                  typeof event.payload.usedPercentage === 'number'
                    ? event.payload.usedPercentage
                    : 0,
                lastInputTokens:
                  typeof event.payload.lastInputTokens === 'number'
                    ? event.payload.lastInputTokens
                    : 0,
                effectiveWindow:
                  typeof event.payload.effectiveWindow === 'number'
                    ? event.payload.effectiveWindow
                    : 128_000,
                level:
                  ['normal', 'warning', 'critical', 'overflow'].includes(
                    event.payload.level as string,
                  )
                    ? (event.payload.level as ContextState['level'])
                    : 'normal',
              }
            }
            return
          case 'warning':
            state.runStatus =
              isActiveButNotCancelling(state.runStatus) || state.runStatus === 'idle'
                ? 'running'
                : state.runStatus
            break
          case 'tool_intent': {
            // 模型决定调用工具：创建 pending 工具壳
            const toolCallId =
              typeof event.payload?.toolCallId === 'string'
                ? event.payload.toolCallId
                : createLiveBlockId('tool')
            const toolName =
              typeof event.payload?.toolName === 'string'
                ? event.payload.toolName
                : 'unknown'
            state.currentRunStep =
              state.currentRunStep === RUN_STEP_STOPPING
                ? state.currentRunStep
                : `正在准备 ${toolName}`
            const finalizedCurrent = finalizeOpenThinkingBlocks(state.liveConversation)
            state.liveConversation = replaceLiveBlocks(finalizedCurrent, [
              ...finalizedCurrent.blocks,
              {
                id: createLiveBlockId('tool'),
                type: 'tool',
                toolCallId,
                toolName,
                args: {},
                status: 'pending',
              },
            ])
            return
          }
          case 'tool_args_delta': {
            // 工具参数增量：合并到已有的 pending 工具壳，更新安全摘要
            const toolCallId =
              typeof event.payload?.toolCallId === 'string'
                ? event.payload.toolCallId
                : ''
            const argsSoFar =
              event.payload?.argsSoFar && typeof event.payload.argsSoFar === 'object'
                ? (event.payload.argsSoFar as Record<string, unknown>)
                : {}
            state.liveConversation = replaceLiveBlocks(
              state.liveConversation,
              state.liveConversation.blocks.map((block) => {
                if (block.type !== 'tool' || block.toolCallId !== toolCallId) {
                  return block
                }
                return {
                  ...block,
                  args: sanitizeToolArgsForDisplay(block.toolName, argsSoFar),
                }
              }),
            )
            return
          }
          case 'tool_ready': {
            // 工具参数完整：更新 args 到完整值（仍保持 pending 状态，等 tool_start 切 running）
            const toolCallId =
              typeof event.payload?.toolCallId === 'string'
                ? event.payload.toolCallId
                : ''
            const args =
              event.payload?.args && typeof event.payload.args === 'object'
                ? (event.payload.args as Record<string, unknown>)
                : {}
            const toolName =
              typeof event.payload?.toolName === 'string'
                ? event.payload.toolName
                : undefined
            state.liveConversation = replaceLiveBlocks(
              state.liveConversation,
              state.liveConversation.blocks.map((block) => {
                if (block.type !== 'tool' || block.toolCallId !== toolCallId) {
                  return block
                }
                return {
                  ...block,
                  ...(toolName !== undefined ? { toolName } : {}),
                  args: sanitizeToolArgsForDisplay(toolName ?? block.toolName, args),
                }
              }),
            )
            return
          }
          case 'tool_start': {
            state.runStatus =
              state.runStatus === 'cancelling' ? state.runStatus : 'tool_calling'
            state.currentRunStep =
              state.currentRunStep === RUN_STEP_STOPPING
                ? state.currentRunStep
                : createRunningStepFromRuntimeEvent(event) ?? '正在执行工具'

            const toolCallId =
              typeof event.payload?.toolCallId === 'string'
                ? event.payload.toolCallId
                : createLiveBlockId('tool')
            const toolName =
              typeof event.payload?.toolName === 'string'
                ? event.payload.toolName
                : 'unknown'
            const args =
              event.payload?.args && typeof event.payload.args === 'object'
                ? (event.payload.args as Record<string, unknown>)
                : {}

            // 检查是否已有 pending 工具壳（来自 tool_intent）
            const existingBlock = state.liveConversation.blocks.find(
              (b) => b.type === 'tool' && b.toolCallId === toolCallId,
            )

            if (existingBlock) {
              // 已有 pending 壳：切换到 running
              state.liveConversation = replaceLiveBlocks(
                state.liveConversation,
                state.liveConversation.blocks.map((block) => {
                  if (block.type !== 'tool' || block.toolCallId !== toolCallId) {
                    return block
                  }
                  return {
                    ...block,
                    toolName,
                    args: sanitizeToolArgsForDisplay(toolName, args),
                    status: 'running' as const,
                  }
                }),
              )
            } else {
              // 没有 pending 壳（旧 provider 路径）：直接创建 running 工具行
              const runningStep = createToolRunningStep(toolName, args)
              const finalizedCurrent = finalizeOpenThinkingBlocks(state.liveConversation)
              const lastBlock = finalizedCurrent.blocks.at(-1)
              const shouldInsertStatus =
                finalizedCurrent.blocks.length === 0 ||
                (lastBlock?.type !== 'text' && lastBlock?.type !== 'status')
              const blocks: LiveConversationBlock[] = shouldInsertStatus
                ? [
                    ...finalizedCurrent.blocks,
                    {
                      id: createLiveBlockId('status'),
                      type: 'status',
                      content: runningStep,
                    },
                  ]
                : finalizedCurrent.blocks
              state.liveConversation = replaceLiveBlocks(finalizedCurrent, [
                ...blocks,
                {
                  id: createLiveBlockId('tool'),
                  type: 'tool',
                  toolCallId,
                  toolName,
                  args: sanitizeToolArgsForDisplay(toolName, args),
                  status: 'running',
                },
              ])
            }
            return
          }
          case 'tool_end': {
            state.runStatus =
              state.runStatus === 'tool_calling' ? 'running' : state.runStatus
            state.currentRunStep =
              state.currentRunStep === RUN_STEP_STOPPING
                ? state.currentRunStep
                : RUN_STEP_CALLING_MODEL
            const toolCallId =
              typeof event.payload?.toolCallId === 'string'
                ? event.payload.toolCallId
                : ''
            let changed = false
            state.liveConversation = replaceLiveBlocks(
              state.liveConversation,
              state.liveConversation.blocks.map((block) => {
                if (block.type !== 'tool' || block.toolCallId !== toolCallId) {
                  return block
                }
                changed = true
                return {
                  ...block,
                  status:
                    event.payload?.success === false ? 'error' : 'done',
                  ...(typeof event.payload?.durationMs === 'number'
                    ? { durationMs: event.payload.durationMs }
                    : {}),
                  ...(typeof event.payload?.success === 'boolean'
                    ? { success: event.payload.success }
                    : {}),
                  ...(typeof event.payload?.resultSummary === 'string'
                    ? {
                        resultSummary: truncateConversationText(
                          event.payload.resultSummary,
                          MAX_TOOL_RESULT_SUMMARY_CHARS,
                        ),
                      }
                    : {}),
                  ...(typeof event.payload?.resultFull === 'string'
                    ? {
                        resultFull: truncateConversationText(
                          event.payload.resultFull,
                          MAX_TOOL_RESULT_FULL_CHARS,
                        ),
                      }
                    : {}),
                }
              }),
            )
            if (!changed) {
              state.liveConversation = state.liveConversation
            }
            return
          }
          case 'permission.request':
            state.runStatus =
              state.runStatus === 'cancelling'
                ? state.runStatus
                : 'waiting_permission'
            state.currentRunStep =
              state.currentRunStep === RUN_STEP_STOPPING
                ? state.currentRunStep
                : '等待用户确认'
            return
          case 'permission.decision':
            state.runStatus =
              state.runStatus === 'waiting_permission'
                ? 'running'
                : state.runStatus
            state.currentRunStep =
              state.currentRunStep === RUN_STEP_STOPPING
                ? state.currentRunStep
                : RUN_STEP_CALLING_MODEL
            return
          case 'run_completed':
          case 'session_end':
            state.isSubmitting = false
            state.runStatus = 'completed'
            state.currentRunId = null
            state.currentRunStep = '运行已完成'
            state.liveConversation = appendLiveStatusBlock(
              finalizeOpenThinkingBlocks(state.liveConversation),
              createLiveBlockId('status'),
              '运行已完成',
            )
            return
          case 'turn_end':
            state.isSubmitting = false
            state.runStatus =
              event.payload?.error || event.payload?.aborted === true
                ? 'failed'
                : 'completed'
            state.currentRunId = null
            state.currentRunStep =
              event.payload?.error || event.payload?.aborted === true
                ? '运行失败'
                : '运行已完成'
            state.liveConversation = appendLiveStatusBlock(
              finalizeOpenThinkingBlocks(state.liveConversation),
              createLiveBlockId('status'),
              event.payload?.error || event.payload?.aborted === true
                ? '运行失败'
                : '运行已完成',
            )
            return
          case 'run_failed':
            state.isSubmitting = false
            state.runStatus = 'failed'
            state.currentRunId = null
            state.currentRunStep = '运行失败'
            break
          case 'run_cancelled':
            state.isSubmitting = false
            state.runStatus = 'cancelled'
            state.currentRunId = null
            state.currentRunStep = '已停止当前运行'
            break
          default:
            break
        }

        if (
          event.type === 'model_request_failed' ||
          event.type === 'warning' ||
          event.type === 'error' ||
          event.type === 'runtime.error' ||
          event.type === 'run_failed' ||
          event.type === 'run_cancelled'
        ) {
          const message =
            typeof event.payload?.message === 'string'
              ? event.payload.message
              : typeof event.payload?.error === 'string'
                ? event.payload.error
                : null
          if (message) {
            const level =
              event.type === 'warning'
                ? 'warning'
                : event.type === 'run_cancelled'
                  ? 'info'
                  : 'error'
            state.liveConversation = appendLiveSystemBlock(
              finalizeOpenThinkingBlocks(state.liveConversation),
              createLiveBlockId('system'),
              message,
              level,
            )
          }
        }
      })
    },
    resetRuntimeState() {
      if (pendingLiveDeltaRafId !== null) {
        cancelAnimationFrame(pendingLiveDeltaRafId)
        pendingLiveDeltaRafId = null
      }
      pendingLiveDeltaChunks = []
      set((state) => {
        Object.assign(state, createInitialRuntimeState())
      })
    },
  })),
)

export const useRunStatus = () => useRuntimeStore((state) => state.runStatus)
export const useLiveConversation = () =>
  useRuntimeStore((state) => state.liveConversation)
export const useContextState = () =>
  useRuntimeStore((state) => state.contextState)
