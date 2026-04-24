import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const packageRoot = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: packageRoot,
  resolve: {
    alias: {
      '@observability': resolve(packageRoot, 'src/observability'),
      '@persistence': resolve(packageRoot, '../persistence/src/persistence'),
      '@core': resolve(packageRoot, '../core/src'),
      '@providers': resolve(packageRoot, '../providers/src/providers'),
      '@tools': resolve(packageRoot, '../tools/src'),
      '@hooks': resolve(packageRoot, '../core/src/hooks'),
      '@config': resolve(packageRoot, '../config/src/config'),
      '@mcp': resolve(packageRoot, '../mcp/src'),
      '@skills': resolve(packageRoot, '../skills/src'),
      '@file-index': resolve(packageRoot, '../core/src/file-index'),
      '@plugin': resolve(packageRoot, '../plugin/src'),
      '@memory': resolve(packageRoot, '../memory/src'),
      '@platform': resolve(packageRoot, '../platform/src/platform'),
      '@xnova/core': resolve(packageRoot, '../core/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
  },
})
