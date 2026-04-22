import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    exclude: [
      'tests/ipc.test.ts',
      'tests/preload-bridge.test.ts',
      'tests/preload-validators.test.ts',
    ],
  },
})
