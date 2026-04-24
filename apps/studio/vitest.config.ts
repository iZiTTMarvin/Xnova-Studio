import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@xnova/runtime': resolve(__dirname, '../../packages/runtime/src/index.ts'),
      '@xnova/core': resolve(__dirname, '../../packages/core/src/index.ts'),
      '@core': resolve(__dirname, '../../packages/core/src'),
      '@providers': resolve(__dirname, '../../packages/providers/src/providers'),
      '@tools': resolve(__dirname, '../../packages/tools/src'),
      '@hooks': resolve(__dirname, '../../packages/core/src/hooks'),
      '@config': resolve(__dirname, '../../packages/config/src/config'),
      '@mcp': resolve(__dirname, '../../packages/mcp/src'),
      '@observability': resolve(__dirname, '../../packages/observability/src/observability'),
      '@persistence': resolve(__dirname, '../../packages/persistence/src/persistence'),
      '@skills': resolve(__dirname, '../../packages/skills/src'),
      '@file-index': resolve(__dirname, '../../packages/core/src/file-index'),
      '@plugin': resolve(__dirname, '../../packages/plugin/src'),
      '@memory': resolve(__dirname, '../../packages/memory/src'),
      '@platform': resolve(__dirname, '../../packages/platform/src/platform'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
})
