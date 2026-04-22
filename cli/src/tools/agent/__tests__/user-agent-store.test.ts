// src/tools/agent/__tests__/user-agent-store.test.ts
/**
 * UserAgentStore CRUD 服务测试
 *
 * 使用临时目录隔离测试，避免影响真实 ~/.xnovacode/agents/
 *
 * 规范来源：.trellis/tasks/04-22-phase3-user-agent-crud/prd.md
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createUserAgentStore, UserAgentStoreError } from '../user-agent-store.js'

// ─── 测试辅助 ────────────────────────────────────────────────────────────────

/** 最小合法的 agent 文件内容 */
function makeAgentContent(id: string, name: string = 'Test Agent'): string {
  return `---
id = "${id}"
name = "${name}"
summary = "测试用途"
mode = "all"
when_to_use = "用于测试的 agent"

[tool_policy]
mode = "exclude"
tools = []
---

测试用系统提示词
`
}

// ─── 测试 ────────────────────────────────────────────────────────────────────

describe('UserAgentStore', () => {
  let tmpDir: string

  beforeEach(() => {
    // 每个测试用独立临时目录
    tmpDir = mkdtempSync(join(tmpdir(), 'xnova-agent-test-'))
  })

  afterEach(() => {
    // 清理临时目录
    rmSync(tmpDir, { recursive: true, force: true })
  })

  // ─── listAll ──────────────────────────────────────────────────────────

  describe('listAll', () => {
    it('空目录返回空列表', () => {
      const store = createUserAgentStore(tmpDir)
      expect(store.listAll()).toHaveLength(0)
    })

    it('列出所有合法 agent 文件', () => {
      const store = createUserAgentStore(tmpDir)
      store.save(makeAgentContent('agent-a'), { overwrite: false })
      store.save(makeAgentContent('agent-b'), { overwrite: false })
      const all = store.listAll()
      expect(all).toHaveLength(2)
      const ids = all.map(a => a.frontmatter.id)
      expect(ids).toContain('agent-a')
      expect(ids).toContain('agent-b')
    })

    it('所有 agent 的 source 为 user', () => {
      const store = createUserAgentStore(tmpDir)
      store.save(makeAgentContent('my-agent'), { overwrite: false })
      const all = store.listAll()
      expect(all[0]?.source).toBe('user')
    })
  })

  // ─── load ─────────────────────────────────────────────────────────────

  describe('load', () => {
    it('加载已存在的 agent', () => {
      const store = createUserAgentStore(tmpDir)
      store.save(makeAgentContent('my-agent', 'My Agent'), { overwrite: false })
      const loaded = store.load('my-agent')
      expect(loaded.frontmatter.id).toBe('my-agent')
      expect(loaded.frontmatter.name).toBe('My Agent')
      expect(loaded.source).toBe('user')
    })

    it('不存在的 id 抛出 NOT_FOUND 错误', () => {
      const store = createUserAgentStore(tmpDir)
      try {
        store.load('nonexistent')
        expect.fail('应该抛出错误')
      } catch (err) {
        expect(err).toBeInstanceOf(UserAgentStoreError)
        expect((err as UserAgentStoreError).code).toBe('NOT_FOUND')
      }
    })

    it('非法 id（路径穿越）会被拒绝', () => {
      const store = createUserAgentStore(tmpDir)
      expect(() => store.load('../escape')).toThrow(UserAgentStoreError)
    })

    it('loadRaw 返回原始内容，供编辑器 round-trip 使用', () => {
      const store = createUserAgentStore(tmpDir)
      store.save(makeAgentContent('raw-agent', 'Raw Agent'), { overwrite: false })
      const raw = store.loadRaw('raw-agent')
      expect(raw).toContain('id = "raw-agent"')
      expect(raw).toContain('Raw Agent')
    })
  })

  // ─── save ─────────────────────────────────────────────────────────────

  describe('save', () => {
    it('创建成功后可被 load 读取', () => {
      const store = createUserAgentStore(tmpDir)
      const saved = store.save(makeAgentContent('new-agent'), { overwrite: false })
      expect(saved.frontmatter.id).toBe('new-agent')
      const loaded = store.load('new-agent')
      expect(loaded.frontmatter.id).toBe('new-agent')
    })

    it('重复 id 且不设 overwrite 时抛出 DUPLICATE_ID 错误', () => {
      const store = createUserAgentStore(tmpDir)
      store.save(makeAgentContent('dup-agent'), { overwrite: false })
      try {
        store.save(makeAgentContent('dup-agent'), { overwrite: false })
        expect.fail('应该抛出错误')
      } catch (err) {
        expect(err).toBeInstanceOf(UserAgentStoreError)
        expect((err as UserAgentStoreError).code).toBe('DUPLICATE_ID')
      }
    })

    it('overwrite=true 时覆盖同名 agent', () => {
      const store = createUserAgentStore(tmpDir)
      store.save(makeAgentContent('update-me', 'Old Name'), { overwrite: false })
      store.save(makeAgentContent('update-me', 'New Name'), { overwrite: true })
      const loaded = store.load('update-me')
      expect(loaded.frontmatter.name).toBe('New Name')
    })

    it('非法 frontmatter 被拒绝，抛出 INVALID_AGENT 错误', () => {
      const store = createUserAgentStore(tmpDir)
      const badContent = `---
name = "No ID Agent"
summary = "bad"
when_to_use = "bad"

[tool_policy]
mode = "exclude"
tools = []
---

body
`
      try {
        store.save(badContent, { overwrite: false })
        expect.fail('应该抛出错误')
      } catch (err) {
        expect(err).toBeInstanceOf(UserAgentStoreError)
        expect((err as UserAgentStoreError).code).toBe('INVALID_AGENT')
      }
    })

    it('保存后返回的对象包含正确的 source 和 filePath', () => {
      const store = createUserAgentStore(tmpDir)
      const result = store.save(makeAgentContent('path-test'), { overwrite: false })
      expect(result.source).toBe('user')
      expect(result.filePath).toContain('path-test.md')
    })
  })

  // ─── delete ───────────────────────────────────────────────────────────

  describe('delete', () => {
    it('删除成功后无法再 load', () => {
      const store = createUserAgentStore(tmpDir)
      store.save(makeAgentContent('to-delete'), { overwrite: false })
      store.delete('to-delete')
      try {
        store.load('to-delete')
        expect.fail('应该抛出错误')
      } catch (err) {
        expect((err as UserAgentStoreError).code).toBe('NOT_FOUND')
      }
    })

    it('删除不存在的 id 抛出 NOT_FOUND 错误', () => {
      const store = createUserAgentStore(tmpDir)
      try {
        store.delete('ghost')
        expect.fail('应该抛出错误')
      } catch (err) {
        expect((err as UserAgentStoreError).code).toBe('NOT_FOUND')
      }
    })

    it('删除时对路径穿越 id 做拒绝处理', () => {
      const store = createUserAgentStore(tmpDir)
      expect(() => store.delete('..\\escape')).toThrow(UserAgentStoreError)
    })
  })

  // ─── createFromTemplate ───────────────────────────────────────────────

  describe('createFromTemplate', () => {
    it('从合法模板创建 agent', () => {
      const store = createUserAgentStore(tmpDir)
      const result = store.createFromTemplate('general', 'my-gen', 'My General', '通用 agent')
      expect(result.frontmatter.id).toBe('my-gen')
      expect(result.frontmatter.name).toBe('My General')
      expect(result.source).toBe('user')
    })

    it('不存在的模板 id 抛出 NOT_FOUND 错误', () => {
      const store = createUserAgentStore(tmpDir)
      try {
        store.createFromTemplate('nonexistent-template', 'x', 'X', 'x')
        expect.fail('应该抛出错误')
      } catch (err) {
        expect((err as UserAgentStoreError).code).toBe('NOT_FOUND')
      }
    })
  })

  // ─── createBlank ──────────────────────────────────────────────────────

  describe('createBlank', () => {
    it('从空白创建 agent', () => {
      const store = createUserAgentStore(tmpDir)
      const result = store.createBlank('blank-agent', 'Blank Agent')
      expect(result.frontmatter.id).toBe('blank-agent')
      expect(result.source).toBe('user')
    })

    it('创建后可被 listAll 列出', () => {
      const store = createUserAgentStore(tmpDir)
      store.createBlank('listed-agent', 'Listed')
      const all = store.listAll()
      expect(all.some(a => a.frontmatter.id === 'listed-agent')).toBe(true)
    })
  })
})
