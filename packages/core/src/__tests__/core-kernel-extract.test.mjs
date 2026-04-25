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

test('文件索引扫描必须在 glob 阶段跳过重型目录并禁止跟随符号链接', () => {
  const content = readFileSync(resolve(CORE_DIR, 'file-index', 'file-index.ts'), 'utf-8')

  assert.equal(
    content.includes('ignore: FILE_INDEX_GLOB_IGNORE_PATTERNS'),
    true,
    'FileIndex.scan 必须把内置忽略规则传给 fast-glob，避免先扫描 node_modules 再过滤导致 OOM',
  )
  assert.equal(
    content.includes('followSymbolicLinks: false'),
    true,
    'FileIndex.scan 必须禁止跟随符号链接，避免 pnpm/node_modules 链接结构造成深层递归',
  )
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
