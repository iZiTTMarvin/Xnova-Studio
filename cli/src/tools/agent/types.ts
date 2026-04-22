// src/tools/agent/types.ts

/**
 * Agent 类型系统 — 统一接口定义。
 *
 * v1 产品层来源收敛为两种：
 * - builtin：内置（general / explore / plan）
 * - user：用户自定义（~/.xnovacode/agents/*.md）
 *
 * Phase 3 变更：source 枚举从 'built-in' | 'custom' | 'plugin' 升级为 'builtin' | 'user'。
 * 规范来源：.trellis/spec/backend/agent-schema-v1.md §3 来源契约
 */

// ═══════════════════════════════════════════════
// Agent 定义接口
// ═══════════════════════════════════════════════

/**
 * Agent 定义来源 — v1 产品层只暴露 builtin + user
 *
 * 不再支持 project-level agent 产品能力（Phase 3 明确排除）。
 */
export type AgentSource = 'builtin' | 'user'

/** 工具策略：白名单或黑名单 */
export type ToolPolicy =
  | { mode: 'exclude'; tools: string[] }
  | { mode: 'include'; tools: string[] }

/**
 * Agent 定义 — 描述一种 Agent 的"模板"。
 *
 * 当 LLM 调用 dispatch_agent({ subagent_type: 'explore' }) 时，
 * 框架查找对应 AgentDefinition 来配置系统提示、工具集、轮次上限。
 */
export interface AgentDefinition {
  /** 类型标识（唯一键），如 "general"、"explore"、"security-reviewer" */
  readonly agentType: string

  /** 来源 */
  readonly source: AgentSource

  /** 显示名称（与 agentType/id 分离，供 UI 展示） */
  readonly displayName?: string

  /** 一行说明 — LLM 看到的类型描述，决策选哪个类型时参考 */
  readonly whenToUse: string

  /**
   * 系统提示词。
   * 方法而非字段 — 内置类型可根据上下文动态生成。
   */
  getSystemPrompt(): string

  /**
   * 工具策略 — 该类型的额外工具约束。
   *
   * dispatch_agent 和 ask_user_question 在执行层硬编码排除，
   * 此处不需要重复声明。
   */
  readonly toolPolicy: ToolPolicy

  /** 默认最大轮次 */
  readonly maxTurns: number

  /**
   * Agent 使用模式（v1 新增）— 决定可出现在哪类候选池
   * - primary：只在主 Agent 候选池
   * - subagent：只在 SubAgent 候选池
   * - all：两个候选池均可（缺省值）
   */
  readonly mode?: import('./schema-v1.js').AgentMode

  /** 可选继承来源；仅表示 loader 已解析过的父级引用 id */
  readonly inherits?: string

  /**
   * UI 副标题说明（v1 新增）— 展示在 Agent 选择器中
   */
  readonly summary?: string

  /** 扩展元数据（v1 frontmatter.extra），runtime 不解释但必须保留 */
  readonly extra?: Record<string, unknown>

  /** 模型建议（hint，不强制覆盖 LLM 传入的 model） */
  readonly modelHint?: 'fast' | 'balanced' | 'strong'

  /** 上下文继承策略（默认 trimmed，子 Agent 继承主 Agent 裁剪后的对话历史） */
  readonly contextPolicy?: import('./context-utils.js').ContextPolicy

  /** 最少执行轮次（防止弱模型提前退出，仅 SubAgent 模式生效） */
  readonly minTurns?: number

  /** 执行超时（毫秒），超时后自动发起 stop（走优雅退出+宽限期路径） */
  readonly timeoutMs?: number

  // ── 预留字段 ──
  // readonly skills?: string[]
  // readonly background?: boolean
  // readonly isolation?: 'worktree'
  // readonly omitInstructions?: boolean
  // readonly hooks?: HooksSettings
}

/** 内置 Agent 定义 */
export interface BuiltInAgentDefinition extends AgentDefinition {
  readonly source: 'builtin'
}

/**
 * 用户自定义 Agent 定义 — ~/.xnovacode/agents/*.md
 *
 * Phase 3 变更：原 CustomAgentDefinition（source: 'custom'）重命名并收敛为 'user' 来源。
 */
export interface UserAgentDefinition extends AgentDefinition {
  readonly source: 'user'
  /** 定义文件路径（调试/报错用） */
  readonly filePath: string
}

// ═══════════════════════════════════════════════
// dispatch_agent 结构化输出
// ═══════════════════════════════════════════════

/** 同步完成 */
export interface AgentCompletedOutput {
  status: 'completed'
  agentId: string
  name: string
  agentType: string
  model: string
  prompt: string
  result: string
}

/** 异步启动 */
export interface AgentAsyncLaunchedOutput {
  status: 'async_launched'
  agentId: string
  name: string
  agentType: string
  model: string
  prompt: string
  description: string
}

/** 失败 */
export interface AgentErrorOutput {
  status: 'error'
  agentId: string
  name: string
  agentType: string
  error: string
  /** 兜底保证始终存在：dispatch-agent.ts 在 finalText 为空时填 emptyTextFallback 占位 */
  partialResult: string
}

/** 被停止 */
export interface AgentStoppedOutput {
  status: 'stopped'
  agentId: string
  name: string
  agentType: string
  /** 终止方式：优雅退出 or 强制中断 */
  resolution: 'graceful' | 'forced'
  /** 谁触发的停止 */
  source: import('./store.js').StopSource
  /** 停止原因 */
  reason: string
  /** 执行进度 */
  turn: number
  maxTurns: number
  /** 已有结果 */
  partialResult: string
  /** token 用量 */
  tokenUsed?: import('./store.js').TokenUsage
  /**
   * 给主 Agent 的自然语言行为指引 — 根据停止来源生成，
   * 防止主 Agent 把"用户主动停止"误解成"执行失败"而自作主张代替执行。
   * 详见 dispatch-agent.ts#buildStopGuidance。
   */
  guidance: string
}

/** dispatch_agent 输出联合类型 */
export type AgentOutput = AgentCompletedOutput | AgentAsyncLaunchedOutput | AgentErrorOutput | AgentStoppedOutput
