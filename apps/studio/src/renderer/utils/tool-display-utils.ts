/**
 * 工具调用名称智能摘要 — 将原始 toolName + args 转换为可读的一行描述。
 *
 * 示例:
 *   shell_exec + { command: "npm install" }  →  { verb: "Bash", target: "npm install" }
 *   read_file  + { path: "src/index.ts" }    →  { verb: "Read", target: "src/index.ts" }
 */

export interface ToolDisplayLabel {
  /** 动词（如 Read, Edit, Bash, Search） */
  verb: string
  /** 操作对象（文件路径、命令、关键词等） */
  target: string
}

/**
 * 从 args 中提取第一个像文件路径的字符串值。
 * 优先匹配 path / file / filename / filePath 等 key。
 */
function extractPathArg(args: Record<string, unknown>): string | null {
  const pathKeys = ['path', 'file', 'filename', 'filePath', 'file_path', 'target', 'targetFile']
  for (const key of pathKeys) {
    const value = args[key]
    if (typeof value === 'string' && value.trim()) {
      return shortenPath(value.trim())
    }
  }
  return null
}

/**
 * 缩短路径，只保留最后 2 段，避免过长。
 * 例如 d:/projects/xnova/packages/core/src/index.ts → core/src/index.ts
 */
function shortenPath(fullPath: string): string {
  const normalized = fullPath.replace(/\\/g, '/')
  const segments = normalized.split('/').filter(Boolean)
  if (segments.length <= 3) {
    return segments.join('/')
  }
  return segments.slice(-3).join('/')
}

/**
 * 从 args 中提取命令文本。
 */
function extractCommandArg(args: Record<string, unknown>): string | null {
  const commandKeys = ['command', 'cmd', 'script', 'CommandLine']
  for (const key of commandKeys) {
    const value = args[key]
    if (typeof value === 'string' && value.trim()) {
      const trimmed = value.trim()
      // 截断过长命令
      return trimmed.length > 60 ? `${trimmed.slice(0, 57)}…` : trimmed
    }
  }
  return null
}

/**
 * 从 args 中提取搜索关键词。
 */
function extractSearchArg(args: Record<string, unknown>): string | null {
  const searchKeys = ['query', 'pattern', 'keyword', 'search', 'text', 'Query']
  for (const key of searchKeys) {
    const value = args[key]
    if (typeof value === 'string' && value.trim()) {
      const trimmed = value.trim()
      return trimmed.length > 40 ? `${trimmed.slice(0, 37)}…` : trimmed
    }
  }
  return null
}

/** 工具名称到显示动词的映射表 */
const TOOL_VERB_MAP: Record<string, { verb: string; extractor: (args: Record<string, unknown>) => string | null }> = {
  // Shell
  shell_exec: { verb: 'Bash', extractor: extractCommandArg },
  bash: { verb: 'Bash', extractor: extractCommandArg },
  run_command: { verb: 'Bash', extractor: extractCommandArg },

  // 文件读取
  read_file: { verb: 'Read', extractor: extractPathArg },
  file_read: { verb: 'Read', extractor: extractPathArg },
  view_file: { verb: 'Read', extractor: extractPathArg },

  // 文件写入/编辑
  write_file: { verb: 'Write', extractor: extractPathArg },
  file_write: { verb: 'Write', extractor: extractPathArg },
  edit_file: { verb: 'Edit', extractor: extractPathArg },
  replace_file_content: { verb: 'Edit', extractor: extractPathArg },
  multi_replace_file_content: { verb: 'Edit', extractor: extractPathArg },
  write_to_file: { verb: 'Write', extractor: extractPathArg },
  create_file: { verb: 'Create', extractor: extractPathArg },

  // 搜索
  search_files: { verb: 'Search', extractor: extractSearchArg },
  grep: { verb: 'Search', extractor: extractSearchArg },
  grep_search: { verb: 'Search', extractor: extractSearchArg },
  ripgrep: { verb: 'Search', extractor: extractSearchArg },

  // 目录
  list_dir: { verb: 'List', extractor: extractPathArg },
  list_directory: { verb: 'List', extractor: extractPathArg },

  // 浏览器
  browser_navigate: { verb: 'Navigate', extractor: (args) => typeof args.url === 'string' ? args.url : null },
  browser_click: { verb: 'Click', extractor: (args) => typeof args.element === 'string' ? args.element : null },
  browser_type: { verb: 'Type', extractor: (args) => typeof args.text === 'string' ? args.text : null },
}

/**
 * 获取工具调用的可读显示标签。
 */
export function getToolDisplayLabel(
  toolName: string,
  args: Record<string, unknown>,
): ToolDisplayLabel {
  const mapping = TOOL_VERB_MAP[toolName]

  if (mapping) {
    const target = mapping.extractor(args)
    return {
      verb: mapping.verb,
      target: target ?? '',
    }
  }

  // 未知工具 — 尝试从 args 提取任意有用的 key
  const firstStringValue = Object.values(args).find(
    (value): value is string => typeof value === 'string' && value.trim().length > 0,
  )
  const fallbackTarget = firstStringValue
    ? firstStringValue.length > 50 ? `${firstStringValue.slice(0, 47)}…` : firstStringValue
    : ''

  return {
    verb: toolName,
    target: fallbackTarget,
  }
}
