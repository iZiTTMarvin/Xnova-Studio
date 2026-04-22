import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

const cliAliases = {
  '@core': resolve(__dirname, '../cli/src/core'),
  '@providers': resolve(__dirname, '../cli/src/providers'),
  '@tools': resolve(__dirname, '../cli/src/tools'),
  '@ui': resolve(__dirname, '../cli/src/ui'),
  '@platform': resolve(__dirname, '../cli/src/platform'),
  '@commands': resolve(__dirname, '../cli/src/commands'),
  '@persistence': resolve(__dirname, '../cli/src/persistence'),
  '@observability': resolve(__dirname, '../cli/src/observability'),
  '@config': resolve(__dirname, '../cli/src/config'),
  '@utils': resolve(__dirname, '../cli/src/utils'),
  '@mcp': resolve(__dirname, '../cli/src/mcp'),
  '@skills': resolve(__dirname, '../cli/src/skills'),
  '@plugin': resolve(__dirname, '../cli/src/plugin'),
  '@hooks': resolve(__dirname, '../cli/src/hooks'),
  '@file-index': resolve(__dirname, '../cli/src/file-index'),
  '@server': resolve(__dirname, '../cli/src/server'),
  '@memory': resolve(__dirname, '../cli/src/memory'),
}

export default defineConfig({
  main: {
    resolve: {
      alias: cliAliases,
    },
    build: {
      outDir: 'dist/main',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
        },
      },
    },
  },
  preload: {
    resolve: {
      alias: cliAliases,
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
