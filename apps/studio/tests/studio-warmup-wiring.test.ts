/**
 * 集成测试：验证 Studio main 入口的 warmup 装配链路。
 *
 * 这些测试通过静态分析 main/index.ts 源码和模拟 IPC handler 调用，
 * 断言 warmup manager 被正确创建、传入 runtime service、
 * 并通过 onWorkspaceChanged 连接到 IPC handler。
 */

import { readFileSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { registerStudioMainIpcHandlers } from '../src/main/studio-ipc'
import {
  createRuntimeWarmupManager,
  buildWarmupCacheKey,
} from '../src/main/studio-runtime-warmup'
import { normalizeRuntimePath } from '../src/main/normalize-runtime-path'

// 基于测试文件位置推导 studio 根目录，避免硬编码本机路径
const testDir = dirname(fileURLToPath(import.meta.url))
const studioRoot = resolve(testDir, '..')

describe('studio warmup 装配链路', () => {
  it('main/index.ts 创建了 warmupManager 并传入 runtimeService', () => {
    const source = readFileSync(join(studioRoot, 'src/main/index.ts'), 'utf-8')

    // 创建 warmupManager
    expect(source).toContain('createRuntimeWarmupManager')
    // 传入 runtimeService
    expect(source).toContain('warmupManager')
    expect(source).toMatch(/createStudioRuntimeService\(\{[\s\S]*warmupManager/)
  })

  it('main/index.ts 把 onWorkspaceChanged 传入 IPC handlers', () => {
    const source = readFileSync(join(studioRoot, 'src/main/index.ts'), 'utf-8')

    expect(source).toContain('onWorkspaceChanged')
    // onWorkspaceChanged 内部调用 warmupManager.startWarmup
    expect(source).toContain('warmupManager.startWarmup')
  })

  it('main/index.ts 启动 warmup 时带上默认 agent，避免 submit key 漂移', () => {
    const source = readFileSync(join(studioRoot, 'src/main/index.ts'), 'utf-8')

    expect(source).toContain('agentCatalog.resolvePrimaryAgent')
    expect(source).toContain('const warmupRuntimeConfig')
    expect(source).toContain('agentId: warmupAgentId')
    expect(source).toContain('default: warmupAgentId')
  })

  it('main/index.ts workspace 切换时 abort 旧 warmup', () => {
    const source = readFileSync(join(studioRoot, 'src/main/index.ts'), 'utf-8')

    // 应该有 abort 旧 workspace 的逻辑
    expect(source).toContain('warmupManager.abortWarmup')
    expect(source).toContain('previousWarmupWorkspace')
  })

  it('main/index.ts 在 before-quit 时 dispose warmupManager', () => {
    const source = readFileSync(join(studioRoot, 'src/main/index.ts'), 'utf-8')

    expect(source).toContain('warmupManager.dispose()')
  })
})

describe('IPC handler onWorkspaceChanged 集成', () => {
  function createMockIpcMain() {
    const handlers = new Map<string, (_event: unknown, payload: unknown) => Promise<unknown> | unknown>()
    return {
      handle(channel: string, handler: (_event: unknown, payload: unknown) => Promise<unknown> | unknown) {
        handlers.set(channel, handler)
      },
      invoke(channel: string, payload?: unknown) {
        const handler = handlers.get(channel)
        if (!handler) throw new Error(`No handler for ${channel}`)
        return handler({}, payload)
      },
    }
  }

  it('openWorkspace 成功后触发 onWorkspaceChanged', async () => {
    const ipcMain = createMockIpcMain()
    const onWorkspaceChanged = vi.fn()

    registerStudioMainIpcHandlers({
      ipcMainLike: ipcMain,
      selectWorkspaceDirectory: () =>
        Promise.resolve({ ok: true as const, code: 'selected' as const, path: 'D:/project-a' }),
      onWorkspaceChanged,
      mainWindowManager: { getMainWindow: () => null },
      inspectRuntime: vi.fn().mockResolvedValue({ ok: true, status: 'ready', snapshot: {}, workspacePath: null, configWarnings: [], issues: [] }),
      inspectShell: vi.fn().mockResolvedValue({}),
      logger: { info: vi.fn(), error: vi.fn() },
    })

    await ipcMain.invoke('studio:host:open-workspace')

    expect(onWorkspaceChanged).toHaveBeenCalledWith('D:/project-a')
  })

  it('openWorkspace 取消时不触发 onWorkspaceChanged', async () => {
    const ipcMain = createMockIpcMain()
    const onWorkspaceChanged = vi.fn()

    registerStudioMainIpcHandlers({
      ipcMainLike: ipcMain,
      selectWorkspaceDirectory: () =>
        Promise.resolve({ ok: false as const, code: 'cancelled' as const, message: '用户取消' }),
      onWorkspaceChanged,
      mainWindowManager: { getMainWindow: () => null },
      inspectRuntime: vi.fn().mockResolvedValue({ ok: true, status: 'ready', snapshot: {}, workspacePath: null, configWarnings: [], issues: [] }),
      inspectShell: vi.fn().mockResolvedValue({}),
      logger: { info: vi.fn(), error: vi.fn() },
    })

    await ipcMain.invoke('studio:host:open-workspace')

    expect(onWorkspaceChanged).not.toHaveBeenCalled()
  })

  it('bindWorkspace 成功后触发 onWorkspaceChanged', async () => {
    const ipcMain = createMockIpcMain()
    const onWorkspaceChanged = vi.fn()

    registerStudioMainIpcHandlers({
      ipcMainLike: ipcMain,
      selectWorkspaceDirectory: vi.fn(),
      onWorkspaceChanged,
      mainWindowManager: { getMainWindow: () => null },
      inspectRuntime: vi.fn().mockResolvedValue({ ok: true, status: 'ready', snapshot: {}, workspacePath: null, configWarnings: [], issues: [] }),
      inspectShell: vi.fn().mockResolvedValue({}),
      logger: { info: vi.fn(), error: vi.fn() },
    })

    await ipcMain.invoke('studio:host:bind-workspace', { workspacePath: 'D:/project-b' })

    expect(onWorkspaceChanged).toHaveBeenCalledWith('D:/project-b')
  })

  it('warmup prepare IPC 会把当前 UI 选择转给 main handler', async () => {
    const ipcMain = createMockIpcMain()
    const prepareWarmupSelection = vi.fn(() => ({
      ok: true,
      status: 'warming' as const,
      selectionKey: 'selection-1',
    }))

    registerStudioMainIpcHandlers({
      ipcMainLike: ipcMain,
      selectWorkspaceDirectory: vi.fn(),
      prepareWarmupSelection,
      mainWindowManager: { getMainWindow: () => null },
      inspectRuntime: vi.fn().mockResolvedValue({ ok: true, status: 'ready', snapshot: {}, workspacePath: null, configWarnings: [], issues: [] }),
      inspectShell: vi.fn().mockResolvedValue({}),
      logger: { info: vi.fn(), error: vi.fn() },
    })

    await expect(
      ipcMain.invoke('studio:runtime:warmup-prepare', {
        projectPath: 'D:/project-b',
        agentId: 'general',
        providerId: 'minimax',
        modelId: 'MiniMax-M2.7',
        mode: 'standard',
      }),
    ).resolves.toEqual({
      ok: true,
      status: 'warming',
      selectionKey: 'selection-1',
    })

    expect(prepareWarmupSelection).toHaveBeenCalledWith(
      {
        projectPath: 'D:/project-b',
        agentId: 'general',
        providerId: 'minimax',
        modelId: 'MiniMax-M2.7',
        mode: 'standard',
      },
      {
        workspacePath: null,
        lastSelection: null,
      },
    )
  })

  it('workspace 切换时 warmupManager 先 abort 旧路径再 start 新路径', async () => {
    const ipcMain = createMockIpcMain()
    const bootstrapFn = vi.fn().mockReturnValue(new Promise(() => {}))
    const warmupManager = createRuntimeWarmupManager({ bootstrapFn })

    // 模拟 main/index.ts 中的 onWorkspaceChanged 闭包
    let previousWarmupWorkspace: string | null = null
    const onWorkspaceChanged = (workspacePath: string) => {
      const normalizedWorkspace = normalizeRuntimePath(workspacePath)
      if (!normalizedWorkspace) {
        return
      }
      if (previousWarmupWorkspace && previousWarmupWorkspace !== normalizedWorkspace) {
        warmupManager.abortWarmup(previousWarmupWorkspace)
      }
      previousWarmupWorkspace = normalizedWorkspace
      warmupManager.startWarmup({ cwd: normalizedWorkspace })
    }

    registerStudioMainIpcHandlers({
      ipcMainLike: ipcMain,
      selectWorkspaceDirectory: vi.fn(),
      onWorkspaceChanged,
      mainWindowManager: { getMainWindow: () => null },
      inspectRuntime: vi.fn().mockResolvedValue({ ok: true, status: 'ready', snapshot: {}, workspacePath: null, configWarnings: [], issues: [] }),
      inspectShell: vi.fn().mockResolvedValue({}),
      logger: { info: vi.fn(), error: vi.fn() },
    })

    // 绑定 workspace A
    await ipcMain.invoke('studio:host:bind-workspace', { workspacePath: 'D:/project-a' })
    const keyA = buildWarmupCacheKey({ cwd: 'D:/project-a' })
    expect(warmupManager.getStatus(keyA)).toBe('warming')

    // 切换到 workspace B
    await ipcMain.invoke('studio:host:bind-workspace', { workspacePath: 'D:/project-b' })
    const keyB = buildWarmupCacheKey({ cwd: 'D:/project-b' })

    // A 应该被 abort（entry 被删除，状态回到 idle）
    expect(warmupManager.getStatus(keyA)).toBe('idle')
    // B 应该在 warming
    expect(warmupManager.getStatus(keyB)).toBe('warming')

    warmupManager.dispose()
  })

  it('重复绑定同一 workspace 不会重复启动 warmup', async () => {
    const ipcMain = createMockIpcMain()
    const bootstrapFn = vi.fn().mockReturnValue(new Promise(() => {}))
    const warmupManager = createRuntimeWarmupManager({ bootstrapFn })

    let previousWarmupWorkspace: string | null = null
    const onWorkspaceChanged = (workspacePath: string) => {
      const normalizedWorkspace = normalizeRuntimePath(workspacePath)
      if (!normalizedWorkspace) {
        return
      }
      if (previousWarmupWorkspace && previousWarmupWorkspace !== normalizedWorkspace) {
        warmupManager.abortWarmup(previousWarmupWorkspace)
      }
      previousWarmupWorkspace = normalizedWorkspace
      warmupManager.startWarmup({ cwd: normalizedWorkspace })
    }

    registerStudioMainIpcHandlers({
      ipcMainLike: ipcMain,
      selectWorkspaceDirectory: vi.fn(),
      onWorkspaceChanged,
      mainWindowManager: { getMainWindow: () => null },
      inspectRuntime: vi.fn().mockResolvedValue({ ok: true, status: 'ready', snapshot: {}, workspacePath: null, configWarnings: [], issues: [] }),
      inspectShell: vi.fn().mockResolvedValue({}),
      logger: { info: vi.fn(), error: vi.fn() },
    })

    await ipcMain.invoke('studio:host:bind-workspace', { workspacePath: 'D:\\project-a\\' })
    await ipcMain.invoke('studio:host:bind-workspace', { workspacePath: 'D:/project-a' })

    // 斜杠写法不同也应视为同一个 workspace，只启动一次。
    expect(bootstrapFn).toHaveBeenCalledTimes(1)

    warmupManager.dispose()
  })
})

describe('abortWarmup 限制说明', () => {
  it('abort 是逻辑取消：bootstrapAll 不接受 AbortSignal，已启动的子阶段会继续执行', async () => {
    // 这个测试验证 abort 后 warmup 状态正确回到 idle，
    // 即使底层 bootstrapFn 最终 resolve 也不会更新已 abort 的 entry。
    let resolveBootstrap: ((result: unknown) => void) | null = null
    const bootstrapFn = vi.fn().mockImplementation(
      () => new Promise((resolve) => { resolveBootstrap = resolve }),
    )

    const events: Array<{ status: string }> = []
    const manager = createRuntimeWarmupManager({
      bootstrapFn,
      onStatusChanged: (e) => events.push({ status: e.status }),
    })

    manager.startWarmup({ cwd: 'D:/project' })
    const key = buildWarmupCacheKey({ cwd: 'D:/project' })
    expect(manager.getStatus(key)).toBe('warming')

    // abort
    manager.abortWarmup('D:/project')
    expect(manager.getStatus(key)).toBe('idle')

    // 底层 bootstrap 最终完成 — 不应影响已 abort 的状态
    resolveBootstrap!({
      skillsReady: true,
      fileIndexReady: true,
      systemPromptReady: true,
      warnings: [],
    })

    // 等一个 microtask 让 promise 回调执行
    await new Promise((r) => setTimeout(r, 10))

    // 状态仍然是 idle（entry 已被删除）
    expect(manager.getStatus(key)).toBe('idle')
    // 不应有 'ready' 事件
    expect(events.map((e) => e.status)).not.toContain('ready')

    manager.dispose()
  })
})
