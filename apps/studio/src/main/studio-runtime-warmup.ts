/**
 * RuntimeWarmupManager — Studio main 侧的 runtime 预热管理器。
 *
 * 职责：
 * - 管理 warmup 状态机（idle → warming → ready / failed / stale）
 * - 持有 PreparedRuntimeSnapshot（含 system prompt、tool definitions、fingerprints）
 * - 提供 snapshot validate 供 submit 入口判断 fast/slow path
 * - workspace 切换时 abort 旧 warmup
 * - warmup 失败不阻塞 submit
 * - 失效规则：workspace/provider/agent/skills/hooks/mcp/memory/git 变化时标记 stale
 *
 * 约束：
 * - warmup 不调用 LLM、不创建 AgentLoop、不消耗 token
 * - 不通过 IPC 发送 system prompt、tool definitions 或 API key 给 renderer
 * - snapshot 只保存在内存，不持久化
 * - fingerprint 只用于判断变化，不包含原始密钥
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, statSync, type Dirent } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { normalizeRuntimePath } from './normalize-runtime-path'
import type { BootstrapResult, BootstrapTimings } from '@xnova/core'
import type { RuntimePreparedSnapshot } from '@xnova/runtime'

// ═══ 类型定义 ═══

export type RuntimeWarmupStatus =
  | 'idle'
  | 'warming'
  | 'ready'
  | 'stale'
  | 'failed'

/**
 * PreparedRuntimeSnapshot — 预热阶段准备好的运行时装配结果。
 *
 * 包含 system prompt、tool definitions、各子系统版本指纹等。
 * submit fast path 命中时复用这些结果，避免重新做完整 bootstrap。
 *
 * 安全约束：
 * - 只保存在内存，不持久化到磁盘
 * - 不通过 IPC 发给 renderer
 * - 不写入日志或 timing summary
 * - fingerprint 只用于判断变化，不包含原始密钥
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
  /** 项目/用户配置指纹（config.toml 内容 hash） */
  configFingerprint: string
  /** provider/model 配置指纹（provider name + model name + baseURL hash，不含 API key） */
  providerFingerprint: string
  /** bootstrap 是否已完成 */
  bootstrapReady: boolean
  /** 创建时间戳 */
  createdAt: number
  /** bootstrap 各子阶段耗时（warmup 完成后填充） */
  timings?: BootstrapTimings | undefined

  // ── 装配产物（fast path 复用） ──

  /** 已构建的 system prompt（不通过 IPC 发给 renderer，不写入日志） */
  systemPrompt?: string | undefined
  /** 已注册的完整工具定义列表（含参数 schema，不含工具调用实参） */
  toolDefinitions?: SnapshotToolDefinition[] | undefined
  /** 可执行工具注册表引用；只在 main/runtime 内存中流转，不走 IPC */
  toolRegistry?: RuntimePreparedSnapshot['toolRegistry'] | undefined

  // ── 各子系统版本指纹（失效判断用） ──

  /** agent 配置指纹（agent ID + agent 文件内容 hash） */
  agentConfigFingerprint: string
  /** skills 版本（skills 文件列表 hash） */
  skillsVersion: string
  /** hooks 版本（hooks 配置 hash） */
  hooksVersion: string
  /** MCP 工具列表版本（MCP 配置 + 工具名列表 hash） */
  mcpToolListVersion: string
  /** memory 版本（memory 初始化状态 hash） */
  memoryVersion: string
  /** git 上下文版本（HEAD commit + branch hash） */
  gitContextVersion: string
}

/**
 * 工具定义快照 — 保存 provider 需要的完整工具 schema。
 * 注意：这是工具声明，不是工具调用实参，不包含 write_file.content 等用户内容。
 */
export type SnapshotToolDefinition =
  NonNullable<RuntimePreparedSnapshot['toolDefinitions']>[number]

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
  /** provider/model 配置指纹（不含 API key） */
  providerFingerprint?: string | undefined
  /** 项目/用户配置指纹 */
  configFingerprint?: string | undefined
}

/** snapshot validate 输入 */
export interface SnapshotValidateInput {
  cwd: string
  workspaceRoot?: string | undefined
  agentId?: string | null | undefined
  mode?: 'standard' | 'xforge' | undefined
  /** 当前 provider/model 指纹，用于检测 provider 变化 */
  providerFingerprint?: string | undefined
  /** 当前配置指纹，用于检测配置变化 */
  configFingerprint?: string | undefined
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

/**
 * 失效维度 — 标识哪类变化导致 snapshot 失效。
 * 用于精确标记 stale 原因，便于日志诊断。
 */
export type InvalidationReason =
  | 'workspace-changed'
  | 'provider-changed'
  | 'agent-changed'
  | 'skills-changed'
  | 'hooks-changed'
  | 'mcp-changed'
  | 'memory-changed'
  | 'git-changed'
  | 'config-changed'
  | 'manual'

export interface WorkspaceVersionFingerprints {
  agentConfigFingerprint: string
  skillsVersion: string
  hooksVersion: string
  mcpToolListVersion: string
  memoryVersion: string
  gitContextVersion: string
}

// ═══ 内部状态 ═══

interface WarmupEntry {
  cacheKey: string
  status: RuntimeWarmupStatus
  snapshot: PreparedRuntimeSnapshot | null
  abortController: AbortController | null
  warmupPromise: Promise<WarmupBootstrapResult> | null
  startedAt: number
  error?: string
}

// ═══ Cache Key 构建 ═══

/**
 * 构建 warmup cache key。
 * 使用规范化路径确保 D:/foo、D:\foo、D:\foo\ 产生相同 key。
 *
 * cache key 维度：
 * - normalized cwd
 * - normalized workspaceRoot（当前与 cwd 相同，monorepo 场景下可能不同）
 * - agentId
 * - mode
 * - providerFingerprint（provider/model 变化时 key 不同）
 * - configFingerprint（配置变化时 key 不同）
 */
export function buildWarmupCacheKey(input: {
  cwd: string
  workspaceRoot?: string | undefined
  agentId?: string | null | undefined
  mode?: 'standard' | 'xforge' | undefined
  providerFingerprint?: string | undefined
  configFingerprint?: string | undefined
}): string {
  const normalizedCwd = normalizeRuntimePath(input.cwd)
  const normalizedWorkspaceRoot = normalizeRuntimePath(input.workspaceRoot ?? input.cwd)
  const agentId = input.agentId ?? '__default_agent__'
  const mode = input.mode ?? 'standard'
  const providerFp = input.providerFingerprint ?? '__no_provider__'
  const configFp = input.configFingerprint ?? '__no_config__'
  return `warmup::${normalizedCwd}::${normalizedWorkspaceRoot}::${agentId}::${mode}::${providerFp}::${configFp}`
}

// ═══ Fingerprint 工具函数 ═══

/**
 * 构建 provider/model 指纹。
 * 只包含 provider name、model name、baseURL 的 hash，不包含 API key。
 * 用于检测 provider/model 切换。
 */
export function buildProviderFingerprint(input: {
  provider?: string | null
  model?: string | null
  baseURL?: string | null
}): string {
  const parts = [
    input.provider ?? '__default__',
    input.model ?? '__default__',
    input.baseURL ?? '__default_url__',
  ]
  return simpleHash(parts.join('|'))
}

/**
 * 构建配置指纹。
 * 基于配置对象的 JSON 序列化 hash，不包含 API key 等敏感字段。
 */
export function buildConfigFingerprint(config: Record<string, unknown>): string {
  // 浅拷贝并移除敏感字段
  const sanitized = sanitizeConfigForFingerprint(config)
  return simpleHash(JSON.stringify(sanitized))
}

/**
 * 简单 hash 函数 — 用于生成指纹字符串。
 * 不用于安全场景，只用于变化检测。
 */
function simpleHash(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash + char) | 0
  }
  // 转为正整数的 hex 字符串
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/**
 * 从配置对象中移除敏感字段（apiKey、Authorization 等），
 * 确保 fingerprint 不包含原始密钥。
 */
function sanitizeConfigForFingerprint(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj
  if (typeof obj !== 'object') return obj
  if (Array.isArray(obj)) return obj.map(sanitizeConfigForFingerprint)

  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase()
    // 跳过敏感字段
    if (
      lowerKey === 'apikey' ||
      lowerKey === 'api_key' ||
      lowerKey === 'authorization' ||
      lowerKey === 'token' ||
      lowerKey === 'secret' ||
      lowerKey === 'password'
    ) {
      result[key] = '[REDACTED]'
      continue
    }
    result[key] = sanitizeConfigForFingerprint(value)
  }
  return result
}

// ═══ Workspace version fingerprints ═══

const VERSION_SCAN_MAX_FILES = 1000
const VERSION_SCAN_MAX_DEPTH = 6
const VERSION_SCAN_IGNORED_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  '.cache',
])

function emptyWorkspaceVersionFingerprints(): WorkspaceVersionFingerprints {
  return {
    agentConfigFingerprint: '',
    skillsVersion: '',
    hooksVersion: '',
    mcpToolListVersion: '',
    memoryVersion: '',
    gitContextVersion: '',
  }
}

function findMatchingFiles(
  root: string,
  predicate: (name: string) => boolean,
  maxDepth = VERSION_SCAN_MAX_DEPTH,
): string[] {
  const out: string[] = []
  if (!existsSync(root)) {
    return out
  }

  const walk = (dir: string, depth: number): void => {
    if (depth < 0 || out.length >= VERSION_SCAN_MAX_FILES) {
      return
    }

    let entries: Dirent[]
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      if (out.length >= VERSION_SCAN_MAX_FILES) {
        return
      }
      if (entry.isSymbolicLink()) {
        continue
      }

      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!VERSION_SCAN_IGNORED_DIRS.has(entry.name)) {
          walk(fullPath, depth - 1)
        }
        continue
      }

      if (entry.isFile() && predicate(entry.name)) {
        out.push(fullPath)
      }
    }
  }

  walk(root, maxDepth)
  return out.sort()
}

function fingerprintFiles(files: string[]): string {
  const parts: string[] = []
  for (const file of [...new Set(files)].sort()) {
    try {
      const stat = statSync(file)
      if (!stat.isFile() && !stat.isDirectory()) {
        continue
      }
      parts.push([
        normalizeRuntimePath(file),
        stat.isDirectory() ? 'dir' : 'file',
        stat.size,
        Math.floor(stat.mtimeMs),
      ].join('|'))
    } catch {
      // 文件可能在扫描和 stat 之间被删除；下次 validate 会重新计算。
    }
  }
  return simpleHash(parts.join('\n'))
}

function fingerprintGitContext(cwd: string): string {
  try {
    const inside = spawnSync(
      'git',
      ['rev-parse', '--is-inside-work-tree'],
      { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 500 },
    )
    if (inside.status !== 0 || inside.stdout.trim() !== 'true') {
      return simpleHash('git:not-a-repo')
    }

    const commands: string[][] = [
      ['branch', '--show-current'],
      ['rev-parse', 'HEAD'],
    ]
    const parts = commands.map((args) => {
      const result = spawnSync(
        'git',
        args,
        { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 500 },
      )
      return [
        args.join(' '),
        result.status ?? 'timeout',
        result.stdout.trim(),
      ].join(':')
    })
    return simpleHash(parts.join('\n'))
  } catch {
    return simpleHash('git:error')
  }
}

/**
 * 构建 workspace 相关轻量版本指纹。
 *
 * 这里不读取正文、不写日志，只用路径、大小和 mtime 生成 hash；
 * 目的不是安全校验，而是在用户直接修改 skills/hooks/agent/memory/git 时，
 * 让 submit 前的 snapshot validate 能发现“这份预热结果已经旧了”。
 */
export function buildWorkspaceVersionFingerprints(
  cwd: string,
): WorkspaceVersionFingerprints {
  const userXnovaDir = join(homedir(), '.xnovacode')
  const projectXnovaDir = join(cwd, '.xnovacode')
  const pluginRoots = [
    join(userXnovaDir, 'plugins'),
    join(projectXnovaDir, 'plugins'),
  ]

  const skillsFiles = [
    ...findMatchingFiles(join(userXnovaDir, 'skills'), (name) => name === 'SKILL.md'),
    ...findMatchingFiles(join(projectXnovaDir, 'skills'), (name) => name === 'SKILL.md'),
    ...pluginRoots.flatMap((root) =>
      findMatchingFiles(root, (name) => name === 'SKILL.md' || name === 'plugin.json'),
    ),
  ]
  const hooksFiles = [
    join(projectXnovaDir, 'hooks.json'),
    join(userXnovaDir, 'hooks.json'),
    ...pluginRoots.flatMap((root) =>
      findMatchingFiles(root, (name) => name === 'hooks.json'),
    ),
  ]
  const agentFiles = findMatchingFiles(
    join(userXnovaDir, 'agents'),
    (name) => name.endsWith('.md'),
    2,
  )
  const mcpFiles = [
    join(userXnovaDir, '.mcp.json'),
    join(homedir(), '.claude.json'),
    join(homedir(), '.mcp.json'),
  ]
  const memoryFiles = [
    ...findMatchingFiles(
      join(userXnovaDir, 'memory'),
      (name) => name.endsWith('.md') || name.endsWith('.json'),
      4,
    ),
    ...findMatchingFiles(
      join(projectXnovaDir, 'memory'),
      (name) => name.endsWith('.md') || name.endsWith('.json'),
      4,
    ),
  ]

  return {
    agentConfigFingerprint: fingerprintFiles(agentFiles),
    skillsVersion: fingerprintFiles(skillsFiles),
    hooksVersion: fingerprintFiles(hooksFiles),
    mcpToolListVersion: fingerprintFiles(mcpFiles),
    memoryVersion: fingerprintFiles(memoryFiles),
    gitContextVersion: fingerprintGitContext(cwd),
  }
}

function getVersionMismatchReason(
  snapshot: PreparedRuntimeSnapshot,
  current: WorkspaceVersionFingerprints,
): InvalidationReason | null {
  if (
    snapshot.agentConfigFingerprint &&
    snapshot.agentConfigFingerprint !== current.agentConfigFingerprint
  ) {
    return 'agent-changed'
  }
  if (snapshot.skillsVersion && snapshot.skillsVersion !== current.skillsVersion) {
    return 'skills-changed'
  }
  if (snapshot.hooksVersion && snapshot.hooksVersion !== current.hooksVersion) {
    return 'hooks-changed'
  }
  if (
    snapshot.mcpToolListVersion &&
    snapshot.mcpToolListVersion !== current.mcpToolListVersion
  ) {
    return 'mcp-changed'
  }
  if (snapshot.memoryVersion && snapshot.memoryVersion !== current.memoryVersion) {
    return 'memory-changed'
  }
  if (snapshot.gitContextVersion && snapshot.gitContextVersion !== current.gitContextVersion) {
    return 'git-changed'
  }
  return null
}

// ═══ Manager 接口 ═══

/**
 * bootstrapFn 的扩展返回类型 — 除了 BootstrapResult，
 * 还可以返回 system prompt 和 tool definitions 供 snapshot 缓存。
 */
export interface WarmupBootstrapResult extends BootstrapResult, RuntimePreparedSnapshot {
  /** 已构建的 system prompt */
  systemPrompt?: string | undefined
  /** 已注册的工具定义列表 */
  toolDefinitions?: SnapshotToolDefinition[] | undefined
  /** 可执行工具注册表引用 */
  toolRegistry?: RuntimePreparedSnapshot['toolRegistry'] | undefined
  /** 各子系统版本指纹 */
  agentConfigFingerprint?: string | undefined
  skillsVersion?: string | undefined
  hooksVersion?: string | undefined
  mcpToolListVersion?: string | undefined
  memoryVersion?: string | undefined
  gitContextVersion?: string | undefined
}

export interface RuntimeWarmupManagerOptions {
  /**
   * bootstrap 函数注入点，默认使用 @xnova/core 的 bootstrapAll。
   * 测试时可替换为 mock。
   */
  bootstrapFn?: (cwd: string) => Promise<WarmupBootstrapResult>
  /**
   * workspace 版本指纹注入点。
   * 生产默认扫描本地 skills/hooks/agent/memory/git；测试可注入稳定值。
   */
  versionFingerprintFn?: (cwd: string) => WorkspaceVersionFingerprints
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
  /**
   * 标记指定 cwd 的所有 snapshot 为 stale。
   * 当 skills/hooks/mcp/memory/git/config 等变化时调用。
   */
  invalidateSnapshot(cwd: string, reason: InvalidationReason): void
  /**
   * 标记所有 snapshot 为 stale（全局失效）。
   * 当 provider/model 设置变化等全局事件时调用。
   */
  invalidateAll(reason: InvalidationReason): void
  /**
   * slow path 成功后刷新 snapshot。
   * 将新的装配结果写入已有 entry，状态从 stale/failed 恢复为 ready。
   */
  refreshSnapshot(input: RefreshSnapshotInput): void
  /** 获取当前所有 entry 的 cache key（调试用） */
  getEntryKeys(): string[]
  /** 清理所有 warmup 状态 */
  dispose(): void
}

/** slow path 成功后刷新 snapshot 的输入 */
export interface RefreshSnapshotInput {
  cwd: string
  workspaceRoot?: string | undefined
  agentId?: string | null | undefined
  mode?: 'standard' | 'xforge' | undefined
  providerFingerprint?: string | undefined
  configFingerprint?: string | undefined
  bootstrapResult: WarmupBootstrapResult
}

// ═══ 工厂函数 ═══

export function createRuntimeWarmupManager(
  options: RuntimeWarmupManagerOptions = {},
): RuntimeWarmupManager {
  const entries = new Map<string, WarmupEntry>()
  const versionFingerprintFn =
    options.versionFingerprintFn ?? buildWorkspaceVersionFingerprints
  const shouldValidateVersionFingerprints =
    options.versionFingerprintFn !== undefined || options.bootstrapFn === undefined

  /**
   * 默认 bootstrap 函数：延迟导入 @xnova/core 的 bootstrapAll，
   * 避免模块加载阶段触发重型初始化。
   */
  const bootstrapFn = options.bootstrapFn ?? (async (cwd: string): Promise<WarmupBootstrapResult> => {
    const { bootstrapAll, getSystemPrompt, getRegistry, registerMcpTools } = await import('@xnova/core')
    const result = await bootstrapAll(cwd)

    // 收集 fast path 真正需要复用的本地装配结果。这里仍不创建 AgentLoop、不调用 LLM。
    const systemPrompt = getSystemPrompt()
    const registry = getRegistry()
    registerMcpTools(registry)
    const toolDefinitions = registry.toToolDefinitions()

    return {
      ...result,
      systemPrompt,
      toolDefinitions,
      toolRegistry: registry,
      bootstrapWarnings: result.warnings,
      bootstrapTimings: result.timings,
    }
  })

  function resolveVersionFingerprints(
    cwd: string,
    result?: Partial<Record<keyof WorkspaceVersionFingerprints, string | undefined>>,
  ): WorkspaceVersionFingerprints {
    let current = emptyWorkspaceVersionFingerprints()
    try {
      current = versionFingerprintFn(cwd)
    } catch {
      // 指纹只用于失效判断，计算失败不能阻断 warmup 或 submit。
    }
    return {
      agentConfigFingerprint:
        result?.agentConfigFingerprint ?? current.agentConfigFingerprint,
      skillsVersion: result?.skillsVersion ?? current.skillsVersion,
      hooksVersion: result?.hooksVersion ?? current.hooksVersion,
      mcpToolListVersion:
        result?.mcpToolListVersion ?? current.mcpToolListVersion,
      memoryVersion: result?.memoryVersion ?? current.memoryVersion,
      gitContextVersion: result?.gitContextVersion ?? current.gitContextVersion,
    }
  }

  function maybeInvalidateByVersionDrift(
    entry: WarmupEntry,
  ): InvalidationReason | null {
    if (!shouldValidateVersionFingerprints || !entry.snapshot) {
      return null
    }

    try {
      const current = versionFingerprintFn(entry.snapshot.cwd)
      const reason = getVersionMismatchReason(entry.snapshot, current)
      if (!reason) {
        return null
      }
      entry.status = 'stale'
      entry.error = `invalidated: ${reason}`
      emitStatusChanged(entry)
      return reason
    } catch {
      return null
    }
  }

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
        workspaceRoot: normalizedWorkspaceRoot,
        agentId: input.agentId,
        mode: input.mode,
        providerFingerprint: input.providerFingerprint,
        configFingerprint: input.configFingerprint,
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
        configFingerprint: input.configFingerprint ?? '',
        providerFingerprint: input.providerFingerprint ?? '',
        bootstrapReady: false,
        createdAt: Date.now(),
        // 版本指纹初始为空，warmup 完成后填充
        agentConfigFingerprint: '',
        skillsVersion: '',
        hooksVersion: '',
        mcpToolListVersion: '',
        memoryVersion: '',
        gitContextVersion: '',
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

          const versions = resolveVersionFingerprints(normalizedCwd, result)
          entry.status = 'ready'
          entry.snapshot = {
            ...snapshot,
            bootstrapReady: true,
            timings: result.timings,
            // 填充装配产物
            systemPrompt: result.systemPrompt,
            toolDefinitions: result.toolDefinitions,
            toolRegistry: result.toolRegistry,
            // 填充版本指纹
            agentConfigFingerprint: versions.agentConfigFingerprint,
            skillsVersion: versions.skillsVersion,
            hooksVersion: versions.hooksVersion,
            mcpToolListVersion: versions.mcpToolListVersion,
            memoryVersion: versions.memoryVersion,
            gitContextVersion: versions.gitContextVersion,
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
        workspaceRoot: input.workspaceRoot,
        agentId: input.agentId,
        mode: input.mode,
        providerFingerprint: input.providerFingerprint,
        configFingerprint: input.configFingerprint,
      })

      const entry = entries.get(cacheKey)
      if (!entry || !entry.snapshot) {
        return { hit: false, snapshot: null, missReason: 'no-snapshot' }
      }

      switch (entry.status) {
        case 'ready':
          if (maybeInvalidateByVersionDrift(entry)) {
            return { hit: false, snapshot: entry.snapshot, missReason: 'stale' }
          }
          if (entry.snapshot.bootstrapReady && entry.snapshot.toolRegistry) {
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

    invalidateSnapshot(cwd, reason) {
      const matchingEntries = findEntriesByCwd(cwd)
      for (const entry of matchingEntries) {
        if (entry.status === 'ready') {
          entry.status = 'stale'
          entry.error = `invalidated: ${reason}`
          emitStatusChanged(entry)
        }
      }
    },

    invalidateAll(reason) {
      for (const entry of entries.values()) {
        if (entry.status === 'ready') {
          entry.status = 'stale'
          entry.error = `invalidated: ${reason}`
          emitStatusChanged(entry)
        }
      }
    },

    refreshSnapshot(input) {
      const normalizedCwd = normalizeRuntimePath(input.cwd)
      const normalizedWorkspaceRoot = normalizeRuntimePath(
        input.workspaceRoot ?? input.cwd,
      )
      const cacheKey = buildWarmupCacheKey({
        cwd: normalizedCwd,
        workspaceRoot: normalizedWorkspaceRoot,
        agentId: input.agentId,
        mode: input.mode,
        providerFingerprint: input.providerFingerprint,
        configFingerprint: input.configFingerprint,
      })

      const existing = entries.get(cacheKey)
      const versions = resolveVersionFingerprints(
        normalizedCwd,
        input.bootstrapResult,
      )
      if (existing) {
        // 刷新已有 entry
        existing.status = 'ready'
        delete existing.error
        existing.snapshot = {
          cacheKey,
          cwd: normalizedCwd,
          workspaceRoot: normalizedWorkspaceRoot,
          agentId: input.agentId ?? null,
          mode: input.mode ?? 'standard',
          configFingerprint: input.configFingerprint ?? '',
          providerFingerprint: input.providerFingerprint ?? '',
          bootstrapReady: true,
          createdAt: Date.now(),
          timings: input.bootstrapResult.timings,
          systemPrompt: input.bootstrapResult.systemPrompt,
          toolDefinitions: input.bootstrapResult.toolDefinitions,
          toolRegistry: input.bootstrapResult.toolRegistry,
          agentConfigFingerprint: versions.agentConfigFingerprint,
          skillsVersion: versions.skillsVersion,
          hooksVersion: versions.hooksVersion,
          mcpToolListVersion: versions.mcpToolListVersion,
          memoryVersion: versions.memoryVersion,
          gitContextVersion: versions.gitContextVersion,
        }
        emitStatusChanged(existing)
      } else {
        // 创建新 entry（slow path 首次成功后）
        const snapshot: PreparedRuntimeSnapshot = {
          cacheKey,
          cwd: normalizedCwd,
          workspaceRoot: normalizedWorkspaceRoot,
          agentId: input.agentId ?? null,
          mode: input.mode ?? 'standard',
          configFingerprint: input.configFingerprint ?? '',
          providerFingerprint: input.providerFingerprint ?? '',
          bootstrapReady: true,
          createdAt: Date.now(),
          timings: input.bootstrapResult.timings,
          systemPrompt: input.bootstrapResult.systemPrompt,
          toolDefinitions: input.bootstrapResult.toolDefinitions,
          toolRegistry: input.bootstrapResult.toolRegistry,
          agentConfigFingerprint: versions.agentConfigFingerprint,
          skillsVersion: versions.skillsVersion,
          hooksVersion: versions.hooksVersion,
          mcpToolListVersion: versions.mcpToolListVersion,
          memoryVersion: versions.memoryVersion,
          gitContextVersion: versions.gitContextVersion,
        }
        const newEntry: WarmupEntry = {
          cacheKey,
          status: 'ready',
          snapshot,
          abortController: null,
          warmupPromise: null,
          startedAt: Date.now(),
        }
        entries.set(cacheKey, newEntry)
        emitStatusChanged(newEntry)
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
