// src/config/__tests__/field-mapping.test.ts
/**
 * Phase 2 · Task B — TOML ↔ Runtime 字段映射契约测试
 *
 * 规范来源：.trellis/spec/backend/config-toml-migration.md
 * 要点：
 * - snake_case (TOML 文件) ↔ camelCase (运行时 CCodeConfig)
 * - 迁移不借机做语义变更，只改格式
 * - round-trip 等价：runtime → toml → runtime 语义不丢失
 */

import { describe, it, expect } from 'vitest'
import {
  tomlToRuntimeUser,
  runtimeToTomlUser,
} from '../toml/field-mapping.js'
import type { UserConfigToml } from '../toml/index.js'
import type { CCodeConfig } from '../config-manager.js'

describe('tomlToRuntimeUser — snake_case → camelCase', () => {
  it('能映射顶层 default_provider / default_model / sub_agent_model / status_bar', () => {
    const toml: UserConfigToml = {
      default_provider: 'anthropic',
      default_model: 'claude-sonnet-4-6',
      sub_agent_model: 'claude-haiku-4-5-20251001',
      status_bar: false,
    }
    const runtime = tomlToRuntimeUser(toml)
    expect(runtime.defaultProvider).toBe('anthropic')
    expect(runtime.defaultModel).toBe('claude-sonnet-4-6')
    expect(runtime.subAgentModel).toBe('claude-haiku-4-5-20251001')
    expect(runtime.statusBar).toBe(false)
  })

  it('能映射 providers.<name>.api_key / base_url / vision_models', () => {
    const toml: UserConfigToml = {
      providers: {
        anthropic: {
          api_key: 'sk-xxx',
          protocol: 'anthropic',
          models: ['claude-sonnet-4-6'],
          vision_models: ['claude-sonnet-4-6'],
        },
        openai: {
          api_key: '',
          base_url: 'https://api.openai.com/v1',
          protocol: 'openai',
          models: ['gpt-4o'],
        },
      },
    }
    const runtime = tomlToRuntimeUser(toml)
    expect(runtime.providers?.['anthropic']?.apiKey).toBe('sk-xxx')
    expect(runtime.providers?.['anthropic']?.visionModels).toEqual([
      'claude-sonnet-4-6',
    ])
    expect(runtime.providers?.['openai']?.baseURL).toBe(
      'https://api.openai.com/v1',
    )
    expect(runtime.providers?.['openai']?.apiKey).toBe('')
  })

  it('能映射 memory.embedding.api_key / base_url / dimension', () => {
    const toml: UserConfigToml = {
      memory: {
        enabled: true,
        embedding: {
          api_key: 'sk-embed',
          base_url: 'https://api.example.com/v1',
          model: 'text-embedding-3-small',
          dimension: 1536,
        },
      },
    }
    const runtime = tomlToRuntimeUser(toml)
    expect(runtime.memory?.enabled).toBe(true)
    expect(runtime.memory?.embedding?.apiKey).toBe('sk-embed')
    expect(runtime.memory?.embedding?.baseURL).toBe(
      'https://api.example.com/v1',
    )
    expect(runtime.memory?.embedding?.dimension).toBe(1536)
  })
})

describe('runtimeToTomlUser — camelCase → snake_case', () => {
  it('能映射最小 CCodeConfig 到 UserConfigToml', () => {
    const runtime: CCodeConfig = {
      defaultProvider: 'anthropic',
      defaultModel: 'claude-sonnet-4-6',
      subAgentModel: 'claude-haiku-4-5-20251001',
      statusBar: true,
      providers: {
        anthropic: {
          apiKey: 'sk-xxx',
          protocol: 'anthropic',
          models: ['claude-sonnet-4-6'],
          visionModels: ['claude-sonnet-4-6'],
        },
      },
      memory: {
        enabled: true,
        embedding: {
          apiKey: 'sk-embed',
          baseURL: 'https://api.example.com/v1',
          dimension: 1536,
        },
      },
    }
    const toml = runtimeToTomlUser(runtime)
    expect(toml.default_provider).toBe('anthropic')
    expect(toml.sub_agent_model).toBe('claude-haiku-4-5-20251001')
    expect(toml.status_bar).toBe(true)
    expect(toml.providers?.anthropic?.api_key).toBe('sk-xxx')
    expect(toml.providers?.anthropic?.vision_models).toEqual([
      'claude-sonnet-4-6',
    ])
    expect(toml.memory?.embedding?.api_key).toBe('sk-embed')
    expect(toml.memory?.embedding?.base_url).toBe(
      'https://api.example.com/v1',
    )
    expect(toml.memory?.embedding?.dimension).toBe(1536)
  })

  it('保留空 apiKey（空字符串不得被吞掉）', () => {
    const runtime: CCodeConfig = {
      defaultProvider: 'anthropic',
      defaultModel: 'claude-sonnet-4-6',
      providers: {
        anthropic: {
          apiKey: '',
          models: ['claude-sonnet-4-6'],
        },
      },
    }
    const toml = runtimeToTomlUser(runtime)
    expect(toml.providers?.anthropic?.api_key).toBe('')
  })

  it('undefined provider 不应出现在输出中', () => {
    const runtime: CCodeConfig = {
      defaultProvider: 'anthropic',
      defaultModel: 'claude-sonnet-4-6',
      providers: {
        anthropic: {
          apiKey: 'k',
          models: ['m'],
        },
        openai: undefined,
      },
    }
    const toml = runtimeToTomlUser(runtime)
    expect(toml.providers).toBeDefined()
    expect(Object.keys(toml.providers!)).toEqual(['anthropic'])
  })
})

describe('round-trip：runtime → toml → runtime 语义等价', () => {
  it('所有字段的映射必须可逆（保留空值）', () => {
    const original: CCodeConfig = {
      defaultProvider: 'glm',
      defaultModel: 'glm-4',
      subAgentModel: 'glm-4-air',
      statusBar: true,
      providers: {
        glm: {
          apiKey: 'k',
          baseURL: 'https://open.bigmodel.cn/api/coding/paas/v4',
          protocol: 'openai',
          models: ['glm-4', 'glm-4-air'],
          visionModels: [],
        },
      },
      memory: {
        enabled: false,
        embedding: {
          apiKey: '',
          baseURL: 'https://api.example.com/v1',
          model: 'text-embedding-3-small',
          dimension: 1536,
        },
      },
    }
    const toml = runtimeToTomlUser(original)
    const restored = tomlToRuntimeUser(toml)
    expect(restored.defaultProvider).toBe(original.defaultProvider)
    expect(restored.defaultModel).toBe(original.defaultModel)
    expect(restored.subAgentModel).toBe(original.subAgentModel)
    expect(restored.statusBar).toBe(original.statusBar)
    expect(restored.providers?.['glm']).toEqual(original.providers['glm'])
    expect(restored.memory).toEqual(original.memory)
  })
})

// ── Phase 2 fix-B：user 层 [agent] / [modes] / [features] 双向映射 ──
//
// 规范：.trellis/spec/backend/config-toml-migration.md · §2 Schema / §3 Contracts
// - snake_case TOML 字段 ↔ camelCase runtime 字段
// - 缺省字段保持 undefined（不强写默认值）
// - round-trip 语义等价：runtime → toml → runtime 无损

describe('tomlToRuntimeUser — [agent] / [modes] / [features]', () => {
  it('能映射 [agent] 的 default / max_parallel_subagents → default / maxParallelSubagents', () => {
    const toml: UserConfigToml = {
      agent: {
        default: 'general',
        max_parallel_subagents: 3,
      },
    }
    const runtime = tomlToRuntimeUser(toml)
    expect(runtime.agent?.default).toBe('general')
    expect(runtime.agent?.maxParallelSubagents).toBe(3)
  })

  it('能映射 [modes] 的 allowed / recommended 枚举', () => {
    const toml: UserConfigToml = {
      modes: {
        allowed: ['standard', 'xforge'],
        recommended: 'xforge',
      },
    }
    const runtime = tomlToRuntimeUser(toml)
    expect(runtime.modes?.allowed).toEqual(['standard', 'xforge'])
    expect(runtime.modes?.recommended).toBe('xforge')
  })

  it('能映射 [features] 的 enabled 数组', () => {
    const toml: UserConfigToml = {
      features: {
        enabled: ['rag', 'web', 'memory'],
      },
    }
    const runtime = tomlToRuntimeUser(toml)
    expect(runtime.features?.enabled).toEqual(['rag', 'web', 'memory'])
  })

  it('缺省 [agent]/[modes]/[features] 段时返回值里对应字段保持 undefined', () => {
    const toml: UserConfigToml = {
      default_provider: 'anthropic',
    }
    const runtime = tomlToRuntimeUser(toml)
    expect(runtime.agent).toBeUndefined()
    expect(runtime.modes).toBeUndefined()
    expect(runtime.features).toBeUndefined()
  })
})

describe('runtimeToTomlUser — [agent] / [modes] / [features]', () => {
  it('能映射 agent.maxParallelSubagents → agent.max_parallel_subagents', () => {
    const runtime: CCodeConfig = {
      defaultProvider: 'anthropic',
      defaultModel: 'claude-sonnet-4-6',
      providers: {},
      agent: {
        default: 'reviewer',
        maxParallelSubagents: 5,
      },
    }
    const toml = runtimeToTomlUser(runtime)
    expect(toml.agent?.default).toBe('reviewer')
    expect(toml.agent?.max_parallel_subagents).toBe(5)
  })

  it('能映射 modes.allowed / recommended（整组数组）', () => {
    const runtime: CCodeConfig = {
      defaultProvider: 'anthropic',
      defaultModel: 'claude-sonnet-4-6',
      providers: {},
      modes: {
        allowed: ['standard'],
        recommended: 'standard',
      },
    }
    const toml = runtimeToTomlUser(runtime)
    expect(toml.modes?.allowed).toEqual(['standard'])
    expect(toml.modes?.recommended).toBe('standard')
  })

  it('能映射 features.enabled（空数组必须保留）', () => {
    const runtime: CCodeConfig = {
      defaultProvider: 'anthropic',
      defaultModel: 'claude-sonnet-4-6',
      providers: {},
      features: {
        enabled: [],
      },
    }
    const toml = runtimeToTomlUser(runtime)
    expect(toml.features?.enabled).toEqual([])
  })

  it('runtime.agent / modes / features 为 undefined 时不应出现在输出中', () => {
    const runtime: CCodeConfig = {
      defaultProvider: 'anthropic',
      defaultModel: 'claude-sonnet-4-6',
      providers: {},
    }
    const toml = runtimeToTomlUser(runtime)
    expect(toml.agent).toBeUndefined()
    expect(toml.modes).toBeUndefined()
    expect(toml.features).toBeUndefined()
  })
})

describe('round-trip — agent / modes / features 语义等价', () => {
  it('含 agent / modes / features 的完整配置 round-trip 后必须语义等价', () => {
    const original: CCodeConfig = {
      defaultProvider: 'anthropic',
      defaultModel: 'claude-sonnet-4-6',
      providers: {
        anthropic: {
          apiKey: 'sk-xxx',
          models: ['claude-sonnet-4-6'],
        },
      },
      agent: {
        default: 'coder',
        maxParallelSubagents: 4,
      },
      modes: {
        allowed: ['standard', 'xforge'],
        recommended: 'standard',
      },
      features: {
        enabled: ['rag', 'memory'],
      },
    }
    const toml = runtimeToTomlUser(original)
    const restored = tomlToRuntimeUser(toml)

    expect(restored.agent).toEqual(original.agent)
    expect(restored.modes).toEqual(original.modes)
    expect(restored.features).toEqual(original.features)
  })

  it('引用不共享：runtime 数组被回写后不得与 restored 数组是同一引用（防止污染）', () => {
    const original: CCodeConfig = {
      defaultProvider: 'anthropic',
      defaultModel: 'claude-sonnet-4-6',
      providers: {},
      modes: {
        allowed: ['standard'],
        recommended: 'standard',
      },
      features: {
        enabled: ['rag'],
      },
    }
    const toml = runtimeToTomlUser(original)
    const restored = tomlToRuntimeUser(toml)

    // 修改 restored 的数组，不得影响 original（映射必须复制而非共享引用）
    restored.modes!.allowed!.push('xforge')
    restored.features!.enabled!.push('web')

    expect(original.modes?.allowed).toEqual(['standard'])
    expect(original.features?.enabled).toEqual(['rag'])
  })
})
