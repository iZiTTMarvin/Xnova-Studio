import { describe, expect, it } from 'vitest'
import { inspectRuntimeConfig } from '../inspect.js'

describe('inspectRuntimeConfig()', () => {
  it('基于已解析配置返回最小 runtime snapshot 视图', () => {
    const result = inspectRuntimeConfig({
      config: {
        defaultProvider: 'openai',
        defaultModel: 'gpt-4o',
        providers: {},
      },
    })

    expect(result).toEqual({
      sessionId: null,
      isRunning: false,
      provider: 'openai',
      model: 'gpt-4o',
      warnings: [],
    })
  })
})
