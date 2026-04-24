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
      status: 'ready',
      snapshot: {
        sessionId: null,
        isRunning: false,
        provider: 'openai',
        model: 'gpt-4o',
        warnings: [],
      },
      workspacePath: 'D:/workspace/demo',
      configWarnings: ['config.toml parse error'],
      issues: [],
    })
  })

  it('未绑定 workspace 时返回 not-ready 状态而不是静默成功', async () => {
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
          return []
        },
      },
    })

    await expect(
      inspector.inspect(
        { refresh: true },
        {
          workspacePath: null,
          lastSelection: null,
        },
      ),
    ).resolves.toEqual({
      ok: true,
      status: 'not-ready',
      snapshot: {
        sessionId: null,
        isRunning: false,
        provider: 'openai',
        model: 'gpt-4o',
        warnings: [],
      },
      workspacePath: null,
      configWarnings: [],
      issues: [
        {
          code: 'runtime-not-ready',
          severity: 'warning',
          message: '当前尚未绑定 Workspace，runtime 未就绪。',
        },
      ],
    })
  })
})
