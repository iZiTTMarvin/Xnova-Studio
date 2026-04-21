# Task PRD: Add Startup Specs and Complete Gitignore

## Goal

补齐 3 份启动前最关键的专项 spec，并完善仓库根 `.gitignore`，使仓库在初始化 Git 前具备更稳定的架构约束和忽略规则基线。

## Scope

### In Scope

- 新增或补齐以下专项 spec：
  - runtime boundary
  - config TOML migration
  - agent schema v1
- 将上述专项 spec 挂入现有 backend spec 索引，供 `trellis-before-dev` 使用
- 完善根 `.gitignore`
- 更新 `CHANGELOG.md`

### Out of Scope

- 真实实现 runtime / TOML / agent schema 代码
- 安装 `node_modules`
- 初始化 Git 仓库或执行 commit

## Requirements

1. 专项 spec 必须写成可执行 code-spec，而不是原则性概述
2. 每份 spec 都应覆盖：
   - Scope / Trigger
   - Signatures
   - Contracts
   - Validation & Error Matrix
   - Good / Base / Bad Cases
   - Tests Required
   - Wrong vs Correct
3. `.gitignore` 必须覆盖当前仓库已知的本地产物、构建产物和依赖目录，同时避免误伤应纳入版本控制的 Trellis 规范文件

## Success Criteria

- backend index 已纳入 3 份专项 spec
- 根 `.gitignore` 相比当前最小版本明显完善
- `python -m unittest discover -s .trellis/scripts/tests -p 'test_*.py'` 继续通过
- 变更已记录到 `CHANGELOG.md`
