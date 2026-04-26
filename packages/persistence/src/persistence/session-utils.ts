import { v7 as uuidv7, v4 as uuidv4 } from 'uuid'
import { spawnSync } from 'node:child_process'

/** 将 cwd 路径转为文件系统安全的目录名（与 Claude Code 一致） */
export function toProjectSlug(cwd: string): string {
  return cwd.replace(/[/\\:]/g, '-')
}

/** 生成 UUIDv7（时间有序） */
export function generateSessionId(): string {
  return uuidv7()
}

/** 生成普通 UUIDv4（事件 ID） */
export function generateEventId(): string {
  return uuidv4()
}

/** 格式化会话文件名: YYYYMMDDHHMMSSMMM_<sessionId>.jsonl */
export function formatSessionFilename(sessionId: string, date: Date = new Date()): string {
  const y = date.getUTCFullYear()
  const mo = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  const h = String(date.getUTCHours()).padStart(2, '0')
  const mi = String(date.getUTCMinutes()).padStart(2, '0')
  const s = String(date.getUTCSeconds()).padStart(2, '0')
  const ms = String(date.getUTCMilliseconds()).padStart(3, '0')
  return `${y}${mo}${d}${h}${mi}${s}${ms}_${sessionId}.jsonl`
}

/** 从文件名中提取 sessionId */
export function extractSessionId(filename: string): string {
  const match = filename.match(/^\d{17}_(.+)\.jsonl$/)
  return match?.[1] ?? filename.replace('.jsonl', '')
}

/**
 * 实际调用 git 子进程的逻辑（不带缓存），失败返回 'unknown'。
 * 抽离是为了让缓存版可以在 TTL 过期后重新调用，同时也方便测试 mock。
 */
function execGitBranch(cwd: string): string {
  try {
    const result = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd,
      encoding: 'utf-8',
      timeout: 3000,
      stdio: ['pipe', 'pipe', 'ignore'],
    })
    if (result.status !== 0 || result.error) {
      return 'unknown'
    }
    return result.stdout.trim()
  } catch {
    return 'unknown'  // 非 git 仓库或 git 未安装，预期行为
  }
}

interface GitBranchCacheEntry {
  branch: string
  expiresAt: number
}

/**
 * Studio shell.getSnapshot 在每次 IPC 都会调一次 getGitBranch，
 * 频繁起 git 子进程在 Windows 上代价不小。这里缓存 60 秒，
 * 用户切分支后最多 60 秒看到旧值，是可接受的代价。
 */
const GIT_BRANCH_TTL_MS = 60_000
const gitBranchCache = new Map<string, GitBranchCacheEntry>()

/** 获取当前 git 分支名，带 60s TTL 缓存。失败返回 'unknown'。 */
export function getGitBranch(cwd: string): string {
  const now = Date.now()
  const cached = gitBranchCache.get(cwd)
  if (cached && cached.expiresAt > now) {
    return cached.branch
  }
  const branch = execGitBranch(cwd)
  gitBranchCache.set(cwd, {
    branch,
    expiresAt: now + GIT_BRANCH_TTL_MS,
  })
  return branch
}

/** 测试 / 工具用：清空 git 分支缓存，强制下次重新调 git。 */
export function clearGitBranchCache(): void {
  gitBranchCache.clear()
}
