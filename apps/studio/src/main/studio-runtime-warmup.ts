/**
 * RuntimeWarmupManager — Studio main 侧的 runtime 预热管理器。
 *
 * 职责：
 * - 管理 warmup 状态机（idle → warming → ready / failed）
 * - 持有 PreparedRuntimeSnapshot 骨架
 * - 提供 snapshot validate 供 submit 入口判断 fast/slow path
 * - workspace 切换时 abort 旧 warmup
 * - warmup 失败不阻塞 submit
 *
 * 约束：
 * - warmup 不调用 LLM、不创建 AgentLoop、不消耗 token
 * - 第一阶段只预热 bootstrapAll，后续扩展到完整 snapshot
 * - 不通过 IPC 发送 system prompt 或 API key 给 renderer
 */

import { normalizeRuntimePath } from './normalize-runtime-path'
import type { BootstrapResult, BootstrapTimings } from '@xnova/core'

// ═══ 类型定义 ═══

export type RuntimeWarmupStatus =
  | 'idle'
  | 'warming'
  | 'ready'
  | 'stale'
  | 'failed'

/**
 * PreparedRuntimeSnapshot 骨架。
 * 第一阶段只填充 bootstrapReady，后续扩展到完整 fast path。
 */
export interface PreparedRuntimeSnapshot {
  /** 规范化后的 cache key，用于匹配 submit 请求 */
  cacheKey: string
  /** 规范化后的 cwd */
  cwd: string
  /** 规范化后的 workspaceRoot */
  workspaceRoot: string
  /** 当前 agent ID（null = 默认 agent） */
  agentId: string | null
  /** 运行模式 */
  mode: 'standard' | 'xforge'
  /** 配置指纹（第一阶段为空字符串占位） */
  configFingerprint: string
  /** provider 指纹（第一阶段为空字符串占位） */
  providerFingerprint: string
  /** bootstrap 是否已完成 */
  bootstrapReady: boolean
  /** 创建时间戳 */
  createdAt: number
  /** bootstrap 各子阶段耗时（warmup 完成后填充） */
  timings?: BootstrapTimings | undefined
}

export interface RuntimeWarmupStatusChangedEvent {
  status: RuntimeWarmupStatus
  cwd: string
  cacheKey: string
  durationMs?: number | undefined
  error?: string | undefined
}

/** warmup 启动输入 */
export interface WarmupStartInput {
  cwd: string
  workspaceRoot?: string | undefined
  agentId?: string | null | undefined
  mode?: 'standard' | 'xforge' | undefined
}

/** snapshot validate 输入 */
export interface SnapshotValidateInput {
  cwd: string
  workspaceRoot?: string | undefined
  agentId?: string | null | undefined
  mode?: 'standard' | 'xforge' | undefined
}

/** snapshot validate 结果 */
export interface SnapshotValidateResult {
  /** 是否命中有效 snapshot */
  hit: boolean
  /** 命中的 snapshot（未命中时为 null） */
  snapshot: PreparedRuntimeSnapshot | null
  /** 未命中原因 */
  missReason?: 'no-snapshot' | 'not-ready' | 'stale' | 'failed' | 'key-mismatch' | undefined
}

// ═══ 内部状态 ═══

interface WarmupEntry {
  cacheKey: string
  status: RuntimeWarmupStatus
  snapshot: PreparedRuntimeSnapshot | null
  abortController: AbortController | null
  warmupPromise: Promise<BootstrapResult> | null
  startedAt: number
  error?: string
}

// ═══ Cache Key 构建 ═══

/**
 * 构建 warmup cache key。
 * 使用规范化路径确保 D:/foo、D:\foo、D:\foo\ 产生相同 key。
 *
 * 第一阶段 key 只包含 cwd + agentId + mode，不包含 workspaceRoot。
 * 原因：当前 Studio 的 openWorkspace/bindWorkspace 只传入一个路径，
 * cwd 和 workspaceRoot 在第一阶段始终相同。后续如果支持 monorepo
 * 子目录（cwd ≠ workspaceRoot），需要把 workspaceRoot 加入 key。
 */
export function buildWarmupCacheKey(input: {
  cwd: string
  agentId?: string | null | undefined
  mode?: 'standard' | 'xforge' | undefined
}): string {
  const normalizedCwd = normalizeRuntimePath(input.cwd)
  const agentId = input.agentId ?? '__default_agent__'
  const mode = input.mode ?? 'standard'
  return `warmup::${normalizedCwd}::${agentId}::${mode}`
}

// ═══ Manager 接口 ═══

export interface RuntimeWarmupManagerOptions {
  /**
   * bootstrap 函数注入点，默认使用 @xnova/core 的 bootstrapAll。
   * 测试时可替换为 mock。
   */
  bootstrapFn?: (cwd: string) => Promise<BootstrapResult>
  /** 状态变更回调（供 host 层转发给 renderer 或记录日志） */
  onStatusChanged?: (event: RuntimeWarmupStatusChangedEvent) => void
}

export interface RuntimeWarmupManager {
  /** 启动或复用当前 warmup */
  startWarmup(input: WarmupStartInput): void
  /** 取消指定 cwd 的 warmup（workspace 切换或 dispose 时调用） */
  abortWarmup(cwd: string): void
  /** 读取指定 cache key 的状态 */
  getStatus(cacheKey: string): RuntimeWarmupStatus
  /** submit 前校验 snapshot */
  validateSnapshot(input: SnapshotValidateInput): SnapshotValidateResult
  /** 获取当前所有 entry 的 cache key（调试用） */
  getEntryKeys(): string[]
  /** 清理所有 warmup 状态 */
  dispose(): void
}

// ═══ 工厂函数 ═══

export function createRuntimeWarmupManager(
  options: RuntimeWarmupManagerOptions = {},
): RuntimeWarmupManager {
  const entries = new Map<string, WarmupEntry>()

  /**
   * 默认 bootstrap 函数：延迟导入 @xnova/core 的 bootstrapAll，
   * 避免模块加载阶段触发重型初始化。
   */
  const bootstrapFn = options.bootstrapFn ?? (async (cwd: string) => {
    const { bootstrapAll } = await import('@xnova/core')
    return bootstrapAll(cwd)
  })

  function emitStatusChanged(entry: WarmupEntry, durationMs?: number): void {
    options.onStatusChanged?.({
      status: entry.status,
      cwd: entry.snapshot?.cwd ?? '',
      cacheKey: entry.cacheKey,
      durationMs,
      error: entry.error,
    })
  }

  /**
   * 查找与指定 cwd 关联的 entry（按规范化路径匹配）。
   * 一个 cwd 可能对应多个 entry（不同 agentId/mode），
   * 这里返回所有匹配的 entry。
   */
  function findEntriesByCwd(cwd: string): WarmupEntry[] {
    const normalizedCwd = normalizeRuntimePath(cwd)
    return [...entries.values()].filter(
      (entry) => entry.snapshot?.cwd === normalizedCwd,
    )
  }

  return {
    startWarmup(input) {
      const normalizedCwd = normalizeRuntimePath(input.cwd)
      if (!normalizedCwd) return

      const normalizedWorkspaceRoot = normalizeRuntimePath(
        input.workspaceRoot ?? input.cwd,
      )
      const cacheKey = buildWarmupCacheKey({
        cwd: normalizedCwd,
        agentId: input.agentId,
        mode: input.mode,
      })

      // 已有 entry 且正在 warming 或已 ready → 复用
      const existing = entries.get(cacheKey)
      if (existing && (existing.status === 'warming' || existing.status === 'ready')) {
        return
      }

      const abortController = new AbortController()
      const snapshot: PreparedRuntimeSnapshot = {
        cacheKey,
        cwd: normalizedCwd,
        workspaceRoot: normalizedWorkspaceRoot,
        agentId: input.agentId ?? null,
        mode: input.mode ?? 'standard',
        configFingerprint: '',
        providerFingerprint: '',
        bootstrapReady: false,
        createdAt: Date.now(),
      }

      const entry: WarmupEntry = {
        cacheKey,
        status: 'warming',
        snapshot,
        abortController,
        warmupPromise: null,
        startedAt: Date.now(),
      }
      entries.set(cacheKey, entry)
      emitStatusChanged(entry)

      // 启动 warmup（fire-and-forget，不阻塞调用方）
      const warmupPromise = bootstrapFn(normalizedCwd)
        .then((result) => {
          // 检查是否已被 abort
          if (abortController.signal.aborted) return result

          const currentEntry = entries.get(cacheKey)
          if (!currentEntry || currentEntry !== entry) return result

          entry.status = 'ready'
          entry.snapshot = {
            ...snapshot,
            bootstrapReady: true,
            timings: result.timings,
          }
          const durationMs = Date.now() - entry.startedAt
          emitStatusChanged(entry, durationMs)
          return result
        })
        .catch((err) => {
          // 检查是否已被 abort
          if (abortController.signal.aborted) throw err

          const currentEntry = entries.get(cacheKey)
          if (!currentEntry || currentEntry !== entry) throw err

          entry.status = 'failed'
          entry.error = err instanceof Error ? err.message : String(err)
          const durationMs = Date.now() - entry.startedAt
          emitStatusChanged(entry, durationMs)
          throw err
        })

      entry.warmupPromise = warmupPromise
      // fire-and-forget：不让 unhandled rejection 泄漏
      warmupPromise.catch(() => {})
    },

    abortWarmup(cwd) {
      // 注意：这里的 abort 是逻辑取消 — 通过 AbortController.abort() 标记后，
      // warmup promise 的 .then/.catch 回调会检查 signal.aborted 并跳过状态更新。
      // 但底层 bootstrapAll() 当前不接受 AbortSignal，所以已启动的 bootstrap
      // 子阶段（skills/hooks/fileIndex 等）会继续执行到完成。
      // 这是可接受的：bootstrapAll 本身是幂等的，重复调用会命中 promise cache；
      // 真正的资源浪费只在首次调用时发生，且 bootstrap 通常在几百毫秒内完成。
      // 如果后续需要真正中止重型 bootstrap（如大型 monorepo 的 fileIndex），
      // 应在 bootstrapAll 内部增加 AbortSignal 支持，而不是在 warmup 层 hack。
      const matchingEntries = findEntriesByCwd(cwd)
      for (const entry of matchingEntries) {
        if (entry.status === 'warming') {
          entry.abortController?.abort()
          entry.status = 'idle'
          entry.warmupPromise = null
          emitStatusChanged(entry)
        }
        entries.delete(entry.cacheKey)
      }
    },

    getStatus(cacheKey) {
      return entries.get(cacheKey)?.status ?? 'idle'
    },

    validateSnapshot(input) {
      const cacheKey = buildWarmupCacheKey({
        cwd: input.cwd,
        agentId: input.agentId,
        mode: input.mode,
      })

      const entry = entries.get(cacheKey)
      if (!entry || !entry.snapshot) {
        return { hit: false, snapshot: null, missReason: 'no-snapshot' }
      }

      switch (entry.status) {
        case 'ready':
          if (entry.snapshot.bootstrapReady) {
            return { hit: true, snapshot: entry.snapshot }
          }
          return { hit: false, snapshot: entry.snapshot, missReason: 'not-ready' }

        case 'stale':
          return { hit: false, snapshot: entry.snapshot, missReason: 'stale' }

        case 'failed':
          return { hit: false, snapshot: entry.snapshot, missReason: 'failed' }

        case 'warming':
          // 正在预热中，submit 不等待，走 slow path
          return { hit: false, snapshot: entry.snapshot, missReason: 'not-ready' }

        case 'idle':
        default:
          return { hit: false, snapshot: null, missReason: 'no-snapshot' }
      }
    },

    getEntryKeys() {
      return [...entries.keys()]
    },

    dispose() {
      for (const entry of entries.values()) {
        entry.abortController?.abort()
      }
      entries.clear()
    },
  }
}
