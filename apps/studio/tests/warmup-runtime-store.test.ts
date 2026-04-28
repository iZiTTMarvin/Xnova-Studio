/**
 * runtime-store warmup 状态测试
 *
 * 覆盖范围：
 * - setWarmupStatus 正确更新状态
 * - resetRuntimeState 重置 warmup 为 idle
 * - warmupStatus 初始值为 idle
 */

import { describe, expect, it } from 'vitest'
import { useRuntimeStore } from '../src/renderer/stores/runtime-store'

describe('runtime-store warmup status', () => {
  it('初始 warmupStatus 为 idle', () => {
    const state = useRuntimeStore.getState()
    expect(state.warmupStatus).toBe('idle')
  })

  it('setWarmupStatus 更新状态', () => {
    const { setWarmupStatus } = useRuntimeStore.getState()

    setWarmupStatus('warming')
    expect(useRuntimeStore.getState().warmupStatus).toBe('warming')

    setWarmupStatus('ready')
    expect(useRuntimeStore.getState().warmupStatus).toBe('ready')

    setWarmupStatus('stale')
    expect(useRuntimeStore.getState().warmupStatus).toBe('stale')

    setWarmupStatus('failed')
    expect(useRuntimeStore.getState().warmupStatus).toBe('failed')

    setWarmupStatus('idle')
    expect(useRuntimeStore.getState().warmupStatus).toBe('idle')
  })

  it('resetRuntimeState 重置 warmupStatus 为 idle', () => {
    const { setWarmupStatus, resetRuntimeState } = useRuntimeStore.getState()

    setWarmupStatus('ready')
    expect(useRuntimeStore.getState().warmupStatus).toBe('ready')

    resetRuntimeState()
    expect(useRuntimeStore.getState().warmupStatus).toBe('idle')
  })
})
