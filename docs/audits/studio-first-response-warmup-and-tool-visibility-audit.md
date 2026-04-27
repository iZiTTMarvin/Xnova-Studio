# Xnova Studio 首次响应、Runtime Warmup 与工具可见性审查报告

> 审查范围：`apps/studio`、`packages/runtime`、`packages/core`、`packages/providers`、`packages/persistence`、`packages/observability`、`packages/tools`、相关 main/renderer 桥接与测试。
>
> 审查目标：定位 _首次响应慢_ 与 _工具过程黑盒_ 两条主线的根因，给出可落地的多 Phase 修复建议。本轮 **只写文档，不修代码**。
>
> 时间锚点：本次报告基于 `Submit timing summary` 中观察到的样本：runtime bootstrap **10.3s**、provider first raw chunk **6.1s**、first text delta **7.5s**、first visible progress **17.9s**、total **111.5s**。

---

## 1. 当前结论摘要

1. **慢点不在 Electron 分层**：renderer→main `0ms`、main→runtime service `12ms`、runtime acquire `5ms`、config load `1ms`，IPC/序列化与 manager 复用不是瓶颈。
2. **最大可控慢点是 `runtime bootstrap` 10.3s**：该 stage 即 `@/packages/runtime/src/create-runtime.ts:286-289` 中 `await bootstrapAll(input.cwd)` 的耗时，包含 Skills/Hooks/SessionStartHooks/FileIndex/Plugins/Memory/ShellSnapshot/GitContext/SystemPrompt 等本地子系统的同步装配。
3. **Bootstrap 黑盒**：当前只有 `runtime_bootstrap_start` 与 `runtime_bootstrap_done` 两个 mark，内部 6 条并行链各自的 timing 只写在 `BootstrapResult.timings` 里，**没有以 `timing_mark` 事件透传给 Studio main**，因此审查无法在 timing summary 里看出"卡在哪一条链"。
4. **provider 6.1s 首包属于"次要可控"**：受 MiniMax/网络 RTT/排队/`withRetry` 退避（最多 1+2+4=7s）影响。审查范围内 provider 层无法消除，但 prompt/toolDefs snapshot 缓存可显著降低发包准备时间。
5. **`first visible progress 17.9s ≈ bootstrap 10.3s + provider TTFT 7.5s`**：bootstrap 与首包两个串行段叠加构成了"用户看到任何输出之前的死寂期"。warmup 直接消除前者。
6. **18s 之后的长尾在 timing summary 里几乎不可见**：当前 `studio-submit-timing.ts` 只 `markFirst` 第一轮 `model_request_started/finished`，后续工具反馈轮的 model 请求与子工具流没有继续打点。
7. **Xnova 还没有任何 warmup 概念**：`openWorkspace` (`@/apps/studio/src/main/studio-ipc.ts:715-739`) 只更新 hostState、广播状态、`inspectRuntime` 看 config 是否合法；不预热 bootstrap、不预备 toolRegistry、不缓存 systemPrompt、不预连 provider。
8. **工具"running 看不到"是 UI 时序问题，不是事件丢失**：`runtime-store.ts:619-720` 的 `tool_start/tool_end` 都正确写入了 block；`ToolActivityGroupRow` 有 `AUTO_COLLAPSE_DELAY_MS = 720` 但只是组级折叠延迟；单 `ToolActionRow` 没有最小 running 可见时间，paint 跟不上瞬时 done。
9. **OpenCowork 给 Xnova 的关键启发**：openWorkspace 不打 LLM、本地 warmup 装配、prompt/toolDefs snapshot、立即出 assistant shell + tool shell（`tool_call_start` 即出壳，`tool_call_delta` 累积参数）、reasoning-only TTFT 单独度量。
10. **应该优先修的 3 个方向**：(A) 把 `bootstrapAll` 内部 6 条链 timing 通过 `timing_mark` 暴露给 host（拆出 10.3s 在哪），(B) 设计 _可取消、可失效_ 的 workspace warmup + prompt/toolDefs snapshot 缓存让 submit 走 fast path，(C) 给 `ToolActionRow` 加最小 running 可见时间（短期）并设计 `tool_intent/tool_args_delta/tool_ready` 事件链（中期）。

---

## 2. 当前 submit timing 解读

参考样本：

```
- renderer submit -> main received: 0ms
- main received -> runtime submit start: 12ms
- runtime acquire: 5ms
- config load: 1ms
- runtime bootstrap: 10.3s
- provider stream first raw chunk: 6.1s
- first text delta: 7.5s
- first visible progress: 17.9s
- total: 111.5s
```

### 2.1 各段诊断

- **renderer → main `0ms`**：preload/IPC 直通；`@/apps/studio/src/main/studio-ipc.ts:807` 在 `runtimeSubmit` handler 顶端记录 `ipcRuntimeSubmitReceivedAt`。**不是问题**。
- **main → runtime submit start `12ms`**：`@/apps/studio/src/main/studio-runtime-service.ts:1156` 与 `ipc_runtime_submit_received` 的差，包含参数解析 + 早期 hostState 校验。**正常**。
- **runtime acquire `5ms`**：`@/apps/studio/src/main/studio-runtime-service.ts:1212-1220` 的 `runtimeManager.acquireRuntime`。当 entry 已存在（`reused=true`）时仅做 LRU `lastUsedAt` 更新与 bridge 重绑；不存在时才 `createRuntimeFn`，但 `createRuntime()` 本身只做 closure 声明，不跑 bootstrapAll。**不是问题**。
- **config load `1ms`**：`loadResolvedConfig(cwd)`（`@/apps/studio/src/main/studio-runtime-service.ts:1178`）。**不是问题**。
- **runtime bootstrap `10.3s`**：`create-runtime.ts:286-289` 两个 `timing_mark`：`runtime_bootstrap_start` → `runtime_bootstrap_done`。该区间完整跑了一遍 `bootstrapAll(input.cwd)`，详见 §3。**最大可控慢点**。
- **provider first raw chunk `6.1s`**：`provider_chat_start` (`@/packages/providers/src/providers/openai-compat.ts:62-65`) → `provider_stream_first_chunk` (`@:122-128`)。覆盖 `bindTools` 转换、`toLangChainMessages`、`model.stream` 建连、TLS、网络 RTT、模型排队、首 token 出帧。`withRetry` 在网络层最多 1+2+4=7s 退避（`@/packages/providers/src/providers/retry.ts:25-29`）是最坏情况。
- **first text delta `7.5s`**：`first_text_delta` 由 `text_delta` 事件触发 (`@/apps/studio/src/main/studio-submit-timing.ts:288-289`)。比 `provider_stream_first_chunk` 晚 ~1.4s，差额是首块到首个可见文本（可能首块是 `thinking` 或 tool_call）。
- **first visible progress `17.9s`**：`renderer_runtime_submit_invoked` → 第一个被 renderer 视为 progress 的事件 (`@/apps/studio/src/renderer/hooks/useStudioBridge.ts:641-646`)。约等于 `bootstrap 10.3s + first text delta 7.5s`。
- **total `111.5s`**：覆盖整轮（含若干轮模型请求 + 工具循环），见 §2.3。

### 2.2 timing 缺少的 stage

| 现状缺失 | 期望 stage | 为什么需要 |
|---|---|---|
| bootstrap 内部 6 条链 | `bootstrap.skills/instructions/hooks/sessionStartHooks/fileIndex/plugins/memory/shellSnapshot/gitContext/systemPrompt` | 拆 10.3s 真因。`BootstrapResult.timings` 已存在但不外发。 |
| provider client 选/建 | `provider_resolve_start/done`、`provider_session_create_start/done` | `getOrCreateProvider` + `createSession` 耗时，区分"首次连"与"复用"。 |
| sessionLogger.ensureSession | `session_open_start/done` | sqlite 打开、JSONL 头写入。 |
| tokenMeter bind | `token_meter_bind` | 首次 bind 会打开 sqlite。 |
| context.prepare 内部 | `context_prepare.compact_check/snapshot_resolve` | 首次可能触发 compact bridge。 |
| 第二轮及之后 model_request | `model_request_started_phase=after_tool_result` | 当前只 `markFirst`，多轮之后无法看出哪一轮慢。 |
| 工具批次 | `tool_batch_start/done`，每个 `tool_start/end` 已有但未参与 summary | 把 18→111s 长尾拆出"工具卡 vs 模型卡"。 |
| renderer paint | `renderer_painted_first_block`、`renderer_painted_first_tool_shell` | 区分"事件已到 renderer"和"用户看到"。 |

### 2.3 关键问题回答

- **runtime bootstrap 10.3s 是否说明每次 submit 都在做 heavy bootstrap？**
  - **结论**：每个 _未命中缓存的 cwd_ 第一次 submit 都会做。`bootstrapAll` 在 `@/packages/core/src/bootstrap.ts:561, 581-677` 用 `bootstrapPromises = new Map<cwd, Promise<BootstrapResult>>()` 缓存 _Promise_，命中时直接 `return cached`。即 _同一 cwd 第二次 submit 会立即返回_，前提 `runtimeCwd` 完全相同。
  - **风险**：`createRuntime()` 收到的 `input.cwd` 来自 `studio-runtime-service.ts` 的 `resolveRuntimeCwd`，未规范化（无 `path.resolve`、无大小写归一化）。**不同形式的同一目录可能被识别为不同 key**（如 `D:/foo` vs `D:\\foo` vs 末尾斜杠），导致幂等绕过。
- **bootstrap 内部步骤？** — 见 §3。
- **哪些应后台 warmup？** — 见 §4。几乎全部本地装配：Skills/Instructions/Hooks/FileIndex/Plugins/Memory/SystemPrompt/ShellSnapshot/GitContext；以及 provider client 建连、ToolRegistry 构建、sessionLogger/tokenMeter DB 打开。
- **哪些必须留在 submit？** — 与本轮用户输入耦合的部分：`buildResumeHistory`、`syncContextHistoryForSubmit`、`contextManager.prepare`、`AgentLoop` 实例化、`runSessionStartHooks('resume')`。**不能** 在 warmup 调用 LLM。

---

## 3. runtime bootstrap 内部审查

从 `createRuntime.submit` 的 `submit_start` 到 `model_request_started` 之间的顺序：

1. `runtime_bootstrap_start` (`@/packages/runtime/src/create-runtime.ts:286-287`)
2. `await bootstrapAll(input.cwd)` (`:288`) — 内部 6 条并行链，见 §3.1。
3. `agentCatalog.ensureInitialized()` (`:291`) — agent 目录读盘。
4. _可选_ `await ensureMcpInitialized()` 当 `submitInput.waitForMcp` (`:293-295`)。
5. `getRegistry()` + `registerMcpTools(registry)` (`:297-298`) → `tool_registry_ready` (`:299`)。
6. `getOrCreateProvider(providerName, config)` + `createSession()` (`:301-302`)。
7. `sessionLogger.ensureSession(...)` (`:304`) — 打开 sqlite + JSONL 头。
8. `tokenMeter.bind(sessionId, providerName, modelName)` (`:307-309`)。
9. `sessionLogger.logUserMessage(loggedUserContent)` (`:312`)。
10. `agentCatalog.resolvePrimaryAgent(config.agent?.default)` (`:314`)。
11. systemPrompt 拼接 (`:316-319`)。
12. `history_hydration_start/done` + `syncContextHistoryForSubmit` (`:320-322`)。
13. `context_build_start/done` + `contextManager.prepare` (`:323-332`)。
14. `new AgentLoop(...)` (`:335-345`)。
15. `loop.run(history)` 首个 yield → `llm_start` → `model_request_started` 由 bridge 转发 (`:357-361`)。

### 3.1 `bootstrapAll` 6 条并行链 + 屏障

来自 `@/packages/core/src/bootstrap.ts:586-672`：

| 链 | 内容 | 关键耗时点 |
|---|---|---|
| A' | `ensureSkillsDiscovered` → `ensureInstructionsLoaded` → `ensureHooksDiscovered` → `runSessionStartHooks('startup', cwd)` | SessionStart hooks 是用户脚本，可任意慢；hooks discover 涉及 plugin 目录递归。 |
| B' | `ensureFileIndexReady` (`fast-glob '**/*'` + ignore) | 大仓库（万级文件）扫描秒级；已禁用 symlinks。 |
| C' | `ensurePluginsLoaded` → `pluginRegistry.discover(registry)` | 取决于已安装插件数量。 |
| D' | `ensureMemoryInitialized` → 可能跑 `ProviderEmbedding.isAvailable()`（**真实网络请求**） + `LibsqlVectorStore.initialize()` | Embedding API 探测 _可能秒级_。 |
| E' | `startSnapshotCreation` (Shell snapshot) | 通常毫秒级，首次可能写盘。 |
| F' | `collectGitContext` (`Promise.race` 3s 超时) | 3 个并行 `execa('git', …)`。 |
| 屏障 | `buildSystemPrompt(...)` | CPU 拼接毫秒级。 |
| 后台 | `memoryManagerInstance.embedPending().catch(...)` | fire-and-forget。 |

### 3.2 阶段拆解表

| 阶段 | 相关文件/函数 | 当前是否在 submit 时执行 | 是否可 warmup | 风险 | 建议 |
|---|---|---|---|---|---|
| config resolve | `loadResolvedConfig(cwd)` (`@/apps/studio/src/main/studio-runtime-service.ts:1178`) | 是（每次） | **可** | 与 setting 保存联动失效 | warmup 时跑并缓存 |
| bootstrapAll | `@/packages/core/src/bootstrap.ts:581` | 是（首次 cwd 命中后缓存） | **可** | `bootstrapPromises` key 用 `runtimeCwd.trim()`，**未做路径规范化**——同目录不同写法可能 cache miss | warmup 调用并把 timings 通过 `timing_mark` 透传 |
| Skills 发现 | `ensureSkillsDiscovered` | 是 | **可** | skill 目录变更需失效 | warmup + 文件 watcher 失效 |
| Instructions 加载 | `ensureInstructionsLoaded` | 是 | **可** | XNOVACODE.md/CLAUDE.md 修改需失效 | warmup + 文件监听 |
| Hooks 发现 | `ensureHooksDiscovered` | 是 | **可** | hooks.json 修改需失效 | warmup |
| SessionStart hooks 执行 | `runSessionStartHooks('startup')` | 是 | **可（warmup 跑 startup；submit 不跑）** | 用户脚本副作用；Xnova 应区分 `startup` vs `submit_resume` | warmup 跑 startup；submit 时只跑 resume/turn 类 hook |
| Tool registry build | `getRegistry()` (`@/packages/core/src/bootstrap.ts:137-142`) | 是 | **可** | MemoryManager 延迟初始化需 `invalidateRegistry` | warmup 后续触发（依赖 memoryReady） |
| Memory init | `ensureMemoryInitialized` (`@/packages/core/src/bootstrap.ts:690-769`) | 是 | **可** | **`ProviderEmbedding.isAvailable()` 是真实 HTTP**，可能数百 ms 至数秒 | warmup 阶段做，超时降级 |
| MCP init | `ensureMcpInitialized`（按 `waitForMcp`） | 否（默认后台） | **已是 warmup 形态** | 当前 Studio 未调 `startMcpBackground` | warmup 时启动 |
| Skills system prompt | `getSkillsSystemPrompt` | 是（拼进 systemPrompt） | **可** | skills 失效同步 | snapshot 一起缓存 |
| Project config resolve | `loadEffectiveRuntimeConfig` | memory init 内一次 | **可** | project.toml 修改需失效 | warmup |
| Agent loader | `agentCatalog.ensureInitialized + resolvePrimaryAgent` | 是 | **部分可**：`ensureInitialized` 可 warmup；`resolvePrimaryAgent` 依赖 `agentId` | 用户切 agent 时 systemPrompt 需重算 | snapshot 按 agentId 维度缓存 |
| Provider init | `getOrCreateProvider` + `createSession` | 是 | **可（getOrCreateProvider）** | provider 设置变更 → `clearProviderCache` | warmup 触发；`createSession` 仍 submit |
| Session/history hydration | `buildResumeHistory` + `syncContextHistoryForSubmit` | 是（依赖 sessionId/text） | **不可** | 多窗口切 sessionId 时一致性 | 保留 submit |
| Context build | `contextManager.prepare` | 是 | **不可** | 首次 prepare 可能触发 compact | 保留；可在 warmup 预热 tokenizer |
| Workspace scan | `ensureFileIndexReady` | 是（首次） | **可** | 大仓库秒级；watcher 启动 | warmup |
| Shell inspect | `studio-shell-inspector` | 在 `bridge.shell.getSnapshot` 时跑 | **N/A** | 已与 submit 解耦 | 保留 |
| Plugin/hook init | `ensurePluginsLoaded + ensureHooksDiscovered` | 是 | **可** | 插件目录变更 | warmup |
| Git context | `collectGitContext` | 是 | **可** | 分支变化时 systemPrompt stale；3s 上限 | warmup；git checkout 后失效 |
| Shell snapshot | `startSnapshotCreation` | 是（短链） | **可** | 退出时 cleanup | warmup |
| sessionLogger.ensureSession | 首次开 sqlite | 是 | **不可（依赖 sessionId）** | sessionId 是 submit 时确定 | 保留；可在 warmup 预开 db 文件 |
| tokenMeter.bind | `tokenMeter.bind` | 是 | **不可** | 同上 | 保留 |
| AgentLoop 实例化 | `new AgentLoop(...)` | 是 | **不可** | 每轮 abortController 唯一 | 保留 |

> 观察：`runtime-store.ts:534-547` 已把 `runtime_bootstrap_start / tool_registry_ready / history_hydration_start / context_build_start` 翻译成中文。warmup 后这些步骤不再出现在 submit 路径，但 fast path 失败回退时需保留文案。

---

## 4. openWorkspace warmup 设计

> **硬性约束**：openWorkspace 不调用 LLM；warmup 不消耗 token；不在 main/runtime 之外调度 AgentLoop。

### 4.1 触发与生命周期

- **触发时机**：`bridge.host.openWorkspace` 与 `bridge.host.bindWorkspace` 成功更新 `hostState` 后；以及 renderer `selectProject(projectPath)` 后由 main 主动派发 warmup。
- **可取消**：每次 warmup 持有 `AbortController`；若触发新 warmup（切 workspace、切 provider、切 agent）或 dispose，立即 `abort()`，并在 `RuntimeWarmupStatus` 上标 `stale`。
- **与 workspace 切换关系**：上一次 workspace 的 warmup 若仍 in-flight，main 直接 `abort` 旧任务；新 warmup 用新 cwd key。
- **与 runtime cache 关系**：warmup 完成后把装配产物挂到 `studio-runtime-manager.ts` 的 `engineServiceApiCache` 与新增的 `runtimeWarmupCache`（按 cwd key）。`acquireRuntime` 命中 warmup 则直接复用 entry，submit 时跳过 `bootstrapAll`（或 `bootstrapAll` 按 cwd 命中 `bootstrapPromises` 缓存）。
- **与 provider/model 切换关系**：provider/model 切换 **不**触发完整 warmup，只触发 `provider warm cache + system prompt snapshot rehash`（systemPrompt 不依赖 model，只依赖 agent + skills + hooks + memory + git）。
- **与 agent/mode 切换关系**：agent 切换需要重算 `primaryAgent.getSystemPrompt()` → snapshot 按 `agentId+mode` 维度缓存。
- **与 memory/mcp/skills 状态变化**：
  - skills 文件变化 → invalidate `skills snapshot`
  - hooks 文件变化 → invalidate `hooks/systemPrompt snapshot`
  - mcp 配置变化 → invalidate `mcpToolList snapshot`
  - memory 重建 → invalidate `memoryContext snapshot`
  - git HEAD 变化 → invalidate `gitContext snapshot`
- **失败降级**：warmup 失败不阻塞 submit；submit 时回退到旧路径，并向 renderer 发 warning "运行时准备失败，将在提交时重试"。

### 4.2 状态机

```
RuntimeWarmupStatus =
  | 'idle'      // 尚未开始（无 workspace 或刚启动）
  | 'warming'   // 进行中（renderer 显示 "正在准备运行时"）
  | 'ready'     // 完成可走 fast path（renderer 显示 "运行时已就绪"）
  | 'stale'     // 命中失效条件需要重做（背景内重做，UI 可继续 submit）
  | 'failed'    // 装配失败（renderer 显示 "运行时准备失败，将在提交时重试"）
```

允许的迁移：

```
idle -> warming -> ready
ready -> stale  -> warming (重做)
warming -> ready
warming -> failed
warming -> idle (workspace 切走 -> abort)
ready -> idle   (workspace 切走)
failed -> warming (手动重试 / 失效条件触发)
```

### 4.3 UI 文案约束

- `warming` → "正在准备运行时…"
- `ready` → "运行时已就绪"
- `stale` → "运行时配置变化，正在重新准备…"（不阻塞输入）
- `failed` → "运行时准备失败，将在提交时重试"
- `idle` 时，submit 入口仍可用（沿用旧 slow path），输入框不禁用。

### 4.4 暴露给 renderer 的事件

- `runtime.warmup.status_changed`：`{ status, cwd, durationMs?, error? }`
- `runtime.warmup.timing`：`{ stage, durationMs }`（可选，dev 模式）

### 4.5 安全约束

- warmup 任何阶段 **不得** 把用户文件内容、API Key、Authorization、prompt 全文写入日志或事件。复用 `studio-submit-timing.ts` 的 `SAFE_DETAIL_KEYS`/`SENSITIVE_DETAIL_KEY_PATTERN` 白名单。
- warmup 必须只在 main/runtime 内执行，不在 renderer。

---

## 5. prompt/toolDefs/context snapshot cache 设计

### 5.1 缓存的内容

| 字段 | 来源 | 说明 |
|---|---|---|
| `systemPrompt` | `getSystemPrompt() + primaryAgent.getSystemPrompt()` | 已在 `bootstrap.ts:382-453` 按 cwd 缓存 |
| `toolDefinitions` | `getRegistry().listToolDefs()` | 每次 submit 重新组装；warmup 缓存 |
| `agentConfig` | `agentCatalog.resolvePrimaryAgent(agentId).agent` metadata | 只缓存 hash + ids，不缓存大实例 |
| `mode` | `RuntimeConfigInput.mode` | snapshot key 一部分 |
| `projectConfig` | `loadEffectiveRuntimeConfig(cwd)` 摘要 | 字段 hash + memory enabled flag |
| `model/provider capability` | provider.isModelSupported / 上下文长度 | metadata，不缓存 client |
| `memorySummary` / `memoryVersion` | `MemoryManager.getRelevantContext(cwd)` hash | Memory 重建后失效 |
| `mcpToolListVersion` | `mcpManager.getStatus()` 衍生 | 增删 server 后失效 |
| `skillsListVersion` | `skillStore.getPluginDirs()/getSkills()` hash | skill 目录变化失效 |
| `systemPromptVersion` | 上述各部分 hash 合成 | snapshot key 终值 |

### 5.2 cache key

```
cacheKey = hash({
  workspacePath,           // path.resolve 规范化
  projectConfigHash,       // sha256(loadEffectiveRuntimeConfig 字段子集)
  userConfigHash,          // sha256(~/.xnovacode/config.toml 关键字段)
  agentId,
  mode,
  providerId,              // 仅当影响 systemPrompt 时
  modelId,                 // 仅当影响 systemPrompt 时
  toolRegistryVersion,
  memoryVersion,
  mcpVersion,
  skillsVersion,
  systemPromptVersion,
})
```

> 不要把 apiKey/baseURL 进 cache key 字符串；改用 `providerCacheKey = hash(providerId|baseURL|apiKeyHash)` 与 `systemPromptVersion` 解耦。

### 5.3 invalidation 规则

- skill 目录变化 → 自增 `skillsVersion`，触发 `stale`
- hooks.json 变化 → 自增 `hooksVersion`（合入 systemPromptVersion）
- ~/.xnovacode/config.toml / 项目 .xnovacode/project.toml 修改 → 自增 `projectConfigHash`/`userConfigHash`
- provider settings 保存（`clearProviderCache` 调用点）→ 失效 `providerCacheKey`
- memory rebuild → 自增 `memoryVersion`
- mcp 增/删/重启 → 自增 `mcpVersion`
- agent 文件修改 → 自增 `toolRegistryVersion`
- git checkout / branch 变化 → 自增 `gitContextVersion`

### 5.4 fast path 判定

submit 时顺序：

1. 取 `cacheKey(workspacePath, agentId, mode, providerId, modelId, ...)`
2. 若 `runtimeWarmupCache.get(cacheKey)?.status === 'ready'` → fast path：跳过 bootstrapAll；复用 systemPrompt、toolDefs、provider、agent metadata；继续 history hydration + context build + AgentLoop。
3. 否则 slow path：维持当前 `await bootstrapAll(cwd)` 流程。

### 5.5 落盘 vs 内存

- **只内存缓存**。
  - 内含 systemPrompt 全文；落盘可能在多用户机器上泄漏。
  - 失效频繁（git/hooks/skills/mcp）；落盘收益低。
  - Electron 重启后重新 warmup（一次 ~10s）可接受。
- 例外：`fileIndex` 已有自己的 watcher 缓存；`mcpManager` 自身有连接状态。snapshot 层不重复落盘。

### 5.6 API Key 防泄漏

- snapshot 不存 raw apiKey；只存 `apiKeyFingerprint = sha256(apiKey).slice(0,12)`。
- snapshot 不存 system prompt 全文到日志；只在内存 `Map.value` 存。
- snapshot 不通过 IPC 发到 renderer；renderer 只看到 `RuntimeWarmupStatus` 与少量 metadata。
- 复用 `studio-submit-timing.ts` 的 `sanitizeDetails` 白名单。

---

## 6. submit fast path 设计

### 6.1 当前 vs 目标链路

**当前（slow path）**：

```
renderer click
  -> renderer submit (~0ms)
  -> main IPC parse (~12ms)
  -> runtime acquire (~5ms)
  -> loadResolvedConfig (~1ms)
  -> runtimeInstance.submit
       -> bootstrapAll (~10.3s)
       -> registry/provider/sessionLogger/tokenMeter (~few ms)
       -> history hydration (~ms)
       -> context build (~ms)
       -> AgentLoop.run
            -> llm_start / model_request_started
            -> provider chat (TTFT 6.1s)
            -> first text delta (7.5s)
```

**目标（fast path，warmup ready 时）**：

```
openWorkspace (idle -> warming -> ready)
  -> bootstrapAll 已完成、systemPrompt/toolDefs cached、provider client warmed、fileIndex ready
renderer click
  -> renderer submit
  -> main IPC parse
  -> runtime acquire (warm entry)
  -> snapshot validate (cacheKey hit -> 跳 bootstrapAll)
  -> history hydration
  -> context build
  -> AgentLoop.run
       -> model_request_started
       -> provider TTFT (单独度量)
```

### 6.2 目标 timing budget

| 阶段 | 当前 | 目标（warmup ready） |
|---|---|---|
| renderer submit → main received | 0ms | < 20ms |
| runtime acquire | 5ms | < 50ms |
| submit → model_request_started | ~10.5s | **< 1s** |
| provider TTFT | 6.1s | 单独统计，不算 fast path 内 |

### 6.3 fast / slow / failed 三档行为

- **warmup ready** → fast path，UI 立即出 assistant shell 并显示 "正在请求模型"。
- **warmup not ready (warming)** → 走 slow path，UI 文案改为 "正在准备运行时…"，ready 后切换 "正在请求模型"。
- **warmup failed** → fall back 到 slow path，并发 warning。**不**因 warmup 失败而拒绝 submit。

### 6.4 与现有 submit guard 的兼容

- `currentRun !== null` 串行化护栏保持。
- `firstChunkTimeoutMs` 45s 保持；warmup 不影响首包计时。
- `submitTimeoutMs` 60s 与 `submitPostProgressTimeoutMs` 10min 保持。

---

## 7. 工具过程黑盒审查

### 7.1 事实回顾

- `tool_start`：在 `@/packages/runtime/src/create-runtime.ts:401-413` 由 AgentLoop `tool_start` 转发到 main `bridge.emit`，再到 renderer `runtime-store.ts:619-666`，写入 status block + tool block(`status: 'running'`)。
- `tool_end`：`:415-438` 转发，renderer `:668-720` 把 block 切到 `done/error`。
- **问题**：`tool_start → tool_end` 可能 < 200ms（小文件 write/read），renderer paint 节流（`pendingLiveDeltaRafId` raf 合并）后用户只看到 done。
- `ToolActivityGroupRow.tsx:20` 的 `AUTO_COLLAPSE_DELAY_MS = 720` 是组级折叠延迟，不是单工具的最小可见时间。
- `ToolActionRow.tsx` 没有最小可见时长，spinner 立即被 done 替换。

### 7.2 短期建议（不破坏 blocks-first）

- 在 `ToolActionRow` 内引入 `MIN_RUNNING_VISIBLE_MS = 600`：
  - `useEffect` 跟踪 `tool.status` 进入 `running` 的时间戳。
  - 若 `status` 在 < 600ms 内切到 `done/error`，则保留 `running` 视觉态到 600ms 再切。
  - 仅对 _动作类工具_ 启用（`write_file/edit_file/bash/todo_write/dispatch_agent`）；exploration 类工具已被 `tool_activity_group` 合并，不需要。
- Stop / failed / completed 时 **必须** clear timer（避免运行已结束但 UI 卡在 running）。
- 该 timer 不影响 `runtime-store` 真实 status，仅影响呈现层的 spinner 翻译。

### 7.3 中期建议：tool 生命周期事件

| 事件 | 触发时机 | 含义 | 来源（建议位置） |
|---|---|---|---|
| `tool_intent` | provider stream 中刚看到 tool_call header（`function.name` 已知） | 立即出工具壳，UI 显示 "准备调用 X" | `openai-compat.ts` 收到第一个含 `tool_calls.name` 的 chunk |
| `tool_args_delta` | provider stream 拿到 args 增量 | UI 显示参数预览（路径预填） | 同上，按 chunk 累积 |
| `tool_ready` | 参数完整 + 进入 `parallelExecutor` 入队 | UI 把壳从 pending 切到 ready | `agent-loop.ts` 队列阶段 |
| `tool_start` | 实际执行第一帧（已存在） | UI 切 running | 现状保持 |
| `tool_progress` | 长时工具周期反馈（bash 输出、dispatch_agent 子事件） | UI 更新 progress 文案 | `bash`/`dispatch_agent` 主动 emit |
| `tool_end` | 完成（已存在） | UI 切 done/error | 现状保持 |

### 7.4 UI 状态机演进

```
pending  -> running -> done
                     -> error
   ^
   +-- tool_intent / tool_args_delta 累积参数
```

- pending 文案："准备调用 X"
- running 文案："正在 X (path)"（沿用 `createToolRunningStep`）
- done 文案：基于 `resultSummary`
- error 文案：失败摘要

### 7.5 对持久化的影响

- 持久化的 `SessionConversationBlock` 已只有 `status: 'running' | 'done' | 'error'`（`@/packages/persistence/src/persistence/conversation-blocks.ts:14-26`），无需新增字段；`tool_intent` 仅是 _事件层_，不持久化为新 block 类型。
- live 端在 renderer 把 pending/intent 表现为 `status: 'running'` + 一个轻量 `meta` flag，避免持久层 schema 跟变。

### 7.6 不要做什么

- **不要** 把 `write_file.content` 全文渲染。`ToolActionRow` 已按 `argumentDetails` 摘要展示，禁止扩展为全文。
- **不要** 把工具 args 全文写入 timing summary。
- **不要** 仅为修可见性而破坏 blocks-first：所有最小可见时间都在 _展示层_ 处理，store 数据不延迟。

---

## 8. model request 可观测性与 first chunk guard

### 8.1 现状审查

- `model_request_started/first_chunk/finished/failed` 在 `@/packages/runtime/src/create-runtime.ts:352-494` 已正确从 AgentLoop 事件桥接到 RuntimeEvent。
- 多轮工具反馈：`agent-loop.ts` 每次 `_callLLM` 都 yield `llm_start`，所以 _每轮模型请求都会产生一次_ `model_request_started`（含 `phase=after_tool_result`）。**已正确桥接**。
- first chunk guard：`@/apps/studio/src/main/studio-runtime-service.ts:744-829`：
  - `model_request_started` → `startFirstChunkGuard(run, payload)` 启 timer。
  - `model_first_chunk / model_request_finished / model_request_failed` → `clearFirstChunkGuard(run)`。
  - cancel 路径：`:1092` `clearFirstChunkGuard(activeRun)`，并 `cancelPendingRuntimeInteractions(reason)`。
  - timeout 触发时：发 `model_request_failed` + `run_failed`，调用 `runtimeInstance.abort()`，`releaseActiveRun(run)`。
  - **late first_chunk guard**：`if (currentRun?.runId !== run.runId || run.settled || run.released) return`，timeout 后晚到的 chunk 不会覆盖。
- 已有测试覆盖（`@/apps/studio/tests/studio-runtime-service.test.ts:534-732, 933-1010`）：
  - 45s 内无 first_chunk → emit `model_request_failed` + `run_failed`。
  - first_chunk 收到后 timer 清除。
  - cancel 后 timer 清除。
  - timeout 后 late first_chunk 被丢弃。

### 8.2 现有不足

- `firstChunkTimeoutMs` 默认 45s 适合 MiniMax 等慢首包，对 Anthropic/OpenAI 偏长；可按 provider 维度调整。
- 当前 guard 只对 _首包_ 起作用；**模型只输出 thinking 不输出文本** 的 reasoning-only 场景：`llm_first_chunk` 在 thinking 也会 emit（`@/packages/core/src/agent-loop.ts:391-394`），first chunk timer 会清除，但用户可能很久看不到"可见进展"。
- **暂不建议做复杂 reasoning-only timeout** 的理由：
  - 真实推理时长难以预测，会误杀长链推理。
  - 用户已有 stop 按钮 + `submitPostProgressTimeoutMs = 10min` 兜底。
  - reasoning live 在 `ReasoningRow.tsx:50-57` 有秒数计时，UX 上"看得到在跑"。
  - 增加复杂 timeout 只会增加 false positive。

### 8.3 推荐补充打点

- model_request 内部增加 `model_request_first_thinking_chunk`、`model_request_first_text_chunk`、`model_request_first_tool_call_chunk`。
- 多轮 timing：每轮 `model_request_started_phase=after_tool_result` 参与 summary，按 `phase` 分组聚合。
- 当前 `studio-submit-timing.ts:264-302` 仅 `markFirst`，多轮信息丢失。建议 `markEvery(stage)` 数组形态用于多轮聚合。

---

## 9. Windows 工具策略观察（仅观察，本轮不修）

### 9.1 现状

- `bash` 工具在 `@/packages/tools/.../bash.ts` 仍可用；`packages/core/src/bootstrap.ts:415` 的 behaviorGuidance 已写明优先 `read_file/write_file/edit_file/grep/glob`。
- 实际运行中模型仍可能：
  - `bash` 调用 `dir`、`cat`、`type`（PowerShell 别名问题）。
  - `bash` 调用 `cd path && cmd`（cd 不应改变工具长期 cwd）。
  - 在 Windows 上 `cat <file>` 在 PowerShell 是 `Get-Content` 别名，Markdown 大文件可能超时。
  - 用 `python -c` 做轻量验证；视同任意命令，不在 SAFE_READ_TOOL_NAMES 内。
- 当前权限策略 (`SAFE_READ_TOOL_NAMES` / `INTERACTIVE_PERMISSION_TOOL_NAMES` `@/apps/studio/src/main/studio-runtime-service.ts:97-126`) 已把 `bash` 列为交互权限。

### 9.2 建议（仅观察）

- 增加 Windows tool policy 提示词段：
  - 优先 `read_file/write_file/edit_file/glob/grep`；少用 shell 做文件读写。
  - 不要用 `cat/Get-Content` 验证 Windows 文件，改用 `read_file`。
  - PowerShell 命令需要 `pwsh`/`powershell.exe` 显式调用。
  - `cd` 不应作为独立命令改变长期 cwd；改用 `bash` 工具的 `cwd` 参数。
- 工具失败要结构化 `errorCode`（路径不存在 / 权限拒绝 / 编码失败 / 超时）。
- 不要在本审查范围内修。

---

## 10. 推荐修复路线

### Phase A — runtime bootstrap breakdown instrumentation

- **目标**：不优化业务的前提下，把 10.3s 拆出"哪条链卡住"。
- **修改文件**：
  - `@/packages/core/src/bootstrap.ts`：把每条链的 `timings[name]` 通过新增 `BootstrapTimingSink` 回调暴露（默认 noop），让 caller 注入；保持现有 `BootstrapResult.timings` 不变。
  - `@/packages/runtime/src/create-runtime.ts`：在 `await bootstrapAll(...)` 周围把 sink 接到 `bridge.emit('timing_mark', { stage: 'bootstrap.<chain>', elapsedMs })`。
  - `@/apps/studio/src/main/studio-submit-timing.ts`：把 `bootstrap.skills/hooks/fileIndex/plugins/memory/shellSnapshot/gitContext/systemPrompt` 加入 `SAFE_DETAIL_KEYS`/SUMMARY_LINES。
  - `@/apps/studio/src/renderer/stores/runtime-store.ts`：补几个 stage→中文文案映射（"正在加载 Skills"、"正在扫描工作区文件"、"正在初始化记忆"…）。
- **验收标准**：
  - 用户重现首次响应慢时，`Submit timing summary` 内能看到 6 条子链耗时。
  - 任何子链 > 3s 时控制台有 warn（仅 dev 模式）。
- **测试建议**：
  - 单元：`bootstrap.test.ts` 测试 sink 注入路径与各 chain 回调。
  - 集成：扩展 `studio-submit-timing.test.ts` 覆盖 `bootstrap.*` stage 出现在 summary。
- **风险**：
  - sink 写入路径可能引入轻微 GC 压力 → 每次 mark 仅传 string + number。
  - 不引入新副作用，纯观测。

### Phase B — workspace warmup + snapshot cache

- **目标**：openWorkspace 后后台 warmup runtime；submit 时按 cacheKey 走 fast path。**不调用 LLM**。
- **修改文件**：
  - 新增 `apps/studio/src/main/studio-runtime-warmup.ts`（warmup 调度 + status state machine）。
  - `@/apps/studio/src/main/studio-runtime-manager.ts`：增加 `warmRuntime(selection, config, hostState)`，内部调用 `bootstrapAll(cwd)`、`getRegistry()`、`getOrCreateProvider(...)`，不实例化 AgentLoop。
  - `@/apps/studio/src/main/studio-ipc.ts`：在 `openWorkspace`/`bindWorkspace` 成功后触发 warmup；新增 `runtime.warmup.status_changed` IPC channel。
  - `@/apps/studio/src/shared/studio-bridge-contract.ts`：新增 `RuntimeWarmupStatus` 类型与事件 type。
  - `@/apps/studio/src/renderer/hooks/useStudioBridge.ts`、`@/apps/studio/src/renderer/pages/StudioHomePage.tsx`：订阅 warmup status，显示文案。
  - 新增 `apps/studio/src/main/studio-prompt-snapshot.ts`（snapshot key + invalidate 规则）。
- **验收标准**：
  - `openWorkspace` 后 1.5s 内出现 `runtime.warmup.status_changed: warming`，10-12s 内 `ready`。
  - warmup ready 状态下 submit，`bootstrap` 这一行从 timing summary 消失或 < 50ms。
  - skills/hooks/mcp/memory/git 任一变化 → snapshot 失效 → 下次 submit 仍走 slow path 兜底（不崩）。
  - 切换 workspace 时旧 warmup `abort`，无残留事件。
- **测试建议**：
  - `studio-runtime-warmup.test.ts`：覆盖状态机迁移；abort；snapshot invalidate；fast/slow path 分支。
  - 扩展 `studio-runtime-service.test.ts`：覆盖 fast path skip bootstrap 的事件序列与 timing。
  - 扩展 `studio-ipc.test.ts`：covering warmup IPC contract。
- **风险**：
  - warmup 内部依赖的 singleton（`bootstrapPromises` Map）路径未规范化时缓存命中失败 → 在 warmup 入口先 `path.resolve(cwd)`。
  - 多窗口/多 workspace 并发 warmup → manager LRU 上限 3 已有，注意 evict 时同时清 snapshot。

### Phase C — submit fast path

- **目标**：warmup ready 时，从用户点击发送到 `model_request_started` 控制在 1s 内。
- **修改文件**：
  - `@/packages/runtime/src/create-runtime.ts`：把 `bootstrapAll` 调用包裹一层"snapshot 命中即跳过"。
  - `@/apps/studio/src/main/studio-runtime-service.ts`：`submitTiming.mark` 增加 `fast_path_used` 等新 stage。
  - renderer `runtime-store.ts`：在 fast path 模式下立即把 `currentRunStep` 切到 "正在请求模型"。
- **验收标准**：
  - 在常规 dev 环境下，warmup ready 时 5 次连续 submit 的 `submit start -> model_request_started` 平均 < 1s（排除网络波动）。
  - warmup 失败时 fast path 不启用，旧路径行为不变。
- **测试建议**：扩展 `studio-runtime-service.test.ts` 覆盖 fast path skip bootstrap 路径、snapshot 缺失回退路径。
- **风险**：fast path 跳过 bootstrap 时，要确保 `agentCatalog.ensureInitialized` / `registerMcpTools` / `getOrCreateProvider` 已在 warmup 内执行；防漏注册。

### Phase D — tool running 最小可见时间

- **目标**：动作类工具至少有 600ms 的 running 视觉态。
- **修改文件**：
  - `@/apps/studio/src/renderer/components/ToolActionRow.tsx`：内部 `useEffect` + setTimeout 维护 `displayStatus`。
  - 复用 `apps/studio/src/renderer/utils/tool-classification.ts`（已有 `isExplorationTool`），新增 `isActionTool`。
  - 单元测试：覆盖 `displayStatus` 翻译，stop / unmount / fast-flip 场景。
- **验收标准**：
  - 模拟 100ms 内完成的 `write_file` 工具，UI 至少展示 spinner 600ms 再切 done。
  - cancel/error 立即清 timer，无残留 spinner。
- **测试建议**：补 `tool-action-row.test.tsx` 覆盖最小可见时间 + stop 清理。
- **风险**：测试需用 fake timers；卸载组件时确保清 setTimeout 防泄漏。

### Phase E — tool_intent / tool_args_delta

- **目标**：模型刚开始生成 tool_call header 即出工具壳；参数累积渲染。
- **修改文件**：
  - `@/packages/providers/src/providers/openai-compat.ts`、`anthropic.ts`：在 stream loop 中识别 tool_calls header 增量，yield 新 chunk type `tool_call_delta`。
  - `@/packages/core/src/agent-loop.ts`：增加 `tool_intent`、`tool_args_delta`、`tool_ready` 事件。
  - `@/packages/runtime/src/create-runtime.ts`：转发新事件到 RuntimeEvent。
  - renderer：新增 pending tool block 状态；UI 状态机 `pending → running → done/error`。
- **验收标准**：
  - 在能流式吐 tool_call 的 provider 上，从 `tool_intent` 到 `tool_start` 出现，可见 < 200ms 切换。
  - 参数累积期间 UI 显示部分 path 预填，切到 running 后保留参数。
- **测试建议**：
  - provider 单元测试模拟分块 tool_calls，断言事件序列。
  - renderer 状态机单元测试。
- **风险**：
  - 不同 provider 流式 tool_call 行为不一致（Anthropic content_block_delta vs OpenAI tool_calls 增量），需要 per-provider 适配。
  - 必须 _不_ 把 args 全文渲染（`write_file.content` 仍走摘要）。

### Phase F — Windows tool policy

- **目标**：减少 Windows 下无意义 shell 失败。
- **修改文件**：
  - `@/packages/core/src/bootstrap.ts:409-447`：在 behaviorGuidance 内追加 Windows 专用段落。
  - `@/packages/tools/src/builtin/bash.ts`：对 `cat/dir/type` 等命令返回 structured hint "建议改用 read_file"。
- **验收标准**：
  - 在 Windows 机器上连续提问 "读一下 README.md"，模型优先调用 `read_file` 而非 `bash cat`。
- **测试建议**：添加 system prompt 快照测试（避免回退）；bash 工具 hint 单元测试。
- **风险**：prompt 改动可能影响其他平台行为；用 `process.platform === 'win32'` 分流，只对 Windows 注入。

### Phase 优先级与依赖

```
Phase A (independent, 1~2 天)  ─► 提供可见性基础数据
Phase B (depends on A)         ─► 核心 warmup；3~5 天
Phase C (depends on B)         ─► fast path 收割；1~2 天
Phase D (independent, 0.5 天)  ─► 立即改善工具可见性
Phase E (depends on D)         ─► 深度可见性；3~5 天（受 provider 流式能力限制）
Phase F (independent, 0.5 天)  ─► Windows 质量提升
```

- **第一批可以立刻上**：Phase A + Phase D，都是低风险纯观测/UI 微调，无需引入新架构。
- **第二批**：Phase B + Phase C 一起规划，warmup 作为架构新概念需要完整 contract/test。
- **第三批**：Phase E + Phase F 作为长期优化。

---

## 11. 非目标与不改项

- **不**在 warmup 里调用 LLM 或消耗 token。
- **不**大改 `blocks-first` 架构；所有 UI 改动仅在展示层。
- **不**直接暴露 API Key 或 system prompt 全文到 renderer / timing summary / 日志。
- **不**破坏现有 `firstChunkTimeoutMs` / `submitPostProgressTimeoutMs` / cancel 路径的 guard 语义。
- **不**为工具可见性而引入人为延迟 store（只在展示层做 min-visible timer）。
- **不**改持久化 schema；`SessionConversationBlock` 保持现有字段集。

---

## 附录 A — 关键文件索引

- `@/apps/studio/src/main/studio-ipc.ts`：IPC 绑定、workspace open/bind、runtime submit/inspect 等。
- `@/apps/studio/src/main/studio-runtime-service.ts`：submit 入口、first chunk guard、权限/用户输入桥接、timing 汇总。
- `@/apps/studio/src/main/studio-runtime-manager.ts`：runtime 实例 LRU、engineServiceApi 缓存。
- `@/apps/studio/src/main/studio-submit-timing.ts`：timing summary + 脱敏白名单。
- `@/apps/studio/src/main/studio-runtime-inspector.ts`：inspect 快照（配置校验）。
- `@/apps/studio/src/renderer/hooks/useStudioBridge.ts`：renderer 侧 submit / inspect / 状态流转。
- `@/apps/studio/src/renderer/pages/StudioHomePage.tsx`：主页面，项目选择、输入框、对话视图。
- `@/apps/studio/src/renderer/stores/runtime-store.ts`：RuntimeEvent → liveConversation/state 翻译。
- `@/apps/studio/src/renderer/components/ConversationTimeline.tsx`：对话流。
- `@/apps/studio/src/renderer/components/ToolActionRow.tsx`：单工具行（最小可见时间要加这里）。
- `@/apps/studio/src/renderer/components/ToolActivityGroupRow.tsx`：工具组行（已有 720ms 折叠延迟）。
- `@/apps/studio/src/renderer/components/ReasoningRow.tsx`：推理行（已有秒数计时）。
- `@/apps/studio/src/renderer/utils/conversation-render-rows.ts`：block → row 折叠策略。
- `@/packages/runtime/src/create-runtime.ts`：runtime submit 核心流程 + timing_mark 发射点。
- `@/packages/runtime/src/engine-service-api.ts`：工程侧 API（model 切换等）。
- `@/packages/core/src/bootstrap.ts`：`bootstrapAll` 6 条并行链 + systemPrompt 拼装。
- `@/packages/core/src/agent-loop.ts`：AgentLoop（model request 多轮、tool 执行、事件流）。
- `@/packages/core/src/file-index/file-index.ts`：文件索引 scan。
- `@/packages/providers/src/providers/openai-compat.ts`、`anthropic.ts`：provider stream 实现、timing chunk。
- `@/packages/providers/src/providers/retry.ts`：`withRetry` 默认 3 次退避。
- `@/packages/providers/src/providers/registry.ts`：provider 实例缓存。
- `@/packages/persistence/src/persistence/conversation-blocks.ts`：持久化 block schema。
- `@/apps/studio/src/shared/studio-bridge-contract.ts`：renderer ↔ main 契约。

## 附录 B — 术语

- **Slow path**：当前 submit 全流程（含 `bootstrapAll`）。
- **Fast path**：warmup ready 时 submit 可跳过 `bootstrapAll` 的流程。
- **Warmup**：openWorkspace 后后台装配 runtime，不消耗 token。
- **Snapshot cache**：workspace/agent/model/ 配置维度下的装配产物缓存。
- **First chunk guard**：`model_request_started` 后若 `firstChunkTimeoutMs` 内没有 `model_first_chunk` 则中止当前 run。
- **Min running visible**：渲染层对动作类工具 running 态的最短可见时间。
- **Blocks-first**：renderer 始终以 store 的真实 block 数据为准，视觉层不伪造数据。
