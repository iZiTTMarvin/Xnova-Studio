// src/config/__tests__/toml-schema.test.ts
/**
 * Phase 2 · Task A — TOML Schema / Parser / Serializer / Validator 契约测试
 *
 * 仅锁定 schema、解析、序列化、校验的输入输出行为；
 * 不涉及 legacy JSON 迁移，也不涉及 project>user>builtin merge。
 *
 * 规范来源：.trellis/spec/backend/config-toml-migration.md
 */

import { describe, it, expect } from 'vitest'
import {
  parseToml,
  stringifyToml,
  validateUserConfigToml,
  validateProjectConfigToml,
  TomlParseError,
  TomlValidationError,
  type UserConfigToml,
  type ProjectConfigToml,
} from '../toml/index.js'

describe('TOML parser — 合法输入', () => {
  it('能解析完整 config.toml 所有顶层 section', () => {
    const text = `
default_provider = "anthropic"
default_model = "claude-sonnet-4-6"
sub_agent_model = "claude-haiku-4-5-20251001"
status_bar = true

[providers.anthropic]
api_key = "sk-xxx"
protocol = "anthropic"
models = ["claude-opus-4-6", "claude-sonnet-4-6"]
vision_models = ["claude-sonnet-4-6"]

[providers.openai]
api_key = ""
base_url = "https://api.openai.com/v1"
protocol = "openai"
models = ["gpt-4o"]

[memory]
enabled = true

[memory.embedding]
api_key = "sk-embed"
base_url = "https://api.example.com/v1"
model = "text-embedding-3-small"
dimension = 1536

[agent]
default = "coder"
max_parallel_subagents = 3

[modes]
allowed = ["standard", "xforge"]
recommended = "standard"

[features]
enabled = ["rag", "web"]
`
    const parsed = parseToml(text)
    expect(parsed).toBeTypeOf('object')
    const obj = parsed as Record<string, unknown>
    expect(obj.default_provider).toBe('anthropic')
    expect(obj.status_bar).toBe(true)
    const providers = obj.providers as Record<string, Record<string, unknown>>
    expect(providers.anthropic?.api_key).toBe('sk-xxx')
    expect(providers.anthropic?.models).toEqual([
      'claude-opus-4-6',
      'claude-sonnet-4-6',
    ])
    const memory = obj.memory as Record<string, unknown>
    expect(memory.enabled).toBe(true)
    const embedding = memory.embedding as Record<string, unknown>
    expect(embedding.dimension).toBe(1536)
    const modes = obj.modes as Record<string, unknown>
    expect(modes.allowed).toEqual(['standard', 'xforge'])
    expect(modes.recommended).toBe('standard')
  })

  it('能解析最小 project.toml（仅 agent + modes）', () => {
    const text = `
[agent]
default = "coder"
max_parallel_subagents = 2

[modes]
allowed = ["standard"]
recommended = "standard"
`
    const parsed = parseToml(text)
    const obj = parsed as Record<string, Record<string, unknown>>
    expect(obj.agent?.default).toBe('coder')
    expect(obj.agent?.max_parallel_subagents).toBe(2)
    expect(obj.modes?.allowed).toEqual(['standard'])
  })

  it('能解析注释、空行与行末注释', () => {
    const text = `
# 顶层注释
default_provider = "anthropic"  # 行末注释

# section 注释
[memory]
enabled = false
`
    const parsed = parseToml(text) as Record<string, unknown>
    expect(parsed.default_provider).toBe('anthropic')
    expect((parsed.memory as Record<string, unknown>).enabled).toBe(false)
  })
})

describe('TOML parser — 非法输入必须显式报错（禁止 silent fallback）', () => {
  it('非法 key = 缺 value 时抛 TomlParseError 并带行号', () => {
    const text = `
default_provider =
`
    expect(() => parseToml(text)).toThrowError(TomlParseError)
    try {
      parseToml(text)
    } catch (err) {
      expect(err).toBeInstanceOf(TomlParseError)
      expect((err as TomlParseError).line).toBeGreaterThan(0)
    }
  })

  it('section header 不闭合时抛 TomlParseError', () => {
    const text = `[providers.anthropic\napi_key = "x"`
    expect(() => parseToml(text)).toThrowError(TomlParseError)
  })

  it('字符串引号不闭合时抛 TomlParseError', () => {
    const text = `default_model = "claude\n`
    expect(() => parseToml(text)).toThrowError(TomlParseError)
  })

  it('重复的 key 视为非法，抛 TomlParseError', () => {
    const text = `
default_provider = "a"
default_provider = "b"
`
    expect(() => parseToml(text)).toThrowError(TomlParseError)
  })
})

describe('TOML serializer — 输出契约', () => {
  it('能把最小 UserConfigToml 序列化为可重新解析的 TOML', () => {
    const cfg: UserConfigToml = {
      default_provider: 'anthropic',
      default_model: 'claude-sonnet-4-6',
      status_bar: true,
      providers: {
        anthropic: {
          api_key: 'sk-xxx',
          protocol: 'anthropic',
          models: ['claude-sonnet-4-6'],
          vision_models: [],
        },
      },
      memory: {
        enabled: true,
      },
    }
    const text = stringifyToml(cfg)
    expect(text).toContain('default_provider = "anthropic"')
    // round-trip 等价
    const parsed = parseToml(text) as Record<string, unknown>
    expect(parsed.default_provider).toBe('anthropic')
    const providers = parsed.providers as Record<string, Record<string, unknown>>
    expect(providers.anthropic?.api_key).toBe('sk-xxx')
    expect(providers.anthropic?.models).toEqual(['claude-sonnet-4-6'])
  })

  it('round-trip：parse → stringify → parse 语义等价', () => {
    const original = `
default_provider = "glm"
default_model = "glm-4"

[providers.glm]
api_key = "k"
base_url = "https://open.bigmodel.cn/api/coding/paas/v4"
models = ["glm-4", "glm-4-air"]

[memory]
enabled = false
`
    const p1 = parseToml(original)
    const text = stringifyToml(p1 as Record<string, unknown>)
    const p2 = parseToml(text)
    expect(p2).toEqual(p1)
  })

  it('序列化时不应丢失空字符串（例如 api_key = ""）', () => {
    const cfg: UserConfigToml = {
      default_provider: 'anthropic',
      default_model: 'claude-sonnet-4-6',
      providers: {
        anthropic: {
          api_key: '',
          models: ['claude-sonnet-4-6'],
        },
      },
    }
    const text = stringifyToml(cfg)
    const parsed = parseToml(text) as Record<string, unknown>
    const providers = parsed.providers as Record<string, Record<string, unknown>>
    expect(providers.anthropic?.api_key).toBe('')
  })
})

describe('UserConfigToml validator — 非法字段必须显式报错', () => {
  it('合法配置通过校验', () => {
    const raw = {
      default_provider: 'anthropic',
      default_model: 'claude-sonnet-4-6',
      status_bar: true,
      providers: {
        anthropic: {
          api_key: 'sk',
          models: ['claude-sonnet-4-6'],
        },
      },
    }
    expect(() => validateUserConfigToml(raw)).not.toThrow()
    const validated = validateUserConfigToml(raw)
    expect(validated.default_provider).toBe('anthropic')
  })

  it('providers.<name>.api_key 不是 string 时抛 TomlValidationError 并附带 path', () => {
    const raw = {
      providers: {
        anthropic: {
          api_key: 123 as unknown,
          models: ['x'],
        },
      },
    }
    try {
      validateUserConfigToml(raw)
      throw new Error('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(TomlValidationError)
      expect((err as TomlValidationError).path).toBe('providers.anthropic.api_key')
    }
  })

  it('providers.<name>.models 非数组时抛 TomlValidationError', () => {
    const raw = {
      providers: {
        anthropic: {
          api_key: 'x',
          models: 'not-an-array' as unknown,
        },
      },
    }
    expect(() => validateUserConfigToml(raw)).toThrowError(TomlValidationError)
  })

  it('memory.embedding.dimension 非正整数时抛 TomlValidationError', () => {
    expect(() =>
      validateUserConfigToml({
        memory: { embedding: { dimension: -1 } },
      })
    ).toThrowError(TomlValidationError)
    expect(() =>
      validateUserConfigToml({
        memory: { embedding: { dimension: 1.5 } },
      })
    ).toThrowError(TomlValidationError)
  })

  it('缺失可选字段不应报错', () => {
    expect(() => validateUserConfigToml({})).not.toThrow()
    const validated = validateUserConfigToml({})
    expect(validated.default_provider).toBeUndefined()
    expect(validated.providers).toBeUndefined()
  })
})

describe('ProjectConfigToml validator — 非法字段必须显式报错', () => {
  it('合法最小 project config 通过校验', () => {
    const raw: ProjectConfigToml = {
      agent: { default: 'coder', max_parallel_subagents: 2 },
      features: { enabled: ['rag'] },
      modes: { allowed: ['standard', 'xforge'], recommended: 'standard' },
    }
    expect(() => validateProjectConfigToml(raw)).not.toThrow()
  })

  it('modes.recommended 不在枚举内时抛 TomlValidationError', () => {
    try {
      validateProjectConfigToml({
        modes: { recommended: 'banana' as unknown as 'standard' },
      })
      throw new Error('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(TomlValidationError)
      expect((err as TomlValidationError).path).toBe('modes.recommended')
    }
  })

  it('modes.allowed 含未知枚举值时抛 TomlValidationError', () => {
    expect(() =>
      validateProjectConfigToml({
        modes: { allowed: ['standard', 'other' as unknown as 'xforge'] },
      })
    ).toThrowError(TomlValidationError)
  })

  it('agent.max_parallel_subagents 必须为正整数', () => {
    expect(() =>
      validateProjectConfigToml({ agent: { max_parallel_subagents: 0 } })
    ).toThrowError(TomlValidationError)
    expect(() =>
      validateProjectConfigToml({ agent: { max_parallel_subagents: -3 } })
    ).toThrowError(TomlValidationError)
    expect(() =>
      validateProjectConfigToml({
        agent: { max_parallel_subagents: 1.5 as unknown as number },
      })
    ).toThrowError(TomlValidationError)
  })

  it('features.enabled 必须为字符串数组', () => {
    expect(() =>
      validateProjectConfigToml({
        features: { enabled: [1, 2] as unknown as string[] },
      })
    ).toThrowError(TomlValidationError)
  })

  it('完全为空的 project.toml 通过校验（缺失即 undefined）', () => {
    expect(() => validateProjectConfigToml({})).not.toThrow()
    const v = validateProjectConfigToml({})
    expect(v.agent).toBeUndefined()
    expect(v.features).toBeUndefined()
    expect(v.modes).toBeUndefined()
  })
})
