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

test('bootstrap 导入阶段不得急切打开 TokenMeter SQLite', () => {
  const content = readFileSync(resolve(CORE_DIR, 'bootstrap.ts'), 'utf-8')

  assert.equal(
    content.includes('export const tokenMeter = new TokenMeter()'),
    false,
    'bootstrap 被 runtime barrel 导入时不能立刻打开 SQLite，否则并发测试和轻量 inspect 会抢全局 DB 锁',
  )
  assert.equal(
    content.includes('export const tokenMeter = createLazySingleton(() => new TokenMeter())'),
    true,
    'TokenMeter 必须保持惰性实例化，只在真正计量使用时访问 SQLite',
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

test('AgentLoop 权限拒绝必须把真实 reason 写入工具结果', () => {
  const content = readFileSync(resolve(CORE_DIR, 'agent-loop.ts'), 'utf-8')

  assert.equal(
    content.includes("result: 'rejected by user'"),
    false,
    '权限拒绝不能再硬编码为 rejected by user，否则 workspace-not-ready/outside-workspace 等原因会被吞掉',
  )
  assert.equal(
    content.includes("resultSummary: 'rejected by user'"),
    false,
    '权限拒绝的 resultSummary 必须来自结构化 reason，不能统一显示 rejected by user',
  )
  assert.equal(
    content.includes('permission denied ('),
    true,
    '权限拒绝时应把 reason 格式化为 permission denied (<reason>) 供 UI 与 LLM 诊断',
  )
})
