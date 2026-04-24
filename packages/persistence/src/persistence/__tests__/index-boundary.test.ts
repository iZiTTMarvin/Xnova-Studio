import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

describe('persistence barrel boundary', () => {
  it('index.ts 只暴露 session JSONL 能力，不再把 db.ts 一起透出给上层宿主', () => {
    const source = readFileSync(new URL('../index.ts', import.meta.url), 'utf-8')

    expect(source).not.toContain("from './db.js'")
    expect(source).not.toContain('getDb')
  })
})
