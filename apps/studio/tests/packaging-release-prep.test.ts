import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const repoRoot = 'D:\\visual_ProgrammingSoftware\\毕设and简历Projects\\Xnova-Code'
const studioRoot = join(repoRoot, 'apps', 'studio')

describe('packaging and release prep', () => {
  it('studio/package.json 提供预览、目录打包与 Windows 打包脚本', () => {
    const pkg = JSON.parse(
      readFileSync(join(studioRoot, 'package.json'), 'utf-8'),
    ) as {
      scripts?: Record<string, string>
    }

    expect(pkg.scripts).toMatchObject({
      preview: expect.any(String),
      'pack:dir': expect.any(String),
      'pack:win': expect.any(String),
    })
  })

  it('electron-builder 配置存在并声明 Windows NSIS 产物', () => {
    const configPath = join(studioRoot, 'electron-builder.yml')
    expect(existsSync(configPath)).toBe(true)

    const content = readFileSync(configPath, 'utf-8')
    expect(content).toContain('productName: Xnova Studio')
    expect(content).toContain('output: release')
    expect(content).toContain('target: nsis')
  })

  it('README 与发布说明包含当前打包命令和产物说明', () => {
    const readmePath = join(repoRoot, 'README.md')
    const releaseNotePath = join(repoRoot, 'docs', 'release', 'xnova-studio-v1-trial.md')

    expect(existsSync(readmePath)).toBe(true)
    expect(existsSync(releaseNotePath)).toBe(true)

    const readme = readFileSync(readmePath, 'utf-8')
    const releaseNote = readFileSync(releaseNotePath, 'utf-8')

    expect(readme).toContain('pnpm --dir apps/studio pack:win')
    expect(readme).toContain('Xnova Studio')
    expect(releaseNote).toContain('版本来源：`apps/studio/package.json`')
    expect(releaseNote).toContain('生成命令：`pnpm --dir apps/studio pack:win`')
    expect(releaseNote).toContain('目录验证命令：`pnpm --dir apps/studio pack:dir`')
    expect(releaseNote).toContain('产物目录：`apps/studio/release/`')
    expect(releaseNote).toContain('Windows 安装包')
    expect(releaseNote).not.toContain('pnpm --dir studio')
  })
})
