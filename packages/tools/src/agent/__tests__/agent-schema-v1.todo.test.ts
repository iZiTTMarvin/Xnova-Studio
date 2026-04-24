// src/tools/agent/__tests__/agent-schema-v1.todo.test.ts
/**
 * Phase 3 占位测试 — 已完成（Phase 3 已落地）
 *
 * 实际测试已迁移到：
 * - agent-schema-v1.test.ts（parseAgentFrontmatter / parseAgentFile / splitAgentFile）
 * - mode-filter.test.ts（mode 过滤规则）
 * - user-agent-store.test.ts（用户 agent CRUD）
 * - dispatch-agent.baseline.test.ts（注册表基线，source 已升级为 v1 枚举）
 *
 * 保留本文件仅供历史追溯，不产生任何测试断言。
 */

import { describe, it } from 'vitest'

// Phase 3 已完成：所有占位测试已转正到对应测试文件
describe('[Phase 3 已完成] agent frontmatter v1 解析（占位已转正）', () => {
  it.todo('已转移至 agent-schema-v1.test.ts — 解析 mode / inherits / tool_policy')
  it.todo('已转移至 agent-schema-v1.test.ts — 缺少必填字段报错')
  it.todo('已转移至 dispatch-agent.baseline.test.ts — user > builtin 优先级')
})
