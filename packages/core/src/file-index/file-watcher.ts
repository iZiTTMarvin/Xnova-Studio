import { watch, stat, type FSWatcher } from 'node:fs'
import type { Ignore } from 'ignore'
import type { FileIndex } from './file-index.js'
import { dbg } from '../debug.js'

const DEBOUNCE_MS = 100

export class FileWatcher {
  private watcher: FSWatcher | null = null
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private pendingAdds: Set<string> = new Set()
  private pendingRemoves: Set<string> = new Set()

  constructor(
    private cwd: string,
    private index: FileIndex,
    private ignoreFilter: Ignore,
  ) {}

  start(): void {
    try {
      this.watcher = watch(
        this.cwd,
        { recursive: true },
        (eventType, filename) => {
          if (!filename) {
            return
          }

          this.handleEvent(eventType, filename)
        },
      )

      this.watcher.on('error', (error) => {
        dbg(
          `[FileWatcher] watcher 错误: ${
            error instanceof Error ? error.message : String(error)
          }\n`,
        )
      })
    } catch (error) {
      dbg(
        `[FileWatcher] 启动失败 cwd=${this.cwd}: ${
          error instanceof Error ? error.message : String(error)
        }\n`,
      )
    }
  }

  stop(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }

    if (this.watcher) {
      this.watcher.close()
      this.watcher = null
    }

    this.pendingAdds.clear()
    this.pendingRemoves.clear()
  }

  private handleEvent(eventType: string, filename: string): void {
    const normalizedPath = filename.replace(/\\/g, '/')

    if (this.ignoreFilter.ignores(normalizedPath)) {
      return
    }

    if (eventType === 'change') {
      return
    }

    this.checkFileExists(normalizedPath)
  }

  private checkFileExists(relativePath: string): void {
    const fullPath = `${this.cwd}/${relativePath}`

    stat(fullPath, (error, stats) => {
      try {
        if (error || !stats) {
          this.pendingAdds.delete(relativePath)
          this.pendingRemoves.add(relativePath)
        } else if (stats.isFile()) {
          this.pendingRemoves.delete(relativePath)
          this.pendingAdds.add(relativePath)
        }

        this.scheduleBatchUpdate()
      } catch (nextError) {
        dbg(
          `[FileWatcher] checkFileExists 异常 path=${relativePath}: ${
            nextError instanceof Error ? nextError.message : String(nextError)
          }\n`,
        )
      }
    })
  }

  private scheduleBatchUpdate(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
    }

    this.debounceTimer = setTimeout(() => {
      this.flushPending()
    }, DEBOUNCE_MS)
  }

  private flushPending(): void {
    try {
      for (const path of this.pendingRemoves) {
        this.index.remove(path)
      }

      for (const path of this.pendingAdds) {
        this.index.add(path)
      }

      this.pendingRemoves.clear()
      this.pendingAdds.clear()
    } catch (error) {
      dbg(
        `[FileWatcher] flushPending 异常: ${
          error instanceof Error ? error.message : String(error)
        }\n`,
      )
    }
  }
}
