# 后端日志与观测规范

> 当前项目的观测由三类输出组成：会话事件日志、项目级调试日志、开发态控制台输出。新增代码必须明确自己属于哪一类。

## 当前日志面

### 1. 会话事件日志

- 入口：`cli/src/observability/session-logger.ts`
- 目标：把 Agent 事件映射为 session JSONL，供恢复、审计、可视化使用
- 特征：
  - 结构化
  - 带 `uuid` / `parentUuid`
  - 优先记录业务事件而不是任意字符串

### 2. 项目级调试日志

- 入口：`cli/src/debug.ts`
- 输出文件：`<project>/.xnovacode/debug.log`
- 目标：记录不会被 Ink UI 覆盖的底层调试信息

### 3. 前端/开发态控制台日志

- 现有示例：`cli/web/src/hooks/useApi.ts`
- 用于本地调试请求与页面状态
- 这是当前事实，不代表未来可以无限制扩张

## 记录什么

应该记录：

- 启动耗时、阶段状态、降级 warning
- LLM 调用起止、token 统计、tool 调用、MCP 连接
- 会影响用户排障的关键上下文：
  - provider
  - model
  - toolName
  - sessionId
  - agentId

不应该记录：

- API Key
- 完整密钥、token、cookie、授权头
- 未脱敏的本地敏感路径或用户私有内容
- 无上下文的“失败了”“执行中”之类空日志

## 级别约定

当前仓库未建立统一 log level 枚举，因此先按渠道约束：

- **session JSONL**：只记结构化业务事件
- **debug.log**：底层调试与异常补充信息
- **console**：本地开发调试、页面调试；若后续量变大，需要逐步收敛

## 书写规则

### 调试日志

- 日志行要带时间戳
- 最好带模块前缀，如 `[HookManager]`
- 一行内至少说明：
  - 谁
  - 做了什么
  - 对哪个对象做
  - 失败/成功原因

当前示例：

```ts
dbg(`[HookManager] hook 配置加载失败 source=${source}: ${message}\n`)
```

### 会话日志

- 尽量记录结构化字段，不拼大段自然语言
- 能单独建字段的内容，不要塞进 `resultSummary` 或 `error` 字符串里

当前示例：

- `tool_call_start`
- `tool_call_end`
- `mcp_connect_end`
- `session_end`

## Validation & Error Matrix

| 场景 | 要求 |
|---|---|
| 持久化主日志失败 | 不阻断主对话，但要避免抛出二次异常 |
| API 调试日志 | 只能打印必要字段，不能打印密钥 |
| 新增观测字段 | 优先结构化存储，保持前端可消费 |
| 高频循环日志 | 必须评估噪声与性能，避免刷屏 |

## Good / Base / Bad Cases

- Good：
  - `SessionLogger` 把事件序列化为可回放 JSONL
  - `dbg()` 把关键异常写到项目级文件
- Base：
  - 页面调试时使用带前缀的 `console.log`
- Bad：
  - 在生产路径打印完整配置对象
  - 把本可结构化的数据全部拼进字符串
  - 每个 render / loop tick 都写日志

## Wrong vs Correct

#### Wrong

```ts
console.log('provider config', providerConfig)
```

问题：

- 容易泄露 `apiKey`
- 日志噪声大

#### Correct

```ts
console.log('[Settings] provider updated', {
  provider: name,
  modelCount: provider.models.length,
  hasBaseUrl: Boolean(provider.baseURL),
})
```

## 参考文件

- `cli/src/observability/session-logger.ts`
- `cli/src/debug.ts`
- `cli/src/core/bootstrap.ts`
- `cli/web/src/hooks/useApi.ts`

## 反模式

- 不要为“以后也许会用”预埋一堆未消费的日志。
- 不要把日志当错误处理本身；日志是补充，不是替代。
- 不要让日志格式在不同模块里完全失控。
