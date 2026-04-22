# [Phase 2 · 01] Config Migration — TOML and Project Config Resolver

> **Phase**：Phase 2 Config Migration · 主任务
> **Priority**：P0
> **Status**：planning
> **Source**：[`docs/implement/phase2-config-migration.md`](../../../docs/implement/phase2-config-migration.md)、[`docs/xnova-studio-V1核心设计文档.md`](../../../docs/xnova-studio-V1核心设计文档.md)、[`docs/xnova-studio-v1开发文档.md`](../../../docs/xnova-studio-v1开发文档.md)、[`docs/xnova-stuido-V1工程测试计划.md`](../../../docs/xnova-stuido-V1工程测试计划.md)

---

## 1. Problem

当前配置体系仍以 `~/.xnovacode/config.json` 为主，项目级配置也还没有统一收敛到 `.xnovacode/project.toml`。这会直接阻塞后续的桌面端主链路与 project-aware 能力：

1. 配置格式仍是 JSON，和 v1 已锁定的 TOML 基线不一致。
2. 缺少统一的 `project > user > builtin` 解析链路，项目默认值无法稳定表达。
3. Web 设置页和运行时还没有消费同一套配置语义，后续会出现“页面保存了，但运行时理解不同”的漂移风险。
4. 现有配置损坏路径存在 silent reset 风险，Phase 2 明确要求迁移必须可回退、可提示、不可静默覆盖。

## 2. Goal

在不破坏现有用户配置的前提下，建立 v1 需要的统一配置基础设施：

- 引入 `~/.xnovacode/config.toml` 作为新的用户级主配置
- 引入 `.xnovacode/project.toml` 作为项目级配置入口
- 实现 `project > user > builtin` 的统一解析与 merge 规则
- 保持旧 `config.json` 兼容读取，并提供安全迁移能力
- 让设置页写回与运行时消费收敛到同一套配置语义

## 3. Scope

### In

- 定义 `config.toml` 顶层 section：
  - `providers`
  - `memory`
  - `agent`
  - `modes`
  - `features`
- 定义 `project.toml` 最小字段集：
  - `agent.default`
  - `agent.max_parallel_subagents`
  - `features.enabled`
  - `modes.allowed`
  - `modes.recommended`
- 实现双读：
  - 优先 `config.toml`
  - 回退 `config.json`
- 实现安全迁移：
  - JSON -> TOML
  - 迁移失败保留原 JSON
  - 明确错误提示与 fallback
- 新增 project config resolver
- 改造设置页读写逻辑为 TOML 主格式
- 补齐本阶段要求的单元测试与集成测试

### Out

- 不处理 Agent frontmatter/schema 迁移（归 Phase 3）
- 不做 Electron 宿主与桌面 renderer（归 Phase 4 及以后）
- 不做 project-aware 主壳、默认首页和最近项目恢复（归 Phase 5 及以后）
- 不引入新的 project-level agent 产品能力

## 4. Dependencies

- **Requires**：Phase 1 Runtime Foundation 已完成，尤其是 runtime 配置入口已可独立演进
- **Blocks**：Phase 3 Agent System、Phase 4 Electron Host、Phase 5 Project-aware Shell
- **Gate 归属**：Gate B `Config / Agent Ready` 的前半部分主交付物

## 5. Subtasks

- [ ] **5.1** 子任务：`04-22-phase2-toml-schema`
  - 定义 `config.toml` / `project.toml` schema 与解析契约
- [ ] **5.2** 子任务：`04-22-phase2-legacy-migration`
  - 实现 `config.json -> config.toml` 双读、安全迁移与失败回退
- [ ] **5.3** 子任务：`04-22-phase2-project-resolver`
  - 实现 `.xnovacode/project.toml` 读取与 `project > user > builtin` merge
- [ ] **5.4** 子任务：`04-22-phase2-settings-writeback`
  - 改造 SettingsPage 读写链路，收敛到 TOML 主格式
- [ ] **5.5** 子任务：`04-22-phase2-config-verification`
  - 收口迁移、merge、设置页与错误路径验证，完成 Phase 2 验收

## 5A. 子任务顺序

建议执行顺序：

1. `04-22-phase2-toml-schema`
2. `04-22-phase2-legacy-migration`
3. `04-22-phase2-project-resolver`
4. `04-22-phase2-settings-writeback`
5. `04-22-phase2-config-verification`

## 6. Related Files

### 核心改动范围

- `cli/src/config/config-manager.ts`
- `cli/src/core/initializer.ts`
- `cli/web/src/pages/SettingsPage.tsx`
- 新增 TOML parser / serializer / resolver 相关模块
- 对应测试文件

### 只读参考

- `docs/implement/phase2-config-migration.md`
- `docs/xnova-studio-V1核心设计文档.md`
- `docs/xnova-studio-v1开发文档.md`
- `docs/xnova-stuido-V1工程测试计划.md`
- `.trellis/spec/backend/config-toml-migration.md`
- `.trellis/spec/backend/error-handling.md`
- `.trellis/spec/frontend/state-management.md`

## 7. Reference Specs（必读）

- [`.trellis/spec/backend/directory-structure.md`](../../../.trellis/spec/backend/directory-structure.md)
- [`.trellis/spec/backend/error-handling.md`](../../../.trellis/spec/backend/error-handling.md)
- [`.trellis/spec/backend/config-toml-migration.md`](../../../.trellis/spec/backend/config-toml-migration.md)
- [`.trellis/spec/backend/quality-guidelines.md`](../../../.trellis/spec/backend/quality-guidelines.md)
- [`.trellis/spec/frontend/directory-structure.md`](../../../.trellis/spec/frontend/directory-structure.md)
- [`.trellis/spec/frontend/quality-guidelines.md`](../../../.trellis/spec/frontend/quality-guidelines.md)
- [`.trellis/spec/frontend/state-management.md`](../../../.trellis/spec/frontend/state-management.md)
- [`.trellis/spec/frontend/type-safety.md`](../../../.trellis/spec/frontend/type-safety.md)
- [`.trellis/spec/guides/code-reuse-thinking-guide.md`](../../../.trellis/spec/guides/code-reuse-thinking-guide.md)
- [`.trellis/spec/guides/cross-layer-thinking-guide.md`](../../../.trellis/spec/guides/cross-layer-thinking-guide.md)

## 8. Acceptance Criteria

- [ ] `config.toml` / `project.toml` schema 已落定，且字段语义与现有 CLI 配置保持兼容
- [ ] `config.toml` 存在时优先读取，不会被 `config.json` 自动覆盖
- [ ] 仅存在旧 `config.json` 时，可安全迁移到 TOML，失败时保留原 JSON
- [ ] `project > user > builtin` merge 规则可测试、可解释、可复现
- [ ] `project.toml` 缺失、损坏、字段类型错误时，都有明确错误或 fallback 语义
- [ ] 设置页读取与保存使用同一套 resolved config 语义，保存只写 TOML
- [ ] Provider / Memory 配置在迁移后不丢失
- [ ] `pnpm typecheck`、相关测试、`cli/web` 构建验证全部通过

## 9. Risks & Mitigations

| 风险 | 缓解 |
|---|---|
| `config.toml` 解析失败后被默认值静默覆盖 | 先写失败测试；损坏配置必须显式报错并保留原文件 |
| `project.toml` 与 `config.toml` 字段结构漂移 | 以专项 spec 和现有 CLI 字段为唯一事实源，不在 UI 层自造结构 |
| UI 读写逻辑与 runtime 解析规则不一致 | 统一走 resolved config 入口，禁止 SettingsPage 私自决定优先级 |
| 迁移时只修一处，遗漏其他配置入口 | 先全仓搜索相同字段与旧 `config.json` 读取路径，按 Code Reuse Guide 收敛 |
| cross-layer 数据流不清，导致前后端理解不一致 | 在 `info.md` 中画清读取、合并、写回的数据流与边界责任 |

## 10. Testing Strategy

- 单元测试：
  - JSON -> TOML 迁移
  - `project > user > builtin` merge
  - 缺失字段 / 非法字段处理
- 集成测试：
  - 旧用户配置保留与迁移链路
  - 新配置可读写
  - 设置页改造后仍能稳定保存 Provider / Memory 配置
- 回归验证：
  - `provider / memory / modes / features` 默认值不丢失
  - CLI/runtime/UI 消费同一套 resolved config 语义

## 11. Definition of Done

1. 上述 Acceptance Criteria 全部打勾
2. `config.toml` 成为用户级主配置，`project.toml` 成为项目级主配置入口
3. 旧 `config.json` 兼容链路具备明确迁移、回退和提示
4. 设置页写回与运行时读取不再分叉
5. `CHANGELOG.md` 追加一条本阶段配置迁移相关记录
