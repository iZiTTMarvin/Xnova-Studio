import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const testDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(testDir, '../../../../')

describe('基础领域包迁移基线', () => {
  it('config/providers/persistence/platform/observability 包应具备最小可消费结构', () => {
    const requiredPackages = [
      'config',
      'providers',
      'persistence',
      'platform',
      'observability',
    ]

    for (const packageName of requiredPackages) {
      const packageRoot = resolve(repoRoot, 'packages', packageName)
      expect(existsSync(resolve(packageRoot, 'package.json')), `${packageName} 缺少 package.json`).toBe(true)
      expect(existsSync(resolve(packageRoot, 'tsconfig.json')), `${packageName} 缺少 tsconfig.json`).toBe(true)
      expect(existsSync(resolve(packageRoot, 'src')), `${packageName} 缺少 src 目录`).toBe(true)
    }
  })

  it('runtime 不应再直接从 cli/src 基础领域导入实现', () => {
    const runtimeFiles = [
      resolve(repoRoot, 'packages/runtime/src/create-runtime.ts'),
      resolve(repoRoot, 'packages/runtime/src/inspect.ts'),
      resolve(repoRoot, 'packages/runtime/src/types.ts'),
    ]

    const forbiddenImport = /cli\/src\/(config|providers|persistence|platform|observability)\//

    for (const filePath of runtimeFiles) {
      const content = readFileSync(filePath, 'utf-8')
      expect(forbiddenImport.test(content), `${filePath} 仍存在 cli/src 基础领域导入`).toBe(false)
    }
  })

  it('core/runtime 的基础领域路径映射应优先指向 packages/*', () => {
    const configFiles = [
      resolve(repoRoot, 'packages/core/tsconfig.json'),
      resolve(repoRoot, 'packages/runtime/tsconfig.json'),
    ]
    const aliasKeys = [
      '@config/*',
      '@providers/*',
      '@persistence/*',
      '@platform/*',
      '@observability/*',
    ]

    for (const configPath of configFiles) {
      const config = JSON.parse(readFileSync(configPath, 'utf-8')) as {
        compilerOptions?: { paths?: Record<string, string[]> }
      }
      const paths = config.compilerOptions?.paths ?? {}

      for (const aliasKey of aliasKeys) {
        const mapped = paths[aliasKey] ?? []
        expect(
          mapped.some(value => value.includes('packages/')),
          `${configPath} 的 ${aliasKey} 未映射到 packages`,
        ).toBe(true)
        expect(
          mapped.some(value => value.includes('cli/src')),
          `${configPath} 的 ${aliasKey} 仍映射到 cli/src`,
        ).toBe(false)
      }
    }
  })
})
