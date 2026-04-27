# 修复 Studio Electron 启动与写文件权限拒绝

## 背景

Studio 当前存在两类独立但会叠加放大的缺陷：

- 开发启动时 `electron-vite` 在 pnpm isolated 布局下无法解析 `electron`，报 `Error: Electron uninstall`。
- 用户在 Studio 中选择项目后，Agent 的 `write_file` / `edit_file` 可能被静默拒绝，UI 只显示 `rejected by user`，但用户实际上没有看到权限弹窗。
- 权限拒绝原因在 `packages/runtime` 到 `packages/core` 的链路中被压扁为 boolean，导致 UI 与 LLM 都无法获得真实 reason。

## 目标

- Studio 开发模式在干净 pnpm 安装后可以稳定启动，不再依赖偶然 hoist 或旧环境变量。
- 项目选择、workspace 绑定、runtime cwd、权限判定基准保持一致，避免合法项目内写入被误判为 workspace 外。
- 权限拒绝结果完整透传 `reason`，工具结果不再硬编码成 `rejected by user`。
- 用户可见错误文案能区分 workspace 未就绪、workspace 外路径、权限超时、用户拒绝等原因。
- 用自动化测试覆盖上述回归点，并更新 `CHANGELOG.md`。

## 非目标

- 不改变工具安全策略为“无条件放行”。
- 不引入新的全局状态库或绕过 preload/main 的 renderer 直连能力。
- 不使用 `shamefully-hoist=true` 破坏 pnpm 严格依赖边界。

## 验收标准

- 根目录存在 `.npmrc`，声明精确的 Electron public hoist 策略。
- `selectProject` 或等价项目选择链路会同步主进程 workspace 绑定，使 `hostState.workspacePath` 与当前项目路径保持一致。
- `defaultResolvePermission` 对 workspace-scoped mutation 的判定以当前有效工作根为准，并对拒绝给出稳定 reason。
- `AgentLoop`、`createRuntime`、Studio host 的权限类型可以携带 `{ allow, reason }`，拒绝工具结果包含真实 reason。
- 相关测试覆盖：
  - Electron hoist 配置存在。
  - 项目选择会绑定 workspace。
  - workspace-scoped 写入在当前项目内被允许，项目外被拒绝且 reason 明确。
  - runtime/core 权限 reason 能进入工具结果摘要。
- 受影响包的测试与类型检查通过，至少执行 `pnpm --filter xnova-studio test`、`pnpm --filter @xnova/core test`、`pnpm --filter @xnova/runtime test`，并根据实际脚本补充 typecheck。

## 任务来源

- 根因报告：`bug-analysis-electron-and-write-file-rejected.md`
