import type { StudioConversationBlock } from '../../shared/studio-bridge-contract'
import type { SubAgentInfo, SubAgentDetailEvent } from '../components/SubAgentCard'
import {
  isExplorationTool,
  normalizeToolName,
} from './tool-classification'
import { sanitizeConversationBlock } from './conversation-memory-guards'

export interface ToolRowModel {
  id: string
  toolCallId: string
  toolName: string
  normalizedToolName: string
  args: Record<string, unknown>
  status: 'running' | 'done' | 'error'
  success?: boolean
  durationMs?: number
  resultSummary?: string
  resultFull?: string
  agentId?: string
}

export type ConversationRenderRow =
  | { type: 'text'; id: string; content: string }
  | {
      type: 'reasoning'
      id: string
      content: string
      isLive: boolean
      durationMs?: number
      startedAt?: number
      endedAt?: number
    }
  | { type: 'tool_activity_group'; id: string; title: string; running: boolean; tools: ToolRowModel[] }
  | { type: 'tool_action'; id: string; tool: ToolRowModel }
  | { type: 'subagent'; id: string; agent: SubAgentInfo }
  | { type: 'status'; id: string; content: string }
  | { type: 'system'; id: string; content: string; level: 'info' | 'warning' | 'error' }

export interface BuildConversationRenderRowsOptions {
  isRunActive: boolean
}

const FILE_READ_TOOL_NAMES = new Set(['read_file'])
const SEARCH_TOOL_NAMES = new Set([
  'grep',
  'glob',
  'list',
  'list_dir',
  'list_files',
  'fast_context',
  'web',
  'fetch',
  'research_web',
])

function isThinkingBlockOpen(
  block: Extract<StudioConversationBlock, { type: 'thinking' }>,
): boolean {
  return block.endedAt === undefined && block.durationMs === undefined
}

function isFailedTool(tool: ToolRowModel): boolean {
  return tool.status === 'error' || tool.success === false
}

function toToolRowModel(
  block: Extract<StudioConversationBlock, { type: 'tool' }>,
): ToolRowModel {
  const sanitizedBlock = sanitizeConversationBlock(block)
  if (sanitizedBlock.type !== 'tool') {
    return {
      id: block.id,
      toolCallId: block.toolCallId,
      toolName: block.toolName,
      normalizedToolName: normalizeToolName(block.toolName),
      args: block.args,
      status: block.status,
    }
  }

  return {
    id: sanitizedBlock.id,
    toolCallId: sanitizedBlock.toolCallId,
    toolName: sanitizedBlock.toolName,
    normalizedToolName: normalizeToolName(sanitizedBlock.toolName),
    args: sanitizedBlock.args,
    status: sanitizedBlock.status,
    ...(sanitizedBlock.success === undefined
      ? {}
      : { success: sanitizedBlock.success }),
    ...(sanitizedBlock.durationMs === undefined
      ? {}
      : { durationMs: sanitizedBlock.durationMs }),
    ...(sanitizedBlock.resultSummary === undefined
      ? {}
      : { resultSummary: sanitizedBlock.resultSummary }),
    ...(sanitizedBlock.resultFull === undefined
      ? {}
      : { resultFull: sanitizedBlock.resultFull }),
    ...(sanitizedBlock.agentId === undefined
      ? {}
      : { agentId: sanitizedBlock.agentId }),
  }
}

/**
 * 是否所有工具都属于 exploration 类（read/grep/list/...）。
 * 用于决定 group title 走 exploration 文案还是通用文案。
 */
function isAllExplorationTools(tools: ToolRowModel[]): boolean {
  return tools.every((tool) => isExplorationTool(tool.toolName))
}

function countRunningTools(tools: ToolRowModel[]): number {
  return tools.filter((tool) => tool.status === 'running').length
}

function createGroupTitle(tools: ToolRowModel[], running: boolean): string {
  const normalizedNames = tools.map((tool) => tool.normalizedToolName)
  const allFileReads = normalizedNames.every((name) => FILE_READ_TOOL_NAMES.has(name))
  const hasSearchLikeTool = normalizedNames.some((name) => SEARCH_TOOL_NAMES.has(name))
  const allExploration = isAllExplorationTools(tools)
  const runningCount = countRunningTools(tools)
  const total = tools.length

  // 全部读文件：保持原有"读取 N 个文件"文案
  if (allFileReads) {
    return `${running ? '正在读取' : '已读取'} ${total} 个文件`
  }
  // 包含搜索类：保持"搜索代码库"语义
  if (hasSearchLikeTool && allExploration) {
    return running ? '正在搜索代码库' : '已搜索代码库'
  }
  // 全 exploration（多种混合）：原有"探索操作"文案
  if (allExploration) {
    return `${running ? '正在处理' : '已处理'} ${total} 个探索操作`
  }
  // 通用并行批次：明确标出 N/M 进度，让用户一眼看到并行执行的进度
  if (running && runningCount > 0) {
    const completed = total - runningCount
    return `正在并行执行 ${total} 个操作（${completed}/${total} 已完成）`
  }
  return `已执行 ${total} 个操作`
}

function resolveLiveThinkingIndex(
  blocks: StudioConversationBlock[],
  isRunActive: boolean,
): number {
  if (!isRunActive) {
    return -1
  }

  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const block = blocks[index]
    if (!block) {
      continue
    }
    if (block.type === 'thinking') {
      return isThinkingBlockOpen(block) ? index : -1
    }
    if (
      block.type === 'text' ||
      block.type === 'tool' ||
      block.type === 'status' ||
      block.type === 'system'
    ) {
      return -1
    }
  }

  return -1
}

export function buildConversationRenderRows(
  blocks: StudioConversationBlock[],
  options: BuildConversationRenderRowsOptions,
): ConversationRenderRow[] {
  const rows: ConversationRenderRow[] = []
  const liveThinkingIndex = resolveLiveThinkingIndex(blocks, options.isRunActive)

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index]
    if (!block) {
      continue
    }

    switch (block.type) {
      case 'text': {
        let content = block.content
        let nextIndex = index + 1
        while (true) {
          const nextBlock = blocks[nextIndex]
          if (nextBlock?.type !== 'text') {
            break
          }
          content += nextBlock.content
          nextIndex += 1
        }
        rows.push({
          type: 'text',
          id: block.id,
          content,
        })
        index = nextIndex - 1
        break
      }

      case 'thinking':
        rows.push({
          type: 'reasoning',
          id: block.id,
          content: block.content,
          isLive: index === liveThinkingIndex,
          ...(block.durationMs === undefined ? {} : { durationMs: block.durationMs }),
          ...(block.startedAt === undefined ? {} : { startedAt: block.startedAt }),
          ...(block.endedAt === undefined ? {} : { endedAt: block.endedAt }),
        })
        break

      case 'tool': {
        const firstTool = toToolRowModel(block)

        // 失败的工具单独显示（保留 ToolActionRow 的失败摘要）
        if (isFailedTool(firstTool)) {
          rows.push({
            type: 'tool_action',
            id: `tool:${block.id}`,
            tool: firstTool,
          })
          break
        }

        // 收集连续的非失败工具：原本只合并 exploration，
        // 现在扩展为"任意连续 ≥2 个非失败工具"，让并行 write_file / bash 等
        // 也能在 UI 上体现批次进度。
        const groupedTools: ToolRowModel[] = [firstTool]
        let nextIndex = index + 1
        while (true) {
          const nextBlock = blocks[nextIndex]
          if (nextBlock?.type !== 'tool') {
            break
          }
          const nextTool = toToolRowModel(nextBlock)
          if (isFailedTool(nextTool)) {
            break
          }
          groupedTools.push(nextTool)
          nextIndex += 1
        }

        // 单个工具：保持单行显示，避免无谓的"展开"
        if (groupedTools.length === 1) {
          rows.push({
            type: 'tool_action',
            id: `tool:${block.id}`,
            tool: firstTool,
          })
          break
        }

        // 仅当全部 exploration 时按 exploration 语义合并；
        // 其他情况只在"有 ≥2 个 running"时合并为通用并行批次，
        // 让历史完成的混合工具仍按单行展示，避免视觉过度合并。
        const allExploration = isAllExplorationTools(groupedTools)
        const runningCount = countRunningTools(groupedTools)
        const shouldGroup = allExploration || runningCount >= 2

        if (!shouldGroup) {
          rows.push({
            type: 'tool_action',
            id: `tool:${block.id}`,
            tool: firstTool,
          })
          break
        }

        const running = runningCount > 0
        rows.push({
          type: 'tool_activity_group',
          id: `tool-activity:${block.id}`,
          title: createGroupTitle(groupedTools, running),
          running,
          tools: groupedTools,
        })
        index = nextIndex - 1
        break
      }

      case 'status':
        rows.push({
          type: 'status',
          id: block.id,
          content: block.content,
        })
        break

      case 'system':
        rows.push({
          type: 'system',
          id: block.id,
          content: block.content,
          level: block.level,
        })
        break
    }
  }

  return rows
}
