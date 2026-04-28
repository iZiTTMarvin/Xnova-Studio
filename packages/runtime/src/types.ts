// src/runtime/types.ts

/**
 * Runtime 核心类型定义
 *
 * 落定 spec/backend/runtime-boundary.md 中的 6 个占位类型：
 * - ResolvedConfig（从 config-manager 现行结构平移，Phase 2 迁移时扩展）
 * - RuntimeEvent
 * - PermissionRequest / PermissionResolution
 * - UserQuestionRequest / UserQuestionResult
 * - RuntimeSubmitInput
 * - RuntimeSnapshot
 *
 * 约束：本文件不得 import ink / electron / ui/*
 */

import type { CCodeConfig } from '@config/config-manager.js'
import type { ToolDefinition } from '@providers/provider.js'
import type { ToolRegistry } from '@tools/core/registry.js'
import type {
  BootstrapTimings,
  Message,
  MessageContent,
  UserQuestion,
  UserQuestionResult as AgentLoopUserQuestionResult,
} from '@xnova/core'

// ═══════════════════════════════════════════════
// 1. ResolvedConfig
// ═══════════════════════════════════════════════

/**
 * 运行时消费的已解析配置。
 * Phase 1：直接复用 CCodeConfig（从 config-manager 平移，不改字段名）。
 * Phase 2：config-toml-migration 完成后，此类型扩展为 project > user > builtin 合并结果。
 */
export type ResolvedConfig = CCodeConfig

// ═══════════════════════════════════════════════
// 2. RuntimeEvent
// ═══════════════════════════════════════════════

/** Runtime 向 Host 发出的事件类型 */
export type RuntimeEventType =
  | 'model_request_started' // 模型请求开始
  | 'model_first_chunk'     // 收到首个 chunk
  | 'model_request_finished' // 模型请求结束
  | 'model_request_failed'  // 模型请求失败
  | 'timing_mark'       // 非敏感性能阶段打点
  | 'text_delta'        // LLM 流式文本片段
  | 'thinking'          // 思考过程片段
  | 'tool_start'        // 工具调用开始
  | 'tool_end'          // 工具调用结束
  | 'subagent_spawn'    // 子 Agent 刚创建
  | 'subagent_progress' // 子 Agent 进度
  | 'subagent_done'     // 子 Agent 完成
  | 'agent_start'       // 子 Agent 启动
  | 'agent_end'         // 子 Agent 结束
  | 'turn_end'          // 一轮 LLM 调用结束
  | 'session_end'       // 整个会话结束
  | 'error'             // 运行时错误
  | 'warning'           // 降级警告（如 embedding 不可用）
  | 'context_update'    // 上下文窗口状态更新

export interface RuntimeEvent {
  type: RuntimeEventType
  /** 事件发生时间（ISO 8601） */
  timestamp: string
  /** 关联的 sessionId */
  sessionId?: string
  /** 关联的 agentId（子 Agent 事件） */
  agentId?: string
  /** 事件携带的数据 */
  payload?: Record<string, unknown>
}

// ═══════════════════════════════════════════════
// 3. PermissionRequest / PermissionResolution
// ═══════════════════════════════════════════════

/** Runtime 向 Host 请求工具执行权限 */
export interface PermissionRequest {
  /** 请求权限的工具名 */
  toolName: string
  /** 工具调用参数（供 Host 展示给用户） */
  args: Record<string, unknown>
  /** 关联的 sessionId */
  sessionId: string
}

/** Host 对权限请求的决策结果 */
export interface PermissionResolution {
  /** true = 允许执行，false = 拒绝 */
  allow: boolean
  /** 是否记住本次决策（本 session 内同工具不再询问） */
  remember?: boolean
  /** Host 给出的结构化决策原因，用于 UI 与 LLM 诊断 */
  reason?: string
}

// ═══════════════════════════════════════════════
// 4. UserQuestionRequest / UserQuestionResult
// ═══════════════════════════════════════════════

/** Runtime 向 Host 请求用户回答问题表单 */
export interface UserQuestionRequest {
  /** 问题列表（复用 AgentLoop 的 UserQuestion 定义） */
  questions: UserQuestion[]
  /** 关联的 sessionId */
  sessionId: string
}

/** Host 返回用户的回答结果（复用 AgentLoop 的 UserQuestionResult 定义） */
export type UserQuestionResult = AgentLoopUserQuestionResult

// ═══════════════════════════════════════════════
// 5. RuntimeSubmitInput
// ═══════════════════════════════════════════════

/**
 * Runtime 预备快照。
 *
 * 这个对象只在 main/runtime 内存中流转，不能通过 IPC 发给 renderer，
 * 因为其中可能包含 system prompt 和不可序列化的工具注册表引用。
 */
export interface RuntimePreparedSnapshot {
  /** bootstrap 构建出的基础 system prompt，不含本轮 primary agent prompt */
  systemPrompt?: string | undefined
  /** 完整工具定义，包含参数 schema；用于判断工具列表和模型工具声明是否完整 */
  toolDefinitions?: ToolDefinition[] | undefined
  /** 可执行工具注册表引用；fast path 命中时 AgentLoop 直接复用它 */
  toolRegistry?: ToolRegistry | undefined
  /** bootstrap 过程产生的 warning */
  bootstrapWarnings?: string[] | undefined
  /** bootstrap 各子阶段耗时 */
  bootstrapTimings?: BootstrapTimings | undefined
  /** 版本/配置指纹，host 用于刷新 warmup snapshot */
  agentConfigFingerprint?: string | undefined
  skillsVersion?: string | undefined
  hooksVersion?: string | undefined
  mcpToolListVersion?: string | undefined
  memoryVersion?: string | undefined
  gitContextVersion?: string | undefined
}

/** 向 Runtime 提交一次用户输入 */
export interface RuntimeSubmitInput {
  /** 用户文本消息 */
  text: string
  /** 本轮临时覆盖的 provider */
  provider?: string
  /** 本轮临时覆盖的 model */
  model?: string
  /** 本轮执行前要喂给 AgentLoop 的 history；REPL 复用 ContextManager，Pipe Mode 走本地数组 */
  history?: Message[]
  /** 记录到 session JSONL 的原始用户输入；支持多模态内容 */
  loggedUserContent?: string | MessageContent[]
  /** 标记为非交互模式（如 Pipe Mode） */
  nonInteractive?: boolean
  /** Pipe Mode 等一次性场景可要求 submit 前等待 MCP 初始化完成 */
  waitForMcp?: boolean
  /** 可选：指定恢复的 leafEventUuid（会话分支恢复） */
  resumeLeafUuid?: string
  /** 可选：附加的上下文（如文件内容、选中代码） */
  attachments?: RuntimeAttachment[]
  /**
   * main 侧 warmup 准备好的本地装配结果。
   * 命中时 runtime 可以跳过 bootstrapAll/getSystemPrompt/registerMcpTools。
   */
  preparedSnapshot?: RuntimePreparedSnapshot | undefined
}

export interface RuntimeAttachment {
  type: 'file' | 'text'
  /** 文件路径或文本内容 */
  content: string
  /** 文件路径（type=file 时） */
  filePath?: string
}

// ═══════════════════════════════════════════════
// 6. RuntimeSnapshot
// ═══════════════════════════════════════════════

/** Runtime 当前状态快照（供 Host 渲染 UI） */
export interface RuntimeSnapshot {
  /** 当前 sessionId */
  sessionId: string | null
  /** 是否正在处理请求 */
  isRunning: boolean
  /** 当前 provider */
  provider: string
  /** 当前 model */
  model: string
  /** 上下文窗口使用情况（token 数） */
  contextUsed?: number
  contextLimit?: number
  /** 启动过程中的警告（embedding 降级等） */
  warnings: string[]
}

/** 单轮执行的聚合结果 */
export interface RuntimeTurnResult {
  /** 助手最终文本（包含中断前的部分输出） */
  text: string
  /** 思考过程文本（若 provider 支持） */
  thinking: string
  /** 本轮最后一次 LLM 调用的 stop reason */
  stopReason: string
  /** 本轮 LLM 调用次数 */
  llmCallCount: number
  /** 本轮工具调用次数 */
  toolCallCount: number
  /** 本轮累计 token 使用 */
  usage: {
    inputTokens: number
    outputTokens: number
    cacheReadTokens: number
    cacheWriteTokens: number
  }
  /** 是否由用户中断 */
  aborted: boolean
  /** 本轮开始前是否触发了 auto-compact */
  historyCompacted: boolean
  /** 关联 sessionId */
  sessionId: string | null
  /** 本轮错误（若有） */
  error?: string
  /**
   * 本轮执行后可供 main 刷新 warmup 的真实装配结果。
   * 只允许 main/runtime 内部消费，不应出现在 renderer IPC 响应里。
   */
  preparedSnapshot?: RuntimePreparedSnapshot | undefined
}

// ═══════════════════════════════════════════════
// RuntimeConfigInput / RuntimeHostBridge / RuntimeInstance
// （spec 中的顶层接口）
// ═══════════════════════════════════════════════

/** createRuntime() 的输入参数 */
export interface RuntimeConfigInput {
  /** 当前工作目录 */
  cwd: string
  /** 可选：workspace 根目录（多项目场景） */
  workspaceRoot?: string
  /** 已解析的配置 */
  config: ResolvedConfig
  /** 运行模式 */
  mode: 'standard' | 'xforge'
}

/**
 * Host 实现的 Bridge 接口 — Runtime 通过此接口与宿主通信。
 * CLI host 和 Desktop host 各自实现，Runtime 不感知具体宿主。
 */
export interface RuntimeHostBridge {
  /** 向 Host 发送运行时事件 */
  emit(event: RuntimeEvent): void
  /** 请求工具执行权限（Host 展示确认弹窗） */
  requestPermission(input: PermissionRequest): Promise<PermissionResolution>
  /** 请求用户回答问题表单（可选，Host 不支持时 Runtime 降级） */
  requestUserInput?(input: UserQuestionRequest): Promise<UserQuestionResult>
}

/**
 * Runtime 实例接口 — createRuntime() 的返回值。
 * Host 通过此接口驱动 Runtime。
 */
export interface RuntimeInstance {
  /** 提交用户输入，启动一轮 AgentLoop */
  submit(input: RuntimeSubmitInput): Promise<RuntimeTurnResult>
  /** 中止当前正在运行的 AgentLoop */
  abort(): void
  /** 释放所有资源（MCP 连接、文件监听、DB 连接等） */
  dispose(): Promise<void>
  /** 获取当前状态快照 */
  getSnapshot(): RuntimeSnapshot
}
