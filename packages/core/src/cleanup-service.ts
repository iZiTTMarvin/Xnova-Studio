// src/core/cleanup-service.ts

/**
 * CleanupService — 会话与数据清理服务。
 *
 * 提供 dry-run 统计和实际清理两个主要操作，
 * 支持按 sessions / usage 分别或同时清理。
 */

import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { Database } from 'libsql'
import { sessionStore } from '@persistence/index.js'
import { getDb } from '@persistence/db.js'
import { cleanupImages } from './image-store.js'

const DEFAULT_SESSION_RETENTION_DAYS = 30
const DEFAULT_USAGE_RETENTION_DAYS = 90

export interface CleanupStats {
  sessions: {
    totalFiles: number
    totalSizeBytes: number
    expiredFiles: number
    expiredSizeBytes: number
  }
  usage: {
    totalRows: number
    expiredRows: number
  }
  images: {
    totalFiles: number
    expiredFiles: number
  }
}

export interface CleanupOptions {
  sessionRetentionDays?: number | undefined
  usageRetentionDays?: number | undefined
  target?: 'sessions' | 'usage' | 'all' | undefined
  activeSessionId?: string | undefined
  _db?: Database | undefined
}

export interface CleanupResult {
  deletedSessionFiles: number
  deletedSessionBytes: number
  deletedUsageRows: number
  deletedImages: number
}

export function getCleanupStats(options: CleanupOptions = {}): CleanupStats {
  const sessionDays = options.sessionRetentionDays ?? DEFAULT_SESSION_RETENTION_DAYS
  const usageDays = options.usageRetentionDays ?? DEFAULT_USAGE_RETENTION_DAYS
  const target = options.target ?? 'all'
  const db = options._db ?? getDb()

  const sessions =
    target === 'all' || target === 'sessions'
      ? scanSessionFiles(sessionDays)
      : { totalFiles: 0, totalSizeBytes: 0, expiredFiles: 0, expiredSizeBytes: 0 }

  const usage =
    target === 'all' || target === 'usage'
      ? scanUsageLogs(usageDays, db)
      : { totalRows: 0, expiredRows: 0 }

  const images =
    target === 'all' || target === 'sessions'
      ? scanImageFiles(sessionDays)
      : { totalFiles: 0, expiredFiles: 0 }

  return { sessions, usage, images }
}

export function executeCleanup(options: CleanupOptions = {}): CleanupResult {
  const sessionDays = options.sessionRetentionDays ?? DEFAULT_SESSION_RETENTION_DAYS
  const usageDays = options.usageRetentionDays ?? DEFAULT_USAGE_RETENTION_DAYS
  const target = options.target ?? 'all'
  const db = options._db ?? getDb()

  let deletedSessionFiles = 0
  let deletedSessionBytes = 0
  let deletedUsageRows = 0
  let deletedImages = 0

  if (target === 'all' || target === 'sessions') {
    const before = scanSessionFiles(sessionDays)
    sessionStore.cleanup(sessionDays)
    deletedSessionFiles = before.expiredFiles
    deletedSessionBytes = before.expiredSizeBytes
    deletedImages = cleanupImages(sessionDays)
  }

  if (target === 'all' || target === 'usage') {
    deletedUsageRows = deleteExpiredUsageLogs(usageDays, db)
  }

  return {
    deletedSessionFiles,
    deletedSessionBytes,
    deletedUsageRows,
    deletedImages,
  }
}

function scanSessionFiles(retentionDays: number): CleanupStats['sessions'] {
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000
  const baseDir = sessionStore.baseDir
  let totalFiles = 0
  let totalSizeBytes = 0
  let expiredFiles = 0
  let expiredSizeBytes = 0

  let slugs: string[]
  try {
    slugs = readdirSync(baseDir)
  } catch {
    return { totalFiles, totalSizeBytes, expiredFiles, expiredSizeBytes }
  }

  for (const slug of slugs) {
    const dir = join(baseDir, slug)
    let entries: string[]
    try {
      entries = readdirSync(dir).filter((file) => file.endsWith('.jsonl'))
    } catch {
      continue
    }
    for (const entry of entries) {
      try {
        const stat = statSync(join(dir, entry))
        totalFiles++
        totalSizeBytes += stat.size
        if (stat.mtime.getTime() < cutoff) {
          expiredFiles++
          expiredSizeBytes += stat.size
        }
      } catch {
        continue
      }
    }
  }

  return { totalFiles, totalSizeBytes, expiredFiles, expiredSizeBytes }
}

function scanUsageLogs(retentionDays: number, db: Database): CleanupStats['usage'] {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString()
  const totalRow = db.prepare('SELECT COUNT(*) as cnt FROM usage_logs').get() as { cnt: number }
  const expiredRow = db
    .prepare('SELECT COUNT(*) as cnt FROM usage_logs WHERE timestamp < ?')
    .get(cutoff) as { cnt: number }
  return { totalRows: totalRow.cnt, expiredRows: expiredRow.cnt }
}

function scanImageFiles(retentionDays: number): CleanupStats['images'] {
  const imagesDir = join(process.cwd(), '.xnovacode', 'images')
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000
  let totalFiles = 0
  let expiredFiles = 0

  try {
    const files = readdirSync(imagesDir)
    for (const file of files) {
      try {
        const stat = statSync(join(imagesDir, file))
        totalFiles++
        if (stat.mtime.getTime() < cutoff) {
          expiredFiles++
        }
      } catch {
        continue
      }
    }
  } catch {
    return { totalFiles, expiredFiles }
  }

  return { totalFiles, expiredFiles }
}

function deleteExpiredUsageLogs(retentionDays: number, db: Database): number {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString()
  const result = db.prepare('DELETE FROM usage_logs WHERE timestamp < ?').run(cutoff)
  if (result.changes > 0) {
    db.exec('VACUUM')
  }
  return result.changes
}
