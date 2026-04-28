# Frontend 状态管理规范

> 当前 Studio renderer 已引入 Zustand + Immer 管理跨组件会话状态；页面局部交互仍使用 React 本地状态，自定义 Hook 负责 bridge 订阅与副作用边界。

## 当前事实

### Studio renderer

- 当前主状态分为三类 store：
  - `apps/studio/src/renderer/stores/runtime-store.ts`：runtime 运行态、live conversation、thinking/tool/status block、pending 交互。
  - `apps/studio/src/renderer/stores/session-store.ts`：会话列表、当前会话、恢复后的持久化消息。
  - `apps/studio/src/renderer/stores/settings-store.ts`：provider/model 设置、设置页状态。
- `useStudioBridge.ts` 与 `useStudioBridgeState.ts` 负责订阅 preload/shared contract，并把 runtime/main 事件落到 store。
- 页面组件只消费 store selector 和 hook API，不直接调用 runtime/core 单例。

### Legacy UI

- `cli/src/ui/**`、`cli/web/src/**` 只作为历史参考，不再定义 Studio renderer 状态事实源。

## 状态分层

### 1. 页面临时状态

适用：

- 输入框值
- tab 选中项
- 是否展开面板
- 正在保存 / 测试中

管理方式：

- `useState`
- 页面组件本地维护

### 2. 会话级状态

适用：

- 当前消息流
- 当前 provider/model
- pending permission / pending question
- subagent events
- runtime warmup 辅助状态

管理方式：

- `runtime-store` 维护 runtime 事件映射与 live conversation。
- `session-store` 维护持久化会话事实。
- `settings-store` 维护设置事实。
- `useStudioBridge` 负责跨层订阅、状态恢复和副作用。

### 3. 运行时共享状态

适用：

- 会话日志
- MCP 状态
- 记忆系统
- 配置管理

管理方式：

- main/runtime/persistence 是底层事实源。
- renderer store 是 UI 当前视图状态，不得伪造 backend 成功。
- UI 只消费 shared contract 暴露的数据，不直接重造 runtime 状态。

## v1 基线

需求文档已经锁定：

- 项目、会话、Agent、Mode、Model 需要有可恢复状态
- `project.toml` 和用户配置需要合并
- `Standard / XForge` 共用同一项目与 workspace，只切换 workflow 行为

因此新增状态逻辑时必须遵守：

- **项目事实源**、**用户偏好**、**当前会话临时状态** 三者不能混写在一个对象里
- “恢复最近状态”必须定义优先级，而不是靠最后一次偶然写入
- 同一语义只能有一个主状态源，不要同时存：
  - URL 一份
  - localStorage 一份
  - EventBus 一份
  - 组件 state 再一份

## Validation & Error Matrix

| 场景 | 要求 |
|---|---|
| 用户切换 provider/model | 新会话默认值改变，但不应意外覆盖项目级推荐值 |
| bridge 未就绪或订阅断开 | UI 显示明确状态，而不是卡死 |
| 最近项目路径失效 | 恢复失败要给用户可见反馈 |
| 子代理运行中被停止 | 聊天流与侧栏状态都要同步更新 |
| runtime event 高频到达 | store 可用 requestAnimationFrame 合并文本/思考增量，但 tool_start/tool_end 等结构化事件必须及时落地 |
| warmup 状态变化 | 只能更新辅助提示，不得覆盖 runtime-ready 门禁 |

## Good / Base / Bad Cases

- Good：
  - `runtime-store` 聚合 runtime 事件，页面只消费 selector
  - `useStudioBridge` 集中处理 bridge 订阅、清理和恢复
  - 文本/思考流可以批处理，工具生命周期事件保持结构化
- Base：
  - 单页表单编辑状态放本地 `useState`
- Bad：
  - 为同一份状态同时维护多个无同步策略的副本
  - 页面组件直接读写多个底层单例并自行拼装恢复规则
  - 新增第二套全局 store 绕开现有 `runtime/session/settings` stores

## Wrong vs Correct

#### Wrong

```ts
const [mode, setMode] = useState(localStorage.getItem('mode') ?? 'Standard')
```

问题：

- 没有和项目状态、最近会话、文档规则对齐
- 容易出现恢复优先级混乱

#### Correct

```ts
const mode = resolveMode({
  projectConfig,
  recentProjectState,
  userOverride,
})
```

并把 `resolveMode` 的优先级写进 spec 和测试。

## 当前代码示例

- runtime 状态：`apps/studio/src/renderer/stores/runtime-store.ts`
- 会话状态：`apps/studio/src/renderer/stores/session-store.ts`
- 设置状态：`apps/studio/src/renderer/stores/settings-store.ts`
- bridge Hook：`apps/studio/src/renderer/hooks/useStudioBridge.ts`
- 启动与共享能力：`packages/core/src/bootstrap.ts`

## 反模式

- 不要新增第二套全局状态容器来绕开现有 Zustand stores。
- 不要把“项目级默认值”和“用户本次临时选择”混成一个字段。
- 不要把恢复逻辑写成分散在多个组件里的 if/else。
