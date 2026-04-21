# Project Shell v1 专项规范

> 本规范约束 `Xnova Studio v1` 的 **project-aware 主体验** 交互骨架：默认入口、左侧信息架构、上下文条、模式切换、SubAgent 呈现、Agent 选择器。目标是防止 renderer 实现时把"聊天壳 + 项目感"重新退化成"session-first 壳"。

## 当前事实

- 当前 Web 壳首页仍偏 `Overview` 与设置大盘
- `Sidebar.tsx` 已有一级导航常量，但未按 v1 锁定的 7 项清单对齐
- `useChat.ts` 主链路聚合了会话级状态，但尚未按 `project / session / agent / mode / model` 五元组恢复
- `XForge` / `Standard` 模式切换尚未作为独立顶部入口存在
- 未来 `studio/src/renderer/` 尚未落地，但产品侧硬约束已在 [`docs/xnova-studio-V1核心设计文档.md`](../../../docs/xnova-studio-V1核心设计文档.md) 与 [`docs/implement/phase5-project-aware-shell.md`](../../../docs/implement/phase5-project-aware-shell.md) 中锁定

## 场景：建立 project-aware 主壳的交互契约

### 1. Scope / Trigger

- 触发条件：
  - 改动默认首页路由、冷启动恢复逻辑
  - 改动 `cli/web/src/components/Sidebar.tsx` 的一级导航或二级 block
  - 新增/调整输入框附近的上下文信息条
  - 新增或迁移 `Standard / XForge` 模式切换入口
  - 调整 SubAgent 在聊天流 / 会话树中的呈现
  - 调整主 Agent 选择器、`Agents` 页面、`管理 Agents` 面板
  - 未来 `studio/src/renderer/` 首次实现上述任意一项
- 这是高风险跨层约束：UI 漂移会让"项目感"退化为文案装饰。

### 2. Signatures

v1 建议围绕以下接口收敛。类型体现契约，不是最终实现清单。

```ts
// 冷启动路由决策
interface StartupRouteInput {
  recentProject?: { path: string; lastActiveAt: number } | null
  recentSession?: { projectPath: string; sessionId: string } | null
  userOverride?: 'blank-chat' | 'last-session'
}

type StartupRouteResult =
  | { kind: 'blank-chat' }
  | { kind: 'restore-session'; projectPath: string; sessionId: string }

function resolveStartupRoute(input: StartupRouteInput): StartupRouteResult

// 当前工作上下文五元组（恢复 / 持久化 / 显示同源）
interface WorkContext {
  projectPath: string | null
  branch: string | null
  agentId: string | null
  modelId: string | null
  mode: 'standard' | 'xforge'
}

// 上下文条字段契约：顺序 / 是否必显 / 空态
interface ContextBarFieldSpec {
  key:
    | 'project'
    | 'branch'
    | 'agent'
    | 'model'
    | 'contextUsage'
    | 'runningSubagents'
  order: 1 | 2 | 3 | 4 | 5 | 6
  requiredVisible: boolean
  emptyPresentation: 'placeholder' | 'hidden' | 'muted'
}
```

> **类型引用约定（spec 层契约骨架）**：
>
> - 字段级定义（例如 `WorkContext.modelId` 的枚举、`ContextBarFieldSpec.key` 的图标与文案）由 Phase 5 / 6 对应 `prd.md` 落到具体文件。
> - `WorkContext` 必须成为项目恢复、上下文条显示、默认值下沉的唯一主状态源；不允许再在 URL / localStorage / EventBus / 组件 state 里各存一份竞态副本。
> - `resolveStartupRoute` 的优先级规则在 `Contracts` 段定义，测试中必须断言。

### 3. Contracts

#### 默认入口

- 冷启动默认页：**空白聊天页**，不是 `Overview`
- 决策优先级：
  1. 若 `userOverride = 'blank-chat'`：强制空白聊天页
  2. 否则，若有最近项目且有最近会话：恢复最近工作会话
  3. 否则：空白聊天页
- `Overview` 降级为二级页面，不再作为主产品叙事

#### 左侧一级导航（顺序固定）

1. 快速聊天
2. 搜索
3. Agents
4. 项目
5. 聊天
6. 工具
7. 设置

- `工具` 承载 `MCP / Skills` 状态展示，v1 不做重型运维后台
- `XForge` 不作为左侧一级入口
- `Plugins` 不作为 v1 左侧一级入口

#### 左侧二级：项目块 / 聊天块

- 两个独立 block，各自支持折叠 / 展开、独立滚动
- `项目` 块：最近项目列表 → 项目下会话树 → 子代理会话折叠
- `聊天` 块：仅 scratchpad 语义的全局聊天入口，**不得再长成第二套主工作流**

#### 上下文条（输入框附近）

字段顺序固定为：

1. 当前项目
2. 当前分支
3. 当前 Agent
4. 当前模型
5. 上下文使用量
6. 运行中的 SubAgent 数量

- 切换模型 / Agent 的新会话默认跟随当前选择
- **上下文条里不得放第二个 mode 切换入口**

#### Mode 切换

- `Standard / XForge` 的唯一主切换入口在顶部
- 默认只显示模式名；hover / 点击时显示一句简短说明
- 模式切换不改变项目 / workspace / 上下文，只改变执行策略

#### SubAgent UX

- 首先是对话内事件与分支会话，其次才是侧栏
- 主 Agent 派遣子代理时，创建与运行状态直接出现在当前对话里
- 左侧项目块内的会话树支持父会话展开 → 子代理会话折叠呈现
- 子代理会话可点击进入独立聊天视图
- 运行中 / 停止 / 部分结果三种状态在聊天流与侧栏必须**同步**，不允许一边显示 running 一边侧栏已收起

#### Todo UX

- 主界面只显示执行中的 todo 摘要
- 完成后摘要收起，明细仍保留在聊天记录或任务面板

#### 主 Agent 选择器

- 默认简洁下拉框，分组用用户语言：`系统推荐` / `我的自定义`
- 每项默认只显示 `name` + 简短副标题，**不直接暴露** `id` / 完整 `when_to_use` / `builtin/user` 这类实现细节词
- 提供"进入 `管理 agents` 面板"入口

#### Agents 页面 v1

- 默认是 Agent 列表页
- 列表按 `mode` 分组：主 Agent / 子代理 / 通用
- 每条展示 `name` / `summary` / `mode` / 来源标签
- 点击进入详情/编辑页可编辑完整 frontmatter 与 Markdown 正文

### 4. Validation & Error Matrix

| 条件 | 处理方式 |
|---|---|
| 最近项目路径失效 | 降级到空白聊天页，并显式提示路径失效原因 |
| 最近会话数据损坏 | 降级到项目根视图而非直接崩溃，并记录失败事件 |
| Runtime 未就绪 | 主壳显示明确"连接中 / 未就绪"状态，不卡死输入栏 |
| `project.toml` 非法 | 显示错误并回退到 user + builtin 默认 |
| SubAgent 停止但聊天流未收到结束事件 | 必须在 UI 上以"已停止/部分结果"兜底，不允许长时间 `running` |
| 窗口宽度 < 1024px | 按"尽量不崩溃"处理；v1 不承诺完整可用 |
| 用户尝试在上下文条新增第二个 mode 切换 | 视为边界违规，必须拒绝合入 |

### 5. Good / Base / Bad Cases

- Good：
  - 冷启动路由由纯函数 `resolveStartupRoute` 决定，UI 只消费结果
  - 上下文条由 `ContextBarFieldSpec` 驱动，字段顺序不可散落到多个组件里
  - SubAgent 呈现状态订阅同一事件源
- Base：
  - 在 `cli/web/` 内先把导航与首页改造落地，再把可复用部分迁移到未来 `studio/src/renderer/`
- Bad：
  - 每个页面各自在 `useState` 里决定"显哪几个上下文字段"
  - `Overview` 重新长成默认首页
  - 全局聊天块又长成第二套项目级工作流

### 6. Tests Required

- 单元测试：
  - `resolveStartupRoute` 覆盖"无最近项目 / 有项目无会话 / 有项目有会话 / 用户强制空白"四条分支
  - 上下文条字段顺序与必显规则断言
  - 主 Agent 选择器过滤规则（`primary | all`）
- 集成测试：
  - 冷启动路由决策
  - 最近项目 / 最近会话 / 最近 Agent / Mode / Model 恢复
  - SubAgent 在聊天流与会话树两处的状态同步
  - Mode 切换时项目 / 会话不被清空
- E2E（v1 两条 Critical Path）：
  - 新建项目链路：冷启动 → 空白聊天页 → 绑定 workspace → 创建首会话
  - 接手已有项目：打开项目 → 恢复最近会话 → 恢复 agent / mode / model

### 7. Wrong vs Correct

#### Wrong

```tsx
// 首页直接落到统计大盘
function App() {
  return <OverviewPage />
}

// 上下文条里偷偷加了第二个 mode 切换
<ContextBar>
  <ModeToggle /> {/* 违规：顶部已有唯一主切换 */}
</ContextBar>
```

问题：

- 默认叙事退回 session-first
- mode 切换入口不唯一，恢复和用户预期必然漂移

#### Correct

```tsx
function App() {
  const route = resolveStartupRoute({
    recentProject,
    recentSession,
    userOverride,
  })
  switch (route.kind) {
    case 'blank-chat':
      return <BlankChatPage />
    case 'restore-session':
      return <ProjectChatPage
        projectPath={route.projectPath}
        sessionId={route.sessionId}
      />
  }
}
```

并把 `ContextBarFieldSpec` 配置列表作为单一数据源驱动上下文条。

## 当前代码参考

- `cli/web/src/App.tsx`
- `cli/web/src/components/Sidebar.tsx`
- `cli/web/src/pages/ChatPage.tsx`
- `cli/src/ui/useChat.ts`

## 反模式

- 不要把"项目感"只做成 UI 文案或面包屑。
- 不要让全局聊天重新长成第二套主工作流。
- 不要在上下文条增加第二个 mode 切换入口；顶部是唯一主切换。
- 不要把"恢复最近工作"的优先级写成分散的 if/else；必须走统一的 `resolveStartupRoute`。
- 不要等 `studio/src/renderer/` 落地后再补这份 spec——它现在就必须约束 `cli/web/` 的演进。

## 相关 spec

- [`component-guidelines.md`](./component-guidelines.md) 定义页面 / 展示组件分层，本 spec 里所有 UI 决策都必须遵守那份的组件边界。
- [`state-management.md`](./state-management.md) 定义项目事实源 / 用户偏好 / 当前会话状态三分层，`WorkContext` 必须作为会话级状态落到 `useChat` 这类领域 Hook，不允许散落。
- [`../backend/agent-schema-v1.md`](../backend/agent-schema-v1.md) 定义主 Agent / SubAgent 候选池的过滤规则；本 spec 的 Agent 选择器与 Agents 页面必须复用那一套，不得自造 mode 过滤逻辑。
- [`../backend/config-toml-migration.md`](../backend/config-toml-migration.md) 定义 `project > user > builtin` 优先级；本 spec 的 "恢复最近 mode / agent / model" 必须消费该优先级的结果，不得在 UI 层重造。
