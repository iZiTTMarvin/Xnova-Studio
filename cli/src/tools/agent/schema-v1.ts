// src/tools/agent/schema-v1.ts

/**
 * Agent Schema v1 — TypeScript 类型定义
 *
 * 规范来源：.trellis/spec/backend/agent-schema-v1.md
 *
 * v1 产品层来源：builtin + user（不含 project-level）
 * override 规则：user > builtin
 */

// ═══════════════════════════════════════════════
// 基础枚举类型
// ═══════════════════════════════════════════════

/** v1 产品层 Agent 来源（收敛自旧的 built-in/custom/plugin） */
export type AgentSourceV1 = 'builtin' | 'user'

/**
 * Agent 使用模式 — 决定可出现在哪类候选池
 *
 * - primary：只出现在主 Agent 候选池
 * - subagent：只出现在 SubAgent 候选池
 * - all：两个候选池均可出现（缺省值）
 */
export type AgentMode = 'primary' | 'subagent' | 'all'

/** 模型偏好提示（hint，不强制覆盖用户选择） */
export type ModelPreference = 'fast' | 'balanced' | 'strong'

// ═══════════════════════════════════════════════
// 工具策略
// ═══════════════════════════════════════════════

/** 工具策略 v1 — 白名单或黑名单 */
export interface AgentToolPolicyV1 {
  /** include：只允许 tools 列表中的工具；exclude：排除 tools 列表中的工具 */
  mode: 'include' | 'exclude'
  tools: string[]
}

// ═══════════════════════════════════════════════
// Frontmatter / 加载后定义
// ═══════════════════════════════════════════════

/**
 * Agent frontmatter v1 — 从 Markdown 文件解析出的结构化定义
 *
 * 字段约束见 agent-schema-v1.md §3 Contracts
 */
export interface AgentFrontmatterV1 {
  /** 唯一标识，仅允许小写英文、数字、连字符，且不以连字符开头 */
  id: string
  /** UI 展示名 */
  name: string
  /** UI 副标题描述 */
  summary: string
  /** 使用模式：缺省默认 'all' */
  mode: AgentMode
  /** 继承自某个已知 agent id（可选，schema 层只验证格式，引用有效性在 loader 层验证） */
  inherits?: string
  /** LLM 调度参考描述 */
  when_to_use: string
  /** 工具策略（必填） */
  tool_policy: AgentToolPolicyV1
  /** 模型偏好提示（可选） */
  model_preference?: ModelPreference
  /** 扩展元数据（可选，透传给运行时） */
  extra?: Record<string, unknown>
}

/**
 * 加载后的 Agent 定义 v1
 *
 * 供 registry、UI、runtime 消费的完整对象。
 * builtin agent 的 filePath 为空字符串。
 */
export interface LoadedAgentDefinitionV1 {
  /** 来源：内置 or 用户自定义 */
  source: AgentSourceV1
  /** 解析后的 frontmatter（完整 v1 结构） */
  frontmatter: AgentFrontmatterV1
  /** Markdown 正文（系统提示词扩展说明或完整提示词正文） */
  body: string
  /** 文件路径，builtin 为空字符串 */
  filePath: string
}
