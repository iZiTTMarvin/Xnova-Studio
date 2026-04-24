import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const packageRoot = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(packageRoot, '../..')

export default defineConfig({
  root: packageRoot,
  resolve: {
    alias: {
      '@xnova/core': resolve(packageRoot, '../core/src/index.ts'),
      '@core': resolve(packageRoot, '../core/src'),
      '@providers': resolve(packageRoot, '../providers/src/providers'),
      '@tools': resolve(packageRoot, '../tools/src'),
      '@hooks': resolve(packageRoot, '../core/src/hooks'),
      '@config': resolve(packageRoot, '../config/src/config'),
      '@mcp': resolve(packageRoot, '../mcp/src'),
      '@observability': resolve(packageRoot, '../observability/src/observability'),
      '@persistence': resolve(packageRoot, '../persistence/src/persistence'),
      '@skills': resolve(packageRoot, '../skills/src'),
      '@file-index': resolve(packageRoot, '../core/src/file-index'),
      '@plugin': resolve(packageRoot, '../plugin/src'),
      '@memory': resolve(packageRoot, '../memory/src'),
      '@platform': resolve(packageRoot, '../platform/src/platform'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
  },
})
