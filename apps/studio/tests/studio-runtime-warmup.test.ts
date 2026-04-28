import { describe, expect, it, vi } from 'vitest'
import {
  createRuntimeWarmupManager,
  buildWarmupCacheKey,
  type RuntimeWarmupStatusChangedEvent,
  type SnapshotValidateInput,
} from '../src/main/studio-runtime-warmup'
import { normalizeRuntimePath } from '../src/main/normalize-runtime-path'

// ═══ 路径规范化 ═══

describe('normalizeRuntimePath', () => {
  it('反斜杠统一为正斜杠', () => {
    expect(normalizeRuntimePath('D:\\foo\\bar')).toBe('D:/foo/bar')
  })

  it('Windows 盘符统一为大写', () => {
    expect(normalizeRuntimePath('d:/foo/bar')).toBe('D:/foo/bar')
  })

  it('去除末尾斜杠', () => {
    expect(normalizeRuntimePath('D:/foo/bar/')).toBe('D:/foo/bar')
    expect(normalizeRuntimePath('D:/foo/bar\\')).toBe('D:/foo/bar')
  })

  it('保留 Windows 根路径 D:/', () => {
    expect(normalizeRuntimePath('D:/')).toBe('D:/')
    expect(normalizeRuntimePath('d:/')).toBe('D:/')
    expect(normalizeRuntimePath('d:\\')).toBe('D:/')
  })

  it('D:/foo 与 D:\\foo\\ 产生相同结果', () => {
    const a = normalizeRuntimePath('D:/foo')
    const b = normalizeRuntimePath('D:\\foo\\')
    expect(a).toBe(b)
    expect(a).toBe('D:/foo')
  })

  it('去除首尾空白', () => {
    expect(normalizeRuntimePath('  D:/foo  ')).toBe('D:/foo')
  })

  it('空字符串返回空字符串', () => {
    expect(normalizeRuntimePath('')).toBe('')
    expect(normalizeRuntimePath('   ')).toBe('')
  })

  it('Unix 路径不受影响', () => {
    expect(normalizeRuntimePath('/home/user/project')).toBe('/home/user/project')
  })

  it('Unix 路径去除末尾斜杠', () => {
    expect(normalizeRuntimePath('/home/user/project/')).toBe('/home/user/project')
  })
})

// ═══ Cache Key 构建 ═══

describe('buildWarmupCacheKey', () => {
  it('相同路径不同写法产生相同 key', () => {
    const a = buildWarmupCacheKey({ cwd: 'D:/foo' })
    const b = buildWarmupCacheKey({ cwd: 'D:\\foo\\' })
    const c = buildWarmupCacheKey({ cwd: 'd:/foo' })
    expect(a).toBe(b)
    expect(a).toBe(c)
  })

  it('不同 agentId 产生不同 key', () => {
    const a = buildWarmupCacheKey({ cwd: 'D:/foo', agentId: 'agent-a' })
    const b = buildWarmupCacheKey({ cwd: 'D:/foo', agentId: 'agent-b' })
    expect(a).not.toBe(b)
  })

  it('不同 mode 产生不同 key', () => {
    const a = buildWarmupCacheKey({ cwd: 'D:/foo', mode: 'standard' })
    const b = buildWarmupCacheKey({ cwd: 'D:/foo', mode: 'xforge' })
    expect(a).not.toBe(b)
  })

  it('默认 agentId 和 mode', () => {
    const key = buildWarmupCacheKey({ cwd: 'D:/foo' })
    expect(key).toContain('__default_agent__')
    expect(key).toContain('standard')
  })
})

// ═══ Warmup 状态机 ═══

describe('RuntimeWarmupManager', () => {
  function createMockBootstrap(options?: {
    delay?: number
    shouldFail?: boolean
    failMessage?: string
  }) {
    const { delay = 0, shouldFail = false, failMessage = 'bootstrap failed' } = options ?? {}
    return vi.fn().mockImplementation(
      () =>
        new Promise((resolve, reject) => {
          setTimeout(() => {
            if (shouldFail) {
              reject(new Error(failMessage))
            } else {
              resolve({
                skillsReady: true,
                fileIndexReady: true,
                systemPromptReady: true,
                timings: {
                  skills: 10,
                  instructions: 5,
                  hooks: 8,
                  sessionStartHooks: 3,
                  fileIndex: 100,
                  plugins: 12,
                  memory: 20,
                  shellSnapshot: 15,
                  gitContext: 50,
                  systemPrompt: 7,
                  total: 230,
                },
                warnings: [],
              })
            }
          }, delay)
        }),
    )
  }

  it('idle → warming → ready 状态迁移', async () => {
    const events: RuntimeWarmupStatusChangedEvent[] = []
    const bootstrapFn = createMockBootstrap({ delay: 10 })

    const manager = createRuntimeWarmupManager({
      bootstrapFn,
      onStatusChanged: (e) => events.push(e),
    })

    // 初始状态
    const key = buildWarmupCacheKey({ cwd: 'D:/project' })
    expect(manager.getStatus(key)).toBe('idle')

    // 启动 warmup
    manager.startWarmup({ cwd: 'D:/project' })
    expect(manager.getStatus(key)).toBe('warming')
    expect(events).toHaveLength(1)
    expect(events[0]!.status).toBe('warming')

    // 等待完成
    await vi.waitFor(() => {
      expect(manager.getStatus(key)).toBe('ready')
    })

    expect(events).toHaveLength(2)
    expect(events[1]!.status).toBe('ready')
    expect(events[1]!.durationMs).toBeGreaterThanOrEqual(0)
    expect(bootstrapFn).toHaveBeenCalledWith('D:/project')

    manager.dispose()
  })

  it('warming → failed 状态迁移', async () => {
    const events: RuntimeWarmupStatusChangedEvent[] = []
    const bootstrapFn = createMockBootstrap({ delay: 10, shouldFail: true })

    const manager = createRuntimeWarmupManager({
      bootstrapFn,
      onStatusChanged: (e) => events.push(e),
    })

    manager.startWarmup({ cwd: 'D:/project' })
    const key = buildWarmupCacheKey({ cwd: 'D:/project' })
    expect(manager.getStatus(key)).toBe('warming')

    await vi.waitFor(() => {
      expect(manager.getStatus(key)).toBe('failed')
    })

    expect(events).toHaveLength(2)
    expect(events[1]!.status).toBe('failed')
    expect(events[1]!.error).toBe('bootstrap failed')

    manager.dispose()
  })

  it('重复 startWarmup 不会重新启动已在 warming 的 entry', () => {
    const bootstrapFn = createMockBootstrap({ delay: 1000 })

    const manager = createRuntimeWarmupManager({ bootstrapFn })

    manager.startWarmup({ cwd: 'D:/project' })
    manager.startWarmup({ cwd: 'D:/project' })

    // 只调用一次
    expect(bootstrapFn).toHaveBeenCalledTimes(1)

    manager.dispose()
  })

  it('重复 startWarmup 不会重新启动已 ready 的 entry', async () => {
    const bootstrapFn = createMockBootstrap({ delay: 5 })

    const manager = createRuntimeWarmupManager({ bootstrapFn })

    manager.startWarmup({ cwd: 'D:/project' })
    const key = buildWarmupCacheKey({ cwd: 'D:/project' })

    await vi.waitFor(() => {
      expect(manager.getStatus(key)).toBe('ready')
    })

    manager.startWarmup({ cwd: 'D:/project' })
    // 仍然只调用一次
    expect(bootstrapFn).toHaveBeenCalledTimes(1)

    manager.dispose()
  })

  it('abortWarmup 取消正在进行的 warmup', () => {
    const events: RuntimeWarmupStatusChangedEvent[] = []
    const bootstrapFn = createMockBootstrap({ delay: 5000 })

    const manager = createRuntimeWarmupManager({
      bootstrapFn,
      onStatusChanged: (e) => events.push(e),
    })

    manager.startWarmup({ cwd: 'D:/project' })
    const key = buildWarmupCacheKey({ cwd: 'D:/project' })
    expect(manager.getStatus(key)).toBe('warming')

    manager.abortWarmup('D:/project')
    // abort 后 entry 被删除，状态回到 idle
    expect(manager.getStatus(key)).toBe('idle')

    // 事件：warming → idle
    expect(events.some((e) => e.status === 'idle')).toBe(true)

    manager.dispose()
  })

  it('workspace 切换 abort 旧 warmup', () => {
    const bootstrapFn = createMockBootstrap({ delay: 5000 })

    const manager = createRuntimeWarmupManager({ bootstrapFn })

    // 启动 project-a 的 warmup
    manager.startWarmup({ cwd: 'D:/project-a' })
    const keyA = buildWarmupCacheKey({ cwd: 'D:/project-a' })
    expect(manager.getStatus(keyA)).toBe('warming')

    // 切换到 project-b：先 abort project-a
    manager.abortWarmup('D:/project-a')
    manager.startWarmup({ cwd: 'D:/project-b' })

    expect(manager.getStatus(keyA)).toBe('idle')
    const keyB = buildWarmupCacheKey({ cwd: 'D:/project-b' })
    expect(manager.getStatus(keyB)).toBe('warming')

    manager.dispose()
  })

  it('Windows 路径不同写法触发同一个 warmup', () => {
    const bootstrapFn = createMockBootstrap({ delay: 5000 })

    const manager = createRuntimeWarmupManager({ bootstrapFn })

    manager.startWarmup({ cwd: 'D:\\project\\foo\\' })
    manager.startWarmup({ cwd: 'd:/project/foo' })

    // 只调用一次
    expect(bootstrapFn).toHaveBeenCalledTimes(1)

    manager.dispose()
  })

  it('warmup 不调用 LLM（bootstrapFn 只接收 cwd）', async () => {
    const bootstrapFn = createMockBootstrap({ delay: 5 })

    const manager = createRuntimeWarmupManager({ bootstrapFn })

    manager.startWarmup({ cwd: 'D:/project' })

    await vi.waitFor(() => {
      const key = buildWarmupCacheKey({ cwd: 'D:/project' })
      expect(manager.getStatus(key)).toBe('ready')
    })

    // bootstrapFn 只接收 cwd，不接收 provider/model 等 LLM 参数
    expect(bootstrapFn).toHaveBeenCalledWith('D:/project')
    expect(bootstrapFn.mock.calls[0]).toHaveLength(1)

    manager.dispose()
  })
})

// ═══ Snapshot Validate ═══

describe('RuntimeWarmupManager.validateSnapshot', () => {
  function createMockBootstrap(delay = 5) {
    return vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              skillsReady: true,
              fileIndexReady: true,
              systemPromptReady: true,
              timings: {
                skills: 10, instructions: 5, hooks: 8, sessionStartHooks: 3,
                fileIndex: 100, plugins: 12, memory: 20, shellSnapshot: 15,
                gitContext: 50, systemPrompt: 7, total: 230,
              },
              warnings: [],
            })
          }, delay)
        }),
    )
  }

  it('warmup ready 时 validate 命中', async () => {
    const manager = createRuntimeWarmupManager({
      bootstrapFn: createMockBootstrap(5),
    })

    manager.startWarmup({ cwd: 'D:/project' })

    await vi.waitFor(() => {
      const key = buildWarmupCacheKey({ cwd: 'D:/project' })
      expect(manager.getStatus(key)).toBe('ready')
    })

    const result = manager.validateSnapshot({ cwd: 'D:/project' })
    expect(result.hit).toBe(true)
    expect(result.snapshot).not.toBeNull()
    expect(result.snapshot!.bootstrapReady).toBe(true)
    expect(result.snapshot!.timings).toBeDefined()

    manager.dispose()
  })

  it('warmup warming 时 validate 未命中（not-ready）', () => {
    const manager = createRuntimeWarmupManager({
      bootstrapFn: vi.fn().mockReturnValue(new Promise(() => {})),
    })

    manager.startWarmup({ cwd: 'D:/project' })

    const result = manager.validateSnapshot({ cwd: 'D:/project' })
    expect(result.hit).toBe(false)
    expect(result.missReason).toBe('not-ready')

    manager.dispose()
  })

  it('warmup failed 时 validate 未命中（failed）', async () => {
    const manager = createRuntimeWarmupManager({
      bootstrapFn: vi.fn().mockRejectedValue(new Error('boom')),
    })

    manager.startWarmup({ cwd: 'D:/project' })

    await vi.waitFor(() => {
      const key = buildWarmupCacheKey({ cwd: 'D:/project' })
      expect(manager.getStatus(key)).toBe('failed')
    })

    const result = manager.validateSnapshot({ cwd: 'D:/project' })
    expect(result.hit).toBe(false)
    expect(result.missReason).toBe('failed')

    manager.dispose()
  })

  it('无 warmup 时 validate 未命中（no-snapshot）', () => {
    const manager = createRuntimeWarmupManager({
      bootstrapFn: vi.fn(),
    })

    const result = manager.validateSnapshot({ cwd: 'D:/project' })
    expect(result.hit).toBe(false)
    expect(result.missReason).toBe('no-snapshot')

    manager.dispose()
  })

  it('不同路径写法能匹配同一个 snapshot', async () => {
    const manager = createRuntimeWarmupManager({
      bootstrapFn: createMockBootstrap(5),
    })

    manager.startWarmup({ cwd: 'D:\\project\\foo\\' })

    await vi.waitFor(() => {
      const key = buildWarmupCacheKey({ cwd: 'D:/project/foo' })
      expect(manager.getStatus(key)).toBe('ready')
    })

    // 用不同写法 validate
    const result = manager.validateSnapshot({ cwd: 'd:/project/foo' })
    expect(result.hit).toBe(true)

    manager.dispose()
  })

  it('warmup failed 不阻塞 submit（validate 返回 failed，调用方走 slow path）', async () => {
    const manager = createRuntimeWarmupManager({
      bootstrapFn: vi.fn().mockRejectedValue(new Error('bootstrap error')),
    })

    manager.startWarmup({ cwd: 'D:/project' })

    await vi.waitFor(() => {
      const key = buildWarmupCacheKey({ cwd: 'D:/project' })
      expect(manager.getStatus(key)).toBe('failed')
    })

    const result = manager.validateSnapshot({ cwd: 'D:/project' })
    // 返回 failed 而不是抛异常，调用方可以安全地走 slow path
    expect(result.hit).toBe(false)
    expect(result.missReason).toBe('failed')
    expect(result.snapshot).not.toBeNull()

    manager.dispose()
  })
})

// ═══ dispose ═══

describe('RuntimeWarmupManager.dispose', () => {
  it('dispose 清理所有 entry', () => {
    const manager = createRuntimeWarmupManager({
      bootstrapFn: vi.fn().mockReturnValue(new Promise(() => {})),
    })

    manager.startWarmup({ cwd: 'D:/project-a' })
    manager.startWarmup({ cwd: 'D:/project-b' })

    expect(manager.getEntryKeys()).toHaveLength(2)

    manager.dispose()

    expect(manager.getEntryKeys()).toHaveLength(0)
  })
})
