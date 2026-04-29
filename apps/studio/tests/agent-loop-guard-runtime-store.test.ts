import { beforeEach, describe, expect, it } from 'vitest'
import { useRuntimeStore } from '../src/renderer/stores/runtime-store'
import type { StudioRuntimeEvent } from '../src/shared/studio-bridge-contract'

function makeEvent(
  type: StudioRuntimeEvent['type'],
  payload?: Record<string, unknown>,
): StudioRuntimeEvent {
  return {
    type,
    timestamp: new Date().toISOString(),
    ...(payload === undefined ? {} : { payload }),
  }
}

describe('runtime-store AgentLoop guard 可见性', () => {
  beforeEach(() => {
    useRuntimeStore.getState().resetRuntimeState()
  })

  it('预算保护 warning 会进入 live conversation，安全停止不会显示普通完成文案', () => {
    const store = useRuntimeStore.getState()
    store.handleRuntimeEvent(makeEvent('run_started', {}))
    store.handleRuntimeEvent(
      makeEvent('warning', {
        code: 'agent_loop_budget_exceeded',
        message: 'Agent 已达到安全轮次上限，已停止继续调用工具。',
      }),
    )
    store.handleRuntimeEvent(
      makeEvent('run_completed', {
        stopReason: 'budget_exceeded',
      }),
    )

    const { currentRunStep, liveConversation } = useRuntimeStore.getState()
    expect(currentRunStep).toBe('已触发安全停止')
    expect(liveConversation.blocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'system',
          level: 'warning',
          content: 'Agent 已达到安全轮次上限，已停止继续调用工具。',
        }),
        expect.objectContaining({
          type: 'status',
          content: '已触发安全停止',
        }),
      ]),
    )
  })
})
