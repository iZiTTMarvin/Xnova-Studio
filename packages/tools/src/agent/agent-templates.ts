// src/tools/agent/agent-templates.ts

/**
 * Agent 模板定义 — 供"从模板创建"功能使用
 *
 * 每个模板包含：
 * - 模板元数据（id、名称、描述）
 * - 预填充的 frontmatter 内容
 * - 预填充的正文提示词占位
 *
 * 规范来源：.trellis/tasks/04-22-phase3-user-agent-crud/prd.md §3
 */

/** 模板定义 */
export interface AgentTemplate {
  /** 模板唯一 id（不同于 agent id） */
  templateId: string
  /** 模板展示名称 */
  name: string
  /** 模板描述 */
  description: string
  /** 该模板适合创建哪类 agent */
  useCase: string
  /** 模板生成的 frontmatter（不含 id/name，需用户填写） */
  frontmatterTemplate: string
  /** 模板生成的正文占位内容 */
  bodyTemplate: string
}

// ═══════════════════════════════════════════════
// 内置模板列表
// ═══════════════════════════════════════════════

/** 通用型（全工具集）模板 */
const TEMPLATE_GENERAL: AgentTemplate = {
  templateId: 'general',
  name: '通用型 Agent',
  description: '拥有完整工具集，适合代码实现、文件修改等多步任务',
  useCase: '代码实现、多步工程任务',
  frontmatterTemplate: `mode = "all"
when_to_use = "通用多步任务执行，包含代码实现、文件修改、构建验证等"

[tool_policy]
mode = "exclude"
tools = []`,
  bodyTemplate: `You are a sub-agent executing a SINGLE assigned task autonomously.

=== SCOPE CONSTRAINT ===
Do ONLY what the task description asks. Do NOT expand scope.

=== RULES ===
1. USE TOOLS for every step. Do NOT just describe what to do.
2. Before reporting done, VERIFY your work.
3. If a tool fails, diagnose and retry.

=== WORKFLOW ===
read → plan → execute → verify → report
`,
}

/** 只读探索型模板 */
const TEMPLATE_EXPLORE: AgentTemplate = {
  templateId: 'explore',
  name: '只读探索型 Agent',
  description: '限制为只读工具，适合代码搜索、结构分析等探索任务',
  useCase: '代码搜索、定义查找、结构分析',
  frontmatterTemplate: `mode = "all"
when_to_use = "只读代码探索任务，包括搜索、定义查找、调用链分析等"
model_preference = "fast"

[tool_policy]
mode = "include"
tools = ["read_file", "grep", "glob", "bash"]`,
  bodyTemplate: `=== READ-ONLY MODE — NO FILE MODIFICATIONS ===

You are a code exploration specialist.

FORBIDDEN: write_file, edit_file, bash commands that modify files.
ALLOWED: read_file, grep, glob, bash (read-only commands only).

Output: file_path:line_number + relevant snippet + analysis.
`,
}

/** 规划型模板 */
const TEMPLATE_PLAN: AgentTemplate = {
  templateId: 'plan',
  name: '规划型 Agent',
  description: '读取代码做架构分析和实施规划，不执行任何写操作',
  useCase: '架构分析、实施规划、影响评估',
  frontmatterTemplate: `mode = "all"
when_to_use = "架构分析和实施规划任务，只读不执行"
model_preference = "strong"

[tool_policy]
mode = "include"
tools = ["read_file", "grep", "glob"]`,
  bodyTemplate: `You are a software architect. Analyze requirements, read existing code, and produce implementation plans.

=== RULES ===
1. Read enough code FIRST before designing.
2. Reference exact file paths and line numbers.
3. Output structured plan with steps, files, and rationale.

=== OUTPUT FORMAT ===
- Implementation steps (ordered)
- Files to create or modify
- Key design decisions
- Risks and edge cases
`,
}

/** SubAgent 专用模板 */
const TEMPLATE_SUBAGENT: AgentTemplate = {
  templateId: 'subagent',
  name: 'SubAgent 专用型',
  description: '专门作为子 Agent 使用，不出现在主 Agent 选择器中',
  useCase: '被主 Agent 派发的专项子任务',
  frontmatterTemplate: `mode = "subagent"
when_to_use = "描述这个子 Agent 擅长处理的专项任务类型"
model_preference = "fast"

[tool_policy]
mode = "include"
tools = ["read_file", "grep", "glob"]`,
  bodyTemplate: `You are a specialized sub-agent handling a specific task.

Focus on the assigned task only. Do not expand scope.
`,
}

/** 主 Agent 专用模板 */
const TEMPLATE_PRIMARY: AgentTemplate = {
  templateId: 'primary',
  name: '主 Agent 专用型',
  description: '只出现在主 Agent 选择器，不作为子 Agent 使用',
  useCase: '特定场景的主 Agent 角色',
  frontmatterTemplate: `mode = "primary"
when_to_use = "描述适合用此 Agent 作为主 Agent 的场景"

[tool_policy]
mode = "exclude"
tools = []`,
  bodyTemplate: `You are a primary agent for a specific workflow.

Orchestrate tasks and delegate to sub-agents when appropriate.
`,
}

/** 空白模板（仅含必填字段） */
const TEMPLATE_BLANK: AgentTemplate = {
  templateId: 'blank',
  name: '空白模板',
  description: '从最小必填字段开始，完全自定义',
  useCase: '完全自定义',
  frontmatterTemplate: `mode = "all"
when_to_use = "描述何时使用这个 Agent"

[tool_policy]
mode = "exclude"
tools = []`,
  bodyTemplate: `# 系统提示词

在这里编写你的自定义 Agent 提示词...
`,
}

// ═══════════════════════════════════════════════
// 导出接口
// ═══════════════════════════════════════════════

/** 所有内置模板 */
export const BUILTIN_TEMPLATES: AgentTemplate[] = [
  TEMPLATE_GENERAL,
  TEMPLATE_EXPLORE,
  TEMPLATE_PLAN,
  TEMPLATE_SUBAGENT,
  TEMPLATE_PRIMARY,
  TEMPLATE_BLANK,
]

function escapeTomlString(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
}

/**
 * 根据模板 id 查找模板。
 * 未找到返回 undefined。
 */
export function findTemplate(templateId: string): AgentTemplate | undefined {
  return BUILTIN_TEMPLATES.find(t => t.templateId === templateId)
}

/**
 * 从模板生成完整的 agent 文件内容。
 *
 * @param template - 使用的模板
 * @param id - 新 agent 的 id（必须合法：小写英文/数字/连字符）
 * @param name - 新 agent 的显示名称
 * @param summary - 新 agent 的副标题描述
 */
export function renderTemplate(
  template: AgentTemplate,
  id: string,
  name: string,
  summary: string,
): string {
  const frontmatter = `id = "${escapeTomlString(id)}"
name = "${escapeTomlString(name)}"
summary = "${escapeTomlString(summary)}"
${template.frontmatterTemplate}`

  return `---\n${frontmatter}\n---\n\n${template.bodyTemplate}`
}

/**
 * 生成空白 agent 文件内容（最小必填字段）。
 *
 * @param id - 新 agent 的 id
 * @param name - 新 agent 的显示名称
 */
export function renderBlankAgent(id: string, name: string): string {
  return renderTemplate(TEMPLATE_BLANK, id, name, `${name} 的自定义 Agent`)
}
