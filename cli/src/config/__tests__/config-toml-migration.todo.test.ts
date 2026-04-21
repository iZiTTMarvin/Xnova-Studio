// src/config/__tests__/config-toml-migration.todo.test.ts
/**
 * Phase 2 迁移占位测试 — config.toml 迁移目标契约
 *
 * 这些测试描述 Phase 2 完成后应满足的行为。
 * 当前以 test.todo / describe.skip 标注，不影响套件通过。
 * Phase 2 实现后：将 .todo/.skip 改为正式断言。
 *
 * 所属 Phase：Phase 2 — Config TOML Migration
 * 规范来源：.trellis/spec/backend/config-toml-migration.md
 */

import { describe, it } from 'vitest'

// ── 占位 1：config.toml 优先于 config.json ─────────────────────────────────
describe.skip('[Phase 2 占位] config.toml 优先级高于 config.json', () => {
  it('同时存在 config.toml 和 config.json 时，优先读取 config.toml', () => {
    // TODO Phase 2:
    // const dir = makeTempDir()
    // writeFileSync(join(dir, 'config.json'), JSON.stringify({ defaultProvider: 'from-json' }))
    // writeFileSync(join(dir, 'config.toml'), `default_provider = "from-toml"`)
    // const mgr = new ConfigManager(dir)
    // const cfg = mgr.load()
    // expect(cfg.defaultProvider).toBe('from-toml')
  })

  it('只有 config.json 时仍能正常加载（向后兼容）', () => {
    // TODO Phase 2:
    // const dir = makeTempDir()
    // writeFileSync(join(dir, 'config.json'), JSON.stringify({ defaultProvider: 'anthropic' }))
    // const mgr = new ConfigManager(dir)
    // expect(mgr.load().defaultProvider).toBe('anthropic')
  })
})

// ── 占位 2：project > user > builtin 合并规则 ─────────────────────────────
describe.skip('[Phase 2 占位] project > user > builtin 配置合并规则', () => {
  it('project.toml 的字段覆盖 user config.toml 的同名字段', () => {
    // TODO Phase 2:
    // project.toml: default_model = "gpt-4o"
    // user config.toml: default_model = "claude-sonnet-4-6"
    // resolved: default_model === "gpt-4o"
  })

  it('user config.toml 的字段覆盖 builtin 默认值', () => {
    // TODO Phase 2:
    // user config.toml: status_bar = false
    // builtin default: statusBar = true
    // resolved: statusBar === false
  })

  it('project.toml 缺失字段时回退到 user config.toml', () => {
    // TODO Phase 2:
    // project.toml 不含 default_model
    // user config.toml: default_model = "claude-haiku"
    // resolved: default_model === "claude-haiku"
  })

  it('迁移时不丢失用户已有的 provider apiKey', () => {
    // TODO Phase 2:
    // 这是高风险场景：silent reset 视为严重缺陷
    // 旧 config.json 含 providers.anthropic.apiKey = "sk-xxx"
    // 迁移后 config.toml 应保留该 apiKey
  })
})
