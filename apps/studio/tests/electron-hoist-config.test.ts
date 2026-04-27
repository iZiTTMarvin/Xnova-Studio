import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Electron dev dependency layout', () => {
  it('workspace 根目录通过精确 hoist 让 electron-vite 可以解析 electron', () => {
    const npmrc = readFileSync(resolve(process.cwd(), '../../.npmrc'), 'utf-8')

    expect(npmrc).toContain('public-hoist-pattern[]=electron')
    expect(npmrc).not.toContain('shamefully-hoist=true')
  })
})
