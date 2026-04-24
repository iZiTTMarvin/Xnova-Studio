import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))

describe('engine service api boundary', () => {
  it('engine service api 不应再直接依赖 cli/src', () => {
    const source = readFileSync(join(packageRoot, 'engine-service-api.ts'), 'utf-8')
    expect(source).not.toContain('cli/src')
  })
})
