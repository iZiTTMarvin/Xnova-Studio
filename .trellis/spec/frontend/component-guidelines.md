# Frontend 组件规范

> 组件必须先明确自己是“页面容器”还是“展示组件”。当前仓库的两个前端宿主不同，但这一条通用。

## 当前事实

- 终端 UI 使用 Ink 组件组合：`Box`、`Text`、`useInput`
- Web UI 使用 React + Tailwind 组合
- 大页面已经存在“页面偏大”的历史问题，例如 `cli/web/src/pages/SettingsPage.tsx`
- 因此新增组件时要尽量避免继续做超长单文件堆叠

## 组件分类

### 页面容器组件

- 负责：
  - 路由级状态
  - 数据加载
  - 提交保存
  - 组合多个展示组件
- 示例：
  - `cli/src/ui/App.tsx`
  - `cli/web/src/pages/SettingsPage.tsx`

### 展示组件

- 负责：
  - 单一信息块或交互块
  - 明确 props 输入输出
  - 不直接掌控全局业务状态
- 示例：
  - `cli/web/src/components/Sidebar.tsx`
  - `cli/web/src/components/StatusBar.tsx`

## 组件设计规则

### 1. 先拆数据边界，再拆视觉结构

- 页面先决定：
  - 数据从哪里来
  - 状态在哪里维护
  - 哪些子组件只接收 props
- 不要让展示组件自己偷偷去读多个全局单例

### 2. 交互常量优先提到文件顶部

当前正向示例：

- `Sidebar.tsx` 中的 `NAV_ITEMS`
- 主题切换中的 `THEME_CYCLE`

适用场景：

- 菜单项
- tab 列表
- 模式列表
- 状态映射表

### 3. 组件 props 必须显式建模

- 局部组件可在文件内声明接口
- 对外共享组件，类型应稳定且语义明确
- 布尔值 props 只描述状态，不夹带复杂流程含义

### 4. 新页面默认要具备四类状态

- loading
- empty
- error
- disabled / unsupported

## v1 设计基线

根据设计文档，桌面主体验中的组件结构新增时应默认遵守：

- 默认首页是空白聊天页，不是 overview
- 左侧一级入口只保留：
  - 快速聊天
  - 搜索
  - Agents
  - 项目
  - 聊天
  - 工具
  - 设置
- `Standard / XForge` 只有一个顶部主切换入口
- `工具` 页优先展示状态卡片，而不是先做复杂管理面板

## Good / Base / Bad Cases

- Good：
  - `Sidebar.tsx` 用常量描述导航，再由组件渲染
  - `SettingsPage.tsx` 下的卡片区域有明确分块
- Base：
  - 单页先集中实现，但一旦超过一个明显视图域，就提炼子组件
- Bad：
  - 页面组件一边请求数据，一边做复杂展示，一边处理所有弹窗
  - 小组件内部直接修改全局 runtime 状态

## Wrong vs Correct

#### Wrong

```tsx
function ProviderCard() {
  const config = configManager.load()
  const [local, setLocal] = useState(config.providers.deepseek)
  // ...
}
```

问题：

- 展示组件直接耦合全局配置
- 不利于复用和测试

#### Correct

```tsx
function ProviderCard({
  name,
  provider,
  onChange,
}: {
  name: string
  provider: ProviderConfig
  onChange: (next: ProviderConfig) => void
}) {
  // 仅处理当前卡片视图与交互
}
```

## 当前代码示例

- 终端容器：`cli/src/ui/App.tsx`
- 终端功能面板：`cli/src/ui/ResumePanel.tsx`
- Web 展示组件：`cli/web/src/components/Sidebar.tsx`
- Web 页面容器：`cli/web/src/pages/SettingsPage.tsx`

## 反模式

- 不要新增“万能组件”承载多个无关职责。
- 不要在展示组件里偷偷发请求。
- 不要为了省文件数，把多个完全不同的 UI 语义硬塞进一个组件。
