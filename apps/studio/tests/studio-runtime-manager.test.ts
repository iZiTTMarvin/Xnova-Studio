import { describe, expect, it, vi } from 'vitest'
import { createStudioRuntimeManager } from '../src/main/studio-runtime-manager'
import type {
  StudioManagedRuntimeEntry,
} from '../src/main/studio-runtime-manager'
import type {
  EngineServiceApi,
  RuntimeConfigInput,
  RuntimeHostBridge,
  RuntimeInstance,
} from '@xnova/runtime'

// 测试用占位 EngineServiceApi。LRU 测试只关心 RuntimeInstance 生命周期，
// 不直接调用 engineService 的方法，因此用 `as unknown as EngineServiceApi` 即可。
function createStubEngineServiceApi(): EngineServiceApi {
  return {} as unknown as EngineServiceApi
}

function makeRuntimeInstance(): RuntimeInstance & {
  disposeMock: ReturnType<typeof vi.fn>
} {
  const disposeMock = vi.fn(async () => undefined)
  const instance: RuntimeInstance = {
    submit: vi.fn(),
    abort: vi.fn(),
    dispose: disposeMock,
    getSnapshot: () => ({
      sessionId: null,
      isRunning: false,
      provider: 'openai',
      model: 'gpt-4.1-mini',
      warnings: [],
    }),
  }
  return Object.assign(instance, { disposeMock })
}

function buildRuntimeConfig(): RuntimeConfigInput['config'] {
  return {
    defaultProvider: 'openai',
    defaultModel: 'gpt-4.1-mini',
    providers: {
      openai: {
        apiKey: '',
        models: ['gpt-4.1-mini'],
      },
    },
  }
}

describe('createStudioRuntimeManager — LRU 淘汰', () => {
  it('切换到第 N+1 个 selection 时，最老的 idle 实例会被 dispose 并清出 Map', async () => {
    const created: Array<ReturnType<typeof makeRuntimeInstance>> = []
    const evicted: StudioManagedRuntimeEntry[] = []

    const manager = createStudioRuntimeManager({
      createEngineServiceApiFn: () => createStubEngineServiceApi(),
      maxIdleEntries: 1,
      onEvict: (entry) => evicted.push(entry),
    })

    const createRuntimeFn = vi.fn(async () => {
      const next = makeRuntimeInstance()
      created.push(next)
      return next
    })
    const createBridge = (): RuntimeHostBridge => ({
      emit: vi.fn(),
      requestPermission: async () => ({ allow: true }),
    })

    const baseHostState = {
      workspacePath: 'D:/workspace/demo',
      lastSelection: null,
    } as Parameters<typeof manager.acquireRuntime>[0]['hostState']

    // selection A
    const acquiredA = await manager.acquireRuntime({
      selection: {
        cwd: 'D:/workspace/demo',
        workspaceRoot: 'D:/workspace/demo',
        sessionId: 'session-a',
        agentId: 'agent-x',
      },
      config: buildRuntimeConfig(),
      hostState: baseHostState,
      emitRuntimeEvent: vi.fn(),
      createRuntimeFn,
      createBridge,
    })
    manager.releaseRuntime(acquiredA.entry)

    // selection B：A 现在是 idle，maxIdleEntries=1 仍可保留
    const acquiredB = await manager.acquireRuntime({
      selection: {
        cwd: 'D:/workspace/demo',
        workspaceRoot: 'D:/workspace/demo',
        sessionId: 'session-b',
        agentId: 'agent-x',
      },
      config: buildRuntimeConfig(),
      hostState: baseHostState,
      emitRuntimeEvent: vi.fn(),
      createRuntimeFn,
      createBridge,
    })
    manager.releaseRuntime(acquiredB.entry)

    expect(manager.getEntryCount()).toBe(2)
    expect(evicted).toHaveLength(0)

    // selection C：A 与 B 都是 idle，maxIdleEntries=1 → A（最老）被淘汰
    const acquiredC = await manager.acquireRuntime({
      selection: {
        cwd: 'D:/workspace/demo',
        workspaceRoot: 'D:/workspace/demo',
        sessionId: 'session-c',
        agentId: 'agent-x',
      },
      config: buildRuntimeConfig(),
      hostState: baseHostState,
      emitRuntimeEvent: vi.fn(),
      createRuntimeFn,
      createBridge,
    })
    manager.releaseRuntime(acquiredC.entry)

    expect(manager.getEntryCount()).toBe(2)
    expect(evicted).toHaveLength(1)
    expect(evicted[0]?.selection.sessionId).toBe('session-a')
    // 淘汰的实例必须被 dispose
    expect(created[0]?.disposeMock).toHaveBeenCalledTimes(1)
    expect(created[1]?.disposeMock).not.toHaveBeenCalled()
    expect(created[2]?.disposeMock).not.toHaveBeenCalled()
  })

  it('当前 active 的 entry 不会被 LRU 淘汰，即使 idle 数量已超过上限', async () => {
    const evicted: StudioManagedRuntimeEntry[] = []
    const manager = createStudioRuntimeManager({
      createEngineServiceApiFn: () => createStubEngineServiceApi(),
      maxIdleEntries: 0,
      onEvict: (entry) => evicted.push(entry),
    })

    const createRuntimeFn = vi.fn(async () => makeRuntimeInstance())
    const createBridge = (): RuntimeHostBridge => ({
      emit: vi.fn(),
      requestPermission: async () => ({ allow: true }),
    })

    const baseHostState = {
      workspacePath: 'D:/workspace/demo',
      lastSelection: null,
    } as Parameters<typeof manager.acquireRuntime>[0]['hostState']

    // 仅 acquire（不 release）→ 它是 active，不应被淘汰
    await manager.acquireRuntime({
      selection: {
        cwd: 'D:/workspace/demo',
        workspaceRoot: 'D:/workspace/demo',
        sessionId: 'session-active',
        agentId: 'agent-x',
      },
      config: buildRuntimeConfig(),
      hostState: baseHostState,
      emitRuntimeEvent: vi.fn(),
      createRuntimeFn,
      createBridge,
    })

    expect(manager.getEntryCount()).toBe(1)
    expect(evicted).toHaveLength(0)
  })

  it('dispose() 仍然会清空所有实例', async () => {
    const created: Array<ReturnType<typeof makeRuntimeInstance>> = []
    const manager = createStudioRuntimeManager({
      createEngineServiceApiFn: () => createStubEngineServiceApi(),
    })

    const createRuntimeFn = vi.fn(async () => {
      const next = makeRuntimeInstance()
      created.push(next)
      return next
    })
    const createBridge = (): RuntimeHostBridge => ({
      emit: vi.fn(),
      requestPermission: async () => ({ allow: true }),
    })
    const baseHostState = {
      workspacePath: 'D:/workspace/demo',
      lastSelection: null,
    } as Parameters<typeof manager.acquireRuntime>[0]['hostState']

    const acquired = await manager.acquireRuntime({
      selection: {
        cwd: 'D:/workspace/demo',
        workspaceRoot: 'D:/workspace/demo',
        sessionId: 'session-final',
        agentId: 'agent-x',
      },
      config: buildRuntimeConfig(),
      hostState: baseHostState,
      emitRuntimeEvent: vi.fn(),
      createRuntimeFn,
      createBridge,
    })
    manager.releaseRuntime(acquired.entry)

    expect(manager.getEntryCount()).toBe(1)
    await manager.dispose()
    expect(manager.getEntryCount()).toBe(0)
    expect(created[0]?.disposeMock).toHaveBeenCalledTimes(1)
  })
})
