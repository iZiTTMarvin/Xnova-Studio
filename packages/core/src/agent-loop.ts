// src/core/agent-loop.ts

/**
 * AgentLoop — LLM ↔ 工具的多轮执行引擎。
 *
 * 单次 run() 调用对应一次用户提问的完整处理过程：
 *   1. 调用 LLM → 收集文本和工具调用
 *   2. 如有工具调用 → 逐个执行（含权限检查） → 将结果追加到历史
 *   3. 回到步骤 1 进入下一轮，直到 LLM 不再调用工具
 *
 * 所有中间状态通过 AsyncGenerator<AgentEvent> yield 出去，
 * 调用方（useChat）和观察者（SessionLogger）各取所需。
 *
 * ⚠️ 消息格式检查清单（修改本文件或 provider 转换时必查）：
 *
 *   □ 雷区一：每个 tool_call 都有对应的 tool_result？
 *             assistant(tool_calls) → user(tool_results) 严格成对？
 *             异常时也必须产生 tool_result（不能让 tool_call 成孤儿）？
 *   □ 雷区二：工具异常时完整 stack 传回了 LLM（不是空字符串、不是只有 message）？
 *   □ 雷区三：SystemPrompt 未被上下文裁剪截断？SubAgent 不继承主 Agent prompt？
 *   □ 雷区四：循环退出条件只看 toolCalls.length === 0？不看 text 有没有内容？
 */

import type {LLMProvider} from '@providers/provider.js'
import {summarizeArgs} from './args-summarizer.js'
import type {ToolRegistry} from '@tools/core/registry.js'
import type {ToolResult, ToolResultMeta} from '@tools/core/types.js'
import {isStreamableTool} from '@tools/core/types.js'
import type {Message, MessageContent, StreamChunk, ToolCallContent, ToolResultContent} from './types.js'
import {classifyToolCalls, executeSafeToolsInParallel} from './parallel-executor.js'
import type {HookManager} from '@hooks/hook-manager.js'
import {contextTracker} from './context-tracker.js'
import {RepetitionDetector} from './repetition-detector.js'
import {dbg} from './debug.js'

// ═══════════════════════════════════════════════
// 类型定义
// ═══════════════════════════════════════════════

/** AskUserQuestion 工具 — 单个问题定义 */
export interface UserQuestion {
    /** 答案字段名，如 "domain", "focus" */
    key: string
    /** 问题标题 */
    title: string
    /** 问题类型 */
    type: 'select' | 'multiselect' | 'text'
    /** select/multiselect 时的选项列表 */
    options?: UserQuestionOption[]
    /** text 类型的输入提示 */
    placeholder?: string
}

export interface UserQuestionOption {
    label: string
    description?: string
}

/** AskUserQuestion 工具 — 用户回答结果 */
export interface UserQuestionResult {
    cancelled: boolean
    answers?: Record<string, string | string[]>
}

export interface AgentPermissionResolution {
    allow: boolean
    reason?: string
}

type AgentPermissionResolveInput = boolean | AgentPermissionResolution
type AgentDoneReason = 'complete' | 'max_turns' | 'aborted' | 'stopped' | 'budget_exceeded' | 'stalled'
type AgentLoopGuardReason = 'budget_near_limit' | 'budget_exceeded' | 'stalled'
type AgentLoopGuardLevel = 'warning' | 'stopped'

interface AgentLoopGuardEvent {
    type: 'loop_guard'
    level: AgentLoopGuardLevel
    reason: AgentLoopGuardReason
    message: string
    modelRequestCount: number
    afterToolResultCount: number
    toolRoundCount: number
    lowProgressRounds: number
    recentTools: string[]
}

/**
 * AgentEvent — run() 的 yield 类型。
 *
 * 业务事件（UI 消费）：
 *   text / tool_start / tool_done / permission_request / user_question_request / error / done
 *
 * 观测事件（SessionLogger 消费，写入 JSONL）：
 *   llm_start / llm_done / llm_error / tool_fallback / permission_grant
 *
 * 子 Agent 事件（SubAgent 场景）：
 *   subagent_progress
 */
export type AgentEvent =
// 业务事件
    | { type: 'text'; text: string }
    | { type: 'thinking'; text: string }
    | { type: 'tool_intent'; toolName: string; toolCallId: string }
    | { type: 'tool_args_delta'; toolCallId: string; argsSoFar: Record<string, unknown> }
    | { type: 'tool_ready'; toolName: string; toolCallId: string; args: Record<string, unknown> }
    | { type: 'tool_start'; toolName: string; toolCallId: string; args: Record<string, unknown> }
    | {
    type: 'tool_done';
    toolName: string;
    toolCallId: string;
    durationMs: number;
    success: boolean;
    resultSummary?: string;
    resultFull?: string;
    meta?: ToolResultMeta
}
    | { type: 'permission_request'; toolName: string; args: Record<string, unknown>; resolve: (resolution: AgentPermissionResolveInput) => void }
    | { type: 'user_question_request'; questions: UserQuestion[]; resolve: (result: UserQuestionResult) => void }
    | { type: 'error'; error: string }
    | { type: 'done'; reason?: AgentDoneReason }
    | AgentLoopGuardEvent
    // 观测事件
    | { type: 'llm_start'; provider: string; model: string; messageCount: number; systemPrompt?: string }
    | { type: 'timing_mark'; stage: string; elapsedMs?: number }
    | {
    type: 'llm_done';
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    stopReason: string;
    ttftMs: number;
    e2eMs: number;
    tps: number
}
    | {
    type: 'llm_first_chunk';
    chunkType: 'text' | 'thinking' | 'tool_call';
    elapsedMs: number
}
    | { type: 'llm_error'; error: string; partialOutputTokens?: number }
    | { type: 'tool_fallback'; toolName: string; fromLevel: string; toLevel: string; reason: string }
    | { type: 'post_tool_feedback'; toolName: string; toolCallId: string; feedback: string }
    | { type: 'permission_grant'; toolName: string; always: boolean }
    // 子 Agent 事件 — dispatch_agent 的 stream() 通过 yield* 透传到主 AgentLoop
    /**
     * 子 Agent 派生宣告 — dispatch_agent 生成 agentId 的瞬间 yield，
     * 建立 parentToolCallId ↔ agentId 关联，UI 据此在 running 期间就挂载卡片。
     */
    | {
    type: 'subagent_spawn';
    parentToolCallId: string;
    agentId: string;
    name: string;
    agentType: string;
    description: string;
    maxTurns: number
}
    | {
    type: 'subagent_progress';
    agentId: string;
    name: string;
    agentType: string;
    description: string;
    turn: number;
    maxTurns: number;
    currentTool?: string
}
    | { type: 'subagent_done'; agentId: string; name: string; description: string; success: boolean; output: string }
    // 任务规划事件 — todo_write 工具执行后由 useChat 广播
    | {
    type: 'todo_update';
    todos: Array<{ id: string; content: string; status: 'pending' | 'in_progress' | 'completed'; activeForm: string }>
}

export interface AgentConfig {
    /** 当前运行时工作目录。Studio/Electron 不应依赖全局 process.cwd()。 */
    cwd?: string | undefined
    model: string
    /** provider 名称，记录到 llm_start 事件 */
    provider: string
    signal?: AbortSignal | undefined
    /** 是否启用并行工具执行（默认 true） */
    parallelTools?: boolean | undefined
    /** 最大并行工具数（默认 5） */
    maxParallelTools?: number | undefined
    /** 系统提示词，注入到每次 LLM 调用的首条 system message */
    systemPrompt?: string | undefined
    /** 最大轮次（默认 20，子 Agent 可设更小值防止过长执行） */
    maxTurns?: number | undefined
    /** 工具结果后的模型请求最大轮数（主 Agent 默认较小，避免长循环） */
    maxAfterToolResultRequests?: number | undefined
    /** 连续低进展工具轮数上限，到达后先收束，再继续低进展则停止 */
    maxLowProgressRounds?: number | undefined
    /** 标记为侧链（子 Agent），跳过权限检查弹窗 */
    isSidechain?: boolean | undefined
    /** 子 Agent ID（日志和事件用） */
    agentId?: string | undefined
    /** 当前会话 ID（子 Agent JSONL 需要关联父会话） */
    sessionId?: string | undefined
    /** 标记非交互模式，工具不可弹出用户界面 */
    nonInteractive?: boolean | undefined
    /** Hook 管理器（可选，注入后启用 PreToolUse / PostToolUse 钩子） */
    hookManager?: HookManager | undefined
    /** 配置快照（透传到 ToolContext，避免子 Agent 重复读磁盘） */
    config?: import('@config/config-manager.js').CCodeConfig | undefined
    /** 最少执行轮次（仅 isSidechain 模式生效，防止弱模型提前退出） */
    minTurns?: number | undefined
    /** 标记后台执行模式（run_in_background），禁用 minTurns 续跑，避免无用 LLM 调用挂起 */
    isBackground?: boolean | undefined
}

// ═══════════════════════════════════════════════
// 常量
// ═══════════════════════════════════════════════

/** 主 Agent 交互式默认最大模型请求轮数，防止一次 submit 长时间自转 */
const DEFAULT_MAIN_MAX_TURNS = 12
/** 子 Agent / 后台任务保留较宽预算；它们通常已有 agent 定义的 maxTurns。 */
const DEFAULT_SIDECHAIN_MAX_TURNS = 100
/** 主 Agent 默认允许的 after_tool_result 请求轮数。 */
const DEFAULT_MAIN_MAX_AFTER_TOOL_RESULT_REQUESTS = 8
/** 连续“只有工具、没有文本”的低进展轮数阈值。 */
const DEFAULT_MAX_LOW_PROGRESS_ROUNDS = 5

/** resultSummary 最大长度（CLI 展示用） */
const RESULT_SUMMARY_MAX_LENGTH = 200
/** resultFull 最大长度（Web 展示 + JSONL 持久化用，超过此长度截断） */
const RESULT_FULL_MAX_LENGTH = 100_000
/** 回传 LLM history 的工具结果最大字符数（兜底截断，防 bash/task_output 极端场景） */
const LLM_RESULT_MAX_CHARS = 40_000

// ═══════════════════════════════════════════════
// AgentLoop 类
// ═══════════════════════════════════════════════

export class AgentLoop {
    readonly #provider: LLMProvider
    readonly #registry: ToolRegistry
    readonly #config: AgentConfig
    /** 上一次 LLM 调用的参数指纹（用于 Prompt Cache 破裂检测） */
    #lastCacheFingerprint: string | null = null
    #llmCallIndex = 0
    /** 工具调用重复检测器（防止弱模型陷入循环调用） */
    readonly #repetitionDetector = new RepetitionDetector()
    /** 外部请求优雅停止 — 当前轮结束后退出循环 */
    #stopRequested = false

    constructor(
        provider: LLMProvider,
        registry: ToolRegistry,
        config: AgentConfig,
    ) {
        this.#provider = provider
        this.#registry = registry
        this.#config = config
    }

    /** 暴露 provider 给 StreamableTool（子 Agent 需要继承 provider） */
    get provider(): LLMProvider {
        return this.#provider
    }

    /** 暴露 registry 给 StreamableTool（子 Agent 需要 cloneWithout） */
    get registry(): ToolRegistry {
        return this.#registry
    }

    /** 外部请求优雅停止 — 当前轮结束后退出循环 */
    requestStop(): void {
        this.#stopRequested = true
    }

    #shouldStop(): boolean {
        return this.#stopRequested || this.#config.signal?.aborted === true
    }

    /**
     * 主循环：LLM 调用 → [工具执行 → LLM 调用]* → 文本回复
     *
     * 返回类型说明（2026-04-17 从 AsyncIterable 收紧到 AsyncGenerator）：
     * - 实现是 async function*，运行时对象天然就是 AsyncGenerator
     * - 原先标注 AsyncIterable<T> 属于向上转型，丢失了 return()/throw()/TReturn
     *   的类型信息，且与同文件内部方法的 AsyncGenerator 标注不一致
     * - 现在显式 TReturn=void（run() 所有 return 语句无值）、TNext=unknown
     *   （从不消费 next(x) 的参数），让未来误增 return 值会被编译器挡下
     * - 调用方全部只用 for await...of，改动零破坏，但获得 .return()/.throw()
     *   的类型级能力（未来需要主动清理或测试错误注入时可直接使用）
     *
     * 详细原理、改造取舍、性能误区：
     *   docs/experience/20260417150016_AsyncIterable与AsyncGenerator的魔法细节.md
     */
    async* run(messages: Message[]): AsyncGenerator<AgentEvent, void, unknown> {
        // 直接引用传入数组（不复制）。ContextManager 通过 getHistoryRef() 传入，
        // run() 中追加的 assistant + tool_result 自动反映到 ContextManager 内部。
        const history = messages
        const maxTurns = resolveMaxTurns(this.#config)
        const maxAfterToolResultRequests = resolveMaxAfterToolResultRequests(this.#config, maxTurns)
        const maxLowProgressRounds = this.#config.maxLowProgressRounds ?? DEFAULT_MAX_LOW_PROGRESS_ROUNDS
        const minToolRounds = this.#config.minTurns ?? 0
        /** 实际执行了工具的轮次数（不含纯文本轮） */
        let toolRounds = 0
        /** 实际发起的模型请求次数。 */
        let modelRequestCount = 0
        /** 连续低进展工具轮数：模型只给工具调用、没有可见文本时递增。 */
        let lowProgressRounds = 0
        let budgetConvergenceInjected = false
        let stalledConvergenceInjected = false
        let recentTools: string[] = []

        for (let turn = 0; turn < maxTurns; turn++) {
            // 检查点 1：新一轮开始前（安全 — history 末尾是 tool_result 或初始 user 消息）
            if (this.#shouldStop()) {
                yield {type: 'done', reason: 'stopped'}
                return
            }

            const nextModelRequestCount = modelRequestCount + 1
            const nextAfterToolResultCount = Math.max(0, nextModelRequestCount - 1)

            if (nextAfterToolResultCount > maxAfterToolResultRequests) {
                const guard = buildLoopGuardEvent({
                    level: 'stopped',
                    reason: 'budget_exceeded',
                    modelRequestCount,
                    afterToolResultCount: nextAfterToolResultCount,
                    toolRoundCount: toolRounds,
                    lowProgressRounds,
                    recentTools,
                })
                yield guard
                yield {type: 'done', reason: 'budget_exceeded'}
                return
            }

            if (
                nextAfterToolResultCount === maxAfterToolResultRequests &&
                !budgetConvergenceInjected
            ) {
                const guard = buildLoopGuardEvent({
                    level: 'warning',
                    reason: 'budget_near_limit',
                    modelRequestCount,
                    afterToolResultCount: nextAfterToolResultCount,
                    toolRoundCount: toolRounds,
                    lowProgressRounds,
                    recentTools,
                })
                history.push({role: 'user', content: buildBudgetConvergenceMessage()})
                budgetConvergenceInjected = true
                yield guard
            }

            modelRequestCount = nextModelRequestCount
            const llmResult = yield* this.#callLLM(history)
            if (llmResult.aborted) return

            // 追加 assistant 消息到 history（text + tool_calls 摘要）
            // tool_call 只记录 id/name，不记录完整 args（args 可能包含 write_file 的整个文件内容，
            // 放入 history 会导致每轮 LLM 调用 token 数爆炸）
            const assistantContent: MessageContent[] = []
            if (llmResult.text) {
                assistantContent.push({type: 'text', text: llmResult.text})
            }
            for (const tc of llmResult.toolCalls) {
                assistantContent.push({
                    type: 'tool_call',
                    toolCallId: tc.toolCallId,
                    toolName: tc.toolName,
                    args: summarizeArgs(tc.toolName, tc.args),  // 精简摘要：保留关键信息（命令/路径/模式），不含大段内容
                })
            }
            if (assistantContent.length > 0) {
                history.push({role: 'assistant', content: assistantContent})
            }

            if (llmResult.toolCalls.length === 0) {
                // 续跑检测：前台 SubAgent 且工具轮次不足时注入继续消息
                // 后台 SubAgent 不续跑——任务完成即退出，避免无用 LLM 调用挂起导致 session_end 缺失
                if (toolRounds < minToolRounds && this.#config.isSidechain && !this.#config.isBackground) {
                    history.push({
                        role: 'user',
                        content: 'You have not completed the task yet. Continue executing tools to finish the task. Do NOT just describe what to do — actually call tools.',
                    })
                    continue
                }
                yield {type: 'done', reason: 'complete'}
                return
            }

            toolRounds++
            const hasVisibleText = llmResult.text.trim().length > 0
            if (hasVisibleText) {
                lowProgressRounds = 0
            } else {
                lowProgressRounds++
            }
            recentTools = llmResult.toolCalls.map(tc => tc.toolName).slice(-6)

            yield* this.#executeToolCalls(llmResult.toolCalls, history)

            if (lowProgressRounds >= maxLowProgressRounds) {
                if (stalledConvergenceInjected) {
                    const guard = buildLoopGuardEvent({
                        level: 'stopped',
                        reason: 'stalled',
                        modelRequestCount,
                        afterToolResultCount: Math.max(0, modelRequestCount - 1),
                        toolRoundCount: toolRounds,
                        lowProgressRounds,
                        recentTools,
                    })
                    yield guard
                    yield {type: 'done', reason: 'stalled'}
                    return
                }

                const guard = buildLoopGuardEvent({
                    level: 'warning',
                    reason: 'stalled',
                    modelRequestCount,
                    afterToolResultCount: Math.max(0, modelRequestCount - 1),
                    toolRoundCount: toolRounds,
                    lowProgressRounds,
                    recentTools,
                })
                history.push({role: 'user', content: buildStalledConvergenceMessage()})
                stalledConvergenceInjected = true
                yield guard
            }

            // 检查点 2：工具执行完毕后（安全 — tool_result 已写入 history）
            if (this.#shouldStop()) {
                yield {type: 'done', reason: 'stopped'}
                return
            }
        }

        // 超过最大轮次：以 done + max_turns 结束，不再 yield error（调用方可按 reason 区分）
        yield buildLoopGuardEvent({
            level: 'stopped',
            reason: 'budget_exceeded',
            modelRequestCount,
            afterToolResultCount: Math.max(0, modelRequestCount - 1),
            toolRoundCount: toolRounds,
            lowProgressRounds,
            recentTools,
        })
        yield {type: 'done', reason: 'max_turns'}
    }

    // ─────────────────────────────────────────────
    // LLM 调用
    // ─────────────────────────────────────────────

    /**
     * 调用 LLM 并收集流式输出。
     *
     * yield: llm_start → text* → llm_done | llm_error
     * return: 收集到的工具调用列表 + 是否因错误中止
     */
    async* #callLLM(
        history: Message[],
    ): AsyncGenerator<AgentEvent, { toolCalls: ToolCallContent[]; text: string; aborted: boolean }> {
        const chatRequest = {
            model: this.#config.model,
            messages: history,
            tools: this.#registry.toToolDefinitions(),
            ...(this.#config.signal !== undefined ? {signal: this.#config.signal} : {}),
            ...(this.#config.systemPrompt !== undefined ? {systemPrompt: this.#config.systemPrompt} : {}),
        }

        yield {
            type: 'llm_start',
            provider: this.#config.provider,
            model: this.#config.model,
            messageCount: history.length,
            ...(this.#config.systemPrompt !== undefined ? {systemPrompt: this.#config.systemPrompt} : {}),
        }

        const pendingToolCalls: ToolCallContent[] = []
        let accumulatedText = ''
        let inputTokens = 0
        let outputTokens = 0
        let cacheReadTokens = 0
        let cacheWriteTokens = 0
        // 从 done chunk 中取 stopReason，经 ProviderWrapper 标准化后直接使用
        let doneStopReason = 'end_turn'

        /**
         * 工具调用增量聚合器。
         * Provider 发出 tool_call_delta 时，在此累积 toolName 和 JSON 参数片段。
         * 流结束后（或收到最终 tool_call 时），将聚合结果转为完整 ToolCallContent。
         */
        const pendingDeltas = new Map<string, {
            toolName: string
            argsJson: string
            lastArgsFingerprint: string
        }>()
        /** 已经 yield 过 tool_intent 的 toolCallId 集合 */
        const intentEmitted = new Set<string>()

        // 性能层：计时变量
        const requestStart = Date.now()
        let firstContentChunk = false
        let ttftMs = 0

        try {
            for await (const chunk of this.#provider.chat(chatRequest)) {
                if (chunk.type === 'timing' && typeof chunk.stage === 'string') {
                    yield {
                        type: 'timing_mark',
                        stage: chunk.stage,
                        ...(typeof chunk.elapsedMs === 'number' ? {elapsedMs: chunk.elapsedMs} : {}),
                    }
                    continue
                }

                // 性能层：首个有内容的 chunk 才算 TTFT
                // 部分 Provider 第一个 chunk 可能是 message_start 或空 content_block_start，
                // 只在 text / thinking / tool_call / tool_call_delta 类型时才记录
                if (!firstContentChunk && (chunk.type === 'text' || chunk.type === 'thinking' || chunk.type === 'tool_call' || chunk.type === 'tool_call_delta')) {
                    ttftMs = Date.now() - requestStart
                    firstContentChunk = true
                    yield {
                        type: 'llm_first_chunk',
                        chunkType: chunk.type === 'tool_call_delta' ? 'tool_call' : chunk.type,
                        elapsedMs: ttftMs,
                    }
                }

                // ── 工具调用增量处理 ──
                if (chunk.type === 'tool_call_delta' && chunk.toolCallDelta) {
                    const delta = chunk.toolCallDelta
                    const existing = pendingDeltas.get(delta.toolCallId)

                    if (!existing) {
                        // 首个 delta：记录工具名，yield tool_intent
                        const toolName = delta.toolName ?? 'unknown'
                        pendingDeltas.set(delta.toolCallId, {
                            toolName,
                            argsJson: delta.argumentsDelta ?? '',
                            lastArgsFingerprint: '',
                        })
                        if (!intentEmitted.has(delta.toolCallId)) {
                            intentEmitted.add(delta.toolCallId)
                            yield {type: 'tool_intent', toolName, toolCallId: delta.toolCallId}
                        }
                    } else {
                        // 后续 delta：累积参数 JSON 片段
                        if (delta.toolName && existing.toolName === 'unknown') {
                            existing.toolName = delta.toolName
                        }
                        if (delta.argumentsDelta) {
                            existing.argsJson += delta.argumentsDelta
                        }
                    }

                    // 尝试安全解析已累积的 JSON 片段，yield tool_args_delta
                    const current = pendingDeltas.get(delta.toolCallId)!
                    const partialArgs = safeParsePartialJson(current.argsJson)
                    const partialArgsFingerprint = partialArgs === null ? '' : JSON.stringify(partialArgs)
                    if (partialArgs !== null && partialArgsFingerprint !== current.lastArgsFingerprint) {
                        current.lastArgsFingerprint = partialArgsFingerprint
                        yield {
                            type: 'tool_args_delta',
                            toolCallId: delta.toolCallId,
                            argsSoFar: partialArgs,
                        }
                    }
                    continue
                }

                const mapped = this.#mapChunk(chunk, pendingToolCalls)
                if (mapped) {
                    if (mapped.type === 'text' && 'text' in mapped) accumulatedText += mapped.text
                    if (mapped.type === 'error') {
                        const errorMsg = chunk.error ?? 'unknown error'
                        // Provider 将 abort 错误包装为 error chunk（不抛出）→ 重新抛出使 catch 路径生效
                        if (errorMsg.toLowerCase().includes('aborted')) {
                            const abortErr = new Error(errorMsg)
                            abortErr.name = 'AbortError'
                            throw abortErr
                        }
                        yield makeLlmError(errorMsg, outputTokens)
                        yield mapped
                        return {toolCalls: [], text: '', aborted: true}
                    }
                    yield mapped
                }

                // 最终 tool_call 到达时，yield tool_ready（无论是否有 delta 前驱）
                if (chunk.type === 'tool_call' && chunk.toolCall) {
                    const tc = chunk.toolCall
                    // 如果没有经过 delta 路径（provider 不支持 delta），补发 tool_intent
                    if (!intentEmitted.has(tc.toolCallId)) {
                        intentEmitted.add(tc.toolCallId)
                        yield {type: 'tool_intent', toolName: tc.toolName, toolCallId: tc.toolCallId}
                    }
                    yield {type: 'tool_ready', toolName: tc.toolName, toolCallId: tc.toolCallId, args: tc.args}
                }

                if (chunk.type === 'usage' && chunk.usage) {
                    inputTokens = chunk.usage.inputTokens
                    outputTokens = chunk.usage.outputTokens
                    cacheReadTokens = chunk.usage.cacheReadTokens
                    cacheWriteTokens = chunk.usage.cacheWriteTokens
                }
                if (chunk.type === 'done') {
                    doneStopReason = chunk.stopReason ?? 'end_turn'
                }
            }

            // 性能层：E2E + TPS 计算
            const e2eMs = Date.now() - requestStart
            // 纯工具调用场景：Anthropic 的 tool_call 是流结束后才 yield，
            // ttftMs ≈ e2eMs 使 generationMs ≈ 0。此时退化用 e2eMs 作为分母，
            // 给出"整体吞吐率"而非"纯 generation 阶段吞吐率"。
            const generationMs = e2eMs - ttftMs
            const tpsBase = generationMs > 50 ? generationMs : e2eMs  // 50ms 阈值避免极小值放大噪声
            const tps = tpsBase > 0 && outputTokens > 0
                ? Math.round(outputTokens / (tpsBase / 1000) * 10) / 10
                : 0
            dbg(`[PERF] TTFT=${ttftMs}ms E2E=${e2eMs}ms TPS=${tps} tokens/s (base=${tpsBase}ms)\n`)

            // Prompt Cache 破裂检测：systemPrompt + tools 指纹变化 → 缓存失效
            this.#llmCallIndex++
            const fingerprint = simpleHash(
                (this.#config.systemPrompt ?? '') +
                JSON.stringify(this.#registry.toToolDefinitions().map(t => t.name)),
            )
            if (this.#lastCacheFingerprint !== null && this.#lastCacheFingerprint !== fingerprint) {
                // 指纹变化 = 缓存前缀不同，Prompt Cache 必然 miss
                dbg(`[CACHE-BREAK] LLM call #${this.#llmCallIndex}: prompt/tools fingerprint changed (${this.#lastCacheFingerprint} → ${fingerprint})\n`)
            } else if (this.#llmCallIndex > 1 && cacheReadTokens === 0 && inputTokens > 2000) {
                // 指纹没变但 cacheRead=0，可能是 TTL 过期或 API 侧未命中
                dbg(`[CACHE-MISS] LLM call #${this.#llmCallIndex}: cacheReadTokens=0 with ${inputTokens} input tokens\n`)
            }
            this.#lastCacheFingerprint = fingerprint

            yield {
                type: 'llm_done',
                inputTokens,
                outputTokens,
                cacheReadTokens,
                cacheWriteTokens,
                stopReason: doneStopReason,
                ttftMs,
                e2eMs,
                tps
            }
            // 更新上下文窗口追踪（精确值来自 API 返回的 inputTokens）
            // 仅主 Agent 更新 — 子 Agent（isSidechain）有独立上下文，不应覆盖主 Agent 的追踪值
            if (inputTokens > 0 && !this.#config.isSidechain) {
                contextTracker.update(inputTokens)
            }
            return {toolCalls: pendingToolCalls, text: accumulatedText, aborted: false}
        } catch (err) {
            if (isAbortError(err)) {
                const e2eMs = Date.now() - requestStart
                yield {
                    type: 'llm_done',
                    inputTokens,
                    outputTokens,
                    cacheReadTokens,
                    cacheWriteTokens,
                    stopReason: 'abort',
                    ttftMs,
                    e2eMs,
                    tps: 0
                }
            } else {
                yield makeLlmError(err instanceof Error ? err.message : String(err), outputTokens)
            }
            throw err
        }
    }

    /** StreamChunk → AgentEvent 映射，null 表示不产生事件 */
    #mapChunk(chunk: StreamChunk, pendingToolCalls: ToolCallContent[]): AgentEvent | null {
        switch (chunk.type) {
            case 'text':
                return chunk.text ? {type: 'text', text: chunk.text} : null
            case 'thinking':
                return {type: 'thinking', text: chunk.thinking ?? ''}
            case 'tool_call': {
                if (chunk.toolCall) pendingToolCalls.push(chunk.toolCall);
                return null
            }
            case 'tool_call_delta':
                // delta 在 #callLLM 中单独处理，此处不产生事件
                return null
            case 'error':
                return {type: 'error', error: chunk.error ?? 'unknown error'}
            default:
                return null // usage / done 不产生业务事件
        }
    }

    // ─────────────────────────────────────────────
    // 工具执行
    // ─────────────────────────────────────────────

    /**
     * 分发工具调用：parallelTools=false 时全部串行；否则安全工具并行、危险工具串行。
     */
    async* #executeToolCalls(toolCalls: ToolCallContent[], history: Message[]): AsyncGenerator<AgentEvent> {
        // parallelTools === false → 全部串行（兼容模式）
        if (this.#config.parallelTools === false) {
            for (const tc of toolCalls) {
                if (this.#shouldStop()) return
                yield* this.#executeOneTool(tc, history)
            }
            return
        }

        // 分组：safe 并行，dangerous 串行
        const {safe, dangerous} = classifyToolCalls(toolCalls, this.#registry)

        if (safe.length + dangerous.length > 1) {
            process.stderr.write(`[parallel] ${toolCalls.length} tools → safe: ${safe.map(t => t.toolName).join(',')} | dangerous: ${dangerous.map(t => t.toolName).join(',')}\n`)
        }

        // 1. 并行执行安全工具
        if (safe.length > 0) {
            if (this.#shouldStop()) return
            const events: AgentEvent[] = []
            const ctx = buildToolContext(this.#provider, this.#registry, this.#config, history)
            const results = await executeSafeToolsInParallel(
                safe, this.#registry, (e) => events.push(e), ctx, this.#config.maxParallelTools,
            )
            // yield 收集到的事件
            for (const e of events) {
                yield e
            }
            // 所有并行工具结果合并到一条 user 消息（Anthropic 要求同一条消息包含所有 tool_result）
            const toolResults: ToolResultContent[] = results.map(pr => {
                // 失败时合并 output + error（output 可能含 stderr 等诊断信息）
                const raw = pr.success
                    ? pr.output
                    : [pr.output, pr.error].filter(Boolean).join('\n') || 'error'
                return {
                    type: 'tool_result' as const,
                    toolCallId: pr.toolCallId,
                    result: truncateForLLM(raw, pr.toolName),
                    ...(pr.success === false ? {isError: true as const} : {}),
                }
            })
            if (toolResults.length > 0) {
                history.push({role: 'user', content: toolResults})
            }
        }

        // 2. 串行执行危险工具
        for (const tc of dangerous) {
            if (this.#shouldStop()) return
            yield* this.#executeOneTool(tc, history)
        }
    }

    /**
     * 执行单个工具调用。
     *
     * 普通工具：await tool.execute()
     * 流式工具（StreamableTool）：yield* tool.stream()，中间事件实时透传
     *
     * yield: tool_start → [permission_request → permission_grant] → [subagent_progress*] → tool_done
     */
    async* #executeOneTool(tc: ToolCallContent, history: Message[]): AsyncGenerator<AgentEvent> {
        if (this.#shouldStop()) return
        yield {type: 'tool_start', toolName: tc.toolName, toolCallId: tc.toolCallId, args: tc.args}

        // ── 重复调用检测 ──
        // 在权限检查之前执行，因为 block 级别的拦截根本不需要走后续流程
        const verdict = this.#repetitionDetector.check(tc)
        if (verdict.action === 'block') {
            dbg(`[REPETITION-BLOCK] ${tc.toolName} × ${verdict.count}, skipping execution\n`)
            history.push({
                role: 'user',
                content: [{type: 'tool_result', toolCallId: tc.toolCallId, result: verdict.message, isError: true}]
            })
            yield {
                type: 'tool_done',
                toolName: tc.toolName,
                toolCallId: tc.toolCallId,
                durationMs: 0,
                success: false,
                resultSummary: `循环调用已拦截 (${tc.toolName} × ${verdict.count})`
            }
            return
        }

        // 权限检查：isSidechain 模式跳过弹窗（主 Agent 派发即授权）
        const permission = yield* this.#checkPermission(tc)
        if (!permission.allow) {
            const denialMessage = formatPermissionDenied(permission.reason)
            history.push({
                role: 'user',
                content: [{type: 'tool_result', toolCallId: tc.toolCallId, result: denialMessage, isError: true}]
            })
            yield {
                type: 'tool_done',
                toolName: tc.toolName,
                toolCallId: tc.toolCallId,
                durationMs: 0,
                success: false,
                resultSummary: denialMessage
            }
            return
        }

        // PreToolUse Hook：检查是否被拦截或参数被修改
        let toolArgs = tc.args
        if (this.#config.hookManager) {
            const preResults = await this.#config.hookManager.run('PreToolUse', {
                trigger: tc.toolName,
                env: {CCODE_TOOL_NAME: tc.toolName, CCODE_TOOL_CALL_ID: tc.toolCallId},
                stdin: JSON.stringify({toolName: tc.toolName, args: tc.args}),
            })
            for (const r of preResults) {
                if (!r) continue
                if (r['decision'] === 'block') {
                    const reason = typeof r['reason'] === 'string' ? r['reason'] : 'blocked by hook'
                    history.push({
                        role: 'user',
                        content: [{
                            type: 'tool_result',
                            toolCallId: tc.toolCallId,
                            result: `blocked: ${reason}`,
                            isError: true
                        }]
                    })
                    yield {
                        type: 'tool_done',
                        toolName: tc.toolName,
                        toolCallId: tc.toolCallId,
                        durationMs: 0,
                        success: false,
                        resultSummary: reason
                    }
                    return
                }
                if (r['decision'] === 'modify' && typeof r['modifiedArgs'] === 'object' && r['modifiedArgs'] !== null) {
                    toolArgs = r['modifiedArgs'] as Record<string, unknown>
                }
            }
        }

        // 构建 ToolContext（流式工具需要 provider/registry 来创建子 AgentLoop）
        // 传入 tc.toolCallId：StreamableTool（如 dispatch_agent）可借此在 yield 事件时
        // 携带 parentToolCallId，供 UI 建立工具调用 ↔ 子 Agent 的关联
        const ctx = buildToolContext(this.#provider, this.#registry, this.#config, history, tc.toolCallId)

        const start = Date.now()
        const tool = this.#registry.get(tc.toolName)
        if (this.#shouldStop()) {
            history.push({
                role: 'user',
                content: [{type: 'tool_result', toolCallId: tc.toolCallId, result: '执行前已停止', isError: true}]
            })
            yield {
                type: 'tool_done',
                toolName: tc.toolName,
                toolCallId: tc.toolCallId,
                durationMs: 0,
                success: false,
                resultSummary: '执行前已停止'
            }
            return
        }

        // 【雷区一防御】工具执行必须 try/catch，确保任何异常都产生 tool_result，
        // 绝不能让 assistant 消息中的 tool_call 成为孤儿（无对应 tool_result）。
        // registry.execute() 内部已有 catch，但 StreamableTool 的 yield* 没有。
        let result: ToolResult
        try {
            if (tool && isStreamableTool(tool)) {
                // 流式工具（如 dispatch_agent）：yield* 透传中间事件，return 值为最终结果
                result = yield* (tool.stream(toolArgs, ctx) as AsyncGenerator<AgentEvent, ToolResult>)
            } else {
                // 普通工具：await execute()
                result = await this.#registry.execute(tc.toolName, toolArgs, ctx)
            }
        } catch (err) {
            // 【雷区二防御】异常的完整 stack 传回 LLM，让模型能定位错误并自我纠错
            const errDetail = err instanceof Error
                ? `${err.message}\n${err.stack ?? ''}`
                : String(err)
            result = {success: false, output: '', error: errDetail}
        }

        const durationMs = Date.now() - start

        // 失败时合并 output + error 传给 LLM（output 可能含 stderr 等诊断信息，不能丢）
        const toolResultRaw = result.success
            ? result.output
            : [result.output, result.error].filter(Boolean).join('\n') || 'error'
        // 兜底截断：防 bash/task_output 等工具返回超长结果膨胀 history
        const toolResultText = truncateForLLM(toolResultRaw, tc.toolName)

        history.push({
            role: 'user',
            content: [{
                type: 'tool_result',
                toolCallId: tc.toolCallId,
                result: toolResultText,
                ...(result.success === false ? {isError: true} : {}),
            }],
        })

        // ── 重复调用 warn 级别：注入警告到 history，让 LLM 下一轮看到 ──
        if (verdict.action === 'warn') {
            const warning = this.#repetitionDetector.buildWarningMessage(verdict.toolName, verdict.count)
            dbg(`[REPETITION-WARN] ${tc.toolName} × ${verdict.count}\n`)
            history.push({role: 'user', content: warning})
        }

        // PostToolUse Hook：工具执行后通知 + 消费反馈（Reflection 闭环）
        // 放在 history.push(工具结果) 之后，这样 LLM 先看到工具结果，再看到验证反馈。
        // hook 脚本可返回 { additionalContext: "tsc error: ..." }，追加到 history 引导 LLM 自行修正。
        if (this.#config.hookManager) {
            const postResults = await this.#config.hookManager.run('PostToolUse', {
                trigger: tc.toolName,
                env: {CCODE_TOOL_NAME: tc.toolName, CCODE_TOOL_CALL_ID: tc.toolCallId},
                stdin: JSON.stringify({
                    toolName: tc.toolName,
                    result: {success: result.success, output: truncate(result.output, 1000)}
                }),
            })

            for (const r of postResults) {
                if (!r) continue
                const ctx = r['additionalContext']
                if (typeof ctx === 'string' && ctx.trim()) {
                    history.push({role: 'user', content: `[PostToolUse feedback for ${tc.toolName}]: ${ctx}`})
                    // yield 事件让 SessionLogger 持久化到 JSONL
                    yield {type: 'post_tool_feedback', toolName: tc.toolName, toolCallId: tc.toolCallId, feedback: ctx}
                }
            }
        }

        const rawOutput = result.success ? result.output : (result.error ?? 'error')
        const resultSummary = truncate(rawOutput, RESULT_SUMMARY_MAX_LENGTH)
        const resultFull = truncate(rawOutput, RESULT_FULL_MAX_LENGTH)

        yield {
            type: 'tool_done', toolName: tc.toolName, toolCallId: tc.toolCallId,
            durationMs, success: result.success, resultSummary, resultFull,
            ...(result.meta !== undefined ? {meta: result.meta} : {}),
        }
    }

    /** 安全工具直接放行；危险工具 yield permission_request 暂停等待用户确认 */
    async* #checkPermission(tc: ToolCallContent): AsyncGenerator<AgentEvent, AgentPermissionResolution> {
        if (this.#shouldStop()) return {allow: false, reason: 'stopped'}
        // isSidechain 模式：子 Agent 内所有工具自动批准（主 Agent 派发即授权）
        if (this.#config.isSidechain) return {allow: true}

        if (!this.#registry.isDangerous(tc.toolName)) return {allow: true}

        let resolvePermission!: (v: AgentPermissionResolveInput) => void
        const promise = new Promise<AgentPermissionResolution>(r => {
            resolvePermission = (resolution) => {
                r(normalizePermissionResolution(resolution))
            }
        })
        yield {type: 'permission_request', toolName: tc.toolName, args: tc.args, resolve: resolvePermission}
        const permission = await promise

        if (permission.allow) {
            yield {type: 'permission_grant', toolName: tc.toolName, always: false}
        }
        return permission
    }
}

// ═══════════════════════════════════════════════
// 工具函数
// ═══════════════════════════════════════════════

function resolveMaxTurns(config: AgentConfig): number {
    if (typeof config.maxTurns === 'number' && Number.isFinite(config.maxTurns) && config.maxTurns > 0) {
        return Math.floor(config.maxTurns)
    }
    return config.isSidechain || config.isBackground
        ? DEFAULT_SIDECHAIN_MAX_TURNS
        : DEFAULT_MAIN_MAX_TURNS
}

function resolveMaxAfterToolResultRequests(config: AgentConfig, maxTurns: number): number {
    if (
        typeof config.maxAfterToolResultRequests === 'number' &&
        Number.isFinite(config.maxAfterToolResultRequests) &&
        config.maxAfterToolResultRequests >= 0
    ) {
        return Math.floor(config.maxAfterToolResultRequests)
    }
    if (config.isSidechain || config.isBackground) {
        return Math.max(0, maxTurns - 1)
    }
    return Math.min(DEFAULT_MAIN_MAX_AFTER_TOOL_RESULT_REQUESTS, Math.max(0, maxTurns - 1))
}

function buildLoopGuardEvent(input: {
    level: AgentLoopGuardLevel
    reason: AgentLoopGuardReason
    modelRequestCount: number
    afterToolResultCount: number
    toolRoundCount: number
    lowProgressRounds: number
    recentTools: string[]
}): AgentLoopGuardEvent {
    return {
        type: 'loop_guard',
        level: input.level,
        reason: input.reason,
        message: buildLoopGuardMessage(input.reason, input.level),
        modelRequestCount: input.modelRequestCount,
        afterToolResultCount: input.afterToolResultCount,
        toolRoundCount: input.toolRoundCount,
        lowProgressRounds: input.lowProgressRounds,
        recentTools: input.recentTools,
    }
}

function buildLoopGuardMessage(reason: AgentLoopGuardReason, level: AgentLoopGuardLevel): string {
    if (reason === 'budget_near_limit') {
        return 'Agent 已接近工具反馈后的模型请求上限，正在要求模型基于已有结果收束回答。'
    }
    if (reason === 'stalled' && level === 'warning') {
        return 'Agent 连续多轮只调用工具但没有产生可见进展，正在要求模型停止探索并总结当前结果。'
    }
    if (reason === 'stalled') {
        return 'Agent 连续多轮没有产生有效进展，已安全停止继续调用工具。'
    }
    return 'Agent 已达到安全轮次上限，已停止继续调用工具。'
}

function buildBudgetConvergenceMessage(): string {
    return [
        '系统提醒：你已经接近本次运行的工具反馈轮次上限。',
        '请停止发起新的探索性工具调用，除非这是完成任务必需的最后一步。',
        '优先基于已有工具结果给出当前结论、已完成事项、未完成事项和下一步建议。',
    ].join('\n')
}

function buildStalledConvergenceMessage(): string {
    return [
        '系统提醒：你已经连续多轮调用工具但没有产生可见文字进展。',
        '请停止重复探索，基于已有工具结果总结当前状态。',
        '如果确实无法继续，请说明阻塞原因和用户可以采取的下一步。',
    ].join('\n')
}

function truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text
    return maxLength >= 10000
        ? text.slice(0, maxLength) + `\n... (truncated, total ${text.length} chars)`
        : text.slice(0, maxLength) + '...'
}

function normalizePermissionResolution(
    resolution: AgentPermissionResolveInput,
): AgentPermissionResolution {
    if (typeof resolution === 'boolean') {
        return {allow: resolution}
    }

    const reason = typeof resolution.reason === 'string'
        ? resolution.reason.trim()
        : ''

    return {
        allow: resolution.allow,
        ...(reason ? {reason} : {}),
    }
}

function formatPermissionDenied(reason?: string): string {
    const normalizedReason = reason?.trim()
    return normalizedReason
        ? `permission denied (${normalizedReason})`
        : 'permission denied'
}

/** 工具专属的截断后引导提示 */
const TRUNCATION_HINTS: Record<string, string> = {
    bash: '请用 grep/head/tail 过滤输出，或拆分为更小的命令',
    task_output: '输出过长，请用 bash 配合 grep/tail 过滤关键信息',
    grep: '请缩小 pattern 范围或指定更精确的搜索路径',
    read_file: '请指定行号范围读取特定区域',
}

/**
 * 截断工具结果后塞入 LLM history（兜底层）。
 * 大部分工具内部已有截断（read_file 20K / grep 50 条），此处防 bash/task_output 极端场景。
 */
function truncateForLLM(output: string, toolName: string): string {
    if (output.length <= LLM_RESULT_MAX_CHARS) return output
    const hint = TRUNCATION_HINTS[toolName] ?? '结果过长已截断，请尝试缩小查询范围'
    return output.slice(0, LLM_RESULT_MAX_CHARS) +
        `\n\n[结果已截断：共 ${output.length} 字符，仅保留前 ${LLM_RESULT_MAX_CHARS} 字符。${hint}]`
}

/**
 * 判断是否为 abort 错误。
 * Node.js 原生 fetch 抛 AbortError（name='AbortError'），
 * 但 LangChain 等库可能包装为普通 Error，message 含 "aborted"。
 */
export function isAbortError(err: unknown): boolean {
    if (!(err instanceof Error)) return false
    if (err.name === 'AbortError') return true
    if (err.message.toLowerCase().includes('aborted')) return true
    return false
}

/** 构造 llm_error 事件（兼容 exactOptionalPropertyTypes） */
function makeLlmError(error: string, partialTokens: number): AgentEvent {
    return partialTokens > 0
        ? {type: 'llm_error', error, partialOutputTokens: partialTokens}
        : {type: 'llm_error', error}
}

/** 构建 ToolContext，兼容 exactOptionalPropertyTypes（不传 undefined 值） */
function buildToolContext(
    provider: LLMProvider,
    registry: ToolRegistry,
    config: AgentConfig,
    history?: ReadonlyArray<Message>,
    toolCallId?: string,
): import('@tools/core/types.js').ToolContext {
    const ctx: import('@tools/core/types.js').ToolContext = {
        cwd: config.cwd ?? process.cwd(),
        provider,
        providerName: config.provider,
        model: config.model,
        registry,
    }
    if (config.signal !== undefined) {
        ctx.signal = config.signal
    }
    if (config.sessionId !== undefined) {
        ctx.sessionId = config.sessionId
    }
    if (config.nonInteractive) {
        ctx.nonInteractive = config.nonInteractive
    }
    if (config.systemPrompt !== undefined) {
        ctx.systemPrompt = config.systemPrompt
    }
    if (config.config !== undefined) {
        ctx.config = config.config
    }
    if (history !== undefined) {
        ctx.history = history
    }
    if (toolCallId !== undefined) {
        ctx.toolCallId = toolCallId
    }
    return ctx
}

/** djb2 字符串哈希 — 用于 Prompt Cache 破裂检测（不需要密码学安全性） */
function simpleHash(str: string): string {
    let hash = 5381
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0
    }
    return (hash >>> 0).toString(36)
}

/**
 * 安全解析可能不完整的工具参数 JSON。
 *
 * Provider 会逐块输出 `{"path":"a.txt","content":"...` 这样的片段。
 * 完整 JSON 能直接解析；不完整时只提取已经闭合的顶层字段，避免为了等大段
 * content 生成完才让 UI 看到 path/command。
 */
function safeParsePartialJson(json: string): Record<string, unknown> | null {
    if (!json || json.trim().length === 0) return null
    try {
        const parsed = JSON.parse(json)
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
            return parsed as Record<string, unknown>
        }
        return null
    } catch {
        return parseCompletedTopLevelJsonFields(json)
    }
}

function parseCompletedTopLevelJsonFields(json: string): Record<string, unknown> | null {
    const source = json.trim()
    if (!source.startsWith('{')) return null

    const result: Record<string, unknown> = {}
    let cursor = 1

    while (cursor < source.length) {
        cursor = skipJsonWhitespaceAndCommas(source, cursor)
        if (cursor >= source.length || source[cursor] === '}') break
        if (source[cursor] !== '"') break

        const key = readJsonStringLiteral(source, cursor)
        if (!key) break
        cursor = skipJsonWhitespace(source, key.end)
        if (source[cursor] !== ':') break
        cursor = skipJsonWhitespace(source, cursor + 1)

        const value = readCompleteJsonValue(source, cursor)
        if (!value) break
        result[key.value] = value.value
        cursor = skipJsonWhitespace(source, value.end)

        if (source[cursor] === ',') {
            cursor++
            continue
        }
        if (source[cursor] === '}') break
        // 输入可能刚好停在一个完整字段后，后续分隔符还没到达。
        break
    }

    return Object.keys(result).length > 0 ? result : null
}

function skipJsonWhitespace(source: string, start: number): number {
    let cursor = start
    while (cursor < source.length && /\s/.test(source[cursor]!)) cursor++
    return cursor
}

function skipJsonWhitespaceAndCommas(source: string, start: number): number {
    let cursor = start
    while (cursor < source.length && (/\s/.test(source[cursor]!) || source[cursor] === ',')) {
        cursor++
    }
    return cursor
}

function readJsonStringLiteral(source: string, start: number): { value: string; end: number } | null {
    let cursor = start + 1
    let escaped = false
    while (cursor < source.length) {
        const char = source[cursor]!
        if (escaped) {
            escaped = false
        } else if (char === '\\') {
            escaped = true
        } else if (char === '"') {
            try {
                return { value: JSON.parse(source.slice(start, cursor + 1)) as string, end: cursor + 1 }
            } catch {
                return null
            }
        }
        cursor++
    }
    return null
}

function readCompleteJsonValue(source: string, start: number): { value: unknown; end: number } | null {
    const first = source[start]
    if (!first) return null

    if (first === '"') {
        return readJsonStringLiteral(source, start)
    }

    if (first === '{' || first === '[') {
        const end = findJsonContainerEnd(source, start)
        if (end === null) return null
        try {
            return { value: JSON.parse(source.slice(start, end)), end }
        } catch {
            return null
        }
    }

    for (const literal of ['true', 'false', 'null'] as const) {
        if (source.startsWith(literal, start)) {
            return { value: JSON.parse(literal), end: start + literal.length }
        }
    }

    const numberMatch = source.slice(start).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/)
    if (numberMatch?.[0]) {
        return { value: Number(numberMatch[0]), end: start + numberMatch[0].length }
    }

    return null
}

function findJsonContainerEnd(source: string, start: number): number | null {
    const opener = source[start]
    const closer = opener === '{' ? '}' : ']'
    const stack: string[] = [closer]
    let cursor = start + 1
    let inString = false
    let escaped = false

    while (cursor < source.length) {
        const char = source[cursor]!
        if (inString) {
            if (escaped) {
                escaped = false
            } else if (char === '\\') {
                escaped = true
            } else if (char === '"') {
                inString = false
            }
            cursor++
            continue
        }

        if (char === '"') {
            inString = true
        } else if (char === '{') {
            stack.push('}')
        } else if (char === '[') {
            stack.push(']')
        } else if (char === stack[stack.length - 1]) {
            stack.pop()
            if (stack.length === 0) return cursor + 1
        }
        cursor++
    }

    return null
}
