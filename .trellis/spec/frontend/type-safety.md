# Frontend 类型安全规范

> 当前前端 TypeScript 已启用严格模式。任何新增 UI 代码都必须把“事件契约、页面状态、外部输入”显式类型化，而不是留给运行时碰运气。

## 当前编译约束

### `cli/tsconfig.json`

- `strict: true`
- `exactOptionalPropertyTypes: true`
- `noUncheckedIndexedAccess: true`
- `noImplicitReturns: true`
- `noFallthroughCasesInSwitch: true`

### `cli/web/tsconfig.json`

- `strict: true`
- `noUnusedLocals: true`
- `noUnusedParameters: true`
- `noFallthroughCasesInSwitch: true`

## 当前事实

- 终端与 Web 都大量使用接口和联合类型
- 事件流建模倾向于 discriminated union
- 路径别名已经建立，鼓励显式 import 边界

正向示例：

- `cli/web/src/types.ts`
- `cli/src/tools/agent/types.ts`

## 类型规则

### 1. 外部事件必须用联合类型建模

适用对象：

- WebSocket 事件
- EventBus 事件
- Agent / tool / subagent 状态消息

推荐写法：

- 使用 `type: 'xxx'` 作为判别字段
- 不要用宽泛的 `Record<string, unknown>` 代替完整事件联合

### 2. 外部输入先 `unknown`，再收窄

适用对象：

- `fetch().json()`
- TOML / JSON / frontmatter 解析结果
- 插件/用户自定义数据

要求：

- 不直接 `as SomeType` 然后相信它
- 至少做字段存在性与基本形状校验

### 3. 本地组件类型就近放置，共享契约集中管理

- 文件内局部 props/interface：放在组件文件里
- 跨页面、跨 bridge、跨宿主共享的消息类型：放在 `types.ts` 或领域类型文件中

### 4. 禁止 `any`

例外情况必须极少，并要在附近说明原因。

优先替代：

- `unknown`
- 精确接口
- 判别联合
- 泛型

## Validation & Error Matrix

| 输入来源 | 最低要求 |
|---|---|
| Web API 响应 | 有显式返回类型，关键字段有运行时校验 |
| EventBus 消息 | 用判别联合建模 |
| 配置文件 | 解析后校验字段类型 |
| Agent frontmatter | 解析失败要返回明确错误，而不是默认吞掉 |

## Good / Base / Bad Cases

- Good：
  - `ServerEvent` / `ClientMessage` 这类显式联合
  - `AgentOutput` 这类状态联合
- Base：
  - 局部组件 props 用小接口就近定义
- Bad：
  - `const data = await resp.json() as any`
  - 事件对象只靠字符串键访问，不做类型收窄

## Wrong vs Correct

#### Wrong

```ts
const data = await resp.json() as { rules: any[] }
```

#### Correct

```ts
interface PricingRulesResponse {
  rules: PricingRule[]
}

const data = await resp.json() as PricingRulesResponse
```

如果来源不可信，再补运行时校验。

## 当前代码示例

- Web 事件与消息：`cli/web/src/types.ts`
- Agent 输出联合：`cli/src/tools/agent/types.ts`
- 配置对象：`cli/src/config/config-manager.ts`

## 反模式

- 不要把“后面再补类型”当成默认工作流。
- 不要在事件系统里使用松散对象再靠注释描述字段。
- 不要为了绕过编译器而大量追加非空断言。
