# [Phase 1 · 01] Runtime Foundation — Test Baseline

> **Phase**：Phase 1 Runtime Foundation · Task A
> **Priority**：P0
> **Status**：planning
> **Source**：[`docs/implement/phase1-runtime-foundation.md`](../../../docs/implement/phase1-runtime-foundation.md) §任务清单 A、§测试要求

---

## 1. Problem

Phase 1 的后续两个 task（`04-21-runtime-boundary`、`04-21-cli-host-extraction`）将对 `cli/src/core/bootstrap.ts` 做结构性切分。目前仓库的测试护栏严重不足：

- `cli/vitest.config.ts` 存在但**尚未验证在当前代码基线下是否能绿跑**
- `config.json` 迁移、`dispatch_agent` / SubAgent、会话恢复三条高风险链路**没有对应失败测试占位**
- `pnpm typecheck` / `pnpm build:check` 当前产出状态未知

没有这些护栏就做 runtime 切分，等于闭眼改主链路。本 task 是后续 01 / 02 / 03 的**必要前置**。

## 2. Goal

在不改动业务逻辑的前提下，建立**最小但可执行**的测试基线：

- 仓库有一条"绿跑链路"：`pnpm typecheck` + `vitest run` + `cli/web` 的 `pnpm build:check` 全部通过或状态明确
- 三条 Phase 1 最高风险点（config、agent/SubAgent、session 恢复）有对应 **红测试占位**（或行为锚点单测），后续迁移破坏行为时能被立即感知
- 为 Phase 2 / Phase 3 迁移提供"先红后绿"的 TDD 起点

## 3. Scope

### In

- 验证并落地 `cli/vitest.config.ts` 当前可执行状态（必要时修配置）
- 确定仓库根或 `cli/` 的**最小测试命令**并写入 `cli/package.json` / 文档
- 固化当前 `ConfigManager.load()` 主路径行为的基线单测
- 固化当前 `dispatch_agent` 主路径（general / explore / plan）行为的基线单测 or 契约测试
- 固化会话恢复（`persistence/session-store`）主路径行为的基线单测
- 为 Phase 2 config 迁移、Phase 3 agent schema 迁移写**红测试占位**（skip / todo 标记，但已有断言雏形）
- 更新 `.trellis/spec/backend/quality-guidelines.md`（如发现新约束）

### Out（本 task 明确不做）

- 不抽 `cli/src/runtime/`（归 `04-21-runtime-boundary`）
- 不拆 `cli/src/host/cli/`（归 `04-21-cli-host-extraction`）
- 不做 TOML 迁移（归 Phase 2）
- 不改 agent schema（归 Phase 3）
- 不做 E2E 测试框架引入（归 Phase 7）

## 4. Dependencies

- **Blocks**：`04-21-runtime-boundary`、`04-21-cli-host-extraction`
- **Blocked-by**：无
- **Gate 归属**：必须先于 Gate A（Runtime Ready）

## 5. Subtasks

- [ ] **5.1** 跑通当前 `pnpm typecheck` / `vitest` / `cli/web` 的 `pnpm build:check`，记录实际产出
- [ ] **5.2** 如有失败，最小侵入式修复（**不改业务逻辑**），或在 `notes` 里声明"已知失败 + 不在本 task 修"
- [ ] **5.3** 新增 `cli/src/config/__tests__/config-manager.baseline.test.ts`：固化 `ConfigManager.load()` 对合法 / 缺失 / 损坏 JSON 的当前行为
- [ ] **5.4** 新增 `cli/src/tools/agent/__tests__/dispatch-agent.baseline.test.ts`：固化 `dispatch_agent` 分派 general / explore / plan 的主路径
- [ ] **5.5** 新增 `cli/src/persistence/__tests__/session-store.baseline.test.ts`：固化会话写入 / 恢复主路径
- [ ] **5.6** 新增三个 **红测试占位**（Phase 2/3 迁移目标）：
  - `config.toml → config.json 优先级` 占位（`.skip` / `.todo`）
  - `project > user > builtin` 合并规则占位
  - agent frontmatter `mode / inherits / tool_policy` 解析占位
- [ ] **5.7** 在 `cli/package.json` 或 `scripts/` 暴露稳定命令：`pnpm test:baseline`（若已有 `pnpm test` 等价则复用，不增复杂度）
- [ ] **5.8** 把实际测试命令写回 `.trellis/spec/backend/quality-guidelines.md` 与 `.trellis/spec/frontend/quality-guidelines.md`，替换"先前写 `pnpm build:check` 是否真实存在"这类不确定说法

## 6. Related Files

### 改动范围（预计新增 / 修改）

- `cli/vitest.config.ts`（可能微调）
- `cli/package.json`（可能补 scripts）
- `cli/src/config/__tests__/config-manager.baseline.test.ts`（新增）
- `cli/src/tools/agent/__tests__/dispatch-agent.baseline.test.ts`（新增）
- `cli/src/persistence/__tests__/session-store.baseline.test.ts`（新增）
- `cli/src/**/__tests__/*.migration.todo.test.ts`（新增占位）
- `.trellis/spec/backend/quality-guidelines.md`（按需更新）
- `.trellis/spec/frontend/quality-guidelines.md`（按需更新）

### 只读参考

- `docs/implement/phase1-runtime-foundation.md` §任务清单 A、§测试要求
- `docs/xnova-studio-v1开发文档.md` §M0 测试与基线冻结
- `cli/cli完成进度.md`（了解当前 F1–F36 能力基线）

## 7. Reference Specs（必读）

- [`.trellis/spec/backend/quality-guidelines.md`](../../../.trellis/spec/backend/quality-guidelines.md) — TDD / 测试门禁
- [`.trellis/spec/backend/directory-structure.md`](../../../.trellis/spec/backend/directory-structure.md) — 测试文件落点
- [`.trellis/spec/backend/config-toml-migration.md`](../../../.trellis/spec/backend/config-toml-migration.md) — 用于 5.6 占位的目标契约
- [`.trellis/spec/backend/agent-schema-v1.md`](../../../.trellis/spec/backend/agent-schema-v1.md) — 用于 5.6 占位的目标契约
- [`.trellis/spec/backend/runtime-boundary.md`](../../../.trellis/spec/backend/runtime-boundary.md) — 了解后续 task 将把哪些模块搬动，避免本 task 把测试写死在即将搬走的路径

## 8. Acceptance Criteria

- [ ] `pnpm typecheck` 在 `cli/` 与 `cli/web/` 都能绿跑
- [ ] `vitest run` 在 `cli/` 下能绿跑（新增基线测试也全部通过）
- [ ] 5.6 占位测试以 `.skip` / `.todo` 存在且未导致套件失败
- [ ] 三条高风险链路（config / agent-dispatch / session-restore）基线测试覆盖**至少主路径 + 一条失败路径**
- [ ] 测试命令已固化到 `cli/package.json` 和 `.trellis/spec/*/quality-guidelines.md`
- [ ] 改动**不引入**新运行时逻辑，只引入测试与必要的测试基础设施

## 9. Risks & Mitigations

| 风险 | 缓解 |
|---|---|
| 当前代码隐藏失败（pnpm typecheck 不绿） | 按 5.2 最小侵入式修或记录为后续单独 bug task，不在本 task 扩大 scope |
| 基线测试锁得太死，导致正常演进被误报回归 | 只锁主路径 + 少量失败路径；不锁日志格式、UUID、时间戳等易变输出 |
| Windows 路径与 `vitest` 配置差异 | 测试中统一用 `path.posix` / `path.join`；明确 Windows 必跑 |
| 占位测试被后来者无脑删除 | 5.6 中文件名显式带 `.migration.todo` + 注释标注所属 Phase |

## 10. Testing Strategy

- 全部基线测试放在对应模块的 `__tests__/` 子目录，命名 `*.baseline.test.ts` 以便 `grep`
- 占位测试文件命名 `*.migration.todo.test.ts`，通过 `test.todo` / `describe.skip` 标注
- 不引入新测试库（坚持 `vitest` 当前栈）
- 不写 snapshot 测试作为基线（太脆），优先用显式断言

## 11. Definition of Done

在 Phase 3 的 `trellis-update-spec` 跑完后，本 task 判定 DONE 需满足：

1. `pnpm typecheck` + `vitest run` + `pnpm build:check` 全部绿
2. 后续 task 的 AI 子代理**不需要再猜测试命令**，直接读 spec 即可执行
3. 占位测试在 Phase 2 / Phase 3 可以直接从 `.todo` 切换为 `.test` 并断言具体期望
4. CHANGELOG 追加一条 `[测试]` 类别记录
