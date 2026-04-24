import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

const nativeRuntimeExternals = ['libsql', /^@libsql\//]

const packageAliases = {
  '@xnova/runtime': resolve(__dirname, '../../packages/runtime/src/index.ts'),
  '@xnova/core': resolve(__dirname, '../../packages/core/src/index.ts'),
  '@core': resolve(__dirname, '../../packages/core/src'),
  '@providers': resolve(__dirname, '../../packages/providers/src/providers'),
  '@tools': resolve(__dirname, '../../packages/tools/src'),
  '@platform': resolve(__dirname, '../../packages/platform/src/platform'),
  '@persistence': resolve(__dirname, '../../packages/persistence/src/persistence'),
  '@observability': resolve(__dirname, '../../packages/observability/src/observability'),
  '@config': resolve(__dirname, '../../packages/config/src/config'),
  '@mcp': resolve(__dirname, '../../packages/mcp/src'),
  '@skills': resolve(__dirname, '../../packages/skills/src'),
  '@plugin': resolve(__dirname, '../../packages/plugin/src'),
  '@hooks': resolve(__dirname, '../../packages/core/src/hooks'),
  '@file-index': resolve(__dirname, '../../packages/core/src/file-index'),
  '@memory': resolve(__dirname, '../../packages/memory/src'),
}

export default defineConfig({
  main: {
    resolve: {
      alias: packageAliases,
    },
    build: {
      outDir: 'dist/main',
      externalizeDeps: {
        exclude: ['@xnova/runtime'],
      },
      rollupOptions: {
        external: nativeRuntimeExternals,
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
        },
      },
    },
  },
  preload: {
    resolve: {
      alias: packageAliases,
    },
    build: {
      outDir: 'dist/preload',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts'),
        },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react()],
    build: {
      outDir: resolve(__dirname, 'dist/renderer'),
      emptyOutDir: true,
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
        },
      },
    },
  },
})
