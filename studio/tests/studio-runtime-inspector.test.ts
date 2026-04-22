import { describe, expect, it } from 'vitest'
import { createStudioRuntimeInspector } from '../src/main/studio-runtime-inspector'

describe('studio runtime inspector', () => {
  it('透出 config warning 并返回最小 runtime snapshot', async () => {
    const inspector = createStudioRuntimeInspector({
      configManager: {
        load() {
          return {
            defaultProvider: 'openai',
            defaultModel: 'gpt-4o',
            providers: {},
          }
        },
        getLastWarnings() {
          return ['config.toml parse error']
        },
      },
    })

    await expect(
      inspector.inspect(
        { refresh: true },
        {
          workspacePath: 'D:/workspace/demo',
          lastSelection: null,
        },
      ),
    ).resolves.toEqual({
      ok: true,
      snapshot: {
        sessionId: null,
        isRunning: false,
        provider: 'openai',
        model: 'gpt-4o',
        warnings: [],
      },
      workspacePath: 'D:/workspace/demo',
      configWarnings: ['config.toml parse error'],
    })
  })
})
