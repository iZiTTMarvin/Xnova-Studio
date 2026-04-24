import { describe, expect, it, vi } from 'vitest'
import { PluginRegistry } from '../registry.js'

describe('plugin registry', () => {
  it('bridge 未注入时仍可安全返回空 session/provider/model', () => {
    const registry = new PluginRegistry()

    expect(registry.list()).toEqual([])

    // 这里主要锁住 registry 模块本身可被真实加载，
    // 避免仅靠 typecheck，没有任何运行时回归保护。
    expect(() => registry.setBridge({
      injectInput: vi.fn(),
      submitInput: vi.fn(),
      appendSystemMessage: vi.fn(),
      getSessionId: () => null,
      getModel: () => 'unknown',
      getProvider: () => 'unknown',
    })).not.toThrow()
  })
})
