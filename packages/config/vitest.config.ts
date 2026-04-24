import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const packageRoot = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: packageRoot,
  resolve: {
    alias: {
      '@tools': resolve(packageRoot, '../tools/src'),
      '@providers': resolve(packageRoot, '../providers/src/providers'),
      '@config': resolve(packageRoot, 'src/config'),
      '@core': resolve(packageRoot, '../core/src'),
      '@xnova/core': resolve(packageRoot, '../core/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
  },
})
