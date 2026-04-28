import { describe, expect, it, vi } from 'vitest'
import {
  createRuntimeWarmupManager,
  buildWarmupCacheKey,
  buildProviderFingerprint,
  buildConfigFingerprint,
  type RuntimeWarmupStatusChangedEvent,
  type WarmupBootstrapResult,
} from '../src/main/studio-runtime-warmup'
import { normalizeRuntimePath } from '../src/main/normalize-runtime-path'

function makeToolDefinition(name: string, description = `${name} tool`) {
  return {
    name,
    description,
    parameters: {},
  }
}

function makeToolRegistry(toolDefinitions = [
  makeToolDefinition('read_file', 'Read a file'),
  makeToolDefinition('write_file', 'Write a file'),
]) {
  return {
    toToolDefinitions: vi.fn(() => toolDefinitions),
  }
}

function makeBootstrapResult(overrides?: Partial<WarmupBootstrapResult>): WarmupBootstrapResult {
  const toolDefinitions = [
    makeToolDefinition('read_file', 'Read a file'),
    makeToolDefinition('write_file', 'Write a file'),
  ]
  return {
    skillsReady: true, fileIndexReady: true, systemPromptReady: true,
    timings: { skills: 10, instructions: 5, hooks: 8, sessionStartHooks: 3, fileIndex: 100, plugins: 12, memory: 20, shellSnapshot: 15, gitContext: 50, systemPrompt: 7, total: 230 },
    warnings: [],
    systemPrompt: 'You are a helpful assistant.',
    toolDefinitions,
    toolRegistry: makeToolRegistry(toolDefinitions) as never,
    agentConfigFingerprint: 'agent-fp-1', skillsVersion: 'skills-v1', hooksVersion: 'hooks-v1',
    mcpToolListVersion: 'mcp-v1', memoryVersion: 'mem-v1', gitContextVersion: 'git-v1',
    ...overrides,
  }
}

function makeVersionFingerprints(overrides?: Partial<{
  agentConfigFingerprint: string
  skillsVersion: string
  hooksVersion: string
  mcpToolListVersion: string
  memoryVersion: string
  gitContextVersion: string
}>) {
  return {
    agentConfigFingerprint: 'agent-v1',
    skillsVersion: 'skills-v1',
    hooksVersion: 'hooks-v1',
    mcpToolListVersion: 'mcp-v1',
    memoryVersion: 'memory-v1',
    gitContextVersion: 'git-v1',
    ...overrides,
  }
}

function createMockBootstrap(opts?: { delay?: number; shouldFail?: boolean; failMessage?: string; result?: Partial<WarmupBootstrapResult> }) {
  const d = opts?.delay ?? 0, sf = opts?.shouldFail ?? false, fm = opts?.failMessage ?? 'bootstrap failed', r = opts?.result
  return vi.fn().mockImplementation(() => new Promise((resolve, reject) => { setTimeout(() => { if (sf) reject(new Error(fm)); else resolve(makeBootstrapResult(r)) }, d) }))
}

describe('normalizeRuntimePath', () => {
  it('backslash to forward slash', () => { expect(normalizeRuntimePath('D:\\foo\\bar')).toBe('D:/foo/bar') })
  it('Windows drive letter uppercase', () => { expect(normalizeRuntimePath('d:/foo/bar')).toBe('D:/foo/bar') })
  it('trailing slash removed', () => { expect(normalizeRuntimePath('D:/foo/bar/')).toBe('D:/foo/bar') })
  it('root path preserved', () => { expect(normalizeRuntimePath('D:/')).toBe('D:/') })
  it('same result for different notations', () => { expect(normalizeRuntimePath('D:/foo')).toBe(normalizeRuntimePath('D:\\foo\\')) })
  it('empty string', () => { expect(normalizeRuntimePath('')).toBe('') })
  it('Unix path', () => { expect(normalizeRuntimePath('/home/user/project')).toBe('/home/user/project') })
})

describe('buildWarmupCacheKey', () => {
  it('same path different notation same key', () => {
    expect(buildWarmupCacheKey({ cwd: 'D:/foo' })).toBe(buildWarmupCacheKey({ cwd: 'D:\\foo\\' }))
  })
  it('different agentId different key', () => {
    expect(buildWarmupCacheKey({ cwd: 'D:/foo', agentId: 'a' })).not.toBe(buildWarmupCacheKey({ cwd: 'D:/foo', agentId: 'b' }))
  })
  it('different mode different key', () => {
    expect(buildWarmupCacheKey({ cwd: 'D:/foo', mode: 'standard' })).not.toBe(buildWarmupCacheKey({ cwd: 'D:/foo', mode: 'xforge' }))
  })
  it('different providerFingerprint different key', () => {
    expect(buildWarmupCacheKey({ cwd: 'D:/foo', providerFingerprint: 'a' })).not.toBe(buildWarmupCacheKey({ cwd: 'D:/foo', providerFingerprint: 'b' }))
  })
  it('different configFingerprint different key', () => {
    expect(buildWarmupCacheKey({ cwd: 'D:/foo', configFingerprint: 'a' })).not.toBe(buildWarmupCacheKey({ cwd: 'D:/foo', configFingerprint: 'b' }))
  })
  it('key contains all dimensions', () => {
    const key = buildWarmupCacheKey({ cwd: 'D:/p', workspaceRoot: 'D:/w', agentId: 'ag', mode: 'xforge', providerFingerprint: 'pf', configFingerprint: 'cf' })
    expect(key).toContain('D:/p'); expect(key).toContain('D:/w'); expect(key).toContain('ag'); expect(key).toContain('xforge'); expect(key).toContain('pf'); expect(key).toContain('cf')
  })
  it('workspaceRoot defaults to cwd', () => {
    expect(buildWarmupCacheKey({ cwd: 'D:/foo' })).toBe(buildWarmupCacheKey({ cwd: 'D:/foo', workspaceRoot: 'D:/foo' }))
  })
})

describe('buildProviderFingerprint', () => {
  it('same input same fingerprint', () => {
    expect(buildProviderFingerprint({ provider: 'openai', model: 'gpt-4o' })).toBe(buildProviderFingerprint({ provider: 'openai', model: 'gpt-4o' }))
  })
  it('different provider different fingerprint', () => {
    expect(buildProviderFingerprint({ provider: 'openai' })).not.toBe(buildProviderFingerprint({ provider: 'anthropic' }))
  })
  it('different model different fingerprint', () => {
    expect(buildProviderFingerprint({ model: 'gpt-4o' })).not.toBe(buildProviderFingerprint({ model: 'gpt-4o-mini' }))
  })
})

describe('buildConfigFingerprint', () => {
  it('same config same fingerprint', () => {
    expect(buildConfigFingerprint({ a: 1 })).toBe(buildConfigFingerprint({ a: 1 }))
  })
  it('different config different fingerprint', () => {
    expect(buildConfigFingerprint({ a: 1 })).not.toBe(buildConfigFingerprint({ a: 2 }))
  })
  it('apiKey redacted', () => {
    expect(buildConfigFingerprint({ apiKey: 'sk-111' })).toBe(buildConfigFingerprint({ apiKey: 'sk-222' }))
  })
})

describe('RuntimeWarmupManager state machine', () => {
  it('idle -> warming -> ready', async () => {
    const events: RuntimeWarmupStatusChangedEvent[] = []
    const manager = createRuntimeWarmupManager({ bootstrapFn: createMockBootstrap({ delay: 10 }), onStatusChanged: (e) => events.push(e) })
    const key = buildWarmupCacheKey({ cwd: 'D:/project' })
    expect(manager.getStatus(key)).toBe('idle')
    manager.startWarmup({ cwd: 'D:/project' })
    expect(manager.getStatus(key)).toBe('warming')
    await vi.waitFor(() => { expect(manager.getStatus(key)).toBe('ready') })
    expect(events[0]!.status).toBe('warming')
    expect(events[1]!.status).toBe('ready')
    expect(events[1]!.durationMs).toBeGreaterThanOrEqual(0)
    manager.dispose()
  })

  it('warming -> failed', async () => {
    const events: RuntimeWarmupStatusChangedEvent[] = []
    const manager = createRuntimeWarmupManager({ bootstrapFn: createMockBootstrap({ delay: 10, shouldFail: true }), onStatusChanged: (e) => events.push(e) })
    manager.startWarmup({ cwd: 'D:/project' })
    const key = buildWarmupCacheKey({ cwd: 'D:/project' })
    await vi.waitFor(() => { expect(manager.getStatus(key)).toBe('failed') })
    expect(events[1]!.status).toBe('failed')
    expect(events[1]!.error).toBe('bootstrap failed')
    manager.dispose()
  })

  it('duplicate startWarmup is idempotent for warming', () => {
    const fn = createMockBootstrap({ delay: 5000 })
    const m = createRuntimeWarmupManager({ bootstrapFn: fn })
    m.startWarmup({ cwd: 'D:/p' }); m.startWarmup({ cwd: 'D:/p' })
    expect(fn).toHaveBeenCalledTimes(1)
    m.dispose()
  })

  it('duplicate startWarmup is idempotent for ready', async () => {
    const fn = createMockBootstrap({ delay: 5 })
    const m = createRuntimeWarmupManager({ bootstrapFn: fn })
    m.startWarmup({ cwd: 'D:/p' })
    await vi.waitFor(() => { expect(m.getStatus(buildWarmupCacheKey({ cwd: 'D:/p' }))).toBe('ready') })
    m.startWarmup({ cwd: 'D:/p' })
    expect(fn).toHaveBeenCalledTimes(1)
    m.dispose()
  })

  it('abortWarmup cancels warming entry', () => {
    const events: RuntimeWarmupStatusChangedEvent[] = []
    const m = createRuntimeWarmupManager({ bootstrapFn: createMockBootstrap({ delay: 5000 }), onStatusChanged: (e) => events.push(e) })
    m.startWarmup({ cwd: 'D:/p' })
    expect(m.getStatus(buildWarmupCacheKey({ cwd: 'D:/p' }))).toBe('warming')
    m.abortWarmup('D:/p')
    expect(m.getStatus(buildWarmupCacheKey({ cwd: 'D:/p' }))).toBe('idle')
    expect(events.some(e => e.status === 'idle')).toBe(true)
    m.dispose()
  })

  it('workspace switch aborts old warmup', () => {
    const m = createRuntimeWarmupManager({ bootstrapFn: createMockBootstrap({ delay: 5000 }) })
    m.startWarmup({ cwd: 'D:/a' })
    m.abortWarmup('D:/a')
    m.startWarmup({ cwd: 'D:/b' })
    expect(m.getStatus(buildWarmupCacheKey({ cwd: 'D:/a' }))).toBe('idle')
    expect(m.getStatus(buildWarmupCacheKey({ cwd: 'D:/b' }))).toBe('warming')
    m.dispose()
  })

  it('Windows path normalization triggers same warmup', () => {
    const fn = createMockBootstrap({ delay: 5000 })
    const m = createRuntimeWarmupManager({ bootstrapFn: fn })
    m.startWarmup({ cwd: 'D:\\project\\foo\\' })
    m.startWarmup({ cwd: 'd:/project/foo' })
    expect(fn).toHaveBeenCalledTimes(1)
    m.dispose()
  })

  it('bootstrapFn only receives cwd (no LLM params)', async () => {
    const fn = createMockBootstrap({ delay: 5 })
    const m = createRuntimeWarmupManager({ bootstrapFn: fn })
    m.startWarmup({ cwd: 'D:/p' })
    await vi.waitFor(() => { expect(m.getStatus(buildWarmupCacheKey({ cwd: 'D:/p' }))).toBe('ready') })
    expect(fn).toHaveBeenCalledWith('D:/p')
    expect(fn.mock.calls[0]).toHaveLength(1)
    m.dispose()
  })

  it('ready snapshot contains systemPrompt and toolDefinitions', async () => {
    const toolDefinitions = [makeToolDefinition('test_tool', 'Test tool')]
    const m = createRuntimeWarmupManager({ bootstrapFn: createMockBootstrap({ delay: 5, result: { systemPrompt: 'Test prompt', toolDefinitions, toolRegistry: makeToolRegistry(toolDefinitions) as never } }) })
    m.startWarmup({ cwd: 'D:/p' })
    await vi.waitFor(() => { expect(m.getStatus(buildWarmupCacheKey({ cwd: 'D:/p' }))).toBe('ready') })
    const r = m.validateSnapshot({ cwd: 'D:/p' })
    expect(r.hit).toBe(true)
    expect(r.snapshot!.systemPrompt).toBe('Test prompt')
    expect(r.snapshot!.toolDefinitions).toEqual(toolDefinitions)
    m.dispose()
  })

  it('ready snapshot contains version fingerprints', async () => {
    const m = createRuntimeWarmupManager({ bootstrapFn: createMockBootstrap({ delay: 5 }) })
    m.startWarmup({ cwd: 'D:/p' })
    await vi.waitFor(() => { expect(m.getStatus(buildWarmupCacheKey({ cwd: 'D:/p' }))).toBe('ready') })
    const r = m.validateSnapshot({ cwd: 'D:/p' })
    expect(r.snapshot!.agentConfigFingerprint).toBe('agent-fp-1')
    expect(r.snapshot!.skillsVersion).toBe('skills-v1')
    expect(r.snapshot!.hooksVersion).toBe('hooks-v1')
    expect(r.snapshot!.mcpToolListVersion).toBe('mcp-v1')
    expect(r.snapshot!.memoryVersion).toBe('mem-v1')
    expect(r.snapshot!.gitContextVersion).toBe('git-v1')
    m.dispose()
  })
})

describe('RuntimeWarmupManager.validateSnapshot', () => {
  it('ready -> hit', async () => {
    const m = createRuntimeWarmupManager({ bootstrapFn: createMockBootstrap({ delay: 5 }) })
    m.startWarmup({ cwd: 'D:/p' })
    await vi.waitFor(() => { expect(m.getStatus(buildWarmupCacheKey({ cwd: 'D:/p' }))).toBe('ready') })
    const r = m.validateSnapshot({ cwd: 'D:/p' })
    expect(r.hit).toBe(true)
    expect(r.snapshot!.bootstrapReady).toBe(true)
    m.dispose()
  })
  it('warming -> not-ready', () => {
    const m = createRuntimeWarmupManager({ bootstrapFn: vi.fn().mockReturnValue(new Promise(() => {})) })
    m.startWarmup({ cwd: 'D:/p' })
    expect(m.validateSnapshot({ cwd: 'D:/p' }).missReason).toBe('not-ready')
    m.dispose()
  })
  it('failed -> failed', async () => {
    const m = createRuntimeWarmupManager({ bootstrapFn: vi.fn().mockRejectedValue(new Error('x')) })
    m.startWarmup({ cwd: 'D:/p' })
    await vi.waitFor(() => { expect(m.getStatus(buildWarmupCacheKey({ cwd: 'D:/p' }))).toBe('failed') })
    expect(m.validateSnapshot({ cwd: 'D:/p' }).missReason).toBe('failed')
    m.dispose()
  })
  it('no warmup -> no-snapshot', () => {
    const m = createRuntimeWarmupManager({ bootstrapFn: vi.fn() })
    expect(m.validateSnapshot({ cwd: 'D:/p' }).missReason).toBe('no-snapshot')
    m.dispose()
  })
  it('different path notation matches same snapshot', async () => {
    const m = createRuntimeWarmupManager({ bootstrapFn: createMockBootstrap({ delay: 5 }) })
    m.startWarmup({ cwd: 'D:\\p\\foo\\' })
    await vi.waitFor(() => { expect(m.getStatus(buildWarmupCacheKey({ cwd: 'D:/p/foo' }))).toBe('ready') })
    expect(m.validateSnapshot({ cwd: 'd:/p/foo' }).hit).toBe(true)
    m.dispose()
  })
  it('failed does not block submit (returns failed, caller uses slow path)', async () => {
    const m = createRuntimeWarmupManager({ bootstrapFn: vi.fn().mockRejectedValue(new Error('err')) })
    m.startWarmup({ cwd: 'D:/p' })
    await vi.waitFor(() => { expect(m.getStatus(buildWarmupCacheKey({ cwd: 'D:/p' }))).toBe('failed') })
    const r = m.validateSnapshot({ cwd: 'D:/p' })
    expect(r.hit).toBe(false)
    expect(r.snapshot).not.toBeNull()
    m.dispose()
  })

  it('workspace version drift marks ready snapshot stale', async () => {
    const initialVersions = makeVersionFingerprints()
    const versionFingerprintFn = vi.fn(() => initialVersions)
    const m = createRuntimeWarmupManager({
      bootstrapFn: createMockBootstrap({ delay: 0, result: initialVersions }),
      versionFingerprintFn,
    })
    m.startWarmup({ cwd: 'D:/p' })
    await vi.waitFor(() => { expect(m.getStatus(buildWarmupCacheKey({ cwd: 'D:/p' }))).toBe('ready') })

    versionFingerprintFn.mockReturnValue(makeVersionFingerprints({ skillsVersion: 'skills-v2' }))
    const r = m.validateSnapshot({ cwd: 'D:/p' })

    expect(r.hit).toBe(false)
    expect(r.missReason).toBe('stale')
    expect(m.getStatus(buildWarmupCacheKey({ cwd: 'D:/p' }))).toBe('stale')
    m.dispose()
  })
})

describe('Invalidation rules', () => {
  async function readyManager() {
    const events: RuntimeWarmupStatusChangedEvent[] = []
    const m = createRuntimeWarmupManager({ bootstrapFn: createMockBootstrap({ delay: 0 }), onStatusChanged: (e) => events.push(e) })
    m.startWarmup({ cwd: 'D:/p' })
    await vi.waitFor(() => { expect(m.getStatus(buildWarmupCacheKey({ cwd: 'D:/p' }))).toBe('ready') })
    return { m, events }
  }

  it('workspace switch: old snapshot gone', async () => {
    const { m } = await readyManager()
    m.abortWarmup('D:/p')
    expect(m.validateSnapshot({ cwd: 'D:/p' }).missReason).toBe('no-snapshot')
    m.dispose()
  })
  it('skills-changed -> stale', async () => {
    const { m, events } = await readyManager()
    m.invalidateSnapshot('D:/p', 'skills-changed')
    expect(m.getStatus(buildWarmupCacheKey({ cwd: 'D:/p' }))).toBe('stale')
    expect(m.validateSnapshot({ cwd: 'D:/p' }).missReason).toBe('stale')
    expect(events.some(e => e.status === 'stale')).toBe(true)
    m.dispose()
  })
  it('hooks-changed -> stale', async () => {
    const { m } = await readyManager()
    m.invalidateSnapshot('D:/p', 'hooks-changed')
    expect(m.validateSnapshot({ cwd: 'D:/p' }).missReason).toBe('stale')
    m.dispose()
  })
  it('mcp-changed -> stale', async () => {
    const { m } = await readyManager()
    m.invalidateSnapshot('D:/p', 'mcp-changed')
    expect(m.validateSnapshot({ cwd: 'D:/p' }).missReason).toBe('stale')
    m.dispose()
  })
  it('memory-changed -> stale', async () => {
    const { m } = await readyManager()
    m.invalidateSnapshot('D:/p', 'memory-changed')
    expect(m.validateSnapshot({ cwd: 'D:/p' }).missReason).toBe('stale')
    m.dispose()
  })
  it('git-changed -> stale', async () => {
    const { m } = await readyManager()
    m.invalidateSnapshot('D:/p', 'git-changed')
    expect(m.validateSnapshot({ cwd: 'D:/p' }).missReason).toBe('stale')
    m.dispose()
  })
  it('agent-changed -> stale', async () => {
    const { m } = await readyManager()
    m.invalidateSnapshot('D:/p', 'agent-changed')
    expect(m.validateSnapshot({ cwd: 'D:/p' }).missReason).toBe('stale')
    m.dispose()
  })
  it('config-changed -> stale', async () => {
    const { m } = await readyManager()
    m.invalidateSnapshot('D:/p', 'config-changed')
    expect(m.validateSnapshot({ cwd: 'D:/p' }).missReason).toBe('stale')
    m.dispose()
  })
})

describe('invalidateAll', () => {
  it('provider-changed invalidates all ready snapshots', async () => {
    const m = createRuntimeWarmupManager({ bootstrapFn: createMockBootstrap({ delay: 0 }) })
    m.startWarmup({ cwd: 'D:/a' }); m.startWarmup({ cwd: 'D:/b' })
    await vi.waitFor(() => {
      expect(m.getStatus(buildWarmupCacheKey({ cwd: 'D:/a' }))).toBe('ready')
      expect(m.getStatus(buildWarmupCacheKey({ cwd: 'D:/b' }))).toBe('ready')
    })
    m.invalidateAll('provider-changed')
    expect(m.validateSnapshot({ cwd: 'D:/a' }).missReason).toBe('stale')
    expect(m.validateSnapshot({ cwd: 'D:/b' }).missReason).toBe('stale')
    m.dispose()
  })
  it('invalidateAll does not affect warming entries', () => {
    const m = createRuntimeWarmupManager({ bootstrapFn: vi.fn().mockReturnValue(new Promise(() => {})) })
    m.startWarmup({ cwd: 'D:/p' })
    m.invalidateAll('provider-changed')
    expect(m.getStatus(buildWarmupCacheKey({ cwd: 'D:/p' }))).toBe('warming')
    m.dispose()
  })
})

describe('Invalidation rules', () => {
  async function readyManager() {
    const events: RuntimeWarmupStatusChangedEvent[] = []
    const m = createRuntimeWarmupManager({ bootstrapFn: createMockBootstrap({ delay: 0 }), onStatusChanged: (e) => events.push(e) })
    m.startWarmup({ cwd: 'D:/p' })
    await vi.waitFor(() => { expect(m.getStatus(buildWarmupCacheKey({ cwd: 'D:/p' }))).toBe('ready') })
    return { m, events }
  }
  it('workspace switch: old snapshot gone', async () => {
    const { m } = await readyManager()
    m.abortWarmup('D:/p')
    expect(m.validateSnapshot({ cwd: 'D:/p' }).missReason).toBe('no-snapshot')
    m.dispose()
  })
  it('skills-changed marks stale', async () => {
    const { m, events } = await readyManager()
    m.invalidateSnapshot('D:/p', 'skills-changed')
    expect(m.getStatus(buildWarmupCacheKey({ cwd: 'D:/p' }))).toBe('stale')
    expect(m.validateSnapshot({ cwd: 'D:/p' }).missReason).toBe('stale')
    expect(events.some(e => e.status === 'stale')).toBe(true)
    m.dispose()
  })
  it('hooks-changed marks stale', async () => {
    const { m } = await readyManager()
    m.invalidateSnapshot('D:/p', 'hooks-changed')
    expect(m.validateSnapshot({ cwd: 'D:/p' }).missReason).toBe('stale')
    m.dispose()
  })
  it('mcp-changed marks stale', async () => {
    const { m } = await readyManager()
    m.invalidateSnapshot('D:/p', 'mcp-changed')
    expect(m.validateSnapshot({ cwd: 'D:/p' }).missReason).toBe('stale')
    m.dispose()
  })
  it('memory-changed marks stale', async () => {
    const { m } = await readyManager()
    m.invalidateSnapshot('D:/p', 'memory-changed')
    expect(m.validateSnapshot({ cwd: 'D:/p' }).missReason).toBe('stale')
    m.dispose()
  })
  it('git-changed marks stale', async () => {
    const { m } = await readyManager()
    m.invalidateSnapshot('D:/p', 'git-changed')
    expect(m.validateSnapshot({ cwd: 'D:/p' }).missReason).toBe('stale')
    m.dispose()
  })
  it('agent-changed marks stale', async () => {
    const { m } = await readyManager()
    m.invalidateSnapshot('D:/p', 'agent-changed')
    expect(m.validateSnapshot({ cwd: 'D:/p' }).missReason).toBe('stale')
    m.dispose()
  })
  it('config-changed marks stale', async () => {
    const { m } = await readyManager()
    m.invalidateSnapshot('D:/p', 'config-changed')
    expect(m.validateSnapshot({ cwd: 'D:/p' }).missReason).toBe('stale')
    m.dispose()
  })
})

describe('invalidateAll', () => {
  it('provider-changed invalidates all ready snapshots', async () => {
    const m = createRuntimeWarmupManager({ bootstrapFn: createMockBootstrap({ delay: 0 }) })
    m.startWarmup({ cwd: 'D:/a' }); m.startWarmup({ cwd: 'D:/b' })
    await vi.waitFor(() => {
      expect(m.getStatus(buildWarmupCacheKey({ cwd: 'D:/a' }))).toBe('ready')
      expect(m.getStatus(buildWarmupCacheKey({ cwd: 'D:/b' }))).toBe('ready')
    })
    m.invalidateAll('provider-changed')
    expect(m.validateSnapshot({ cwd: 'D:/a' }).missReason).toBe('stale')
    expect(m.validateSnapshot({ cwd: 'D:/b' }).missReason).toBe('stale')
    m.dispose()
  })
  it('invalidateAll does not affect warming entries', () => {
    const m = createRuntimeWarmupManager({ bootstrapFn: vi.fn().mockReturnValue(new Promise(() => {})) })
    m.startWarmup({ cwd: 'D:/p' })
    m.invalidateAll('provider-changed')
    expect(m.getStatus(buildWarmupCacheKey({ cwd: 'D:/p' }))).toBe('warming')
    m.dispose()
  })
})

describe('refreshSnapshot', () => {
  it('slow path success refreshes failed snapshot', async () => {
    const m = createRuntimeWarmupManager({ bootstrapFn: vi.fn().mockRejectedValue(new Error('fail')) })
    m.startWarmup({ cwd: 'D:/p' })
    await vi.waitFor(() => { expect(m.getStatus(buildWarmupCacheKey({ cwd: 'D:/p' }))).toBe('failed') })
    const toolDefinitions = [makeToolDefinition('bash', 'Run shell command')]
    m.refreshSnapshot({ cwd: 'D:/p', bootstrapResult: makeBootstrapResult({ systemPrompt: 'refreshed', toolDefinitions, toolRegistry: makeToolRegistry(toolDefinitions) as never, skillsVersion: 'sv2' }) })
    expect(m.getStatus(buildWarmupCacheKey({ cwd: 'D:/p' }))).toBe('ready')
    const r = m.validateSnapshot({ cwd: 'D:/p' })
    expect(r.hit).toBe(true)
    expect(r.snapshot!.systemPrompt).toBe('refreshed')
    expect(r.snapshot!.toolDefinitions).toEqual(toolDefinitions)
    expect(r.snapshot!.skillsVersion).toBe('sv2')
    m.dispose()
  })
  it('stale refreshed back to ready', async () => {
    const m = createRuntimeWarmupManager({ bootstrapFn: createMockBootstrap({ delay: 0 }) })
    m.startWarmup({ cwd: 'D:/p' })
    await vi.waitFor(() => { expect(m.getStatus(buildWarmupCacheKey({ cwd: 'D:/p' }))).toBe('ready') })
    m.invalidateSnapshot('D:/p', 'skills-changed')
    expect(m.getStatus(buildWarmupCacheKey({ cwd: 'D:/p' }))).toBe('stale')
    m.refreshSnapshot({ cwd: 'D:/p', bootstrapResult: makeBootstrapResult({ systemPrompt: 'new' }) })
    expect(m.getStatus(buildWarmupCacheKey({ cwd: 'D:/p' }))).toBe('ready')
    expect(m.validateSnapshot({ cwd: 'D:/p' }).snapshot!.systemPrompt).toBe('new')
    m.dispose()
  })
  it('creates new entry when none exists', () => {
    const m = createRuntimeWarmupManager({ bootstrapFn: vi.fn() })
    m.refreshSnapshot({ cwd: 'D:/p', bootstrapResult: makeBootstrapResult({ systemPrompt: 'fresh' }) })
    expect(m.getStatus(buildWarmupCacheKey({ cwd: 'D:/p' }))).toBe('ready')
    expect(m.validateSnapshot({ cwd: 'D:/p' }).snapshot!.systemPrompt).toBe('fresh')
    m.dispose()
  })
})

describe('dispose', () => {
  it('clears all entries', () => {
    const m = createRuntimeWarmupManager({ bootstrapFn: vi.fn().mockReturnValue(new Promise(() => {})) })
    m.startWarmup({ cwd: 'D:/a' }); m.startWarmup({ cwd: 'D:/b' })
    expect(m.getEntryKeys()).toHaveLength(2)
    m.dispose()
    expect(m.getEntryKeys()).toHaveLength(0)
  })
})

describe('Security: no sensitive data leaks', () => {
  it('buildConfigFingerprint does not contain raw apiKey', () => {
    const fp = buildConfigFingerprint({ providers: { openai: { apiKey: 'sk-super-secret-12345', baseURL: 'https://api.openai.com' } } })
    expect(fp).not.toContain('sk-super-secret')
    expect(fp).toMatch(/^[0-9a-f]{8}$/)
  })
  it('buildProviderFingerprint returns hash only', () => {
    const fp = buildProviderFingerprint({ provider: 'openai', model: 'gpt-4o', baseURL: 'https://api.openai.com' })
    expect(fp).toMatch(/^[0-9a-f]{8}$/)
  })
  it('snapshot providerFingerprint is a hash', async () => {
    const m = createRuntimeWarmupManager({ bootstrapFn: createMockBootstrap({ delay: 0 }) })
    const pf = buildProviderFingerprint({ provider: 'openai', model: 'gpt-4o' })
    m.startWarmup({ cwd: 'D:/p', providerFingerprint: pf })
    await vi.waitFor(() => { expect(m.getStatus(buildWarmupCacheKey({ cwd: 'D:/p', providerFingerprint: pf }))).toBe('ready') })
    const r = m.validateSnapshot({ cwd: 'D:/p', providerFingerprint: pf })
    expect(r.snapshot!.providerFingerprint).toMatch(/^[0-9a-f]{8}$/)
    m.dispose()
  })
  it('snapshot configFingerprint does not contain raw secret', () => {
    const m = createRuntimeWarmupManager({ bootstrapFn: vi.fn() })
    const cf = buildConfigFingerprint({ providers: { openai: { apiKey: 'sk-secret' } } })
    m.refreshSnapshot({ cwd: 'D:/p', configFingerprint: cf, bootstrapResult: makeBootstrapResult() })
    const r = m.validateSnapshot({ cwd: 'D:/p', configFingerprint: cf })
    expect(r.snapshot!.configFingerprint).not.toContain('sk-secret')
    expect(r.snapshot!.configFingerprint).toMatch(/^[0-9a-f]{8}$/)
    m.dispose()
  })
})
