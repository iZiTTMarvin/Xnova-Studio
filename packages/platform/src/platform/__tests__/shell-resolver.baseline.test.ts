import { describe, expect, it } from 'vitest'
import { resolveShell } from '../shell-resolver.js'

describe('shell resolver baseline', () => {
  it('应返回可执行 shell 描述', () => {
    const shell = resolveShell()
    expect(shell).toBeDefined()
    expect(shell.path.length).toBeGreaterThan(0)
    expect(Array.isArray(shell.args)).toBe(true)
    expect(shell.args.length).toBeGreaterThan(0)
  })
})
