# 后端错误处理规范

> 当前仓库同时存在“快速失败”和“降级继续”两类错误处理路径。新增代码必须显式选择其中一种，不能模糊处理。

## 核心原则

### 1. 配置错误与契约错误优先快速失败

适用场景：

- Provider 不存在
- 参数不合法
- schema / mode / tool policy 不满足约束

当前示例：

- `cli/src/providers/registry.ts`
- `cli/src/tools/agent/types.ts`

推荐做法：

- 抛出带上下文的 `Error`
- 错误文案要能定位字段、provider、agentType、path

### 2. 可降级依赖允许继续运行，但必须留下痕迹

适用场景：

- Embedding API 不可达
- 向量存储初始化失败
- Git 上下文采集失败
- SessionLogger 落盘失败

当前示例：

- `cli/src/core/bootstrap.ts`
- `cli/src/observability/session-logger.ts`

推荐做法：

- 记录 warning 或 debug 信息
- 向 UI 暴露可见提示，或返回明确的降级说明
- 不允许“表面正常、实际功能已经失效”的静默失败

## 错误边界分层

### 配置层

- 负责检测：
  - 文件不存在
  - JSON/TOML 解析失败
  - 缺失必填字段
- 行为：
  - 兼容老配置时可回落默认值
  - 但迁移逻辑必须区分“未配置”和“配置损坏”

### 运行时编排层

- 负责统一收敛子系统错误并决定：
  - 终止启动
  - 降级启动
  - 展示 warning

### 工具/命令层

- 负责把底层异常转成可理解的错误消息
- 不要把底层 `ENOENT`、`fetch failed` 原样直接抛给用户而无上下文

### 持久化层

- 数据损坏、迁移失败、schema 不兼容时应阻断相关链路
- “写日志失败不阻断主流程”仅适用于观测数据，不适用于用户配置或关键业务状态

## Validation & Error Matrix

| 场景 | 期望行为 |
|---|---|
| Provider 名不存在 | 立即抛错，阻止继续发请求 |
| `config.json` 不存在 | 自动写默认配置 |
| `config.json` 解析失败 | 回落默认值，并尽快补用户可见提示 |
| Embedding API 不可用 | Memory 降级为 BM25，并展示 warning |
| Git 仓库不可用 | 返回说明文本，不阻断会话 |
| SessionLogger 落盘失败 | 静默不中断主流程，但不能影响主 Agent 响应 |
| Web 设置页 API 非 2xx | 页面显示错误提示，不能只打控制台日志 |

## Good / Base / Bad Cases

- Good：
  - `bootstrapAll()` 汇总 warning 并交给 UI 显示
  - `createProvider()` 在 provider 缺失时立即抛错
- Base：
  - 非关键依赖不可用时返回简洁 fallback 文案
- Bad：
  - `catch {}` 后什么都不做
  - 只在控制台打印错误，用户界面无任何反馈
  - 返回“成功”但内部已经降级或跳过关键步骤

## Wrong vs Correct

#### Wrong

```ts
try {
  await saveConfig(data)
} catch {
  return { success: true }
}
```

问题：

- 吞掉真实失败
- 让调用方误判状态

#### Correct

```ts
try {
  await saveConfig(data)
  return { success: true }
} catch (error) {
  return {
    success: false,
    error: error instanceof Error ? error.message : String(error),
  }
}
```

## 当前代码参考

- 启动降级与 warning：`cli/src/core/bootstrap.ts`
- Provider 契约错误：`cli/src/providers/registry.ts`
- Hook 配置加载失败：`cli/src/hooks/hook-manager.ts`
- Web API 请求失败：`cli/web/src/hooks/useApi.ts`

## 反模式

- 不要新增“默认吞错”的帮助函数。
- 不要把错误处理分散到 UI、server、runtime 三层各写一半。
- 不要把“兼容旧版本”理解为“任何坏数据都自动忽略”。
