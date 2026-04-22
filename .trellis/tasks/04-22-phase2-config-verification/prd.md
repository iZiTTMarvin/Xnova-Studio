# [Phase 2 · 06] Config Migration — Regression and Verification

> **Priority**：P0
> **Status**：planning
> **Parent**：`04-21-phase2-config-migration`

## 1. Goal

为 Phase 2 做最终收口，确保 schema、迁移、merge、设置页写回和错误路径都通过验证，并满足阶段完成标准。

## 2. Scope

### In

- 汇总并补齐单元测试：
  - JSON -> TOML 迁移
  - project config merge
  - 缺失字段 / 非法字段处理
- 汇总并补齐集成测试：
  - 旧用户配置不丢失
  - 新配置可读写
  - 设置页改造后仍能稳定保存 Provider / Memory 配置
- 运行 typecheck、测试、web 构建验证
- 检查是否需要回写 `.trellis/spec/backend/config-toml-migration.md`

### Out

- 不新增业务功能
- 不扩展 Phase 2 范围外的 UI

## 3. Acceptance Criteria

- Phase 2 文档中的完成标准全部满足
- 不存在 silent reset
- 新老用户都能稳定启动
- 设置页与运行时消费同一套配置语义

## 4. Related Files

- `docs/implement/phase2-config-migration.md`
- `docs/xnova-stuido-V1工程测试计划.md`
- `.agents/skills/trellis-check/SKILL.md`
