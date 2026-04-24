# Frontend 目录与页面边界

> 当前仓库的前端主线是 `apps/studio/src/renderer/**`。新增 UI 代码必须先判断自己属于 renderer、shared contract，还是 host 桥接，再决定落点。

## 当前目录事实

```text
apps/studio/
├─ src/
│  ├─ renderer/
│  │  ├─ pages/          # 路由/主视图页面
│  │  ├─ components/     # 组件
│  │  ├─ hooks/          # bridge / 订阅 / 页面状态 Hook
│  │  ├─ utils/          # 纯函数与恢复逻辑
│  │  └─ styles/         # 页面与组件样式（如存在）
│  ├─ shared/            # main / preload / renderer 共享 contract
│  ├─ preload/           # 安全桥
│  └─ main/              # Electron host
├─ tests/                # renderer / host / contract 测试
```

legacy 目录说明：

- `cli/src/ui/`：终端 UI 参考，不再是主交付面
- `cli/web/src/`：旧 Web 面板参考，不再承接新功能
- 根 `studio/`：冻结旧目录，仅转发到 `apps/studio`

## 宿主边界

### `apps/studio/src/renderer/`

- 宿主：React renderer
- 负责：
  - 主壳页面
  - 对话时间线
  - 模式切换
  - 模型选择器
  - 项目树、工具页、设置页
- 不负责：
  - `fs`
  - `child_process`
  - provider API key
  - tool execution
  - runtime internals

### `apps/studio/src/shared/`

- 负责：
  - IPC request / response DTO
  - runtime event view model
  - shell snapshot / settings / memory / mcp / skills 概览类型
- 凡是 main 和 renderer 都要理解的数据结构，优先放这里。

### `apps/studio/src/preload/`

- 负责：
  - 暴露 `window.xnovaStudio`
  - `ipcRenderer.invoke/on` 的安全包装
  - 参数校验
- 不负责业务状态与界面逻辑。

### `apps/studio/src/main/`

- 虽不是前端目录，但任何 renderer 能力都必须经由这里接入 runtime / system。
- renderer 不得绕过 main / preload 直接建立替代通道。

## 模块组织规则

### 页面层 `pages/`

- 页面负责：
  - 主视图布局
  - 页面级数据协调
  - 把状态拆给子组件
- 页面不负责堆叠大量一次性小组件；一旦明显变长，应提炼子组件与 Hook。

### 组件层 `components/`

- 组件优先做：
  - 明确 props 输入的可复用视图
  - UI 状态展示
  - 用户操作触发
- 示例：
  - `ProjectShellSidebar.tsx`
  - `ModeSwitch.tsx`
  - `ContextBar.tsx`
  - `ConversationTimeline.tsx`
  - `SessionModelPicker.tsx`

### Hook 层 `hooks/`

- 放真正的 React Hook 或跨页面复用的 bridge 状态逻辑。
- 示例：
  - `useStudioBridge.ts`
  - `useMemoryOverview.ts`
- 只要代码使用 `useState/useEffect/ref`、订阅 runtime 事件、处理恢复逻辑，就优先考虑这一层。

### 工具层 `utils/`

- 放纯函数、恢复策略、小型变换逻辑。
- 示例：
  - `startup-route.ts`
  - `work-context.ts`
  - `work-preferences.ts`

## 命名约定

- React 组件文件：`PascalCase.tsx`
- Hook 文件：`useXxx.ts`
- 页面文件：`PascalCase.tsx`
- 工具函数文件：`kebab-case.ts`
- shared contract 文件：优先使用语义清晰的 `kebab-case`

## 新文件放置判断

### 放在 `pages/`

- 它对应一个完整主视图或壳层页面
- 它要协调多个子组件与 bridge 状态

### 放在 `components/`

- 它主要解决视图复用
- 可以通过 props 独立渲染

### 放在 `hooks/`

- 它使用 React 生命周期
- 它要管理订阅、清理、恢复、状态桥接

### 放在 `utils/`

- 它是纯函数
- 不依赖 React 生命周期

### 放在 `shared/`

- main / preload / renderer 都要消费该结构
- 它本质上是 contract，而不是 UI 细节

## 当前代码示例

- 主壳页面：`apps/studio/src/renderer/pages/StudioHomePage.tsx`
- bridge Hook：`apps/studio/src/renderer/hooks/useStudioBridge.ts`
- 会话时间线：`apps/studio/src/renderer/components/ConversationTimeline.tsx`
- 会话模型选择：`apps/studio/src/renderer/components/SessionModelPicker.tsx`
- shared contract：`apps/studio/src/shared/studio-bridge-contract.ts`

## 反模式

- 不要把页面请求逻辑、runtime 事件处理、局部 UI 状态全部塞进一个组件文件。
- 不要让 renderer 直接触碰 system 能力，再用注释说“以后再收敛”。
- 不要把同一份 contract 在 renderer / main 各写一份近似类型。
- 不要继续把新功能落回 `cli/web/src/` 或根 `studio/`。
