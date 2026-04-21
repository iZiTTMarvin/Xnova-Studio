# Agent Schema v1 专项规范

> 本规范约束 `Xnova Studio v1` 的 agent 文件格式、来源优先级、校验规则和运行时默认行为，避免 parser、registry、UI 与项目配置各自长出一套语义。

## 当前事实

- 当前内置 agent 定义来自：
  - `cli/src/tools/agent/built-in.ts`
  - `cli/src/tools/agent/types.ts`
  - `cli/src/tools/agent/definition-registry.ts`
- 当前 registry 注释仍提到：
  - 内置
  - 全局自定义 `~/.xnovacode/agents/*.md`
  - 项目自定义 `.xnovacode/agents/*.md`
  - 插件（预留）
- 需求文档对 v1 的锁定是：
  - 文件格式：Markdown + frontmatter
  - 产品层来源：`builtin + user`
  - override 规则：`user > builtin`
  - `mode = primary | subagent | all`
  - `default_agent` 受 `mode` 限制

## 场景：建立 v1 agent 文件格式与运行时校验契约

### 1. Scope / Trigger

- 触发条件：
  - 新增 agent parser / loader / validator
  - 修改 `built-in.ts`、`types.ts`、`definition-registry.ts`
  - 建设 Agents 页面或主 Agent / SubAgent 选择器
  - 读取 `agent.default`、`agent.max_parallel_subagents`
- 这是高风险跨层契约，必须先统一 schema，再写 UI 和运行时。

### 2. Signatures

v1 frontmatter 目标结构：

```toml
id = "explorer"
name = "Explorer"
summary = "只读探索"
mode = "all"
inherits = "explore"
when_to_use = "快速只读探索项目结构与关键模块"
model_preference = "fast"

[tool_policy]
mode = "include"
tools = ["read_file", "grep", "glob"]

[extra]
```

建议解析接口：

```ts
interface AgentFrontmatterV1 {
  id: string
  name: string
  summary: string
  mode?: 'primary' | 'subagent' | 'all'
  inherits?: string
  when_to_use: string
  tool_policy: {
    mode: 'include' | 'exclude'
    tools: string[]
  }
  model_preference?: 'fast' | 'balanced' | 'strong'
  extra?: Record<string, unknown>
}

interface LoadedAgentDefinitionV1 {
  source: 'builtin' | 'user'
  frontmatter: AgentFrontmatterV1
  body: string
  filePath: string
}
```

### 3. Contracts

#### 来源契约

- v1 产品层仅暴露：
  - `builtin`
  - `user`
- override 规则：
  - `user > builtin`

#### 文件契约

- 载体：Markdown
- metadata：frontmatter
- 内容体：system prompt / 扩展说明正文

#### 字段契约

- `id`
  - 必填
  - 仅允许小写英文、数字、连字符
- `name`
  - 必填
  - UI 展示名
- `summary`
  - 必填
  - UI 副标题
- `mode`
  - 可选
  - 缺省默认 `all`
- `inherits`
  - 可选
  - 若存在，必须指向合法已知 agent id
- `when_to_use`
  - 必填
- `tool_policy`
  - 必填
  - `mode` 仅允许 `include` / `exclude`
  - `tools` 必须是字符串数组
- `model_preference`
  - 可选
- `extra`
  - 可选 object

#### 运行时契约

- 主 Agent 候选池：`primary | all`
- SubAgent 候选池：`subagent | all`
- `agent.default` 只能引用 `primary | all`
- `agent.max_parallel_subagents` 是硬上限，默认 `5`
- 用户手动切换主 Agent 后，项目级最近选择优先于项目默认值恢复

### 4. Validation & Error Matrix

| 条件 | 处理方式 |
|---|---|
| `id` 不合法 | 拒绝加载并指明文件路径与字段 |
| `mode` 非法 | 拒绝加载 |
| `inherits` 指向不存在的 agent | 拒绝加载 |
| `tool_policy.mode` 非 `include/exclude` | 拒绝加载 |
| `tool_policy.tools` 不是字符串数组 | 拒绝加载 |
| `agent.default` 指向 `subagent` 模式 agent | 配置校验失败 |
| `user` 与 `builtin` 同 id | `user` 覆盖 `builtin` |

### 5. Good / Base / Bad Cases

- Good：
  - `user` agent 覆盖内置同名 agent
  - `mode` 明确限制主/子代理使用范围
  - UI 列表和运行时使用同一套过滤规则
- Base：
  - 旧内置 `general / explore / plan` 先经兼容层映射到 v1 结构
- Bad：
  - parser 一套规则，UI 再写另一套 mode 判断
  - `inherits` 不校验，运行时再随机炸
  - 保留项目级 agent 文件能力但产品层又不说明，导致行为混乱

### 6. Tests Required

- 单元测试：
  - frontmatter parse / validate
  - `mode` 过滤
  - `inherits` 解析
  - `user > builtin` 覆盖
- 集成测试：
  - main agent selector 候选池
  - subagent dispatch 候选池
  - `agent.default` 与最近选择恢复
- 回归测试：
  - 旧内置 agent 仍可正常工作

### 7. Wrong vs Correct

#### Wrong

```ts
const mode = frontmatter.mode ?? 'all'
// UI 用 all 规则
// runtime 另写一套 if/else
```

问题：

- 规则分散
- UI / runtime 容易漂移

#### Correct

```ts
const parsed = parseAndValidateAgent(frontmatter)
const canBePrimary = parsed.mode === 'primary' || parsed.mode === 'all'
const canBeSubagent = parsed.mode === 'subagent' || parsed.mode === 'all'
```

并由 UI 与 runtime 共同复用同一套判断结果。

## 当前代码参考

- `cli/src/tools/agent/types.ts`
- `cli/src/tools/agent/definition-registry.ts`
- `cli/src/tools/agent/built-in.ts`

## 反模式

- 不要先做 UI 再反推 schema。
- 不要在不同层里各自解释 `mode`。
- 不要把“兼容旧 agent”变成“永远不收敛到 v1 schema”。
