# Frontend Hook 规范

> Hook 负责管理状态与副作用，不负责成为新的“隐形全局系统”。

## 当前事实

- 终端前端的核心业务 hook：`cli/src/ui/useChat.ts`
- Web 前端的主题 hook：`cli/web/src/hooks/useTheme.ts`
- Web 中存在历史文件 `cli/web/src/hooks/useApi.ts`，它导出的是请求函数而不是真正 Hook

## 规范

### 1. 真正的 Hook 必须以 `use` 开头，并使用 React Hook 能力

典型示例：

- `useChat`
- `useTheme`
- `useStatusBar`

这类文件通常会用到：

- `useState`
- `useEffect`
- `useRef`
- `useCallback`

### 2. 纯请求封装不是 Hook

当前仓库已有历史例外：`useApi.ts`

后续新增代码的约束：

- 如果只是 `fetch` / 序列化 / 参数拼装，优先放到 `utils/`、`services/` 或明确命名的 API 模块
- 不要继续复制“位于 hooks 目录但其实不是 hook”的命名歧义

### 3. Hook 必须显式处理订阅清理

当前正向示例：

- `useTheme.ts` 对 `matchMedia` 做了清理
- `useChat.ts` 对 EventBus 订阅和 abort controller 做了清理

新增 Hook 如涉及以下内容，必须在 `useEffect` cleanup 中解除：

- DOM / window 事件
- WebSocket
- EventBus
- 定时器
- 长任务 abort 信号

### 4. Hook 的返回值要稳定、可读

- 复杂业务 Hook 优先导出明确接口类型
- 事件方法命名要表达行为：
  - `submit`
  - `abort`
  - `resolvePermission`
  - `loadSession`

## Good / Base / Bad Cases

- Good：
  - `useChat` 以 `UseChatReturn` 明确对外接口
  - `useTheme` 隔离主题持久化和 DOM class 切换
- Base：
  - 小 Hook 可只返回少量状态和 setter
- Bad：
  - Hook 内部注册订阅但不清理
  - Hook 返回一堆匿名对象和行为，调用方看不懂职责

## Wrong vs Correct

#### Wrong

```ts
export function useSocket() {
  socket.on('message', handle)
}
```

问题：

- 没有 cleanup
- 每次 render 都可能重复绑定

#### Correct

```ts
export function useSocket() {
  useEffect(() => {
    socket.on('message', handle)
    return () => socket.off('message', handle)
  }, [])
}
```

## 当前代码示例

- `cli/src/ui/useChat.ts`
- `cli/web/src/hooks/useTheme.ts`
- `cli/web/src/hooks/useApi.ts`（历史命名例外）

## 反模式

- 不要让 Hook 同时承担 UI 渲染、网络请求、全局事件桥接、配置保存四种职责。
- 不要把 refs 当作逃避状态建模的万能手段。
- 不要在 Hook 里默默修改全局单例而不暴露调用语义。
