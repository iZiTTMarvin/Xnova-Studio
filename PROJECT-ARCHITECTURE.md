# Xnova Code — 项目架构全景分析

> 本文档为 GPT 提供项目完整架构理解。最后更新：2026-04-24

---

## 一、项目概述

**Xnova Code** 是一个开源多模型 AI 编程助手，目标是把 CLI 共享运行时与 Electron 桌面主壳收敛到同一套 project-aware 工作流。当前对外试用的桌面产物名为 **Xnova Studio**。

- **核心能力**：多 LLM Provider 支持（Claude / OpenAI / GLM / DeepSeek / Ollama）、MCP 协议、Agent 系统、Memory 记忆系统、Skills 技能系统、Plugin 插件系统
- **技术栈**：TypeScript + Node.js (>=20) + React 19 + Electron 41 + Vite + Vitest + tsup + TailwindCSS + Ink (CLI TUI)
- **包管理**：pnpm（monorepo-like，cli/ 和 studio/ 各自独立 package.json）
- **版本**：cli `0.13.0` / studio `0.7.0-beta.1`

### 架构总览

```
┌──────────────────────────────────────────────────────┐
│                    Xnova Studio                       │
│              (Electron 桌面主壳)                       │
│  ┌─────────┐  ┌──────────┐  ┌────────────────────┐  │
│  │  main   │←→│ preload  │←→│    renderer        │  │
│  │(Node.js)│IPC│(Bridge)  │IPC│  (React + Vite)   │  │
│  └────┬────┘  └──────────┘  └────────────────────┘  │
│       │                                               │
│       │ 直接 import                                    │
│       ▼                                               │
│  ┌──────────────────────────────────────────────┐    │
│  │           cli/src/runtime/*                   │    │
│  │       (Shared Runtime Engine)                 │    │
│  │  createRuntime() → RuntimeInstance            │    │
│  └──────────────────┬───────────────────────────┘    │
└─────────────────────┼────────────────────────────────┘
                      │
┌─────────────────────┼────────────────────────────────┐
│           cli/ (共享运行时 + CLI 宿主)                 │
│                     │                                 │
│  ┌──────────┐  ┌───┴────┐  ┌────────────────────┐   │
│  │  host/   │  │ core/  │  │   tools/           │   │
│  │ (CLI宿主)│→│(引擎核心)│→│(工具注册与执行)     │   │
│  └──────────┘  └────────┘  └────────────────────┘   │
│  ┌──────────┐  ┌────────┐  ┌────────────────────┐   │
│  │ config/  │  │providers│  │ memory/            │   │
│  │(TOML配置)│  │(LLM适配)│  │(RAG记忆系统)       │   │
│  └──────────┘  └────────┘  └────────────────────┘   │
│  ┌──────────┐  ┌────────┐  ┌────────────────────┐   │
│  │  mcp/    │  │ skills/│  │ persistence/       │   │
│  │(MCP协议) │  │(技能引擎)│  │(会话持久化)        │   │
│  └──────────┘  └────────┘  └────────────────────┘   │
└──────────────────────────────────────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
   cli/web/      外部LLM API    MCP Servers
  (Web Dashboard) (Claude等)    (用户配置)
```

### 数据流

```
用户输入 → Host (CLI/Studio)
  → createRuntime().submit()
    → bootstrapAll() (初始化所有子系统)
    → AgentLoop.run()
      → LLMProvider.chat() (调用LLM)
      → ToolRegistry.execute() (执行工具)
        → dispatch_agent (子Agent派发)
        → bash/read_file/write_file/edit_file/glob/grep...
      → 循环直到LLM不再调用工具
    → RuntimeHostBridge.emit() (事件回传给Host)
  → Host UI 更新
```

---

## 二、仓库根目录文件

| 文件/目录 | 用途 |
|---|---|
| `README.md` | 项目入口文档，描述仓库结构、Studio 常用命令、Windows 打包方式 |
| `DESIGN.md` | Xnova Studio 设计系统文档：字体、配色、间距、布局、动效、Surface 层级、组件规范、反模式 |
| `CLAUDE.md` | AI 协作约束：要求所有 UI 决策先对齐 DESIGN.md |
| `AGENTS.md` | Trellis 工作流入口指令，指引 AI 助手读取 spec/workflow/workspace |
| `TODOS.md` | 延期任务列表：外部 Agent Adapter、自动发现模型、Project-level Agent 共享等 |
| `CHANGELOG.md` | 变更日志，按日期记录所有非微小变更（Phase 1~7 全过程） |
| `.gitignore` | Git 忽略规则 |
| `studio-smoke.log` | Studio smoke 测试日志 |

---

## 三、`cli/` — 共享运行时 + CLI 宿主

**包名**：`xnova-cli` v0.13.0  
**入口**：`bin/ccli.ts` → `dist/bin/ccli.js`（命令名 `xnova`）  
**构建**：tsup（TypeScript → JS）  
**测试**：vitest  
**核心依赖**：@anthropic-ai/sdk, @langchain/*, @modelcontextprotocol/sdk, ink, react, libsql, zod, chalk, execa

### 3.1 `cli/bin/ccli.ts`

CLI 可执行入口。负责参数解析后委托给 `host/cli/launcher.ts`，本身是薄壳。

### 3.2 `cli/scripts/`

| 文件 | 用途 |
|---|---|
| `ensure-web.cjs` | 确保 cli/web 依赖已安装（dev:web / build:all 时调用） |
| `inspect-session.mjs` | 会话 JSONL 检查工具，用于调试持久化数据 |

### 3.3 `cli/src/` — 核心源码（21 个子目录）

#### 3.3.1 `cli/src/core/` — 引擎核心

| 文件 | 用途 |
|---|---|
| `agent-loop.ts` | **核心引擎**。LLM ↔ 工具的多轮执行引擎。单次 `run()` = 完整的用户提问处理：调用 LLM → 收集工具调用 → 执行工具 → 回到 LLM，直到不再调用工具。支持流式输出、并行工具执行、权限检查、子 Agent 透传、重复调用检测、Prompt Cache 破裂检测 |
| `bootstrap.ts` | **启动编排器**。统一启动所有子系统（Skills、Instructions、Hooks、SessionStart、文件索引、Plugin、Memory、Shell 快照、Git 上下文），按依赖拓扑并行执行，构建 System Prompt |
| `context-manager.ts` | 上下文窗口管理。维护对话历史，支持 auto-compact（上下文压缩） |
| `context-tracker.ts` | 上下文窗口使用量追踪（token 数、百分比、级别） |
| `args-summarizer.ts` | 工具调用参数摘要（精简 tool_call args 避免历史膨胀） |
| `cleanup-service.ts` | 退出时清理服务（进程、临时文件等） |
| `event-bus.ts` | 事件总线，用于解耦模块间通信 |
| `image-store.ts` | 图片临时存储（多模态消息） |
| `initializer.ts` | TOML-first 初始化器。接受 `{ userDir, projectDir }` 注入，通过 ConfigManager 落地配置 |
| `message-utils.ts` | 消息格式化工具函数 |
| `parallel-executor.ts` | 并行工具执行器。安全工具并行、危险工具串行 |
| `pipe-runner.ts` | Pipe Mode 运行器（非交互模式，单次执行） |
| `repetition-detector.ts` | 工具重复调用检测器（防止弱模型陷入循环） |
| `types.ts` | 核心类型定义：Message、MessageContent、StreamChunk 等 |
| `workspace-trust.ts` | 工作区信任机制 |

#### 3.3.2 `cli/src/runtime/` — Shared Runtime 抽象层

| 文件 | 用途 |
|---|---|
| `create-runtime.ts` | **Runtime 工厂**。`createRuntime(config, bridge) → RuntimeInstance`。是 CLI 和 Studio 共用的执行门面。内部复用 bootstrap 单例，通过 RuntimeHostBridge 与宿主通信。约束：不依赖 ink/electron/ui |
| `types.ts` | Runtime 核心类型：ResolvedConfig、RuntimeEvent、PermissionRequest、RuntimeSubmitInput、RuntimeSnapshot、RuntimeHostBridge、RuntimeInstance |
| `bridge.ts` | Bridge 实现：NoopBridge（静默丢弃事件）、CallbackBridge（回调模式） |
| `tool-registry.ts` | Runtime 级工具注册表（封装 core/registry） |
| `events.ts` | Runtime 事件构造辅助函数 |
| `inspect.ts` | Runtime 状态检查（供 Studio 使用） |
| `index.ts` | Barrel 导出 |

#### 3.3.3 `cli/src/host/cli/` — CLI 宿主

| 文件 | 用途 |
|---|---|
| `index.ts` | CLI 宿主导出 |
| `launcher.ts` | CLI 启动器。参数解析后委托给 REPL 或 Pipe Mode |
| `lifecycle.ts` | CLI 生命周期管理（启动、退出、信号处理） |
| `pipe-mode.ts` | Pipe Mode：非交互单次执行（stdin → LLM → stdout） |
| `repl.ts` | REPL 模式：交互式多轮对话（Ink TUI） |

#### 3.3.4 `cli/src/config/` — 配置系统

| 文件 | 用途 |
|---|---|
| `config-manager.ts` | **配置管理器**。TOML-first 读取（优先 TOML → 回退 JSON → 无则写默认 TOML）。暴露 `getLastWarnings()` 用于降级追踪 |
| `resolver.ts` | **统一配置解析器**。按 `project > user > builtin` 合并得到 `ResolvedConfig`。读取项目级 `.xnovacode/project.toml`，暴露 source/warnings |
| `legacy-migration.ts` | JSON → TOML 安全迁移。TOML 已存在/JSON 无法解析/写入失败三类路径全部显式 fallback |
| `mcp-config.ts` | MCP 服务器配置加载 |
| `permissions.ts` | 权限配置管理 |
| `provider-settings.ts` | Provider 配置管理（API Key、Base URL、模型列表） |
| `instructions-loader.ts` | 多层级指令文件加载（CCODE.md / CLAUDE.md） |
| `settings-contract.ts` | 设置 API 响应契约：`buildSettingsReadResponse` / `buildSettingsSaveResponse` |

**`cli/src/config/toml/` 子目录：**

| 文件 | 用途 |
|---|---|
| `index.ts` | TOML 模块 barrel 导出 |
| `parser.ts` | TOML 解析器（带行/列错误定位） |
| `serializer.ts` | TOML 序列化器 |
| `schema.ts` | UserConfigToml / ProjectConfigToml schema 校验 |
| `errors.ts` | TomlParseError / TomlValidationError |
| `field-mapping.ts` | snake_case ↔ camelCase 双向映射（round-trip 无损） |
| `types.ts` | TOML 类型定义 |

#### 3.3.5 `cli/src/providers/` — LLM Provider 适配

| 文件 | 用途 |
|---|---|
| `provider.ts` | **LLMProvider 接口**。定义 `chat()` / `countTokens()` / `createSession()` / `dispose()` |
| `anthropic.ts` | Anthropic Claude 原生 SDK 适配 |
| `openai-compat.ts` | OpenAI 兼容协议适配（覆盖 OpenAI / GLM / DeepSeek / Ollama 等） |
| `message-converter.ts` | 消息格式转换器（内部 Message ↔ Provider 格式） |
| `registry.ts` | Provider 注册表。`getOrCreateProvider(name, config)` |
| `retry.ts` | Provider 调用重试策略 |
| `wrapper.ts` | Provider 包装器（统一 StreamChunk 格式、stopReason 标准化） |

#### 3.3.6 `cli/src/tools/` — 工具系统

**`cli/src/tools/core/` — 核心工具：**

| 文件 | 用途 |
|---|---|
| `registry.ts` | **ToolRegistry**。工具注册、查找、执行、危险等级判定、并行分类 |
| `types.ts` | Tool / ToolResult / ToolContext / StreamableTool 类型定义 |
| `bash.ts` | Bash 命令执行工具（支持后台运行、超时、工作目录） |
| `read-file.ts` | 文件读取工具 |
| `write-file.ts` | 文件写入工具 |
| `edit-file.ts` | 文件编辑工具（精确替换） |
| `glob.ts` | 文件模式匹配工具 |
| `grep.ts` | 内容搜索工具 |
| `git.ts` | Git 操作工具 |
| `kill-shell.ts` | 终止后台进程工具 |
| `task-output.ts` | 后台任务输出查看工具 |
| `process-tracker.ts` | 后台进程追踪器 |

**`cli/src/tools/agent/` — Agent 系统：**

| 文件 | 用途 |
|---|---|
| `catalog.ts` | **AgentCatalogService** — Agent 单一事实源。启动时加载 builtin + user agent，维护 runtime registry 与产品层一致性 |
| `built-in.ts` | 内置 Agent 定义（general / explore / plan） |
| `dispatch-agent.ts` | **子 Agent 派发工具**。StreamableTool，创建子 AgentLoop 并行执行任务 |
| `control-agent.ts` | Agent 控制工具（停止/查询子 Agent） |
| `schema-v1.ts` | Agent v1 TypeScript 类型定义（id/name/summary/mode/inherits/when_to_use/tool_policy/model_preference/extra） |
| `parser.ts` | TOML frontmatter Agent 定义解析器/校验器 |
| `compat-loader.ts` | AgentDefinition ↔ LoadedAgentDefinitionV1 双向转换（旧内置兼容） |
| `mode-filter.ts` | Agent 模式过滤（canBePrimary / canBeSubagent / filterForPrimarySelector） |
| `definition-registry.ts` | Agent 运行时注册表 |
| `user-agent-store.ts` | 用户自定义 Agent CRUD 服务 |
| `agent-templates.ts` | 6 种内置 Agent 模板 |
| `id-utils.ts` | Agent ID 格式工具函数 |
| `context-utils.ts` | Agent 上下文工具 |
| `store.ts` | Agent 存储层 |
| `types.ts` | Agent 类型定义 |

**`cli/src/tools/ext/` — 扩展工具：**

| 文件 | 用途 |
|---|---|
| `ask-user-question.ts` | 用户问答工具（select/multiselect/text） |
| `todo-write.ts` | Todo 列表管理工具 |
| `todo-store.ts` | Todo 存储层 |
| `verify-code.ts` | 代码验证工具 |

#### 3.3.7 `cli/src/memory/` — RAG 记忆系统

| 文件 | 用途 |
|---|---|
| `index.ts` | Memory 模块 barrel 导出 |
| `types.ts` | Memory 类型定义 |
| `overview-service.ts` | Memory 概览服务（供 UI 展示状态） |

**`cli/src/memory/core/`：**

| 文件 | 用途 |
|---|---|
| `memory-manager.ts` | **MemoryManager**。记忆系统核心：扫描文件、索引、检索、写入、删除 |
| `memory-watcher.ts` | 文件变更监听（自动更新索引） |
| `compact-bridge.ts` | 上下文压缩桥接（压缩时自动提取关键信息到记忆） |

**`cli/src/memory/rag/`：**

| 文件 | 用途 |
|---|---|
| `chunker.ts` | 文本分块器 |
| `indexer.ts` | 索引器 |
| `retriever.ts` | 检索器 |
| `bm25.ts` | BM25 关键词检索 |
| `tokenizer.ts` | 分词器（jieba-wasm 中文分词） |

**`cli/src/memory/rag/embedding/`：**

| 文件 | 用途 |
|---|---|
| `noop-embedding.ts` | 空操作 Embedding（降级纯 BM25） |
| `provider-embedding.ts` | Provider Embedding（调用外部 Embedding API） |

**`cli/src/memory/storage/`：**

| 文件 | 用途 |
|---|---|
| `file-store.ts` | 文件存储（JSONL） |
| `memory-vector-store.ts` | 内存向量存储（开发/测试用） |
| `libsql-vector-store.ts` | libsql 向量存储（生产用，支持持久化） |

**`cli/src/memory/tools/`：**

| 文件 | 用途 |
|---|---|
| `memory-write-tool.ts` | 记忆写入工具 |
| `memory-search-tool.ts` | 记忆搜索工具 |
| `memory-delete-tool.ts` | 记忆删除工具 |

#### 3.3.8 `cli/src/mcp/` — MCP 协议

| 文件 | 用途 |
|---|---|
| `mcp-manager.ts` | **McpManager**。MCP 服务器连接管理、工具发现、状态追踪 |
| `mcp-tool.ts` | MCP 工具适配器（MCP Tool → 内部 Tool 接口） |
| `status-service.ts` | MCP 状态服务（供 UI/API 展示） |

#### 3.3.9 `cli/src/skills/` — 技能系统

| 文件 | 用途 |
|---|---|
| `index.ts` | Skills 模块 barrel 导出 |
| `plugins-overview-service.ts` | Skills/Plugins 概览服务 |

**`cli/src/skills/engine/`：**

| 文件 | 用途 |
|---|---|
| `store.ts` | **SkillStore**。技能发现、加载、缓存 |
| `skill-tool.ts` | 技能工具（LLM 可调用技能） |
| `parser.ts` | 技能定义解析器（SKILL.md） |
| `types.ts` | 技能类型定义 |

**`cli/src/skills/builtin/` — 内置技能：**

| 目录 | 用途 |
|---|---|
| `code-review/` | 代码审查技能（SKILL.md + checklist + common-issues + quick-review.sh） |
| `commit/` | Git 提交技能 |

#### 3.3.10 `cli/src/persistence/` — 会话持久化

| 文件 | 用途 |
|---|---|
| `index.ts` | 安全 barrel 导出（不暴露 db.ts） |
| `db.ts` | libsql 数据库连接管理 |
| `session-store.ts` | **SessionStore**。会话 CRUD（JSONL 格式存储） |
| `session-types.ts` | 会话类型定义 |
| `session-utils.ts` | 会话工具函数 |

#### 3.3.11 `cli/src/plugin/` — 插件系统

| 文件 | 用途 |
|---|---|
| `index.ts` | Plugin 模块 barrel 导出 |
| `registry.ts` | **PluginRegistry**。插件发现、加载、激活 |
| `storage.ts` | 插件存储层 |
| `types.ts` | 插件类型定义 |

#### 3.3.12 `cli/src/observability/` — 可观测性

| 文件 | 用途 |
|---|---|
| `index.ts` | 导出 SessionLogger / TokenMeter |
| `session-logger.ts` | **SessionLogger**。会话事件日志（写入 JSONL），记录 user/assistant/tool/permission 事件 |
| `token-meter.ts` | **TokenMeter**。Token 用量计量与计费 |

#### 3.3.13 `cli/src/hooks/` — Hook 系统

| 文件 | 用途 |
|---|---|
| `index.ts` | Hook 模块 barrel 导出 |
| `hook-manager.ts` | **HookManager**。Hook 发现、注册、执行（PreToolUse / PostToolUse / SessionStart） |
| `hook-runner.ts` | Hook 执行器（调用外部脚本） |
| `types.ts` | Hook 类型定义 |

#### 3.3.14 `cli/src/file-index/` — 文件索引（@ Mention 用）

| 文件 | 用途 |
|---|---|
| `index.ts` | 文件索引 barrel 导出 |
| `file-index.ts` | **FileIndex**。全量扫描 + 增量更新 |
| `file-watcher.ts` | 文件变更监听 |
| `ignore-rules.ts` | .gitignore 规则适配 |
| `types.ts` | 文件索引类型 |

#### 3.3.15 `cli/src/commands/` — CLI 斜杠命令

| 文件 | 用途 |
|---|---|
| `bridge.ts` | bridge 命令（Web Dashboard 模式） |
| `clear.ts` | 清除上下文 |
| `compact.ts` | 手动压缩上下文 |
| `context.ts` | 查看上下文状态 |
| `exit.ts` | 退出 |
| `fork.ts` | 分叉会话 |
| `gc.ts` | 垃圾回收 |
| `help.ts` | 帮助 |
| `mcp.ts` | MCP 状态查看 |
| `model.ts` | 切换模型 |
| `plugins.ts` | 插件管理 |
| `registry.ts` | Agent 注册表查看 |
| `remember.ts` | 记忆管理 |
| `resume.ts` | 恢复会话 |
| `skills.ts` | 技能管理 |
| `usage.ts` | Token 用量查看 |
| `types.ts` | 命令类型定义 |

#### 3.3.16 `cli/src/server/` — HTTP/WebSocket 服务

**`cli/src/server/bridge/`：**

| 文件 | 用途 |
|---|---|
| `server.ts` | WebSocket 服务端（Hono + @hono/node-ws） |
| `client.ts` | WebSocket 客户端连接管理 |

**`cli/src/server/dashboard/`：**

| 文件 | 用途 |
|---|---|
| `api.ts` | Dashboard API 路由（`/api/settings`、`/api/settings/save`） |
| `agents-api.ts` | Agent 管理 API（7 个路由：list/get/create/update/delete/templates/validate） |
| `mcp-api.ts` | MCP 管理 API |
| `plugins-api.ts` | Plugin 管理 API |

#### 3.3.17 `cli/src/platform/` — 平台适配

| 文件 | 用途 |
|---|---|
| `detector.ts` | 平台检测（OS、Shell 类型） |
| `path-utils.ts` | 路径工具 |
| `shell-resolver.ts` | Shell 解析器 |
| `shell-snapshot.ts` | Shell 环境快照（login shell 环境变量捕获） |

#### 3.3.18 `cli/src/ui/` — CLI TUI 组件（Ink + React）

| 文件 | 用途 |
|---|---|
| `App.tsx` | CLI TUI 根组件 |
| `ChatView.tsx` | 聊天视图（消息流渲染） |
| `InputBar.tsx` | 输入栏 |
| `StatusBar.tsx` | 状态栏（模型、上下文、Token） |
| `PermissionDialog.tsx` | 权限确认弹窗 |
| `UserQuestionForm.tsx` | 用户问答表单 |
| `DiffView.tsx` | Diff 视图 |
| `ForkPanel.tsx` | 会话分叉面板 |
| `ResumePanel.tsx` | 会话恢复面板 |
| `SubAgentPanel.tsx` | 子 Agent 面板 |
| `TodoPanel.tsx` | Todo 面板 |
| `ToolStatusLine.tsx` | 工具状态行 |
| `ModelPicker.tsx` | 模型选择器 |
| `McpStatusView.tsx` | MCP 状态视图 |
| `ModeSwitch.tsx` | 模式切换（Standard/XForge） |
| `AtSuggestion.tsx` | @ Mention 文件建议 |
| `CommandSuggestion.tsx` | 斜杠命令建议 |
| `WelcomeScreen.tsx` | 欢迎屏幕 |
| `useChat.ts` | 聊天 Hook（核心交互逻辑） |
| `useStatusBar.ts` | 状态栏 Hook |
| `useTerminalSize.ts` | 终端尺寸 Hook |
| `format-utils.ts` | 格式化工具 |
| `terminal-screen.ts` | 终端屏幕管理 |

#### 3.3.19 `cli/src/utils/`

| 文件 | 用途 |
|---|---|
| `at-resolver.ts` | @ Mention 解析器 |
| `compute-diff.ts` | Diff 计算工具 |

#### 3.3.20 根文件

| 文件 | 用途 |
|---|---|
| `debug.ts` | 调试工具（dbg 函数） |
| `version.ts` | 版本号 |

---

## 四、`cli/web/` — Web Dashboard

**包名**：`xnova-web` v0.13.0  
**构建**：Vite + React 19 + TailwindCSS + react-router-dom v7  
**用途**：`xnova --web` 启动时的 Web 界面，通过 WebSocket 与 CLI 通信

### 4.1 `cli/web/src/`

| 文件 | 用途 |
|---|---|
| `App.tsx` | Web 应用根组件（路由配置） |
| `main.tsx` | Web 入口 |
| `types.ts` | 全局类型 |

### 4.2 `cli/web/src/pages/` — 页面

| 文件 | 用途 |
|---|---|
| `ChatPage.tsx` | 聊天页面 |
| `AgentsPage.tsx` | Agent 管理页面（CRUD） |
| `ConversationsPage.tsx` | 会话列表页 |
| `SettingsPage.tsx` | 设置页面（Provider/Memory/MCP 配置） |
| `OverviewPage.tsx` | 概览页面 |
| `LogsPage.tsx` | 日志页面 |

### 4.3 `cli/web/src/components/` — 组件

| 文件 | 用途 |
|---|---|
| `Sidebar.tsx` | 侧边栏导航 |
| `InputBar.tsx` | 输入栏 |
| `MessageBubble.tsx` | 消息气泡 |
| `ModelSelector.tsx` | 模型选择器 |
| `PermissionCard.tsx` | 权限确认卡片 |
| `SubAgentCard.tsx` / `SubAgentDrawer.tsx` | 子 Agent 卡片/抽屉 |
| `TodoPanel.tsx` | Todo 面板 |
| `ToolStatus.tsx` | 工具状态 |
| `McpTab.tsx` | MCP 状态标签 |
| `MemoryPanel.tsx` | 记忆面板 |
| `PluginsTab.tsx` | 插件标签 |
| `Toast.tsx` | Toast 通知 |
| `UserQuestionForm.tsx` | 用户问答表单 |
| `StatusBar.tsx` | 状态栏 |
| `ScatterPlot.tsx` | 散点图（Token 可视化） |
| `icons/index.tsx` | 图标组件集合 |

### 4.4 `cli/web/src/hooks/`

| 文件 | 用途 |
|---|---|
| `useApi.ts` | API 请求 Hook |
| `useWebSocket.ts` | WebSocket 通信 Hook |
| `useTheme.ts` | 主题切换 Hook |

### 4.5 `cli/web/src/utils/`

| 文件 | 用途 |
|---|---|
| `image-compress.ts` | 图片压缩工具 |
| `pca.ts` | PCA 降维（Token 可视化用） |

---

## 五、`studio/` — Electron 桌面主壳

**包名**：`xnova-studio` v0.7.0-beta.1  
**构建**：electron-vite + electron-builder  
**架构**：标准 Electron 三进程模型（main / preload / renderer）

### 5.1 `studio/src/main/` — Electron 主进程

| 文件 | 用途 |
|---|---|
| `index.ts` | **主进程入口**。创建所有服务实例，注册 IPC handlers，启动应用生命周期。组装 RuntimeService、ShellInspector、ProviderSettings、Memory、MCP、SkillsPlugins 六大服务 |
| `lifecycle.ts` | 应用生命周期管理（ready / window-all-closed / activate） |
| `app-shell.ts` | 应用壳层配置 |
| `window.ts` | 窗口管理器（创建、复用、销毁） |
| `workspace.ts` | 工作区目录选择 |
| `logger.ts` | 主进程日志器 |
| `smoke.ts` | Smoke 测试配置与执行器 |
| `studio-ipc.ts` | **IPC Handler 注册中心**。将所有 IPC channel 映射到对应服务方法 |
| `studio-runtime-service.ts` | **Runtime 服务**。桥接 Electron main → cli/src/runtime/create-runtime。加载 resolved config，创建 RuntimeInstance，执行 submit，转发事件 |
| `studio-runtime-inspector.ts` | Runtime 状态检查服务（桥接 cli/src/runtime/inspect） |
| `studio-shell-inspector.ts` | Shell 状态快照服务（最近项目、会话、Agent、SubAgent 状态） |
| `studio-provider-settings.ts` | Provider 配置服务（读取/保存/测试连接） |
| `studio-memory-service.ts` | Memory 概览与重建服务 |
| `studio-mcp-service.ts` | MCP 概览与增删服务 |
| `studio-skills-plugins-service.ts` | Skills/Plugins 概览服务 |

### 5.2 `studio/src/preload/` — 预加载脚本（安全桥接）

| 文件 | 用途 |
|---|---|
| `index.ts` | Preload 入口，暴露 `window.xnovaStudio` API |
| `studio-bridge-api.ts` | **Bridge API 工厂**。创建 `StudioBridgeApi` 对象，封装所有 IPC 调用，renderer 通过此对象与 main 通信 |
| `studio-ipc-contract.ts` | IPC channel 常量定义与 IPCRenderer 类型 |
| `studio-runtime-gateway.ts` | Runtime 事件网关（runtime:event 推送到 renderer） |
| `studio-validators.ts` | 参数校验器（所有 IPC 调用经过校验，防止 renderer 越界） |

### 5.3 `studio/src/shared/` — 主进程/渲染进程共享类型

| 文件 | 用途 |
|---|---|
| `studio-bridge-contract.ts` | **Bridge 契约**。定义所有 IPC 接口类型：StudioHostApi、StudioRuntimeApi、StudioShellApi、StudioSettingsApi、StudioMemoryApi、StudioMcpApi、StudioSkillsPluginsApi。以及所有数据传输类型（StudioShellSnapshot、StudioProviderSettingsSnapshot、StudioMemoryOverviewSnapshot 等） |

### 5.4 `studio/src/renderer/` — 渲染进程（React + Vite）

| 文件 | 用途 |
|---|---|
| `App.tsx` | 渲染进程根组件 |
| `main.tsx` | 渲染进程入口 |
| `index.html` | HTML 模板 |
| `styles.css` | 全局样式（v1.1 视觉收敛：完整 design token 体系） |
| `global.d.ts` | 全局类型声明 |

**`studio/src/renderer/pages/`：**

| 文件 | 用途 |
|---|---|
| `StudioHomePage.tsx` | 主页（空白聊天页 / 项目会话入口 / 最近会话恢复） |
| `SettingsPage.tsx` | 设置页面 |
| `ToolsPage.tsx` | 工具状态页面（MCP / Skills / Memory / Providers） |

**`studio/src/renderer/components/`：**

| 文件 | 用途 |
|---|---|
| `ContextBar.tsx` | 上下文条（项目/分支/Agent/模型/Context/SubAgent HUD strip） |
| `ModeSwitch.tsx` | 模式切换（Standard / XForge segmented control） |
| `ProjectShellSidebar.tsx` | 项目侧边栏（导航 + 项目树 + 会话树 + SubAgent 树） |
| `ProjectTreePanel.tsx` | 项目树面板 |
| `ConversationTimeline.tsx` | 会话时间线（聊天流） |
| `SessionModelPicker.tsx` | 会话级模型选择器 |
| `ScratchpadList.tsx` | Scratchpad 列表 |
| `StudioSettingsDialog.tsx` | 设置对话框（Cherry 风格悬浮窗，三栏结构） |
| `SettingsToolsPageLayout.tsx` | 设置/工具页面布局 |
| `ProviderSettingsCard.tsx` | Provider 配置卡片 |
| `MemoryOverviewCard.tsx` | Memory 状态卡片 |
| `McpOverviewCard.tsx` | MCP 状态卡片 |
| `SkillsPluginsOverviewCard.tsx` | Skills/Plugins 状态卡片 |

**`studio/src/renderer/hooks/`：**

| 文件 | 用途 |
|---|---|
| `useStudioBridge.ts` | **核心 Hook**。连接 preload bridge，提供 submitPrompt / isSubmitting / shellSnapshot 等 |
| `useProviderSettingsForm.ts` | Provider 设置表单 Hook |
| `useMemoryOverview.ts` | Memory 概览 Hook |
| `useMcpOverview.ts` | MCP 概览 Hook |
| `useSkillsPluginsOverview.ts` | Skills/Plugins 概览 Hook |
| `useSettingsToolsPageModel.ts` | 设置/工具页面模型 Hook |

**`studio/src/renderer/utils/`：**

| 文件 | 用途 |
|---|---|
| `startup-route.ts` | 启动路由决策（恢复最近会话 or 空白页） |
| `mode-resolver.ts` | 模式解析（Standard/XForge） |
| `work-context.ts` | 工作上下文 |
| `work-preferences.ts` | 工作偏好设置 |
| `memory-feedback.ts` | Memory 反馈映射 |

---

## 六、`docs/` — 文档

| 文件/目录 | 用途 |
|---|---|
| `xnova-studio-V1核心设计文档.md` | V1 核心设计文档（中文） |
| `xnova-studio-v1开发文档.md` | V1 开发文档（中文） |
| `xnova-stuido-V1工程测试计划.md` | V1 测试计划（中文） |
| `ai_studio_code.html` | AI Studio Code HTML 文档 |
| `xnova-studio-design-preview.html` | Studio 设计预览静态页 |

**`docs/architecture/`：**

| 文件 | 用途 |
|---|---|
| `xnova-runtime-boundary.md` | Runtime 边界架构文档 |

**`docs/implement/` — 分阶段实现计划：**

| 文件 | 用途 |
|---|---|
| `README.md` | 实现计划索引（7 个 Phase 概览） |
| `phase1-runtime-foundation.md` | Phase 1：Runtime Foundation（测试基线、runtime 抽象、CLI host 收敛） |
| `phase2-config-migration.md` | Phase 2：Config Migration（TOML schema、legacy 迁移、resolver、settings 写回） |
| `phase3-agent-system.md` | Phase 3：Agent System（schema-v1、parser、compat-loader、mode-filter、user-agent CRUD） |
| `phase4-electron-host.md` | Phase 4：Electron Host（Studio 骨架、main process、preload bridge、renderer shell） |
| `phase5-project-aware-shell.md` | Phase 5：Project-aware Shell（项目入口、会话树、上下文条、模式切换） |
| `phase6-settings-and-tools.md` | Phase 6：Settings & Tools（Provider/Memory/MCP/Skills 设置页面） |
| `phase7-polish-and-release.md` | Phase 7：Polish & Release（恢复、错误态、打包、发布） |

**`docs/release/`：**

| 文件 | 用途 |
|---|---|
| `xnova-studio-v1-trial.md` | V1 试用版发布说明 |

---

## 七、`.trellis/` — Trellis 工作流资产

| 文件/目录 | 用途 |
|---|---|
| `workflow.md` | 开发工作流规范 |
| `config.yaml` | Trellis 配置 |
| `.developer` | 开发者身份信息 |
| `.current-task` | 当前活跃任务 |
| `.version` | Trellis 版本 |

**`.trellis/spec/` — 开发规范：**

| 目录 | 用途 |
|---|---|
| `backend/` | 后端规范（agent-schema-v1、config-toml-migration、database-guidelines、directory-structure、error-handling、logging-guidelines、quality-guidelines、runtime-boundary） |
| `frontend/` | 前端规范（component-guidelines、directory-structure、hook-guidelines、project-shell-v1、quality-guidelines、state-management、type-safety） |
| `guides/` | 通用指南（code-reuse-thinking-guide、cross-layer-thinking-guide） |

**`.trellis/tasks/` — 任务管理：**

| 目录 | 用途 |
|---|---|
| `04-24-04-24-studio-runtime-pivot/` | 当前活跃任务：Studio Runtime 架构调整 |
| `04-24-studio-main-flow-repair/` | 已完成任务：Studio 主链路修复 |
| `archive/2026-04/` | 45 个已归档任务（Phase 1~7 全过程） |

**`.trellis/scripts/` — Python 工具脚本：**

| 文件 | 用途 |
|---|---|
| `task.py` | 任务创建/管理/校验 |
| `create_bootstrap.py` | 引导创建 |
| `get_context.py` | 获取任务上下文 |
| `get_developer.py` | 获取开发者信息 |
| `init_developer.py` | 初始化开发者 |
| `add_session.py` | 添加会话 |
| `common/` | 公共模块（config、git、paths、task_store、workflow_phase 等） |
| `hooks/linear_sync.py` | Linear 同步钩子 |

---

## 八、关键架构决策

### 8.1 Runtime 抽象层（Phase 1）

`cli/src/runtime/` 是 CLI 和 Studio 的共享执行层。核心接口：

```typescript
// Runtime 不感知具体宿主（CLI/Electron/Web），通过 Bridge 通信
interface RuntimeHostBridge {
  emit(event: RuntimeEvent): void
  requestPermission(input: PermissionRequest): Promise<PermissionResolution>
  requestUserInput?(input: UserQuestionRequest): Promise<UserQuestionResult>
}

// Host 通过 RuntimeInstance 驱动执行
interface RuntimeInstance {
  submit(input: RuntimeSubmitInput): Promise<RuntimeTurnResult>
  abort(): void
  dispose(): Promise<void>
  getSnapshot(): RuntimeSnapshot
}
```

### 8.2 配置三层合并（Phase 2）

```
project.toml（项目级） > config.toml（用户级） > 内置默认值
```

- 标量：project 覆盖 user 覆盖 builtin
- 对象：按 key merge
- 数组：project 整组替换 user

### 8.3 Agent 双源体系（Phase 3）

```
user agent（~/.xnovacode/agents/*.md） > builtin agent（内置 general/explore/plan）
```

- AgentCatalogService 是单一事实源
- mode-filter 是模式过滤单一事实源
- compat-loader 保证旧内置 agent 兼容

### 8.4 Electron IPC 桥接（Phase 4）

```
Renderer → window.xnovaStudio.api.xxx()
  → Preload (参数校验 + IPC invoke)
    → Main (IPC handle → 调用 cli/src/runtime 或 cli/src/config)
      → 结果/事件通过 IPC 回传
```

### 8.5 Project-aware Shell（Phase 5）

- 冷启动默认进入空白聊天页或恢复最近工作会话
- 一级导航：快速聊天 / 搜索 / Agents / 项目 / 聊天 / 工具 / 设置
- Context Bar：项目 / 分支 / Agent / 模型 / Context 使用率 / SubAgent 数量

---

## 九、测试体系

| 位置 | 测试数量 | 说明 |
|---|---|---|
| `cli/src/**/__tests__/` | ~120+ 用例 | 单元测试 + 集成测试 |
| `cli/tests/` | 1 文件 | Studio bootstrap 测试 |
| `studio/tests/` | 40 文件 | Electron 主进程/Preload/Renderer 测试 |
| `.trellis/scripts/tests/` | 2 文件 | Trellis 工具测试 |

**运行命令：**

```bash
# CLI 测试
pnpm --dir cli test
pnpm --dir cli typecheck

# Studio 测试
pnpm --dir studio test
pnpm --dir studio typecheck
pnpm --dir studio build

# Studio 打包
pnpm --dir studio pack:dir
pnpm --dir studio pack:win
```

---

## 十、当前活跃任务

根据 `.trellis/tasks/04-24-04-24-studio-runtime-pivot/prd.md`，当前正在进行 **Studio Runtime 架构调整**，涉及将 Studio 的 runtime 使用方式从当前模式进行调整优化。
