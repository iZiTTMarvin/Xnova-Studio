# Xnova Code — 当前架构总览

> 最后更新：2026-04-24

## 一、当前事实

Xnova Code 当前只保留一条有效产品主线：

- `apps/studio/`：唯一主宿主
- `packages/*`：唯一共享能力事实源
- `apps/cli/`：只保留宿主空位，当前不提供 CLI 产物

根 `cli/` 与根 `studio/` 已经正式移出 `pnpm workspace`。它们当前只作为历史快照保留，方便你在手动删除前做最后核对；它们不再参与构建、测试、类型检查或发布。

## 二、工作区边界

当前 `pnpm-workspace.yaml` 只允许：

```yaml
packages:
  - apps/*
  - packages/*
```

这意味着：

- 新应用宿主只能放在 `apps/*`
- 共享能力只能放在 `packages/*`
- 根级目录不得再承载可运行产品

## 三、目录结构

```text
Xnova-Code/
├─ apps/
│  ├─ studio/          # 当前唯一主宿主（Electron main / preload / renderer）
│  └─ cli/             # 保留空位，当前不启用
├─ packages/
│  ├─ runtime/         # runtime facade / bridge / inspect / engine service API
│  ├─ core/            # AgentLoop / bootstrap / context-manager / cleanup
│  ├─ config/          # config.toml / project.toml / resolver / settings
│  ├─ providers/       # LLM provider 适配
│  ├─ persistence/     # session store / db / restore
│  ├─ tools/           # 工具注册与执行
│  ├─ memory/          # memory service / indexing / retrieval
│  ├─ mcp/             # MCP manager / status / mutation
│  ├─ skills/          # skills 发现与读取
│  ├─ plugin/          # plugin registry / metadata
│  ├─ platform/        # shell / path / snapshot
│  └─ observability/   # session logger / token meter / metrics
├─ docs/
├─ .trellis/
├─ cli/                # 已下线的 legacy CLI 快照，等待手动删除
└─ studio/             # 已下线的 legacy Studio 快照，等待手动删除
```

## 四、主链路分层

### 1. `apps/studio/src/main`

负责：

- Electron 生命周期
- Workspace 绑定
- RuntimeManager 长生命周期持有
- IPC handler 装配
- 权限请求与宿主级错误处理

不负责：

- 重新实现 runtime / memory / mcp / persistence 业务逻辑
- 继续依赖根 `cli/src/**`

### 2. `apps/studio/src/preload`

负责：

- 安全桥
- 参数校验
- `ipcRenderer.invoke/on` 封装

不负责：

- 文件系统读写
- Provider 密钥持有
- Tool 执行
- Runtime 内部状态缓存

### 3. `apps/studio/src/renderer`

负责：

- 页面与组件
- 会话时间线
- 模型选择
- 项目树 / 会话树 / 设置 / Tools

不负责：

- `fs`
- `child_process`
- Provider secrets
- Runtime internals
- Tool execution

### 4. `packages/*`

这里是共享能力的唯一事实源：

- `@xnova/runtime`：runtime facade、inspect、engine service API
- `@xnova/core`：编排内核
- 其他领域包：config / providers / persistence / tools / memory / mcp / skills / plugin / platform / observability

## 五、数据流

```text
Renderer
  -> window.xnovaStudio
  -> Preload bridge
  -> Main IPC handlers
  -> RuntimeManager / EngineServiceApi
  -> packages/runtime + packages/core + 各领域 packages
  -> 事件回流到 renderer
```

主链路要求：

- `runtime-not-ready` 必须是真门禁
- submit 必须携带当前 `sessionId / agentId / providerId / modelId`
- 会话恢复必须复用 main 持有的 runtime，而不是每轮重建

## 六、验证入口

当前有效验证命令只有两层：

### 根级

```bash
pnpm typecheck
pnpm test
pnpm build
```

### Studio 定向

```bash
pnpm --dir apps/studio typecheck
pnpm --dir apps/studio test
pnpm --dir apps/studio build
pnpm --dir apps/studio pack:dir
pnpm --dir apps/studio pack:win
```

根 `cli/` 与根 `studio/` 已不再是合法验证入口。

## 七、当前约束

- 不要把新能力落回根 `cli/` 或根 `studio/`
- 不要再为 legacy 目录补脚本入口
- 若未来恢复 CLI，必须在 `apps/cli` 基于 `packages/*` 重建
- 若确认不再需要历史参考，可手动删除根 `cli/` 与根 `studio/`
