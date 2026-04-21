# Special Specs and Gitignore Decisions

## 本次任务产物

### 新增 3 份 backend 专项 spec

- `.trellis/spec/backend/runtime-boundary.md`
- `.trellis/spec/backend/config-toml-migration.md`
- `.trellis/spec/backend/agent-schema-v1.md`

### 同步更新

- `.trellis/spec/backend/index.md`
- `.gitignore`
- `.trellis/scripts/tests/test_spec_bootstrap.py`

## 为什么这 3 份 spec 先补

### runtime boundary

原因：

- 后续 `cli/src/runtime/`、`cli/src/host/cli/`、`studio/` 会围绕这条边界拆分
- 如果不先定义 contract，后面很容易把 runtime、UI、IPC、Bridge 再次耦回一起

### config TOML migration

原因：

- 这是用户配置安全的核心风险点
- 如果没有明确迁移、回退和 merge 规则，最容易出现 silent reset

### agent schema v1

原因：

- 后续 parser、registry、Agents UI、project config 默认值、subagent 过滤都要依赖同一套 schema
- 如果不先统一，前后端会各写一套规则

## `.gitignore` 设计原则

目标不是“尽量多忽略”，而是“忽略真实本地产物，同时保留应提交的项目资产”。

### 明确忽略

- `node_modules`
- `dist/build/out/coverage`
- 编辑器 / 系统垃圾文件
- `.xnovacode` 下的运行态文件
- `.trellis/workspace/` 本地开发工作区

### 明确保留

- `.trellis/spec/`
- `.trellis/tasks/`
- `.agents/`
- `.claude/`
- `.codex/`
- `.windsurf/`

原因：

- 这些目录属于项目级规则、工作流或可共享资产，不应在 Git 初始化时被误排除

## 验证

已通过：

```text
python -m unittest discover -s .trellis/scripts/tests -p 'test_*.py'
```
