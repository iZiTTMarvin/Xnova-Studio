import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import studioBuildConfig from '../electron.vite.config'

const repoRoot = 'D:\\visual_ProgrammingSoftware\\毕设and简历Projects\\Xnova-Code'
const studioRoot = join(repoRoot, 'apps', 'studio')
const workspaceRoot = repoRoot

interface StudioMainBuildConfigShape {
  main?: {
    build?: {
      rollupOptions?: {
        external?: Array<string | RegExp> | undefined
      }
    }
  }
}

describe('studio native runtime packaging', () => {
  it('main bundle 对 libsql native 依赖走 external，避免 Rollup 动态 require 崩溃', () => {
    const config = studioBuildConfig as StudioMainBuildConfigShape
    const externalEntries = config.main?.build?.rollupOptions?.external ?? []

    expect(Array.isArray(externalEntries)).toBe(true)
    expect(externalEntries).toContain('libsql')
    expect(
      externalEntries.some(
        (entry) => entry instanceof RegExp && entry.test('@libsql/win32-x64-msvc'),
      ),
    ).toBe(true)
  })

  it('studio package 显式声明 libsql 运行时依赖，并允许 pnpm 安装其 native 绑定', () => {
    const studioPkg = JSON.parse(
      readFileSync(join(studioRoot, 'package.json'), 'utf-8'),
    ) as {
      dependencies?: Record<string, string>
    }
    const workspacePkg = JSON.parse(
      readFileSync(join(workspaceRoot, 'package.json'), 'utf-8'),
    ) as {
      pnpm?: {
        onlyBuiltDependencies?: string[]
      }
    }

    expect(studioPkg.dependencies?.libsql).toBeTypeOf('string')
    expect(workspacePkg.pnpm?.onlyBuiltDependencies).toContain('libsql')
  })
})
