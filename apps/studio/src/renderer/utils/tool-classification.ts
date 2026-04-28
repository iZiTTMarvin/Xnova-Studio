const TOOL_NAME_ALIASES: Record<string, string> = {
  readfile: 'read_file',
  writefile: 'write_file',
  editfile: 'edit_file',
  deletefile: 'delete_file',
  fastcontext: 'fast_context',
  listdir: 'list_dir',
  listdirtoplevel: 'list_dir',
  listfiles: 'list_files',
  researchweb: 'research_web',
  todowrite: 'todo_write',
  dispatchagent: 'dispatch_agent',
  controlagent: 'control_agent',
  memorywrite: 'memory_write',
  movefile: 'move_file',
}

const EXPLORATION_TOOL_NAMES = new Set([
  'read_file',
  'readfile',
  'glob',
  'grep',
  'list',
  'list_dir',
  'list_files',
  'fast_context',
  'web',
  'fetch',
  'research_web',
])

const ACTION_TOOL_NAMES = new Set([
  'write_file',
  'edit_file',
  'delete_file',
  'bash',
  'git',
  'todo_write',
  'dispatch_agent',
  'control_agent',
  'memory_write',
  'mkdir',
  'move_file',
])

/**
 * 需要 running 最小可见时间的动作类工具。
 * 这些工具执行速度可能极快（< 100ms），但用户需要感知到"正在执行"的过程。
 * 探索类工具不在此列，避免影响工具组折叠等已有展示行为。
 */
const MIN_VISIBLE_ACTION_TOOL_NAMES = new Set([
  'write_file',
  'edit_file',
  'bash',
  'git',
  'todo_write',
  'dispatch_agent',
])

export function normalizeToolName(toolName: string): string {
  const trimmed = toolName.trim()
  if (!trimmed) {
    return ''
  }

  const normalized = trimmed
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[-\s]+/g, '_')
    .toLowerCase()

  return TOOL_NAME_ALIASES[normalized] ?? normalized
}

export function isExplorationTool(toolName: string): boolean {
  return EXPLORATION_TOOL_NAMES.has(normalizeToolName(toolName))
}

export function isActionTool(toolName: string): boolean {
  const normalizedToolName = normalizeToolName(toolName)
  if (EXPLORATION_TOOL_NAMES.has(normalizedToolName)) {
    return false
  }
  return ACTION_TOOL_NAMES.has(normalizedToolName) || normalizedToolName.length > 0
}

/**
 * 判断工具是否需要 running 最小可见时间。
 * 仅限明确的动作类工具，探索类工具不启用，避免影响工具组聚合逻辑。
 */
export function isMinVisibleActionTool(toolName: string): boolean {
  return MIN_VISIBLE_ACTION_TOOL_NAMES.has(normalizeToolName(toolName))
}
