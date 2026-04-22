// src/tools/agent/__tests__/agent-schema-v1.test.ts
/**
 * Agent frontmatter v1 schema 解析与校验测试
 *
 * 测试覆盖：
 * - parseAgentFrontmatter：解析主路径与错误路径
 * - parseAgentFile：完整文件解析
 * - splitAgentFile：frontmatter 分割
 *
 * 规范来源：.trellis/spec/backend/agent-schema-v1.md
 */

import { describe, it, expect } from 'vitest'
import {
  parseAgentFrontmatter,
  parseAgentFile,
  splitAgentFile,
  AgentValidationError,
} from '../parser.js'

// ─── 测试辅助 ────────────────────────────────────────────────────────────────

/**
 * 构造最小合法的 agent frontmatter 字符串。
 *
 * overrides 会被插入到 [tool_policy] 段之前，
 * 避免 TOML 将附加字段错误解析为 tool_policy 子字段。
 */
function minimalFrontmatter(overrides: string = ''): string {
  const extra = overrides ? `\n${overrides}` : ''
  return `id = "test-agent"
name = "Test Agent"
summary = "测试 Agent"
when_to_use = "用于测试"${extra}

[tool_policy]
mode = "exclude"
tools = []`
}

/** 构造完整合法的 agent 文件内容 */
function fullAgentFile(frontmatterOverrides: string = '', body: string = '系统提示词内容'): string {
  return `---\n${minimalFrontmatter(frontmatterOverrides)}\n---\n\n${body}`
}

// ─── splitAgentFile ───────────────────────────────────────────────────────────

describe('splitAgentFile', () => {
  it('正确分割含 frontmatter 的文件', () => {
    const content = `---\nid = "foo"\n---\n\nbody content`
    const { frontmatterRaw, body } = splitAgentFile(content)
    expect(frontmatterRaw).toContain('id = "foo"')
    expect(body).toBe('body content')
  })

  it('不含 frontmatter 时 frontmatterRaw 返回空字符串', () => {
    const { frontmatterRaw, body } = splitAgentFile('just a body')
    expect(frontmatterRaw).toBe('')
    expect(body).toBe('just a body')
  })

  it('frontmatter 只有开头 --- 没有结束 --- 时返回空 frontmatterRaw', () => {
    const { frontmatterRaw } = splitAgentFile('---\nid = "foo"\n')
    expect(frontmatterRaw).toBe('')
  })
})

// ─── parseAgentFrontmatter：主路径 ──────────────────────────────────────────

describe('parseAgentFrontmatter — 主路径', () => {
  it('解析最小合法 frontmatter', () => {
    const result = parseAgentFrontmatter(minimalFrontmatter())
    expect(result.id).toBe('test-agent')
    expect(result.name).toBe('Test Agent')
    expect(result.summary).toBe('测试 Agent')
    expect(result.when_to_use).toBe('用于测试')
    expect(result.mode).toBe('all') // 缺省值
    expect(result.tool_policy.mode).toBe('exclude')
    expect(result.tool_policy.tools).toEqual([])
  })

  it('解析 mode 字段：primary | subagent | all', () => {
    for (const mode of ['primary', 'subagent', 'all'] as const) {
      const result = parseAgentFrontmatter(minimalFrontmatter(`mode = "${mode}"`))
      expect(result.mode).toBe(mode)
    }
  })

  it('mode 缺省时默认为 all', () => {
    const result = parseAgentFrontmatter(minimalFrontmatter())
    expect(result.mode).toBe('all')
  })

  it('解析 inherits 字段', () => {
    const result = parseAgentFrontmatter(minimalFrontmatter(`inherits = "explore"`))
    expect(result.inherits).toBe('explore')
  })

  it('解析 tool_policy.mode = include 并提取 tools 列表', () => {
    const raw = `id = "readonly"
name = "ReadOnly"
summary = "只读"
when_to_use = "只读任务"

[tool_policy]
mode = "include"
tools = ["read_file", "grep", "glob"]`
    const result = parseAgentFrontmatter(raw)
    expect(result.tool_policy.mode).toBe('include')
    expect(result.tool_policy.tools).toContain('read_file')
    expect(result.tool_policy.tools).toContain('grep')
  })

  it('解析 model_preference 字段', () => {
    for (const pref of ['fast', 'balanced', 'strong'] as const) {
      const result = parseAgentFrontmatter(minimalFrontmatter(`model_preference = "${pref}"`))
      expect(result.model_preference).toBe(pref)
    }
  })

  it('解析 extra 对象字段', () => {
    const raw = `${minimalFrontmatter()}

[extra]
owner = "qa"
priority = "p0"`
    const result = parseAgentFrontmatter(raw)
    expect(result.extra).toEqual({
      owner: 'qa',
      priority: 'p0',
    })
  })

  it('model_preference 缺省时为 undefined', () => {
    const result = parseAgentFrontmatter(minimalFrontmatter())
    expect(result.model_preference).toBeUndefined()
  })
})

// ─── parseAgentFrontmatter：错误路径 ─────────────────────────────────────────

describe('parseAgentFrontmatter — 错误路径', () => {
  it('缺少必填字段 id 时抛出 AgentValidationError', () => {
    const raw = `name = "No ID Agent"
summary = "no id"
when_to_use = "test"

[tool_policy]
mode = "exclude"
tools = []`
    expect(() => parseAgentFrontmatter(raw)).toThrow(AgentValidationError)
    expect(() => parseAgentFrontmatter(raw)).toThrow(/id/)
  })

  it('id 包含非法字符（大写）时抛出错误', () => {
    const raw = minimalFrontmatter().replace('id = "test-agent"', 'id = "TestAgent"')
    expect(() => parseAgentFrontmatter(raw)).toThrow(AgentValidationError)
    expect(() => parseAgentFrontmatter(raw)).toThrow(/id/)
  })

  it('id 以连字符开头时抛出错误', () => {
    const raw = minimalFrontmatter().replace('id = "test-agent"', 'id = "-bad"')
    expect(() => parseAgentFrontmatter(raw)).toThrow(AgentValidationError)
  })

  it('mode 非法值时抛出错误，并说明非法值', () => {
    const raw = minimalFrontmatter('mode = "invalid"')
    try {
      parseAgentFrontmatter(raw)
      expect.fail('应该抛出错误')
    } catch (err) {
      expect(err).toBeInstanceOf(AgentValidationError)
      expect((err as AgentValidationError).field).toBe('mode')
    }
  })

  it('inherits 格式非法时抛出错误', () => {
    const raw = minimalFrontmatter('inherits = "../bad-agent"')
    try {
      parseAgentFrontmatter(raw)
      expect.fail('应该抛出错误')
    } catch (err) {
      expect(err).toBeInstanceOf(AgentValidationError)
      expect((err as AgentValidationError).field).toBe('inherits')
    }
  })

  it('tool_policy.mode 非 include/exclude 时抛出错误', () => {
    const raw = `id = "test"
name = "Test"
summary = "test"
when_to_use = "test"

[tool_policy]
mode = "all"
tools = []`
    try {
      parseAgentFrontmatter(raw)
      expect.fail('应该抛出错误')
    } catch (err) {
      expect(err).toBeInstanceOf(AgentValidationError)
      expect((err as AgentValidationError).field).toBe('tool_policy.mode')
    }
  })

  it('tool_policy.tools 不是字符串数组时抛出错误', () => {
    const raw = `id = "test"
name = "Test"
summary = "test"
when_to_use = "test"

[tool_policy]
mode = "include"
tools = [1, 2, 3]`
    expect(() => parseAgentFrontmatter(raw)).toThrow(AgentValidationError)
  })

  it('model_preference 非法值时抛出错误', () => {
    const raw = minimalFrontmatter('model_preference = "turbo"')
    expect(() => parseAgentFrontmatter(raw)).toThrow(AgentValidationError)
  })

  it('extra 不是对象时抛出错误', () => {
    const raw = `id = "test-agent"
name = "Test Agent"
summary = "测试 Agent"
when_to_use = "用于测试"
extra = "bad"

[tool_policy]
mode = "exclude"
tools = []`
    expect(() => parseAgentFrontmatter(raw)).toThrow(AgentValidationError)
  })

  it('TOML 语法错误时抛出 frontmatter 校验错误', () => {
    const raw = `id = "broken"
name = "Broken"
summary = "bad"
when_to_use = "bad"

[tool_policy
mode = "exclude"
tools = []`
    expect(() => parseAgentFrontmatter(raw)).toThrow(AgentValidationError)
  })

  it('缺少 name 时抛出错误', () => {
    const raw = `id = "test-agent"
summary = "test"
when_to_use = "test"

[tool_policy]
mode = "exclude"
tools = []`
    expect(() => parseAgentFrontmatter(raw)).toThrow(AgentValidationError)
    expect(() => parseAgentFrontmatter(raw)).toThrow(/name/)
  })

  it('缺少 summary 时抛出错误', () => {
    const raw = `id = "test-agent"
name = "Test"
when_to_use = "test"

[tool_policy]
mode = "exclude"
tools = []`
    expect(() => parseAgentFrontmatter(raw)).toThrow(AgentValidationError)
    expect(() => parseAgentFrontmatter(raw)).toThrow(/summary/)
  })

  it('缺少 when_to_use 时抛出错误', () => {
    const raw = `id = "test-agent"
name = "Test"
summary = "test"

[tool_policy]
mode = "exclude"
tools = []`
    expect(() => parseAgentFrontmatter(raw)).toThrow(AgentValidationError)
    expect(() => parseAgentFrontmatter(raw)).toThrow(/when_to_use/)
  })

  it('缺少 tool_policy 时抛出错误', () => {
    const raw = `id = "test-agent"
name = "Test"
summary = "test"
when_to_use = "test"`
    expect(() => parseAgentFrontmatter(raw)).toThrow(AgentValidationError)
    expect(() => parseAgentFrontmatter(raw)).toThrow(/tool_policy/)
  })

  it('错误信息包含文件路径（当传入 filePath 参数时）', () => {
    const raw = `name = "No ID"`
    try {
      parseAgentFrontmatter(raw, '/path/to/agent.md')
      expect.fail('应该抛出错误')
    } catch (err) {
      expect(err).toBeInstanceOf(AgentValidationError)
      expect((err as AgentValidationError).filePath).toBe('/path/to/agent.md')
      expect((err as Error).message).toContain('/path/to/agent.md')
    }
  })
})

// ─── parseAgentFile ───────────────────────────────────────────────────────────

describe('parseAgentFile', () => {
  it('解析完整合法的 agent 文件', () => {
    const content = fullAgentFile()
    const { frontmatter, body } = parseAgentFile(content)
    expect(frontmatter.id).toBe('test-agent')
    expect(body).toBe('系统提示词内容')
  })

  it('不含 frontmatter 的文件抛出错误', () => {
    expect(() => parseAgentFile('no frontmatter here')).toThrow(AgentValidationError)
  })

  it('正文可以是多行 Markdown', () => {
    const body = `# 标题\n\n段落内容\n\n- 列表项`
    const content = fullAgentFile('', body)
    const result = parseAgentFile(content)
    expect(result.body).toBe(body)
  })
})
