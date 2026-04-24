import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'

const CORE_DIR = resolve(process.cwd(), 'src')

const requiredFiles = [
  'agent-loop.ts',
  'bootstrap.ts',
  'context-manager.ts',
  'context-tracker.ts',
  'parallel-executor.ts',
  'args-summarizer.ts',
]

test('迁移核心文件应已落地到 packages/core/src', () => {
  for (const file of requiredFiles) {
    const filePath = resolve(CORE_DIR, file)
    assert.doesNotThrow(() => readFileSync(filePath, 'utf-8'))
  }
})

test('迁移核心文件不应引入 renderer/CLI UI 依赖', () => {
  const forbiddenPatterns = ['@ui/', '@commands/', '@server/', "from 'ink'", 'from "ink"']
  for (const file of requiredFiles) {
    const content = readFileSync(resolve(CORE_DIR, file), 'utf-8')
    for (const pattern of forbiddenPatterns) {
      assert.equal(
        content.includes(pattern),
        false,
        `${file} 命中禁用依赖: ${pattern}`,
      )
    }
  }
})
