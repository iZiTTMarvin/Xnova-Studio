# Xnova 审计方案代码核对

## 结论

`docs/audits/studio-first-response-warmup-and-tool-visibility-audit.md` 的主方向基本符合当前代码：首次响应慢的可控段确实在 submit 前置的 `bootstrapAll(cwd)`；工具过程黑盒不是事件完全丢失，而是当前事件只有 `tool_start/tool_end`，且单工具展示层没有最小 running 可见时间，更早的 tool intent / 参数增量也尚未进入事件协议。

## 已核对的关键事实

* `apps/studio/src/main/studio-ipc.ts` 的 `openWorkspace` / `bindWorkspace` 只更新 `hostState` 并广播状态，没有 runtime warmup、tool registry 预备或 provider 预连。
* `apps/studio/src/main/studio-runtime-service.ts` 在 submit 时才解析 `cwd`、加载配置、`acquireRuntime`，然后调用 `runtimeInstance.submit()`。
* `packages/runtime/src/create-runtime.ts` 在 `submit()` 内先发 `runtime_bootstrap_start`，再 `await bootstrapAll(input.cwd)`，完成后才继续 agent、MCP、tool registry、provider session、history/context 和 `AgentLoop`。
* `packages/core/src/bootstrap.ts` 内部已经记录 `timings`，包含 skills、instructions、hooks、sessionStartHooks、fileIndex、plugins、memory、shellSnapshot、gitContext、systemPrompt、total 等实际字段，但 `BootstrapTimings` 类型目前只列了部分字段，且这些子阶段没有通过 `timing_mark` 透传到 Studio。
* `bootstrapAll` 的缓存 key 只做了 `cwd.trim()`，没有 `path.resolve` / 大小写归一化；审计里提到的“同一目录不同写法可能 cache miss”成立。
* `ensureMemoryInitialized` 在真实 embedding 配置存在时会调用 `ProviderEmbedding.isAvailable()` 做一次真实连通性探测，放在 warmup 里比放在首次 submit 里更合理。
* `studio-submit-timing.ts` 对 runtime/provider/model 阶段用 `markFirst`，所以后续工具反馈后的第二轮、第三轮模型请求无法进入 summary 的分组统计。
* `runtime-store.ts` 会在 `tool_start` 插入 running tool block，在 `tool_end` 把同一 block 改为 done/error；`ToolActionRow.tsx` 直接使用真实 `tool.status`，没有最小 running 可见时间。
* `ToolActivityGroupRow.tsx` 的 `AUTO_COLLAPSE_DELAY_MS = 720` 只是组级自动折叠延迟，不保证单工具 running 态可见。
* `packages/providers/src/providers/openai-compat.ts` 当前把 LangChain 流式 chunk 收集到最终消息后才 yield `tool_call`，没有 provider 层的 `tool_call_delta`。
* `packages/providers/src/providers/anthropic.ts` 当前在 `finalMessage()` 后才遍历 `tool_use` 并 yield `tool_call`，没有使用 content block start/delta 生成 tool intent / args delta。

## 对审计方案的修正建议

* Phase A 应顺手修正 `BootstrapTimings` 类型，使它显式包含 `plugins`、`memory`、`shellSnapshot`、`gitContext`，避免继续依赖 `as unknown as BootstrapTimings`。
* Phase B/C 不宜第一步就“跳过 `bootstrapAll`”。更稳的第一版 fast path 可以先利用 `bootstrapAll` 自身 promise 缓存：openWorkspace 后调用一次规范化 cwd 的 `bootstrapAll`，submit 仍调用 `bootstrapAll`，但会命中同一个 promise。这样先拿到 80% 收益，少改 runtime contract。
* 真正的 snapshot cache 应作为第二步，因为它会触及 system prompt、tool definitions、agent metadata、provider capabilities 和失效规则，复杂度明显高于基础 warmup。
* `sessionLogger.ensureSession` / `tokenMeter.bind` 依赖 sessionId，不能完整 warmup；最多只能预打开底层数据库或保持现状。
* `tool_intent/tool_args_delta` 需要改 provider/core/runtime/renderer 四层事件协议，且不同 provider 流式工具能力不一致，应放在 Phase E，不应和短期 UI 可见性混在一个 PR。

## 推荐第一批实现

1. Phase A：bootstrap 子阶段 timing 透传 + timing summary 聚合。
2. Phase D：`ToolActionRow` 动作类工具最小 running 可见时间。
3. 轻量 warmup 预备：只在 openWorkspace 后调用规范化 cwd 的 `bootstrapAll`，submit 不跳过逻辑，只靠 promise 缓存收益。确认稳定后再进入完整 snapshot fast path。
