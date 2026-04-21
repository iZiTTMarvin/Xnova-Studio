# Frontend 状态管理规范

> 当前仓库没有引入 Redux/Zustand 之类全局状态库，状态主要通过 React 本地状态、自定义 Hook、模块单例和 EventBus 组合管理。

## 当前事实

### 终端 UI

- 主业务状态集中在 `cli/src/ui/useChat.ts`
- UI 层依赖的单例包括：
  - `configManager`
  - `sessionLogger`
  - `tokenMeter`
  - `contextManager`
  - `skillStore`
  - `pluginRegistry`

### Web UI

- 页面以本地 `useState` 管理编辑态
- 跨端同步通过 Bridge / EventBus / API 交互完成
- 典型示例：
  - `SettingsPage.tsx`
  - `useTheme.ts`

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

管理方式：

- `useChat` 这类领域 Hook 统一维护

### 3. 运行时共享状态

适用：

- 会话日志
- MCP 状态
- 记忆系统
- 配置管理

管理方式：

- 单例服务 + 明确 API
- UI 只消费，不直接重造一份状态事实源

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
| EventBus 断开或 bridge 未就绪 | UI 显示明确状态，而不是卡死 |
| 最近项目路径失效 | 恢复失败要给用户可见反馈 |
| 子代理运行中被停止 | 聊天流与侧栏状态都要同步更新 |

## Good / Base / Bad Cases

- Good：
  - `useChat` 聚合会话级状态，页面只调用接口
  - `useTheme` 把主题持久化封装到单独 Hook
- Base：
  - 单页表单编辑状态放本地 `useState`
- Bad：
  - 为同一份状态同时维护多个无同步策略的副本
  - 页面组件直接读写多个底层单例并自行拼装恢复规则

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

- 会话主状态：`cli/src/ui/useChat.ts`
- 启动与共享单例：`cli/src/core/bootstrap.ts`
- Web 页面编辑态：`cli/web/src/pages/SettingsPage.tsx`

## 反模式

- 不要引入新的全局状态容器，只是为了回避状态建模。
- 不要把“项目级默认值”和“用户本次临时选择”混成一个字段。
- 不要把恢复逻辑写成分散在多个组件里的 if/else。
