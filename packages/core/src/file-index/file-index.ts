import fg from 'fast-glob'
import { Fzf } from 'fzf'
import type { Ignore } from 'ignore'
import { createIgnoreFilter, FILE_INDEX_GLOB_IGNORE_PATTERNS } from './ignore-rules.js'
import type { SearchResult, DirEntry } from './types.js'
import { dbg } from '../debug.js'

export class FileIndex {
  private paths: string[] = []
  private fzf: Fzf<string[]> | null = null
  private ignoreFilter: Ignore

  constructor(private cwd: string) {
    this.ignoreFilter = createIgnoreFilter(cwd)
  }

  async scan(): Promise<void> {
    let allFiles: string[]
    try {
      allFiles = await fg('**/*', {
        cwd: this.cwd,
        dot: false,
        followSymbolicLinks: false,
        ignore: FILE_INDEX_GLOB_IGNORE_PATTERNS,
        onlyFiles: true,
        suppressErrors: true,
      })
    } catch (error) {
      dbg(
        `[FileIndex] glob 扫描失败 cwd=${this.cwd}: ${
          error instanceof Error ? error.message : String(error)
        }\n`,
      )
      allFiles = []
    }

    this.paths = this.ignoreFilter.filter(allFiles).sort()
    this.rebuildFzf()
  }

  add(relativePath: string): void {
    if (this.ignoreFilter.ignores(relativePath)) {
      return
    }

    const insertIndex = this.findInsertIndex(relativePath)
    if (this.paths[insertIndex] === relativePath) {
      return
    }

    this.paths.splice(insertIndex, 0, relativePath)
    this.rebuildFzf()
  }

  remove(relativePath: string): void {
    const index = this.findExactIndex(relativePath)
    if (index === -1) {
      return
    }

    this.paths.splice(index, 1)
    this.rebuildFzf()
  }

  search(query: string, limit = 20): SearchResult[] {
    if (!this.fzf || query.length === 0) {
      return []
    }

    const entries = this.fzf.find(query)
    return entries.slice(0, limit).map((entry) => ({
      path: entry.item,
      score: entry.score,
      positions: entry.positions,
    }))
  }

  getAll(): string[] {
    return [...this.paths]
  }

  get size(): number {
    return this.paths.length
  }

  listEntries(dirPrefix: string, limit = 30): DirEntry[] {
    const dirs = new Set<string>()
    const files: string[] = []

    for (const path of this.paths) {
      if (!path.startsWith(dirPrefix)) {
        continue
      }

      const rest = path.slice(dirPrefix.length)
      const slashIndex = rest.indexOf('/')

      if (slashIndex !== -1) {
        dirs.add(rest.slice(0, slashIndex + 1))
      } else {
        files.push(rest)
      }

      if (dirs.size + files.length >= limit * 3) {
        break
      }
    }

    const entries: DirEntry[] = []
    const sortedDirs = [...dirs].sort()
    for (const dir of sortedDirs) {
      if (entries.length >= limit) {
        break
      }
      entries.push({ name: dir, fullPath: dirPrefix + dir, isDir: true })
    }
    for (const file of files) {
      if (entries.length >= limit) {
        break
      }
      entries.push({ name: file, fullPath: dirPrefix + file, isDir: false })
    }

    return entries
  }

  getIgnoreFilter(): Ignore {
    return this.ignoreFilter
  }

  private rebuildFzf(): void {
    this.fzf = new Fzf(this.paths, {
      selector: (item: string) => item,
      limit: 50,
    })
  }

  private findInsertIndex(target: string): number {
    let lo = 0
    let hi = this.paths.length

    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      if (this.paths[mid]! < target) {
        lo = mid + 1
      } else {
        hi = mid
      }
    }

    return lo
  }

  private findExactIndex(target: string): number {
    const index = this.findInsertIndex(target)
    return this.paths[index] === target ? index : -1
  }
}
