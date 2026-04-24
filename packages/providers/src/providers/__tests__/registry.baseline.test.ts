import { describe, expect, it } from 'vitest'
import type { CCodeConfig } from '@config/config-manager.js'
import { clearProviderCache, createProvider, getOrCreateProvider } from '../registry.js'

function makeConfig(protocol?: 'anthropic' | 'openai'): CCodeConfig {
  return {
    defaultProvider: 'anthropic',
    defaultModel: 'claude-sonnet-4-6',
    providers: {
      anthropic: {
        apiKey: 'k1',
        models: ['claude-sonnet-4-6'],
        ...(protocol ? { protocol } : {}),
      },
      openai: {
        apiKey: 'k2',
        models: ['gpt-4o'],
      },
    },
  }
}

describe('provider registry baseline', () => {
  it('anthropic 默认走 anthropic 协议实现', () => {
    const provider = createProvider('anthropic', makeConfig())
    expect(provider).toBeDefined()
    expect(typeof provider.chat).toBe('function')
  })

  it('getOrCreateProvider 对同一 key 返回同一实例', () => {
    clearProviderCache()
    const config = makeConfig()
    const p1 = getOrCreateProvider('openai', config)
    const p2 = getOrCreateProvider('openai', config)
    expect(p1).toBe(p2)
  })

  it('clearProviderCache 后应返回新实例', () => {
    clearProviderCache()
    const config = makeConfig('openai')
    const p1 = getOrCreateProvider('anthropic', config)
    clearProviderCache()
    const p2 = getOrCreateProvider('anthropic', config)
    expect(p1).not.toBe(p2)
  })
})
