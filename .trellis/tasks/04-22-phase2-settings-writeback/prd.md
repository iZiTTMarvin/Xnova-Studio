# [Phase 2 · 05] Config Migration — Settings TOML Writeback

> **Priority**：P1
> **Status**：planning
> **Parent**：`04-21-phase2-config-migration`

## 1. Goal

把设置页读取和保存链路改造成 TOML 主格式，并让 Provider / Memory 页面与新的 schema、resolved config 语义对齐。

## 2. Scope

### In

- 设置页读取改为 TOML 主格式
- 设置页保存改为只写 TOML
- Provider / Memory 页面与新 schema 对齐
- 保存失败、配置损坏、bridge/runtime 未就绪时给出真实可见反馈

### Out

- 不定义新后端 schema
- 不直接实现 legacy 迁移逻辑
- 不扩展 project-aware UI 展示

## 3. Acceptance Criteria

- SettingsPage 与运行时消费同一套 resolved config 语义
- 保存后不再回写 JSON
- Provider / Memory 页面在错误态和禁用态下有清晰提示
- 相关构建和类型检查通过

## 4. Related Files

- `cli/web/src/pages/SettingsPage.tsx`
- `.trellis/spec/frontend/quality-guidelines.md`
- `.trellis/spec/frontend/state-management.md`
