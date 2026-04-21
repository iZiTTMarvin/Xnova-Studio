# [Phase 1 · 03] Runtime Foundation — CLI Host Extraction & Runtime Contract Docs

> **Phase**：Phase 1 Runtime Foundation · Task C + D
> **Priority**：P0
> **Status**：planning
> **Source**：[`docs/implement/phase1-runtime-foundation.md`](../../../docs/implement/phase1-runtime-foundation.md) §任务清单 C、§任务清单 D

---

## 1. Problem

在 `04-21-runtime-boundary` 把 `shared runtime` 抽出之后，CLI 侧的"宿主职责"仍散落在多处：

- REPL 启动逻辑与 runtime 装配耦合在 `cli/src/core/bootstrap.ts` / `cli/src/ui/*`
- Pipe Mode 入口与终端 UI 交织，不是独立宿主能力
- Ink 组件直接读 runtime 底层单例（违反 [`runtime-boundary.md`](../../../.trellis/spec/backend/runtime-boundary.md) "Renderer 只通过 bridge / IPC 请求 runtime 行为"的约束）
- runtime 对外 contract 仍只活在 spec 文件里，没有沉淀为"host 开发者能直接读的实现级文档"

这些残留会让 Phase 4（Electron Host）子代理很难判断"哪些东西是 host 应自建，哪些是 runtime 应复用"。

## 2. Goal

完成 Phase 1 的最后两件事：

1. **CLI Host 收敛**：把 CLI 专属职责（REPL、Pipe Mode、Ink 装配）统一放到 `cli/src/host/cli/`，`runtime/` 不再直接引用任何终端 UI 代码
2. **Runtime Contract 文档化**：在 `docs/architecture/xnova-runtime-boundary.md` 产出 runtime 对外契约草案，作为未来 Electron Host / 第三方 host 的消费手册

## 3. Scope

### In

- 新建 `cli/src/host/cli/` 目录
- 把 REPL 启动、Pipe Mode 入口、终端 UI 组合装配从 `core/bootstrap.ts` / `cli/src/ui/*` 剥离到 `host/cli/`
- 把 CLI 专属的 lifecycle hook（键盘输入、中断、terminal screen）全部迁入 `host/cli/`
- `cli/src/runtime/` 保持纯净：**不** import `ink` / `cli/src/ui/*` / `cli/src/host/*`
- 产出 `docs/architecture/xnova-runtime-boundary.md` runtime contract 草案
- 定义 runtime event 基本类型与 host 与 runtime 的错误传播方式（同步回写 `.trellis/spec/backend/runtime-boundary.md`）
- 补 host 侧单测 + 集成回归

### Out（本 task 明确不做）

- 不新建 `studio/` 桌面宿主（归 Phase 4）
- 不改 renderer / Web UI 渲染层（Phase 5）
- 不迁移 TOML 配置 / agent schema（Phase 2 / 3）
- 不把 `cli/web/` 迁出（全 Phase 不做此动作）
- 不做大规模 Ink 组件重构（只做"剥离"，不做"重写"）

## 4. Dependencies

- **Blocked-by**：`04-21-runtime-boundary`（必须先有 runtime 边界）
- **Blocks**：Phase 4 Electron Host、Phase 5 project-aware Shell
- **Gate 归属**：Gate A Runtime Ready 的**收尾交付物**

## 5. Subtasks

- [ ] **5.1** 盘点现状：列出 `cli/src/core/bootstrap.ts` / `cli/src/ui/*` / `cli/bin/ccli.ts` 中属于"CLI 宿主"的职责，产出 `info.md`
- [ ] **5.2** 新建 `cli/src/host/cli/` 骨架：`index.ts` / `repl.ts` / `pipe-mode.ts` / `terminal-screen.ts` / `lifecycle.ts`
- [ ] **5.3** 把 REPL 启动逻辑（包括 Ink `render()` 调用）迁到 `host/cli/repl.ts`，原位置改为调用者
- [ ] **5.4** 把 Pipe Mode 入口迁到 `host/cli/pipe-mode.ts`，保持 `ccode "问题"` 与 stdin 管道行为不变
- [ ] **5.5** 把 terminal screen / 键盘中断 / Ctrl+C / Escape 等 CLI 专属 lifecycle 迁到 `host/cli/lifecycle.ts`
- [ ] **5.6** 重写 `cli/bin/ccli.ts`：入口只做"解析 argv → 选 host → 启动 runtime"三件事，不再直接调 bootstrap
- [ ] **5.7** 跑 `grep -r "from '.*ink'" cli/src/runtime` 与 `grep -r "cli/src/ui" cli/src/runtime`，必须无匹配
- [ ] **5.8** 产出 `docs/architecture/xnova-runtime-boundary.md`（runtime contract 草案）：
  - runtime 输入输出契约
  - host 必须提供的 bridge 能力
  - runtime 事件分类（lifecycle / tool / session / subagent / error）
  - 错误传播方式（runtime warning vs host error vs user-visible toast）
  - 初始化与销毁生命周期
- [ ] **5.9** 把 5.8 的关键结论回写到 `.trellis/spec/backend/runtime-boundary.md` 的"Signatures"与"Error Matrix"段
- [ ] **5.10** 补 `cli/src/host/cli/__tests__/*.test.ts`：REPL 启动能在"headless runtime"场景下跑到交互前状态、Pipe Mode 入口参数校验
- [ ] **5.11** 跑完整基线测试（`04-21-test-baseline` 的套件 + 本 task 新增测试），确认零回归

## 6. Related Files

### 改动范围（新增 / 修改）

- `cli/src/host/cli/index.ts`（新增）
- `cli/src/host/cli/repl.ts`（新增）
- `cli/src/host/cli/pipe-mode.ts`（新增）
- `cli/src/host/cli/terminal-screen.ts`（新增）
- `cli/src/host/cli/lifecycle.ts`（新增）
- `cli/src/host/cli/__tests__/*.test.ts`（新增）
- `cli/bin/ccli.ts`（重构为薄入口）
- `cli/src/core/bootstrap.ts`（移除 CLI 宿主职责，仅保留兼容导出）
- `cli/src/ui/useChat.ts`、`cli/src/ui/App.tsx`（小幅改造：消费 host 暴露的 runtime 句柄，不自建装配）
- `docs/architecture/xnova-runtime-boundary.md`（新增）
- `.trellis/spec/backend/runtime-boundary.md`（回写 Signatures / Error Matrix）

### 只读参考

- `docs/implement/phase1-runtime-foundation.md` §任务清单 C、§任务清单 D
- `docs/xnova-studio-v1开发文档.md` §M1、§12 (本计划之外的重要后续文档)
- `cli/bin/ccli.ts`（现状入口）
- `cli/src/core/bootstrap.ts`（Phase 1 · 02 之后的状态）
- `cli/src/ui/App.tsx`（Ink 装配现状）
- `cli/src/runtime/**`（Phase 1 · 02 已落地的 runtime 层）

## 7. Reference Specs（必读）

- [`.trellis/spec/backend/runtime-boundary.md`](../../../.trellis/spec/backend/runtime-boundary.md) — **CLI Host 职责段是本 task 的主契约**
- [`.trellis/spec/backend/directory-structure.md`](../../../.trellis/spec/backend/directory-structure.md) §v1 演进落点 — `cli/src/host/cli/` 落点；禁止 `apps/* + packages/*` 大搬家
- [`.trellis/spec/backend/error-handling.md`](../../../.trellis/spec/backend/error-handling.md) — 错误传播分层约束
- [`.trellis/spec/backend/logging-guidelines.md`](../../../.trellis/spec/backend/logging-guidelines.md) — runtime event 与 host 日志的分工
- [`.trellis/spec/backend/quality-guidelines.md`](../../../.trellis/spec/backend/quality-guidelines.md) — TDD / 测试门禁
- [`.trellis/spec/guides/cross-layer-thinking-guide.md`](../../../.trellis/spec/guides/cross-layer-thinking-guide.md) — host ↔ runtime 是跨层变更
- [`.trellis/spec/guides/code-reuse-thinking-guide.md`](../../../.trellis/spec/guides/code-reuse-thinking-guide.md) — Phase 4 若复用 host 能力，必须先查本 task 的抽象

## 8. Acceptance Criteria

- [ ] `cli/src/host/cli/` 目录存在且**集中承载** REPL / Pipe Mode / terminal screen / lifecycle
- [ ] `grep -r "from '.*ink'" cli/src/runtime` **无匹配**
- [ ] `grep -r "cli/src/ui" cli/src/runtime` **无匹配**
- [ ] `cli/src/runtime/**` 没有任何 `host/` / `ui/` / `ink` / `electron` import
- [ ] `cli/bin/ccli.ts` 只做"解析 argv → 选 host → 启动 runtime"
- [ ] `docs/architecture/xnova-runtime-boundary.md` 草案存在并覆盖 5.8 列出的 5 点
- [ ] `.trellis/spec/backend/runtime-boundary.md` 的 Signatures / Error Matrix 已根据实现回写
- [ ] `pnpm typecheck` / `vitest run` / `pnpm build:check` 全绿
- [ ] CLI 交互（REPL、Pipe Mode、Ctrl+C 中断、`ccode "问题"`）**行为与本 task 开始前一致**

## 9. Risks & Mitigations

| 风险 | 缓解 |
|---|---|
| REPL 迁移时 Ink render 时序变化导致首屏异常 | 在 5.3 之前先跑一次手工 smoke：启动 + 输入 + 退出；迁移后再跑同一脚本对比 |
| Pipe Mode 的 stdin 处理跨平台差异 | Windows 与 Linux 各跑一次 `ccode "..."`；测试用例在 `cli/src/host/cli/__tests__/pipe-mode.test.ts` 覆盖两种 EOF 行为 |
| `ccli.ts` 重构把 argv 解析搞错 | 增量重构：先抽 REPL，再抽 Pipe Mode，最后改 ccli.ts 入口；每步跑基线 |
| runtime contract 文档和实现漂移 | 5.9 强制回写 spec；Phase 3 的 `trellis-update-spec` 再审一次 |
| `cli/src/ui/*` 改动诱惑导致 scope 膨胀 | Out 段明确：本 task 只做"剥离"，不做"重写"。UI 结构优化留给 Phase 5 |

## 10. Testing Strategy

- 复用 `04-21-test-baseline` 的基线套件作为回归护栏
- 新增 `cli/src/host/cli/__tests__/repl.test.ts`：断言 REPL 能在 mock runtime 下启动到交互前状态
- 新增 `cli/src/host/cli/__tests__/pipe-mode.test.ts`：参数解析 + stdin / argv 两种输入路径
- 新增 `cli/src/host/cli/__tests__/lifecycle.test.ts`：Ctrl+C / Escape 能正确触发 abort
- 手工 smoke：启动 REPL / 跑 `ccode "hello"` / `echo "hi" | ccode`
- **不**在本 task 跑 Electron 集成测试（归 Phase 4）

## 11. Definition of Done

1. 上述 Acceptance Criteria 全部打勾
2. Phase 4 的子代理能直接读 `docs/architecture/xnova-runtime-boundary.md` 理解 host 应提供什么
3. 再次 `grep` 确认 `cli/src/runtime` 零 UI/host 依赖
4. CLI 交互手工 smoke 三条（REPL / `ccode "..."` / `echo | ccode`）全部通过
5. CHANGELOG 追加一条 `[架构]` 类别记录
6. Phase 1 整体 **Gate A Runtime Ready** 可以提交验收
