import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const repoRoot = 'D:\\visual_ProgrammingSoftware\\毕设and简历Projects\\Xnova-Code'

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, 'utf-8')) as T
}

describe('workspace cleanup migration', () => {
  it('pnpm workspace 只保留 apps 与 packages 主线，不再包含根 cli', () => {
    const workspace = readFileSync(join(repoRoot, 'pnpm-workspace.yaml'), 'utf-8')

    expect(workspace).toContain('  - apps/*')
    expect(workspace).toContain('  - packages/*')
    expect(workspace).not.toContain('\n  - cli\n')
  })

  it('根 studio 兼容壳不再暴露 dev/build/test 等转发脚本', () => {
    const studioPkg = readJson<{ scripts?: Record<string, string> }>(
      join(repoRoot, 'studio', 'package.json'),
    )

    expect(studioPkg.scripts ?? {}).not.toHaveProperty('dev')
    expect(studioPkg.scripts ?? {}).not.toHaveProperty('build')
    expect(studioPkg.scripts ?? {}).not.toHaveProperty('preview')
    expect(studioPkg.scripts ?? {}).not.toHaveProperty('pack:dir')
    expect(studioPkg.scripts ?? {}).not.toHaveProperty('pack:win')
    expect(studioPkg.scripts ?? {}).not.toHaveProperty('typecheck')
    expect(studioPkg.scripts ?? {}).not.toHaveProperty('test')
  })

  it('根 cli 已标记下线，不再暴露可运行的产品脚本入口', () => {
    const cliPkg = readJson<{
      private?: boolean
      scripts?: Record<string, string>
      bin?: Record<string, string>
    }>(join(repoRoot, 'cli', 'package.json'))

    expect(cliPkg.private).toBe(true)
    expect(cliPkg.bin ?? {}).toEqual({})
    expect(cliPkg.scripts ?? {}).not.toHaveProperty('dev')
    expect(cliPkg.scripts ?? {}).not.toHaveProperty('build')
    expect(cliPkg.scripts ?? {}).not.toHaveProperty('test')
    expect(cliPkg.scripts ?? {}).not.toHaveProperty('typecheck')
  })

  it('根文档与 legacy 说明只认 apps/studio，不再暴露根 cli 或根 studio 入口', () => {
    const readme = readFileSync(join(repoRoot, 'README.md'), 'utf-8')
    const architecture = readFileSync(
      join(repoRoot, 'PROJECT-ARCHITECTURE.md'),
      'utf-8',
    )
    const legacyCliReadme = readFileSync(join(repoRoot, 'cli', 'README.md'), 'utf-8')
    const legacyStudioReadme = readFileSync(
      join(repoRoot, 'studio', 'README.md'),
      'utf-8',
    )

    expect(readme).toContain('apps/studio/')
    expect(readme).not.toContain('pnpm --dir cli')
    expect(readme).not.toContain('pnpm --dir studio')

    expect(architecture).toContain('apps/studio/')
    expect(architecture).toContain('pnpm typecheck')
    expect(architecture).not.toContain('pnpm --dir cli')
    expect(architecture).not.toContain('pnpm --dir studio')

    expect(legacyCliReadme).toContain('已下线')
    expect(legacyCliReadme).toContain('待手动删除')
    expect(legacyStudioReadme).toContain('已下线')
    expect(legacyStudioReadme).toContain('待手动删除')
  })
})
