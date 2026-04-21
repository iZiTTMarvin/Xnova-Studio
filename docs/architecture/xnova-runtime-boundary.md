# Xnova Runtime Boundary — 架构文档

> 版本：v1（Phase 1 落定）
> 更新日期：2026-04-21
> 对应任务：`04-21-runtime-boundary`、`04-21-cli-host-extraction`

---

## 1. 目标

将 Xnova-Code 的核心运行时能力从 CLI 宿主中解耦，形成 `shared runtime + dual host` 架构，使同一套 Runtime 可被 CLI 宿主（终端 REPL / Pipe Mode）和未来的 Desktop 宿主（Electron Studio）复用，而无需各自重新实现 AgentLoop、ToolRegistry、MCP、Memory 等底层能力。

---

## 2. 层次结构

```
┌─────────────────────────────────────────────────────┐
│                   Host Layer                        │
│                                                     │
│   cli/src/host/cli/          studio/ (未来)          │
│   ├── repl.ts                ├── main.ts            │
│   ├── pipe-mode.ts           ├── preload.ts         │
│   └── lifecycle.ts           └── ipc-bridge.ts     │
└──────────────────┬──────────────────────────────────┘
                   │  RuntimeHostBridge
┌──────────────────▼──────────────────────────────────┐
│                 Runtime Layer                       │
│                                                     │
│   cli/src/runtime/                                  │
│   ├── types.ts          — 核心类型契约              │
│   ├── create-runtime.ts — factory 入口              │
│   ├── tool-registry.ts  — 工具注册表组装            │
│   ├── events.ts         — 事件工厂函数              │
│   ├── bridge.ts         — NoopBridge / CallbackBridge│
│   └── index.ts          — 公开导出                  │
└──────────────────┬──────────────────────────────────┘
                   │  内部依赖
┌──────────────────▼──────────────────────────────────┐
│                 Core Layer                          │
│                                                     │
│   cli/src/core/                                     │
│   ├── agent-loop.ts     — LLM 调用主循环            │
│   ├── bootstrap.ts      — 能力装配（过渡期保留）    │
│   └── ...                                          │
│                                                     │
│   cli/src/persistence/  — 会话存储                  │
│   cli/src/config/       — 配置管理                  │
│   cli/src/tools/        — 工具实现                  │
└─────────────────────────────────────────────────────┘
```

---

## 3. 核心契约（Contract）

### 3.1 createRuntime()

```ts
function createRuntime(
  input: RuntimeConfigInput,
  bridge: RuntimeHostBridge
): Promise<RuntimeInstance>
```

- `RuntimeConfigInput`：`{ cwd, workspaceRoot?, config: ResolvedConfig, mode }`
- `RuntimeHostBridge`：Host 实现，Runtime 通过此接口向宿主发送事件、请求权限
- `RuntimeInstance`：`{ submit(), abort(), dispose(), getSnapshot() }`
- `submit()` 返回 `RuntimeTurnResult`，Host 一边消费流式 bridge 事件，一边拿到本轮聚合结果（文本、usage、stopReason、是否中断）
- `RuntimeSubmitInput` 当前实现支持 `provider/model` 临时覆盖、`history` 注入、`loggedUserContent`、`nonInteractive` 与 `waitForMcp`

### 3.2 RuntimeHostBridge

```ts
interface RuntimeHostBridge {
  emit(event: RuntimeEvent): void
  requestPermission(input: PermissionRequest): Promise<PermissionResolution>
  requestUserInput?(input: UserQuestionRequest): Promise<UserQuestionResult>
}
```

两个内置实现：

| 实现 | 用途 |
|---|---|
| `NoopBridge` | Pipe Mode / 测试 / 无交互场景，权限自动允许，事件静默丢弃 |
| `CallbackBridge` | 回调驱动，供 CLI REPL / Desktop IPC 桥接使用 |

### 3.3 RuntimeEvent 类型

| 类型 | 含义 |
|---|---|
| `text_delta` | LLM 流式文本片段 |
| `thinking` | 思考过程片段 |
| `tool_start` | 工具调用开始 |
| `tool_end` | 工具调用结束（含 `tool_done` 别名） |
| `subagent_spawn` | 子 Agent 创建 |
| `subagent_progress` | 子 Agent 进度 |
| `subagent_done` | 子 Agent 完成 |
| `turn_end` | 一轮 LLM 调用结束 |
| `session_end` | 整个会话结束 |
| `error` | 运行时错误 |
| `warning` | 降级警告（如 embedding 不可用） |
| `context_update` | 上下文窗口状态更新 |

---

## 4. 边界规则

### Runtime 负责

- AgentLoop orchestration
- ToolRegistry 组装（内置工具 + MCP 工具 + Skills）
- MCP / Skills / Memory / Hook / Plugin 装配
- Session / context / subagent / event 生命周期
- 配置解析后的消费

### Runtime 不负责

- Ink 组件渲染
- Electron 窗口、菜单、托盘、文件对话框
- Web/renderer 路由与页面状态
- 终端键盘输入与中断

### CLI Host 负责

- REPL 启动（`host/cli/repl.ts`）
- Pipe Mode 入口（`host/cli/pipe-mode.ts`）
- 进程生命周期（`host/cli/lifecycle.ts`）
- Ink UI 组合与终端交互

---

## 5. 违规检测

| 条件 | 处理方式 |
|---|---|
| `cli/src/runtime/` 直接 import `ink` / `electron` / `ui/*` | 边界违规，必须回退 |
| Host 重新实现 ToolRegistry / AgentLoop | 重复实现，必须复用 runtime |
| renderer 直接触达 SQLite / shell / 本地文件系统 | 必须通过 host/runtime 桥接 |
| runtime 初始化部分能力失败（如 embedding） | 可降级，必须通过 `warning` 事件暴露 |

验证命令：

```bash
# 确认 runtime/ 无 ink/electron/ui 依赖
grep -r "from '.*ink\|from '.*electron\|from '.*ui/" cli/src/runtime/
# 应无输出
```

---

## 6. 文件索引

| 文件 | 职责 |
|---|---|
| `cli/src/runtime/types.ts` | 所有核心类型定义（唯一真相来源） |
| `cli/src/runtime/create-runtime.ts` | Runtime factory，并行装配所有能力 |
| `cli/src/runtime/tool-registry.ts` | ToolRegistry 组装逻辑 |
| `cli/src/runtime/events.ts` | `makeEvent()` / `makeWarningEvent()` / `makeErrorEvent()` |
| `cli/src/runtime/bridge.ts` | `NoopBridge` / `CallbackBridge` |
| `cli/src/runtime/index.ts` | 公开导出（Host 只从此处 import） |
| `cli/src/host/cli/repl.ts` | CLI REPL 启动，含 Bridge Server 逻辑 |
| `cli/src/host/cli/pipe-mode.ts` | Pipe Mode 入口 |
| `cli/src/host/cli/lifecycle.ts` | 进程退出、resume hint、信号处理 |
| `cli/src/host/cli/index.ts` | CLI Host 公开导出 |
| `cli/bin/ccli.ts` | 薄入口，仅解析 argv，委托给 host/cli/ |

---

## 7. 相关规范

- [`.trellis/spec/backend/runtime-boundary.md`](../../.trellis/spec/backend/runtime-boundary.md) — 详细契约与 Error Matrix
- [`.trellis/spec/backend/config-toml-migration.md`](../../.trellis/spec/backend/config-toml-migration.md) — ResolvedConfig 字段结构
- [`.trellis/spec/backend/agent-schema-v1.md`](../../.trellis/spec/backend/agent-schema-v1.md) — Agent schema 定义
