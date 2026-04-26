import { describe, expect, it } from 'vitest'
import {
  FINALIZED_RUN_IDS_LIMIT,
  addFinalizedRunIdToLruSet,
} from '../src/renderer/hooks/useStudioBridge'

describe('addFinalizedRunIdToLruSet — LRU 上限', () => {
  it('小于上限时按插入顺序保留全部 runId', () => {
    const set = new Set<string>()
    addFinalizedRunIdToLruSet(set, 'run-1', 3)
    addFinalizedRunIdToLruSet(set, 'run-2', 3)
    addFinalizedRunIdToLruSet(set, 'run-3', 3)

    expect([...set]).toEqual(['run-1', 'run-2', 'run-3'])
  })

  it('超过上限时淘汰最老的 runId，保留最新的 N 个', () => {
    const set = new Set<string>()
    addFinalizedRunIdToLruSet(set, 'run-1', 3)
    addFinalizedRunIdToLruSet(set, 'run-2', 3)
    addFinalizedRunIdToLruSet(set, 'run-3', 3)
    addFinalizedRunIdToLruSet(set, 'run-4', 3)

    expect(set.size).toBe(3)
    expect(set.has('run-1')).toBe(false)
    expect([...set]).toEqual(['run-2', 'run-3', 'run-4'])
  })

  it('重新插入已存在的 runId 会把它移到 LRU 尾部，避免被错误淘汰', () => {
    const set = new Set<string>()
    addFinalizedRunIdToLruSet(set, 'run-1', 3)
    addFinalizedRunIdToLruSet(set, 'run-2', 3)
    addFinalizedRunIdToLruSet(set, 'run-3', 3)
    // 重新触摸 run-1，它应该跳到尾部
    addFinalizedRunIdToLruSet(set, 'run-1', 3)
    addFinalizedRunIdToLruSet(set, 'run-4', 3)

    expect(set.size).toBe(3)
    expect(set.has('run-1')).toBe(true) // 仍在
    expect(set.has('run-2')).toBe(false) // 现在最老的是 run-2
    expect([...set]).toEqual(['run-3', 'run-1', 'run-4'])
  })

  it('生产默认上限（FINALIZED_RUN_IDS_LIMIT）能拦住几千次 run 的累积', () => {
    const set = new Set<string>()
    for (let index = 0; index < 5_000; index += 1) {
      addFinalizedRunIdToLruSet(set, `run-${index}`, FINALIZED_RUN_IDS_LIMIT)
    }
    expect(set.size).toBe(FINALIZED_RUN_IDS_LIMIT)
    expect(set.has('run-0')).toBe(false)
    expect(set.has('run-4999')).toBe(true)
  })
})
