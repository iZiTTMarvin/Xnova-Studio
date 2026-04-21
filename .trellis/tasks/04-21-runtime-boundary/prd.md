# [Phase 1 · 02] Runtime Foundation — Runtime Boundary Extraction

> **Phase**：Phase 1 Runtime Foundation · Task B
> **Priority**：P0
> **Status**：planning
> **Source**：[`docs/implement/phase1-runtime-foundation.md`](../../../docs/implement/phase1-runtime-foundation.md) §任务清单 B、[`docs/xnova-studio-v1开发文档.md`](../../../docs/xnova-studio-v1开发文档.md) §M1 Runtime Boundary

---

## 1. Problem

当前 `cli/src/core/bootstrap.ts` 一次承担了太多职责：

- AgentLoop orchestration
- Tool registry build
- MCP / Skills / Memory / Hook / Plugin 装配
- Session / event API
- CLI UI 相关装配

这导致：

1. 桌面宿主（未来 `studio/src/renderer/`）无法在**不引入 CLI 终端依赖**的前提下复用运行时
2. Phase 4 的 Electron Host、Phase 5 的 project-aware Shell 都会被这个耦合阻塞
3. 任何一次运行时修改都跨层影响 UI，增加回归风险

## 2. Goal

按 [`.trellis/spec/backend/runtime-boundary.md`](../../../.trellis/spec/backend/runtime-boundary.md) 的契约骨架，把 `shared runtime` 切出清晰边界：

- 新建 `cli/src/runtime/`，承载 AgentLoop / ToolRegistry / MCP / Skills / Memory / Session / Event 装配
- 定义 `createRuntime` / `RuntimeHostBridge` / `RuntimeInstance` 三个核心签名并落地到 `cli/src/runtime/types.ts`
- **CLI 仍能完整运行**（回归零容忍）
- 为 Phase 4 桌面宿主与 Phase 1 Task C（CLI Host 收敛）提供稳定消费面

## 3. Scope

### In

- 新建 `cli/src/runtime/` 目录骨架
- 把 `bootstrap.ts` 中的装配逻辑**增量**迁移到 runtime 层，保留兼容层，**不做一次性大搬家**
- 落定 spec 中 6 个占位类型到真实 TS 定义：`ResolvedConfig` / `RuntimeEvent` / `PermissionRequest` / `PermissionResolution` / `UserQuestionRequest` / `UserQuestionResult` / `RuntimeSubmitInput` / `RuntimeSnapshot`
- 实现 `createRuntime()` 工厂并让 CLI 当前主链路改道消费它
- 补 runtime 单元测试 + 集成测试（CLI 主链路端到端仍绿）
- 按需回写 `.trellis/spec/backend/runtime-boundary.md`，把占位类型"升级"为真实字段清单

### Out（本 task 明确不做）

- 不拆 `cli/src/host/cli/`（归 `04-21-cli-host-extraction`）
- 不新建 `studio/`（归 Phase 4）
- 不做 TOML 迁移 / agent schema 迁移（Phase 2 / 3）
- 不改 renderer 层任何代码
- 不把仓库改成 `apps/* + packages/*` 布局（[`directory-structure.md`](../../../.trellis/spec/backend/directory-structure.md) §Design Decision 明确禁止）

## 4. Dependencies

- **Blocked-by**：`04-21-test-baseline`（必须先让回归测试就位）
- **Blocks**：`04-21-cli-host-extraction`、Phase 4 Electron Host
- **Gate 归属**：Gate A Runtime Ready 的**主要交付物**

## 5. Subtasks

- [ ] **5.1** 读 `cli/src/core/bootstrap.ts` / `agent-loop.ts` / `ui/useChat.ts` / `tools/core/*` / `memory/*` / `mcp/*` / `skills/*`，列出当前装配链路（只读调研，产出 `info.md`）
- [ ] **5.2** 新建 `cli/src/runtime/` 目录（`index.ts` / `types.ts` / `create-runtime.ts` / `bridge.ts` / `events.ts`），保持空骨架，先跑通类型
- [ ] **5.3** 在 `cli/src/runtime/types.ts` 落定 spec 里的 6 个占位类型（字段级），同步回写 `runtime-boundary.md`
- [ ] **5.4** 把 Tool registry 构建从 `bootstrap.ts` 抽到 `runtime/tool-registry.ts`，`bootstrap.ts` 改为调用者
- [ ] **5.5** 把 MCP / Skills / Memory / Hook / Plugin 装配逐个迁到 `runtime/`，每次迁完跑一次基线测试确保不回归
- [ ] **5.6** 抽 AgentLoop orchestration 到 `runtime/agent-loop.ts`，`useChat.ts` 改为 runtime 消费者
- [ ] **5.7** 实现 `createRuntime(config, bridge)` 工厂，让 CLI `bootstrapAll()` 内部走 runtime 路径（保留旧导出作为兼容层）
- [ ] **5.8** 补 `cli/src/runtime/__tests__/*`：`create-runtime.test.ts`（factory 输入输出）、`bridge.test.ts`（事件分发）、`integration.test.ts`（CLI 主链路经过 runtime 不回归）
- [ ] **5.9** 核对 `runtime/` 无 `import` 指向 `ui/`、`ink`、`electron`；违反视为边界违规
- [ ] **5.10** 回写 `runtime-boundary.md`：把"spec 层契约骨架"段落的占位类型更新为"已落定，参见 `cli/src/runtime/types.ts`"

## 6. Related Files

### 改动范围（新增 / 修改）

- `cli/src/runtime/index.ts`（新增）
- `cli/src/runtime/types.ts`（新增）
- `cli/src/runtime/create-runtime.ts`（新增）
- `cli/src/runtime/bridge.ts`（新增）
- `cli/src/runtime/events.ts`（新增）
- `cli/src/runtime/tool-registry.ts`（新增）
- `cli/src/runtime/agent-loop.ts`（新增）
- `cli/src/runtime/__tests__/*.test.ts`（新增）
- `cli/src/core/bootstrap.ts`（改为 runtime 消费者，保留兼容导出）
- `cli/src/core/agent-loop.ts`（收敛，逐步被 runtime 版本替代）
- `cli/src/ui/useChat.ts`（小幅改为 runtime 消费者，不引入新 UI 逻辑）
- `.trellis/spec/backend/runtime-boundary.md`（回写占位类型）

### 只读参考

- `docs/implement/phase1-runtime-foundation.md`
- `docs/xnova-studio-v1开发文档.md` §M1
- `cli/src/core/bootstrap.ts`（现状）
- `cli/src/core/agent-loop.ts`（现状）
- `cli/src/ui/useChat.ts`（现状）
- `cli/src/server/bridge/*`（Bridge 已有的消费方式）

## 7. Reference Specs（必读）

- [`.trellis/spec/backend/runtime-boundary.md`](../../../.trellis/spec/backend/runtime-boundary.md) — **本 task 的主契约**
- [`.trellis/spec/backend/directory-structure.md`](../../../.trellis/spec/backend/directory-structure.md) §v1 演进落点、§Design Decision — 明确禁止 `apps/* + packages/*` 大搬家
- [`.trellis/spec/backend/error-handling.md`](../../../.trellis/spec/backend/error-handling.md) — runtime 初始化部分能力失败（如 embedding）必须走 warning/event 暴露
- [`.trellis/spec/backend/logging-guidelines.md`](../../../.trellis/spec/backend/logging-guidelines.md) — 事件与日志语义
- [`.trellis/spec/backend/quality-guidelines.md`](../../../.trellis/spec/backend/quality-guidelines.md) — TDD / 测试门禁
- [`.trellis/spec/backend/config-toml-migration.md`](../../../.trellis/spec/backend/config-toml-migration.md) — `ResolvedConfig` 字段归属另一份 spec，不在本 task 自造
- [`.trellis/spec/backend/agent-schema-v1.md`](../../../.trellis/spec/backend/agent-schema-v1.md) — runtime agent registry 必须复用，不自造 mode 过滤
- [`.trellis/spec/guides/cross-layer-thinking-guide.md`](../../../.trellis/spec/guides/cross-layer-thinking-guide.md) — 本 task 属于跨层结构性变更，必读

## 8. Acceptance Criteria

- [ ] `cli/src/runtime/` 目录存在且**未 import** `ink` / `electron` / `cli/src/ui/*` / `cli/src/host/*`
- [ ] `createRuntime(config, bridge)` 能在**不依赖 CLI UI**的前提下启动完整装配
- [ ] `cli/src/runtime/types.ts` 定义了 spec 列出的 6 个核心类型，字段与 `runtime-boundary.md` 的回写段一致
- [ ] CLI 主链路全部基线测试（来自 `04-21-test-baseline`）继续绿跑，无回归
- [ ] `bootstrap.ts` 对外 API 保持向后兼容（兼容层可标 `@deprecated`，但不删除）
- [ ] 新增 runtime 单元测试 + 至少一条集成测试覆盖"CLI 主链路经过 runtime"
- [ ] 运行 `pnpm typecheck` / `vitest run` / `pnpm build:check` 全绿
- [ ] `.trellis/spec/backend/runtime-boundary.md` 的"类型引用约定"段已更新，把占位状态标注为"已落定"并指向实现文件

## 9. Risks & Mitigations

| 风险 | 缓解 |
|---|---|
| 一次性大搬家导致 CLI 崩 | 按 5.4 → 5.5 → 5.6 分步迁，每步跑一次 `04-21-test-baseline` 的基线套件 |
| runtime 接口设计过度（预支未来需求） | 只按 spec 列出的 6 个类型 + 当前真实消费者抽，不提前 over-design |
| 兼容层长期不收敛变成"两套运行时" | 兼容层函数强制标 `@deprecated`，并在 commit message 记录 sunset 时间点 |
| renderer / host 错误越级 import runtime 内部 | 在 `runtime/index.ts` 只 export 公共契约，非公共符号不暴露 |
| 类型落定时与 config-toml-migration 字段漂移 | `ResolvedConfig` 字段从 `cli/src/config/config-manager.ts` 现行结构平移，不借迁移改字段名 |

## 10. Testing Strategy

- 沿用 `04-21-test-baseline` 建立的 `*.baseline.test.ts` 作为回归护栏
- 新增 `cli/src/runtime/__tests__/create-runtime.test.ts`：断言 factory 输入校验、bridge 事件路由
- 新增 `cli/src/runtime/__tests__/integration.test.ts`：启动完整 runtime → 调用一次工具 → 断言事件流
- **不**在本 task 里写 E2E（归 Phase 7）
- 修改任何一个 runtime 文件都必须跑 `vitest run cli/src/runtime`（在 Phase 3 spec update 里把这条 hook 到 pre-commit）

## 11. Definition of Done

1. 上述 Acceptance Criteria 全部打勾
2. `git diff` 显示 **没有** `apps/`、`packages/` 目录的新增
3. `grep -r "from '.*ink'" cli/src/runtime` 无匹配、`grep -r "from 'electron'" cli/src/runtime` 无匹配
4. 后续 `04-21-cli-host-extraction` 的子代理能**直接消费** `cli/src/runtime/index.ts` 导出
5. CHANGELOG 追加一条 `[架构]` 类别记录
