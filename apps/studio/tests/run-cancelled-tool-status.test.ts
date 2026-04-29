/**
 * Bug 2 探索性测试 — run_cancelled 后工具块状态未更新。
 *
 * 验证 handleRuntimeEvent 处理 run_cancelled 事件时，
 * 应将所有 pending/running 状态的工具块标记为 error 并设置 resultSummary 为 '已取消'。
 *
 * 此测试在未修复代码上 **预期失败**，失败即证明 bug 存在。
 *
 * **Validates: Requirements 1.2, 1.3, 2.2, 2.3**
 */

import { describe, expect, it, beforeEach } from 'vitest'
import { useRuntimeStore } from '../src/renderer/stores/runtime-store'
import type { StudioRuntimeEvent } from '../src/shared/studio-bridge-contract'

function makeEvent(
  type: string,
  payload?: Record<string, unknown>,
): StudioRuntimeEvent {
  return {
    type: type as StudioRuntimeEvent['type'],
    timestamp: new Date().toISOString(),
    ...(payload !== undefined ? { payload } : {}),
  }
}

function getToolBlocks() {
  const { liveConversation } = useRuntimeStore.getState()
  return liveConversation.blocks.filter((b) => b.type === 'tool')
}

describe('Bug Condition: run_cancelled 未同步工具块状态', () => {
  beforeEach(() => {
    useRuntimeStore.getState().resetRuntimeState()
    // 模拟 run 已开始
    useRuntimeStore.getState().handleRuntimeEvent(makeEvent('run_started', {}))
  })

  /**
   * 设置 store 中包含指定状态的工具块。
   * 通过事件序列模拟真实的工具生命周期来创建工具块。
   */
  function setupToolBlock(
    toolCallId: string,
    toolName: string,
    targetStatus: 'pending' | 'running',
  ) {
    const store = useRuntimeStore.getState()

    // 创建 pending 工具壳
    store.handleRuntimeEvent(
      makeEvent('tool_intent', { toolName, toolCallId }),
    )

    // 如果目标是 running，再发送 tool_start
    if (targetStatus === 'running') {
      store.handleRuntimeEvent(
        makeEvent('tool_start', {
          toolName,
          toolCallId,
          args: { path: 'test.ts' },
        }),
      )
    }
  }

  it('run_cancelled 后 pending 工具块应变为 error 且 resultSummary 为 "已取消"', () => {
    // 设置一个 pending 工具块
    setupToolBlock('tc-pending-1', 'read_file', 'pending')

    // 确认初始状态
    const beforeTools = getToolBlocks()
    expect(beforeTools).toHaveLength(1)
    expect(beforeTools[0]).toMatchObject({
      type: 'tool',
      toolCallId: 'tc-pending-1',
      status: 'pending',
    })

    // 触发 run_cancelled 事件
    useRuntimeStore.getState().handleRuntimeEvent(
      makeEvent('run_cancelled', {}),
    )

    // 断言：pending 工具块应变为 error，resultSummary 为 '已取消'
    const afterTools = getToolBlocks()
    expect(afterTools).toHaveLength(1)
    expect(afterTools[0]).toMatchObject({
      type: 'tool',
      toolCallId: 'tc-pending-1',
      status: 'error',
      resultSummary: '已取消',
    })
  })

  it('run_cancelled 后 running 工具块应变为 error 且 resultSummary 为 "已取消"', () => {
    // 设置一个 running 工具块
    setupToolBlock('tc-running-1', 'edit_file', 'running')

    // 确认初始状态
    const beforeTools = getToolBlocks()
    expect(beforeTools).toHaveLength(1)
    expect(beforeTools[0]).toMatchObject({
      type: 'tool',
      toolCallId: 'tc-running-1',
      status: 'running',
    })

    // 触发 run_cancelled 事件
    useRuntimeStore.getState().handleRuntimeEvent(
      makeEvent('run_cancelled', {}),
    )

    // 断言：running 工具块应变为 error，resultSummary 为 '已取消'
    const afterTools = getToolBlocks()
    expect(afterTools).toHaveLength(1)
    expect(afterTools[0]).toMatchObject({
      type: 'tool',
      toolCallId: 'tc-running-1',
      status: 'error',
      resultSummary: '已取消',
    })
  })

  it('run_cancelled 后混合 pending 和 running 工具块均应变为 error', () => {
    // 设置一个 pending 和一个 running 工具块
    setupToolBlock('tc-p', 'read_file', 'pending')
    setupToolBlock('tc-r', 'write_file', 'running')

    // 确认初始状态
    const beforeTools = getToolBlocks()
    expect(beforeTools).toHaveLength(2)
    expect(beforeTools[0]).toMatchObject({ toolCallId: 'tc-p', status: 'pending' })
    expect(beforeTools[1]).toMatchObject({ toolCallId: 'tc-r', status: 'running' })

    // 触发 run_cancelled 事件
    useRuntimeStore.getState().handleRuntimeEvent(
      makeEvent('run_cancelled', {}),
    )

    // 断言：所有 pending/running 工具块均应变为 error
    const afterTools = getToolBlocks()
    expect(afterTools).toHaveLength(2)
    for (const tool of afterTools) {
      if (tool.type === 'tool') {
        expect(tool.status).toBe('error')
        expect(tool.resultSummary).toBe('已取消')
      }
    }
  })
})


/**
 * 保持性测试 — 已终结工具块（done/error）在 run_cancelled 后状态不变。
 *
 * 验证 run_cancelled 事件处理不会修改已处于 done 或 error 状态的工具块。
 * 此测试在未修复代码上 **预期通过**（因为当前代码不修改任何工具块，done/error 自然保持不变）。
 *
 * **Validates: Requirements 3.2, 3.3, 3.5**
 */

import * as fc from 'fast-check'

/**
 * 通过事件序列模拟工具块的完整生命周期，创建指定终态的工具块。
 *
 * - pending: tool_intent
 * - running: tool_intent → tool_start
 * - done: tool_intent → tool_start → tool_end(success=true)
 * - error: tool_intent → tool_start → tool_end(success=false)
 */
function setupToolBlockWithStatus(
  toolCallId: string,
  toolName: string,
  targetStatus: 'pending' | 'running' | 'done' | 'error',
) {
  const store = useRuntimeStore.getState()

  // 创建 pending 工具壳
  store.handleRuntimeEvent(
    makeEvent('tool_intent', { toolName, toolCallId }),
  )

  if (targetStatus === 'pending') return

  // pending → running
  store.handleRuntimeEvent(
    makeEvent('tool_start', {
      toolName,
      toolCallId,
      args: { path: 'test.ts' },
    }),
  )

  if (targetStatus === 'running') return

  // running → done 或 error
  store.handleRuntimeEvent(
    makeEvent('tool_end', {
      toolCallId,
      success: targetStatus === 'done',
      resultSummary: targetStatus === 'done' ? '执行成功' : '执行失败',
      durationMs: 100,
    }),
  )
}

describe('Preservation: 已终结工具块在 run_cancelled 后状态不变', () => {
  beforeEach(() => {
    useRuntimeStore.getState().resetRuntimeState()
    useRuntimeStore.getState().handleRuntimeEvent(makeEvent('run_started', {}))
  })

  it('done 状态的工具块在 run_cancelled 后保持 done', () => {
    setupToolBlockWithStatus('tc-done-1', 'read_file', 'done')

    const beforeTools = getToolBlocks()
    expect(beforeTools).toHaveLength(1)
    expect(beforeTools[0]).toMatchObject({
      toolCallId: 'tc-done-1',
      status: 'done',
      resultSummary: '执行成功',
    })

    // 触发 run_cancelled
    useRuntimeStore.getState().handleRuntimeEvent(
      makeEvent('run_cancelled', {}),
    )

    // done 工具块应保持不变
    const afterTools = getToolBlocks()
    expect(afterTools).toHaveLength(1)
    expect(afterTools[0]).toMatchObject({
      toolCallId: 'tc-done-1',
      status: 'done',
      resultSummary: '执行成功',
    })
  })

  it('error 状态的工具块在 run_cancelled 后保持 error', () => {
    setupToolBlockWithStatus('tc-err-1', 'write_file', 'error')

    const beforeTools = getToolBlocks()
    expect(beforeTools).toHaveLength(1)
    expect(beforeTools[0]).toMatchObject({
      toolCallId: 'tc-err-1',
      status: 'error',
      resultSummary: '执行失败',
    })

    // 触发 run_cancelled
    useRuntimeStore.getState().handleRuntimeEvent(
      makeEvent('run_cancelled', {}),
    )

    // error 工具块应保持不变
    const afterTools = getToolBlocks()
    expect(afterTools).toHaveLength(1)
    expect(afterTools[0]).toMatchObject({
      toolCallId: 'tc-err-1',
      status: 'error',
      resultSummary: '执行失败',
    })
  })

  it('混合 done 和 error 工具块在 run_cancelled 后均保持原状态', () => {
    setupToolBlockWithStatus('tc-d', 'read_file', 'done')
    setupToolBlockWithStatus('tc-e', 'edit_file', 'error')

    const beforeTools = getToolBlocks()
    expect(beforeTools).toHaveLength(2)
    expect(beforeTools[0]).toMatchObject({ toolCallId: 'tc-d', status: 'done' })
    expect(beforeTools[1]).toMatchObject({ toolCallId: 'tc-e', status: 'error' })

    // 触发 run_cancelled
    useRuntimeStore.getState().handleRuntimeEvent(
      makeEvent('run_cancelled', {}),
    )

    const afterTools = getToolBlocks()
    expect(afterTools).toHaveLength(2)
    expect(afterTools[0]).toMatchObject({ toolCallId: 'tc-d', status: 'done' })
    expect(afterTools[1]).toMatchObject({ toolCallId: 'tc-e', status: 'error' })
  })

  /**
   * 属性测试：对任意工具块组合，run_cancelled 后 done/error 块保持不变。
   *
   * 生成 0-15 个工具块，每个随机分配 pending/running/done/error 状态。
   * 不变量：done/error 块的 status 和 resultSummary 在 run_cancelled 前后完全一致。
   *
   * **Validates: Requirements 3.2, 3.3, 3.5**
   */
  it('PBT: 对任意工具块组合，run_cancelled 后 done/error 块保持不变', () => {
    const toolStatusArb = fc.constantFrom(
      'pending' as const,
      'running' as const,
      'done' as const,
      'error' as const,
    )

    const toolBlockSpecArb = fc.array(toolStatusArb, { minLength: 0, maxLength: 15 })

    fc.assert(
      fc.property(toolBlockSpecArb, (statusList) => {
        // 每次迭代重置 store
        useRuntimeStore.getState().resetRuntimeState()
        useRuntimeStore.getState().handleRuntimeEvent(makeEvent('run_started', {}))

        // 按 statusList 创建工具块
        statusList.forEach((status, i) => {
          setupToolBlockWithStatus(`tc-pbt-${i}`, 'read_file', status)
        })

        // 记录 run_cancelled 前 done/error 块的快照
        const beforeTools = getToolBlocks()
        const terminalBefore = beforeTools
          .filter((b) => b.type === 'tool' && (b.status === 'done' || b.status === 'error'))
          .map((b) => {
            if (b.type !== 'tool') return null
            return {
              toolCallId: b.toolCallId,
              status: b.status,
              resultSummary: b.resultSummary,
            }
          })

        // 触发 run_cancelled
        useRuntimeStore.getState().handleRuntimeEvent(
          makeEvent('run_cancelled', {}),
        )

        // 验证不变量：done/error 块的 status 和 resultSummary 不变
        const afterTools = getToolBlocks()
        const terminalAfter = afterTools
          .filter((b) => b.type === 'tool' && (b.status === 'done' || b.status === 'error'))

        // done/error 块数量应 >= 之前的数量（修复后 pending/running 也会变成 error，
        // 但在未修复代码上它们保持原状态，所以 done/error 数量不变）
        // 核心不变量：之前的每个 done/error 块在之后仍然保持相同状态
        for (const before of terminalBefore) {
          if (!before) continue
          const after = afterTools.find(
            (b) => b.type === 'tool' && b.toolCallId === before.toolCallId,
          )
          // 块必须仍然存在
          expect(after).toBeDefined()
          if (after && after.type === 'tool') {
            // status 不变
            expect(after.status).toBe(before.status)
            // resultSummary 不变
            expect(after.resultSummary).toBe(before.resultSummary)
          }
        }
      }),
      { numRuns: 100 },
    )
  })
})
