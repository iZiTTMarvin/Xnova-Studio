// src/tools/agent/__tests__/agent-schema-v1.todo.test.ts
/**
 * Phase 3 迁移占位测试 — agent frontmatter v1 schema 解析契约
 *
 * 这些测试描述 Phase 3 完成后应满足的行为。
 * 当前以 test.todo / describe.skip 标注，不影响套件通过。
 * Phase 3 实现后：将 .todo/.skip 改为正式断言。
 *
 * 所属 Phase：Phase 3 — Agent Schema v1
 * 规范来源：.trellis/spec/backend/agent-schema-v1.md
 */

import { describe, it } from 'vitest'

// ── 占位 3：agent frontmatter mode / inherits / tool_policy 解析 ──────────
describe.skip('[Phase 3 占位] agent frontmatter v1 解析', () => {
  it('解析 mode 字段：primary | subagent | all', () => {
    // TODO Phase 3:
    // const frontmatter = `
    // id = "explorer"
    // name = "Explorer"
    // mode = "subagent"
    // `
    // const def = parseAgentFrontmatter(frontmatter)
    // expect(def.mode).toBe('subagent')
    // expect(['primary', 'subagent', 'all']).toContain(def.mode)
  })

  it('解析 inherits 字段：继承内置 agent 的 toolPolicy', () => {
    // TODO Phase 3:
    // const frontmatter = `
    // id = "my-explorer"
    // inherits = "explore"
    // `
    // const def = parseAgentFrontmatter(frontmatter)
    // expect(def.inherits).toBe('explore')
    // 运行时应从 registry 查找 "explore" 并继承其 toolPolicy
  })

  it('解析 tool_policy.mode = include 并提取 tools 列表', () => {
    // TODO Phase 3:
    // const frontmatter = `
    // id = "readonly"
    // [tool_policy]
    // mode = "include"
    // tools = ["read_file", "grep", "glob"]
    // `
    // const def = parseAgentFrontmatter(frontmatter)
    // expect(def.toolPolicy.mode).toBe('include')
    // expect(def.toolPolicy.tools).toContain('read_file')
  })

  it('frontmatter 缺少必填字段 id 时抛出校验错误', () => {
    // TODO Phase 3:
    // const frontmatter = `name = "No ID Agent"`
    // expect(() => parseAgentFrontmatter(frontmatter)).toThrow(/id/)
  })

  it('user agent 覆盖同名 builtin agent（user > builtin 优先级）', () => {
    // TODO Phase 3:
    // registry.register(builtinExplore)
    // registry.register(userExploreOverride)  // source = 'custom'
    // expect(registry.get('explore')!.source).toBe('custom')
  })
})
