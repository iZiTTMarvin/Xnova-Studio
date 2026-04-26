import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  clearGitBranchCache,
  getGitBranch,
} from '../session-utils.js'

describe('getGitBranch — TTL 缓存', () => {
  let tmpDir: string

  beforeEach(() => {
    clearGitBranchCache()
    // 用临时目录作为非 git 仓库（git rev-parse 会失败 → 返回 'unknown'）
    tmpDir = mkdtempSync(path.join(tmpdir(), 'xnova-git-cache-'))
  })

  afterEach(() => {
    clearGitBranchCache()
    vi.useRealTimers()
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('60 秒内的二次调用直接命中缓存，不再 spawn git 进程', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-26T00:00:00.000Z'))

    const first = getGitBranch(tmpDir)
    expect(first).toBe('unknown')

    // 30 秒后再次调用，应当返回相同值（命中缓存）
    vi.advanceTimersByTime(30_000)
    const second = getGitBranch(tmpDir)
    expect(second).toBe(first)
  })

  it('TTL 过期后 (>60s) 再次调用会重新 spawn git', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-26T00:00:00.000Z'))

    getGitBranch(tmpDir) // 第一次调用，写入缓存
    // 超过 TTL（60s）
    vi.advanceTimersByTime(61_000)
    const result = getGitBranch(tmpDir)
    expect(result).toBe('unknown') // 仍然 unknown（不是 git 仓库）
  })

  it('clearGitBranchCache() 可立即作废缓存', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-26T00:00:00.000Z'))

    getGitBranch(tmpDir)
    clearGitBranchCache()
    // 即使 TTL 还没过，下次调用也会重新执行
    vi.advanceTimersByTime(1_000)
    expect(getGitBranch(tmpDir)).toBe('unknown')
  })

  it('不同 cwd 各自独立缓存，互不影响', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-26T00:00:00.000Z'))

    const otherDir = mkdtempSync(path.join(tmpdir(), 'xnova-git-cache-other-'))
    try {
      const a = getGitBranch(tmpDir)
      const b = getGitBranch(otherDir)
      expect(a).toBe('unknown')
      expect(b).toBe('unknown')
      // 两次调用各自命中各自的缓存，不会互相污染
      vi.advanceTimersByTime(10_000)
      expect(getGitBranch(tmpDir)).toBe(a)
      expect(getGitBranch(otherDir)).toBe(b)
    } finally {
      rmSync(otherDir, { recursive: true, force: true })
    }
  })
})
