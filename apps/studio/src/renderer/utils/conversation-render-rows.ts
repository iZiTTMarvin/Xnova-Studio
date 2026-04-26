import type { StudioConversationBlock } from '../../shared/studio-bridge-contract'
import {
  isExplorationTool,
  normalizeToolName,
} from './tool-classification'

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
  | { type: 'reasoning'; id: string; content: string; isLive: boolean; durationMs?: number }
  | { type: 'tool_activity_group'; id: string; title: string; running: boolean; tools: ToolRowModel[] }
  | { type: 'tool_action'; id: string; tool: ToolRowModel }
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
  return {
    id: block.id,
    toolCallId: block.toolCallId,
    toolName: block.toolName,
    normalizedToolName: normalizeToolName(block.toolName),
    args: block.args,
    status: block.status,
    ...(block.success === undefined ? {} : { success: block.success }),
    ...(block.durationMs === undefined ? {} : { durationMs: block.durationMs }),
    ...(block.resultSummary === undefined ? {} : { resultSummary: block.resultSummary }),
    ...(block.resultFull === undefined ? {} : { resultFull: block.resultFull }),
    ...(block.agentId === undefined ? {} : { agentId: block.agentId }),
  }
}

function canGroupExplorationTool(tool: ToolRowModel): boolean {
  return isExplorationTool(tool.toolName) && !isFailedTool(tool)
}

function createExplorationGroupTitle(tools: ToolRowModel[], running: boolean): string {
  const normalizedNames = tools.map((tool) => tool.normalizedToolName)
  const allFileReads = normalizedNames.every((name) => FILE_READ_TOOL_NAMES.has(name))
  const hasSearchLikeTool = normalizedNames.some((name) => SEARCH_TOOL_NAMES.has(name))

  if (allFileReads) {
    return `${running ? '正在读取' : '已读取'} ${tools.length} 个文件`
  }
  if (hasSearchLikeTool) {
    return running ? '正在搜索代码库' : '已搜索代码库'
  }
  return `${running ? '正在处理' : '已处理'} ${tools.length} 个探索操作`
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
        })
        break

      case 'tool': {
        const firstTool = toToolRowModel(block)
        if (!canGroupExplorationTool(firstTool)) {
          rows.push({
            type: 'tool_action',
            id: `tool:${block.id}`,
            tool: firstTool,
          })
          break
        }

        const groupedTools: ToolRowModel[] = [firstTool]
        let nextIndex = index + 1
        while (true) {
          const nextBlock = blocks[nextIndex]
          if (nextBlock?.type !== 'tool') {
            break
          }
          const nextTool = toToolRowModel(nextBlock)
          if (!canGroupExplorationTool(nextTool)) {
            break
          }
          groupedTools.push(nextTool)
          nextIndex += 1
        }

        if (groupedTools.length === 1) {
          rows.push({
            type: 'tool_action',
            id: `tool:${block.id}`,
            tool: firstTool,
          })
          break
        }

        const running = groupedTools.some((tool) => tool.status === 'running')
        rows.push({
          type: 'tool_activity_group',
          id: `tool-activity:${block.id}`,
          title: createExplorationGroupTitle(groupedTools, running),
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
