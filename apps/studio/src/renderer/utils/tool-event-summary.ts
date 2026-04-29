export type ToolEventSeverity = 'normal' | 'warning' | 'error'
import { normalizeToolName } from './tool-classification'

export interface ToolEventSummary {
  title: string
  target: string | null
  detail: string | null
  severity: ToolEventSeverity
}

const COMMAND_TARGET_MAX_LENGTH = 80

function getStringArg(args: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = args[key]
    if (typeof value === 'string' && value.trim()) {
      return value
    }
  }
  return null
}

function getPathLeaf(pathValue: string | null): string | null {
  if (!pathValue) {
    return null
  }

  const normalized = pathValue.replace(/\\/g, '/').replace(/\/+$/, '')
  const segments = normalized.split('/')
  return segments[segments.length - 1] ?? normalized
}

export function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value
  }
  return `${value.slice(0, maxLength)}…`
}

function countLines(value: string): number {
  if (value.length === 0) {
    return 0
  }
  return value.split(/\r\n|\r|\n/).length
}

function resolveFileTarget(args: Record<string, unknown>): string | null {
  return getPathLeaf(getStringArg(args, ['path', 'file', 'targetPath', 'filePath']))
}

function resolveGitTarget(args: Record<string, unknown>): string | null {
  const subcommand = getStringArg(args, ['subcommand'])
  const file = getStringArg(args, ['file'])
  const branch = getStringArg(args, ['branch_name', 'target'])
  const ref = getStringArg(args, ['ref'])
  const pieces = [subcommand, file ?? branch ?? ref].filter(Boolean)
  return pieces.length > 0 ? truncateText(pieces.join(' '), COMMAND_TARGET_MAX_LENGTH) : null
}

function extractToolPolicySuggestion(resultSummary?: string | null): string | null {
  const summary = resultSummary?.trim()
  if (!summary) {
    return null
  }

  const lines = summary.split(/\r\n|\r|\n/).map((line) => line.trim()).filter(Boolean)
  const policyLine = lines.find((line) => line.includes('工具策略提示'))
  if (!policyLine) {
    return null
  }

  const suggestedToolLine = lines.find((line) => /^建议工具[:：]/.test(line))
  const normalizedPolicyLine = policyLine.replace(/^\[工具策略提示\]\s*/, '')
  const suggestion = suggestedToolLine
    ? `${normalizedPolicyLine}（${suggestedToolLine}）`
    : normalizedPolicyLine
  return truncateText(suggestion, 120)
}

export function createToolEventSummary(
  toolName: string,
  args: Record<string, unknown>,
  resultSummary?: string | null,
): ToolEventSummary {
  const normalizedToolName = normalizeToolName(toolName)

  switch (normalizedToolName) {
    case 'write_file': {
      const content = typeof args['content'] === 'string' ? args['content'] : null
      return {
        title: '写入文件',
        target: resolveFileTarget(args),
        detail: content === null ? null : `${content.length} 字符 / ${countLines(content)} 行`,
        severity: 'normal',
      }
    }

    case 'read_file':
      return {
        title: '读取文件',
        target: resolveFileTarget(args),
        detail: null,
        severity: 'normal',
      }

    case 'grep':
      return {
        title: '搜索代码',
        target: getStringArg(args, ['pattern', 'query', 'search']) ?? null,
        detail: resolveFileTarget(args),
        severity: 'normal',
      }

    case 'glob':
      return {
        title: '匹配文件',
        target: getStringArg(args, ['pattern', 'glob']) ?? null,
        detail: getStringArg(args, ['cwd', 'basePath']),
        severity: 'normal',
      }

    case 'list':
    case 'list_dir':
    case 'list_files':
      return {
        title: '列出目录',
        target: resolveFileTarget(args),
        detail: null,
        severity: 'normal',
      }

    case 'fast_context':
      return {
        title: '收集上下文',
        target: getStringArg(args, ['query', 'pattern']) ?? null,
        detail: null,
        severity: 'normal',
      }

    case 'fetch':
    case 'web':
    case 'research_web':
      return {
        title: '检索网页',
        target: getStringArg(args, ['url', 'query']) ?? null,
        detail: null,
        severity: 'normal',
      }

    case 'edit_file': {
      const oldValue = getStringArg(args, ['old_str', 'oldString'])
      const newValue = getStringArg(args, ['new_str', 'newString'])
      const detail = newValue
        ? `${newValue.length} 字符 / ${countLines(newValue)} 行新内容`
        : oldValue
          ? `${oldValue.length} 字符待替换`
          : null
      return {
        title: '编辑文件',
        target: resolveFileTarget(args),
        detail,
        severity: 'normal',
      }
    }

    case 'bash': {
      const command = getStringArg(args, ['command'])
      const policySuggestion = extractToolPolicySuggestion(resultSummary)
      return {
        title: '执行命令',
        target: command ? truncateText(command, COMMAND_TARGET_MAX_LENGTH) : null,
        detail: policySuggestion ?? getStringArg(args, ['cwd']),
        severity: policySuggestion ? 'error' : 'warning',
      }
    }

    case 'git':
      return {
        title: '执行 Git',
        target: resolveGitTarget(args),
        detail: getStringArg(args, ['cwd']),
        severity: 'warning',
      }

    case 'delete_file':
      return {
        title: '删除文件',
        target: resolveFileTarget(args),
        detail: null,
        severity: 'warning',
      }

    case 'mkdir':
      return {
        title: '创建目录',
        target: resolveFileTarget(args),
        detail: null,
        severity: 'normal',
      }

    case 'move_file':
      return {
        title: '移动文件',
        target:
          resolveFileTarget(args) ??
          getStringArg(args, ['sourcePath', 'from']) ??
          null,
        detail: getStringArg(args, ['destinationPath', 'to']),
        severity: 'normal',
      }

    case 'todo_write':
      return {
        title: '更新待办',
        target: null,
        detail: null,
        severity: 'normal',
      }

    case 'dispatch_agent':
      return {
        title: '派遣子代理',
        target: getStringArg(args, ['agentId', 'task']) ?? null,
        detail: null,
        severity: 'warning',
      }

    case 'control_agent':
      return {
        title: '控制子代理',
        target: getStringArg(args, ['agentId', 'action']) ?? null,
        detail: null,
        severity: 'warning',
      }

    case 'memory_write':
      return {
        title: '写入记忆',
        target: getStringArg(args, ['scope', 'path']) ?? null,
        detail: null,
        severity: 'normal',
      }

    default:
      return {
        title: normalizedToolName || toolName,
        target:
          resolveFileTarget(args) ??
          getStringArg(args, ['command', 'query', 'pattern', 'name']) ??
          null,
        detail: resultSummary ? truncateText(resultSummary, 120) : null,
        severity: 'normal',
      }
  }
}

export function createToolRunningStep(
  toolName: string,
  args: Record<string, unknown>,
): string {
  const summary = createToolEventSummary(toolName, args)
  const target = summary.target ? ` ${summary.target}` : ''

  switch (summary.title) {
    case '写入文件':
      return `正在写入${target}`
    case '读取文件':
      return `正在读取${target}`
    case '编辑文件':
      return `正在编辑${target}`
    case '执行命令':
      return '正在执行命令'
    case '执行 Git':
      return '正在执行 Git'
    default:
      return `正在执行 ${summary.title}`
  }
}

export function formatDurationLabel(durationMs?: number): string | null {
  if (durationMs === undefined || durationMs <= 0) {
    return null
  }
  // durationMs < 100ms 通常是首包超时 abort 后重试导致的不合理值，
  // 直接隐藏避免 "<0.1s" 这类令人困惑的显示
  if (durationMs < 100) {
    return null
  }
  if (durationMs < 1000) {
    return `${(durationMs / 1000).toFixed(1)}s`
  }
  return `${(durationMs / 1000).toFixed(1)}s`
}

export function createToolArgumentDetails(
  toolName: string,
  args: Record<string, unknown>,
): Array<{ label: string; value: string }> {
  const summary = createToolEventSummary(toolName, args)
  const details: Array<{ label: string; value: string }> = []

  if (summary.target) {
    details.push({ label: '目标', value: summary.target })
  }
  if (summary.detail) {
    details.push({ label: '详情', value: summary.detail })
  }

  const cwd = getStringArg(args, ['cwd'])
  if (cwd && !details.some((detail) => detail.label === 'cwd')) {
    details.push({ label: 'cwd', value: cwd })
  }

  return details
}
