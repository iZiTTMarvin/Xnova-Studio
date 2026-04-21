// src/host/cli/__tests__/lifecycle.baseline.test.ts

/**
 * CLI Host Lifecycle 基线测试
 * 固化 getResumeCommand / printResumeHint 主路径行为。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getResumeCommand } from '../lifecycle.js'

describe('getResumeCommand', () => {
  const originalArgv = process.argv

  beforeEach(() => {
    process.argv = [...originalArgv]
  })

  it('argv[1] 以 ccli.js 结尾时返回 xnova --resume <id>', () => {
    process.argv[1] = '/usr/local/bin/ccli.js'
    const cmd = getResumeCommand('abc-123')
    expect(cmd).toBe('xnova --resume abc-123')
  })

  it('argv[1] 以 xnova 结尾时返回 xnova --resume <id>', () => {
    process.argv[1] = '/usr/local/bin/xnova'
    const cmd = getResumeCommand('abc-123')
    expect(cmd).toBe('xnova --resume abc-123')
  })

  it('argv[1] 以 ccli 结尾时返回 xnova --resume <id>', () => {
    process.argv[1] = '/some/path/ccli'
    const cmd = getResumeCommand('abc-123')
    expect(cmd).toBe('xnova --resume abc-123')
  })

  it('argv[1] 为 .ts 开发入口时返回 pnpm run dev -- --resume <id>', () => {
    process.argv[1] = '/project/bin/ccli.ts'
    const cmd = getResumeCommand('abc-123')
    expect(cmd).toBe('pnpm run dev -- --resume abc-123')
  })

  it('sessionId 正确嵌入命令字符串', () => {
    process.argv[1] = '/usr/local/bin/xnova'
    const sessionId = 'session-xyz-9999'
    const cmd = getResumeCommand(sessionId)
    expect(cmd).toContain(sessionId)
  })
})

describe('printResumeHint', () => {
  it('getSessionId 返回 null 时不输出任何内容', async () => {
    // 动态 import 以绕过模块级 resumeHintPrinted 状态
    vi.resetModules()
    const { printResumeHint } = await import('../lifecycle.js')
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    printResumeHint(() => null)
    expect(writeSpy).not.toHaveBeenCalled()
    writeSpy.mockRestore()
  })

  it('getSessionId 返回有效 id 时输出 resume 提示', async () => {
    vi.resetModules()
    const { printResumeHint } = await import('../lifecycle.js')
    const output: string[] = []
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation((s) => {
      output.push(String(s))
      return true
    })
    printResumeHint(() => 'test-session-id')
    expect(output.join('')).toContain('test-session-id')
    writeSpy.mockRestore()
  })
})
