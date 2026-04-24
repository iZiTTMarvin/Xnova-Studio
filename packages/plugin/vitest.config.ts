import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const packageRoot = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(packageRoot, '../..')

export default defineConfig({
  root: packageRoot,
  resolve: {
    alias: {
      '@core': resolve(repoRoot, 'packages/core/src'),
      '@tools': resolve(repoRoot, 'packages/tools/src'),
      '@plugin': resolve(repoRoot, 'packages/plugin/src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
  },
})
