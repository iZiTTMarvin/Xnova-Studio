# Frontend 目录与页面边界

> 当前仓库存在“终端前端 + Web 前端”双形态。新增 UI 代码必须先判断自己属于哪一个宿主，再决定落点。

## 当前目录事实

```text
cli/
├─ src/ui/                  # Ink 终端 UI
│  ├─ App.tsx
│  ├─ ChatView.tsx
│  ├─ InputBar.tsx
│  ├─ useChat.ts
│  └─ ...
└─ web/src/                 # React Web 面板
   ├─ pages/
   ├─ components/
   ├─ hooks/
   ├─ styles/
   ├─ utils/
   └─ types.ts
```

## 宿主边界

### `cli/src/ui/`

- 宿主：Ink / 终端
- 负责：
  - 聊天主视图
  - 输入栏
  - 权限弹窗
  - MCP/Resume/Fork/Todo/SubAgent 面板
- 典型入口：
  - `cli/src/ui/App.tsx`
  - `cli/src/ui/useChat.ts`

### `cli/web/src/`

- 宿主：Vite + React + Tailwind
- 负责：
  - Web dashboard
  - 设置页、历史页、总览页
  - Bridge WebSocket 视图
- 典型入口：
  - `cli/web/src/App.tsx`
  - `cli/web/src/pages/*.tsx`

### `studio/src/renderer/`（未来）

- 当前尚不存在
- 在正式创建前，新增“桌面专属”交互方案先记录到 spec 或 docs，不要提前散落到 `cli/web/` 假装已经落地

## 模块组织规则

### 页面层 `pages/`

- 页面负责：
  - 路由级布局
  - 数据请求/初始化
  - 把状态拆给子组件
- 页面不负责保存一堆难以复用的局部小组件实现；一旦同页代码过长，应提炼子组件

### 组件层 `components/`

- 组件优先做：
  - 可复用视图
  - 明确 props 输入
  - 尽量少依赖全局单例
- 图标集中放在 `components/icons/`

### Hook 层 `hooks/`

- 放真正的 React Hook 或跨页面复用的状态桥接逻辑
- 若只是 `fetch` 包装或纯函数工具，不要因为“看起来像和请求有关”就一律扔到 `hooks/`

### 工具层 `utils/`

- 放纯函数、算法、小型变换逻辑
- 典型示例：
  - `cli/web/src/utils/pca.ts`
  - `cli/web/src/utils/image-compress.ts`

## 命名约定

- React 组件文件：`PascalCase.tsx`
- Hook 文件：`camelCase` 但以 `use` 开头，如 `useTheme.ts`
- 页面文件：`PascalCase.tsx`
- 工具函数文件：`kebab-case.ts` 或按既有命名风格保持一致

## 新文件放置判断

### 放在 `pages/`

- 它对应一个完整路由或主视图块
- 它要协调多个组件和数据源

### 放在 `components/`

- 它主要解决视图复用
- 可以通过 props 独立渲染

### 放在 `hooks/`

- 它使用 React state / effect / ref
- 它要管理订阅、清理、持久化、事件桥接

### 放在 `utils/`

- 它是纯函数
- 不依赖 React 生命周期

## 当前代码示例

- 终端主壳：`cli/src/ui/App.tsx`
- 终端业务 Hook：`cli/src/ui/useChat.ts`
- Web 导航组件：`cli/web/src/components/Sidebar.tsx`
- Web 设置页：`cli/web/src/pages/SettingsPage.tsx`
- Web 主题 Hook：`cli/web/src/hooks/useTheme.ts`

## 反模式

- 不要把页面请求逻辑、组件视图逻辑、Bridge 事件处理全部塞进一个文件。
- 不要把“未来桌面 renderer 也许会复用”的代码，未经抽象就直接复制到多个前端目录。
- 不要继续扩散“历史原因命名不准”的模式，例如纯函数文件滥放在 `hooks/`。
