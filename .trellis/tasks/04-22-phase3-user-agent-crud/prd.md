# [Phase 3 · 05] Agent System — User Agent Persistence and CRUD

> **Priority**：P0
> **Status**：planning
> **Parent**：`04-22-phase3-agent-system`

## 1. Goal

建立用户 agent 的文件存储、模板/空白脚手架和 CRUD 服务，让自定义 agent 不再只是“能读”，而是具备稳定可管理的生命周期。

## 2. Scope

### In

- 用户 agent 存储路径与文件命名约定
- Markdown + frontmatter 的保存 / 读取 / 更新 / 删除
- 从模板创建
- 从空白创建
- 保存前统一走 schema validator
- 文件冲突、非法字段、重复 id 的错误处理
- 后续 UI 可直接调用的 service / API 契约

### Out

- 不实现 UI 页面与交互
- 不实现 project-level agent 管理
- 不重复实现 schema / compat / mode filter

## 3. Technical Approach

- 复用现有 frontmatter / file-store 的轻量文件管理经验，但字段语义严格跟随 agent schema v1
- 先写失败测试，锁住：
  - 创建成功
  - 更新成功
  - 删除成功
  - 重复 id / 非法 frontmatter / 模板缺失报错
- 模板骨架应最少包含：
  - frontmatter 必填字段
  - 正文提示词占位

## 4. Acceptance Criteria

- 用户 agent CRUD 在 service 层可独立通过测试
- 模板创建与空白创建都能产出合法 agent 文件
- 保存前非法 agent 会被拒绝，且错误信息对用户可理解
- 创建后的用户 agent 能被 loader / registry 正常消费

## 5. Related Files

- 未来新增的 user agent store / service / serializer 模块
- `cli/src/tools/agent/types.ts`
- `cli/src/skills/engine/parser.ts`
- `cli/src/memory/storage/file-store.ts`

## 6. Reference Specs

- [`.trellis/spec/backend/agent-schema-v1.md`](../../../.trellis/spec/backend/agent-schema-v1.md)
- [`.trellis/spec/backend/directory-structure.md`](../../../.trellis/spec/backend/directory-structure.md)
- [`.trellis/spec/backend/error-handling.md`](../../../.trellis/spec/backend/error-handling.md)
- [`.trellis/spec/guides/code-reuse-thinking-guide.md`](../../../.trellis/spec/guides/code-reuse-thinking-guide.md)

