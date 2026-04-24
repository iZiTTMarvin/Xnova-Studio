// src/config/__tests__/config-toml-migration.todo.test.ts
/**
 * Phase 2 迁移占位测试 — config.toml 迁移目标契约
 *
 * ⚠️ 本文件在 Phase 2 · Task B / C / D 完成后已被实测覆盖：
 * - config.toml 优先于 config.json：见 `config-manager.toml.test.ts`
 * - project > user > builtin 合并：见 `resolver.test.ts`
 * - 旧用户 apiKey 迁移不丢失：见 `config-migration.integration.test.ts`
 *
 * 本文件保留占位壳体，明确指引到真实测试，避免后续回潮遗漏。
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

describe('[Phase 2 占位 → 已落地] 迁移目标契约', () => {
  it('所有占位场景都有真实断言覆盖（文件存在即视为通过）', () => {
    const here = dirname(fileURLToPath(import.meta.url))
    expect(existsSync(join(here, 'config-manager.toml.test.ts'))).toBe(true)
    expect(existsSync(join(here, 'legacy-migration.test.ts'))).toBe(true)
    expect(existsSync(join(here, 'resolver.test.ts'))).toBe(true)
    expect(existsSync(join(here, 'settings-contract.test.ts'))).toBe(true)
    // 集成测试：Phase 2 · E 新增
    expect(
      existsSync(join(here, 'config-migration.integration.test.ts')),
    ).toBe(true)

    // 锁住本文件自身不再误被当作 skipped 列表（避免回潮）
    const self = readFileSync(__filename, 'utf-8')
    expect(self).not.toMatch(/describe\.skip\(/)
  })
})
