import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = 'D:\\visual_ProgrammingSoftware\\毕设and简历Projects\\Xnova-Code'
const studioRoot = join(repoRoot, 'apps', 'studio')

describe('studio main boundary', () => {
  it('main 入口应通过 runtime manager 持有运行时，而不是直接创建裸 engineServiceApi', () => {
    const source = readFileSync(join(studioRoot, 'src/main/index.ts'), 'utf-8')

    expect(source).toContain('createStudioRuntimeManager')
    expect(source).not.toContain('createEngineServiceApi(')
  })

  it('main 层关键服务不应再直接 import cli/src', () => {
    const files = [
      'src/main/studio-runtime-service.ts',
      'src/main/studio-memory-service.ts',
      'src/main/studio-provider-settings.ts',
      'src/main/studio-mcp-service.ts',
      'src/main/studio-skills-plugins-service.ts',
      'src/main/studio-shell-inspector.ts',
      'src/main/studio-runtime-inspector.ts',
    ]

    for (const relativePath of files) {
      const source = readFileSync(join(studioRoot, relativePath), 'utf-8')
      expect(source).not.toContain('cli/src')
    }
  })

  it('studio 构建与测试 alias 不应再把核心依赖解析回 cli/src', () => {
    const configFiles = ['electron.vite.config.ts', 'vitest.config.ts']

    for (const relativePath of configFiles) {
      const source = readFileSync(join(studioRoot, relativePath), 'utf-8')
      expect(source).not.toContain('cli/src')
    }
  })
})
