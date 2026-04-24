import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const packageRoot = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(packageRoot, '../..')

export default defineConfig({
  root: packageRoot,
  resolve: {
    alias: {
      '@xnova/core': resolve(repoRoot, 'packages/core/src/index.ts'),
      '@xnova/runtime': resolve(repoRoot, 'packages/runtime/src/index.ts'),
      '@core': resolve(repoRoot, 'packages/core/src'),
      '@tools': resolve(repoRoot, 'packages/tools/src'),
      '@memory': resolve(repoRoot, 'packages/memory/src'),
      '@mcp': resolve(repoRoot, 'packages/mcp/src'),
      '@skills': resolve(repoRoot, 'packages/skills/src'),
      '@plugin': resolve(repoRoot, 'packages/plugin/src'),
      '@providers': resolve(repoRoot, 'packages/providers/src/providers'),
      '@hooks': resolve(repoRoot, 'packages/core/src/hooks'),
      '@config': resolve(repoRoot, 'packages/config/src/config'),
      '@observability': resolve(repoRoot, 'packages/observability/src/observability'),
      '@persistence': resolve(repoRoot, 'packages/persistence/src/persistence'),
      '@file-index': resolve(repoRoot, 'packages/core/src/file-index'),
      '@platform': resolve(repoRoot, 'packages/platform/src/platform')
    }
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts']
  }
})
