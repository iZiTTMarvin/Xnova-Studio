import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const repoRoot = 'D:\\visual_ProgrammingSoftware\\毕设and简历Projects\\Xnova-Code'

describe('workspace cleanup migration', () => {
  it('pnpm workspace 只保留 apps 与 packages 主线，不再包含根 cli', () => {
    const workspace = readFileSync(join(repoRoot, 'pnpm-workspace.yaml'), 'utf-8')

    expect(workspace).toContain('  - apps/*')
    expect(workspace).toContain('  - packages/*')
    expect(workspace).not.toContain('\n  - cli\n')
  })

  it('根 studio 目录已被彻底移除', () => {
    const exists = existsSync(join(repoRoot, 'studio', 'package.json'))
    expect(exists).toBe(false)
  })

  it('根 cli 目录已被彻底移除', () => {
    const exists = existsSync(join(repoRoot, 'cli', 'package.json'))
    expect(exists).toBe(false)
  })

  it('根文档只认 apps/studio，不再暴露根 cli 或根 studio 入口', () => {
    const readme = readFileSync(join(repoRoot, 'README.md'), 'utf-8')
    const architecture = readFileSync(
      join(repoRoot, 'PROJECT-ARCHITECTURE.md'),
      'utf-8',
    )

    expect(readme).toContain('apps/studio/')
    expect(readme).not.toContain('pnpm --dir cli')
    expect(readme).not.toContain('pnpm --dir studio')

    expect(architecture).toContain('apps/studio/')
    expect(architecture).toContain('pnpm typecheck')
    expect(architecture).not.toContain('pnpm --dir cli')
    expect(architecture).not.toContain('pnpm --dir studio')
  })
})
