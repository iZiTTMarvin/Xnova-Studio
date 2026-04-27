# Studio Bug 根因分析报告

> 调查时间：2026-04-27
> 调查范围：`electron-vite dev` 启动失败 + `write_file` 反复"rejected by user"
> 涉及层级：Electron 依赖解析 / StudioRuntimeService permission 决策 / AgentLoop permission 透传 / 前端 host state 同步

---

## 1. 症状

### 1.1 终端红字（启动就挂）

```
error during start dev server and electron app:
Error: Electron uninstall
    at getElectronPath (.../electron-vite/dist/chunks/lib-q6ns0vZr.js:155:19)
    at startElectron (.../electron-vite/dist/chunks/lib-q6ns0vZr.js:222:26)
 ELIFECYCLE  Command failed with exit code 1.
```

### 1.2 能启起来那次跑对话的症状

- Agent 接到用户 prompt（如"写一个极具个人风格的赛博朋克个人博客"）
- 输出 "好的，我已完整阅读设计文档。现在开始实现..."
- UI 停在"思考中"很久
- 截图里 `写入文件 SPEC.md` 一行显示红色 **`rejected by user`**
- 用户**根本没看到也没点过权限弹窗**
- 最终表现为"写入失败"+ 长时间无响应

两套症状是两个**独立** bug，但在同一次用户会话里叠加暴露。

---

## 2. Bug 1：`Error: Electron uninstall`

### 2.1 调用链

```
pnpm --filter xnova-studio dev
  → apps/studio/scripts/dev.js
    → chcp 65001  （OK）
    → spawn('electron-vite', ['dev'], { shell: true })
      → apps/studio/node_modules/.bin/electron-vite.CMD  （能找到，能启动）
        → getElectronPath()
          → require.resolve('electron')   ❌ 抛 'Electron uninstall'
```

### 2.2 `getElectronPath` 源码（electron-vite 5.0.0）

```javascript
function getElectronPath() {
    let electronExecPath = process.env.ELECTRON_EXEC_PATH || '';
    if (!electronExecPath) {
        const electronModulePath = path.dirname(_require$2.resolve('electron'));
        const pathFile = path.join(electronModulePath, 'path.txt');
        let executablePath;
        if (fs.existsSync(pathFile)) {
            executablePath = fs.readFileSync(pathFile, 'utf-8');
        }
        if (executablePath) {
            electronExecPath = path.join(electronModulePath, 'dist', executablePath);
            process.env.ELECTRON_EXEC_PATH = electronExecPath;
        } else {
            throw new Error('Electron uninstall');  // ← 就是这里
        }
    }
    return electronExecPath;
}
```

### 2.3 实测文件分布

| 路径 | 状态 |
|---|---|
| `apps/studio/node_modules/electron/dist/electron.exe` | ✅ 存在 |
| `apps/studio/node_modules/electron/path.txt` | ✅ 存在（内容 `electron.exe`）|
| `apps/studio/node_modules/.bin/electron-vite.CMD` | ✅ 存在 |
| `node_modules/electron/` | ❌ **不存在** |
| `node_modules/.pnpm/electron-vite@5.0.0_*/node_modules/electron` | ❌ **不存在** |
| workspace 根 `.npmrc` | ❌ **不存在**（无 hoist 配置） |

### 2.4 根因

pnpm 默认是 **isolated** 模式，`electron-vite` 被装在
`node_modules/.pnpm/electron-vite@5.0.0_*/node_modules/electron-vite/`，它自身邻居 `node_modules` 里只有
`@babel / cac / electron-vite / esbuild / magic-string / picocolors / vite`，**没有 `electron`**。

`electron-vite` 执行 `require.resolve('electron')` 时走 Node 解析算法，从它自己位置开始向上找 `node_modules/electron`：

1. `.pnpm/electron-vite@*/node_modules/electron` → ❌
2. 向上 `.pnpm/node_modules/electron` → ❌
3. 向上 workspace 根 `node_modules/electron` → ❌
4. 抛 `Electron uninstall`

**`electron` 只作为 `apps/studio` 的 devDependency 软链在 `apps/studio/node_modules/electron`，这条路径在 `electron-vite` 的 resolve 可见范围之外。**

### 2.5 为什么过去能跑、现在跑不了

`5983763 feat(studio): 批量修复 P0-P3 稳定性与 UX 问题` 或更早的 `pnpm install` 期间 lockfile 可能发生改变。一旦 `node_modules` 没有被 public-hoist 过（或 hoist-pattern 没写），这个问题永久存在。只是之前环境变量 `ELECTRON_EXEC_PATH` 可能被 shell 缓存，新开终端就复现。

### 2.6 修复方案

**推荐方案 A：在 workspace 根加 `.npmrc`**

```ini
public-hoist-pattern[]=electron
```

然后重装：
```pwsh
pnpm install
```

效果：pnpm 会把 `electron` 提升到根 `node_modules/electron` 软链，`electron-vite` 的 `require.resolve('electron')` 立刻能找到。

**方案 B：在 `apps/studio/scripts/dev.js` 里预注入 `ELECTRON_EXEC_PATH`**

```javascript
const path = require('node:path')
const fs = require('node:fs')
const electronDir = path.resolve(__dirname, '..', 'node_modules', 'electron')
const pathTxt = fs.readFileSync(path.join(electronDir, 'path.txt'), 'utf-8').trim()
process.env.ELECTRON_EXEC_PATH = path.join(electronDir, 'dist', pathTxt)
// 然后再 spawn electron-vite
```

`getElectronPath` 第一行就是读环境变量，有值就跳过 `require.resolve`。但这只救开发模式，CI/打包环境仍需方案 A。

**不推荐**：`shamefully-hoist=true`（太激进，会破坏 pnpm 的严格依赖）。

---

## 3. Bug 2：`write_file` / `edit_file` 被静默 rejected

### 3.1 关键事实

`write_file` 和 `edit_file` **永远不会弹权限对话框**。真正会走 `PermissionDialog` 的只有：

```typescript
// apps/studio/src/main/studio-runtime-service.ts:114-118
const INTERACTIVE_PERMISSION_TOOL_NAMES = new Set([
  'bash',
  'git',
  'kill_shell',
])
```

### 3.2 `defaultResolvePermission` 决策链（全流程）

```typescript
// apps/studio/src/main/studio-runtime-service.ts:484-551
async function defaultResolvePermission(input, hostState, context) {
  // ① workspace 未绑定 → 直接拒
  if (!hostState.workspacePath?.trim()) {
    return { allow: false, reason: 'workspace-not-ready' }
  }

  // ② 安全只读工具 → 直接放行
  if (SAFE_READ_TOOL_NAMES.has(input.toolName)) {
    return { allow: true, remember: true, reason: 'safe-read-tool' }
  }

  // ③ write_file/edit_file 且路径在 workspace 内 → 放行
  if (isWorkspaceScopedMutation(input, hostState.workspacePath)) {
    return { allow: true, remember: true, reason: 'workspace-scoped-tool' }
  }

  // ④ write_file/edit_file 但路径在 workspace 外 → 静默拒（就是这里）
  if (WORKSPACE_PATH_MUTATION_TOOL_NAMES.has(input.toolName)) {
    return { allow: false, reason: 'outside-workspace' }
  }

  // ⑤ todo_write/memory_write 等受信变更工具 → 放行
  if (TRUSTED_MUTATION_TOOL_NAMES.has(input.toolName)) {
    return { allow: true, remember: true, reason: 'workspace-scoped-tool' }
  }

  // ⑥ bash/git/kill_shell → 这才弹窗
  if (INTERACTIVE_PERMISSION_TOOL_NAMES.has(input.toolName)) {
    return context.requestPermissionFromRenderer({...}, memoryKey)
  }

  // ⑦ 未知工具兜底
  return { allow: false, reason: 'unknown-tool' }
}
```

**write_file / edit_file 只可能走 ①、③、④、⑦ 四条分支，没有一条会弹窗。**

一旦落到 ① 或 ④（甚至 ⑦），直接静默 `allow: false`，Agent 收到 `rejected by user` 继续尝试。

### 3.3 `isWorkspaceScopedMutation` 判断基准

```typescript
// studio-runtime-service.ts:354-378
function isPathInsideWorkspace(rawPath, workspacePath) {
  const workspaceRoot = path.resolve(workspacePath)
  const targetPath = path.resolve(workspaceRoot, rawPath)
  const relativePath = path.relative(workspaceRoot, targetPath)
  return relativePath === '' ||
    (!relativePath.startsWith('..') && !path.isAbsolute(relativePath))
}
```

基准是 **`hostState.workspacePath`**，不是 `cwd`，不是 `request.projectPath`。

### 3.4 Studio 状态双轨：`selectedProjectPath` ≠ `hostState.workspacePath`

Studio 前端有两条状态互不同步：

| 状态 | 来源 | 变更时机 |
|---|---|---|
| `hostState.workspacePath` | 主进程 | 只在用户点击**选择 Workspace**（`selectWorkspaceDirectory`）时更新 |
| `selectedProjectPath` | 前端 `useStudioBridge` | 用户在侧边栏点**项目卡片**（`selectProject`）时更新 |

submit 时：
```typescript
// useStudioBridge.ts:1604
const projectPath = selectedProjectPath ?? hostState.workspacePath ?? null
```

runtime-service 那边：
```typescript
// studio-runtime-service.ts:1097-1144
const cwd = resolveRuntimeCwd(request, hostState)   // request.projectPath 优先
const workspaceRoot = hostState.workspacePath ?? cwd
```

**关键：** Agent 实际 `cwd = selectedProjectPath`，但权限判断用的是 `hostState.workspacePath`。两者不一致时，路径不一致，**所有 write/edit 都会命中 ④ outside-workspace 分支**。

### 3.5 完整触发路径（最可能的真实场景）

1. 用户首次启动时选了 workspace `D:\...\Xnova-Code` → `hostState.workspacePath = D:\...\Xnova-Code`
2. 用户在左侧 Project 树里点击 `test` 项目 → `selectedProjectPath = D:\...\test`（workspace 状态**没变**）
3. 用户发送 prompt "写一个赛博朋克博客"
4. Runtime 启动，`cwd = D:\...\test`
5. Agent 读 cwd 后输出 `write_file({ path: "D:\\...\\test\\SPEC.md", content: ... })`（用绝对路径）
6. `isPathInsideWorkspace('D:\\...\\test\\SPEC.md', 'D:\\...\\Xnova-Code')`：
   - `targetPath = D:\\...\\test\\SPEC.md`（绝对路径覆盖 workspaceRoot）
   - `relativePath = ..\\test\\SPEC.md`
   - `startsWith('..')` → **true** → 返回 **false**
7. 命中 ④ → `{ allow: false, reason: 'outside-workspace' }`
8. `agent-loop.ts:599` 硬编码 `result: 'rejected by user'`
9. UI 显示红色 "rejected by user"，用户以为自己点了拒绝

### 3.6 "为什么思考很久才失败"

`tool_result: rejected by user, isError: true` 喂给 LLM 后，模型**以为用户拒绝了本次写入**，于是：

- 重新生成一段"好的，我换一种方式"的 assistant turn
- 再次调用 `write_file`（可能换相对路径、换文件名）
- 再次被静默拒（因为 `hostState.workspacePath` 永远指向错误路径）
- 循环……

每轮要等完整 LLM 响应（数秒到十几秒）。直到：
- `@xnova/core` 的 `RepetitionDetector` 拦截（block 同名工具反复调用）
- `submitTimeoutMs = 60_000` / `firstChunkTimeoutMs = 45_000` 打断
- 模型自己放弃，输出"很抱歉无法写入"之类的 text

前端观察到的"一直思考 → 写入失败"，**本质不是网络/LLM/timeout，而是 Agent 在权限死循环里耗时间**。

### 3.7 用户之前描述的"SPEC.md 已存在但 agent 不知道，卡住"

推测是同一根因的另一面：
- 文件存在，但路径判定 outside-workspace → 被 reject
- Agent 误以为"需要写入但失败"，尝试 `read_file` 确认（`read_file` 是 SAFE_READ，会放行）
- 读到了文件，但 Agent 困惑（因为刚刚 write_file 说 rejected）
- 反复 read/write 循环

---

## 4. Bug 3（加剧因素）：AgentLoop 吞掉 reason

### 4.1 现状

```typescript
// packages/core/src/agent-loop.ts:754-772
async* #checkPermission(tc: ToolCallContent): AsyncGenerator<AgentEvent, boolean> {
    if (this.#shouldStop()) return false
    if (this.#config.isSidechain) return true
    if (!this.#registry.isDangerous(tc.toolName)) return true

    let resolvePermission!: (v: boolean) => void
    const promise = new Promise<boolean>(r => { resolvePermission = r })
    yield {type: 'permission_request', ..., resolve: resolvePermission}
    const allowed = await promise   // ← 只收 boolean
    ...
    return allowed
}
```

返回类型是 `boolean`，bridge 层返回的 `{ allow, reason, remember }` 被压扁。

### 4.2 上游 runtime 侧

```typescript
// packages/runtime/src/create-runtime.ts:440-448
case 'permission_request': {
  const resolution = await bridge.requestPermission({...})
  event.resolve(resolution.allow)   // ← reason 被丢
  break
}
```

### 4.3 结果

`agent-loop.ts:599` 硬编码：

```typescript
content: [{type: 'tool_result', toolCallId: tc.toolCallId, result: 'rejected by user', isError: true}]
```

`resultSummary: 'rejected by user'` 也是硬编码。无论 bridge 真实 reason 是 `workspace-not-ready` / `outside-workspace` / `permission-timeout` / `runtime-disposed` / `unknown-tool` / `permission-ui-unavailable`，UI 和 LLM 看到的都是同一个字符串。

**这让用户无法自我诊断，也让 LLM 无法根据真实原因调整策略。**

---

## 5. 修复优先级

| 优先级 | 修复项 | 影响 | 改动量 |
|---|---|---|---|
| **P0** | 根目录加 `.npmrc` + `public-hoist-pattern[]=electron` | Studio 能启动 | 新增 1 个文件、1 行 |
| **P0** | `selectProject` 时同步更新 `hostState.workspacePath`（或让 `defaultResolvePermission` 也接受 `cwd` 基准） | 消除 outside-workspace 静默拒绝 | ~10 行 |
| **P1** | `#checkPermission` 返回 `{ allow, reason }`、`runtime` 透传、`agent-loop` 写进 tool_result | 用户/LLM 都能看到真实拒绝原因 | ~30 行 |
| **P2** | Permission 被拒时在 UI 上显示 reason 并提供"切换 Workspace"快捷入口 | 用户可自助恢复 | ~50 行 |

### 5.1 P0-2 推荐实现（最干净）

**方案：`selectProject` = `bindWorkspace`**

前端在 `selectProject(projectPath)` 里额外调用一次主进程 API：

```typescript
// 新增 IPC：studio.host.bindWorkspace(projectPath)
// 作用：把 hostState.workspacePath 设置为 projectPath
// 不弹 OS 对话框，不校验目录存在（前端已校验）
```

然后在 `selectProject` 成功后同步触发。这样"切项目 = 切工作区"，用户心智一致。

### 5.2 P1 推荐实现

`#checkPermission` 返回改 `AsyncGenerator<AgentEvent, { allow: boolean; reason?: string }>`：

```typescript
async* #checkPermission(tc): AsyncGenerator<AgentEvent, { allow: boolean; reason?: string }> {
    if (this.#shouldStop()) return { allow: false, reason: 'stopped' }
    if (this.#config.isSidechain) return { allow: true }
    if (!this.#registry.isDangerous(tc.toolName)) return { allow: true }

    let resolvePermission!: (v: { allow: boolean; reason?: string }) => void
    const promise = new Promise<{ allow: boolean; reason?: string }>(r => { resolvePermission = r })
    yield {type: 'permission_request', ..., resolve: resolvePermission}
    const result = await promise
    ...
    return result
}
```

调用侧：

```typescript
const { allow, reason } = yield* this.#checkPermission(tc)
if (!allow) {
    const reasonText = reason ? `permission denied (${reason})` : 'rejected by user'
    history.push({
        role: 'user',
        content: [{type: 'tool_result', toolCallId: tc.toolCallId, result: reasonText, isError: true}]
    })
    yield { type: 'tool_done', ..., resultSummary: reasonText }
    return
}
```

`runtime/src/create-runtime.ts` 对齐：

```typescript
case 'permission_request': {
  const resolution = await bridge.requestPermission({...})
  event.resolve({ allow: resolution.allow, reason: resolution.reason })
  break
}
```

`PermissionRequest.resolve` 类型签名同步更新。

---

## 6. 验证命令

```pwsh
# Bug 1 验证
pnpm install
pnpm --filter xnova-studio dev
# 预期：Studio 正常启动，不再抛 Electron uninstall

# Bug 2 验证
# 1) 选定 workspace A
# 2) 切换到 project B（A ≠ B）
# 3) 发送 prompt 要求 Agent 写文件
# 预期修复前：write_file rejected by user（无弹窗）
# 预期修复后：自动允许（因为 hostState 也切到 B）

# 单测
pnpm --filter xnova-studio test
pnpm --filter @xnova/core test
pnpm --filter @xnova/runtime test
```

---

## 7. 风险与回退

| 变更 | 风险 | 回退 |
|---|---|---|
| `.npmrc public-hoist-pattern` | 无风险，只影响 node_modules 布局 | 删除 `.npmrc` 即可 |
| `selectProject` 同步 workspace | 用户原本"workspace 绑定 ≠ 项目选择"的用法被改；但这本来就是 bug | 加开关 feature flag 临时禁用 |
| `checkPermission` 返回改 | 影响 `packages/core` / `packages/runtime` 公共签名，需要同步改测试 | 保持 boolean overload 兼容签名 |

---

## 8. 结论

**两个 bug 虽然表现在不同层（依赖解析 vs 权限决策），但都是"接口不对齐导致静默失败"的同一类问题。**

- Bug 1：`electron-vite` 对 pnpm isolated 的接口期望（`require.resolve('electron')` 能找到）与实际布局不一致，静默变成 `Electron uninstall`。
- Bug 2：前端 `selectedProjectPath` 和主进程 `hostState.workspacePath` 两条状态独立演化，权限层只看后者，两者分歧就静默拒绝。
- Bug 3：`PermissionResolution` 的 `reason` 字段**在整个权限链路里都存在**，但在 `AgentLoop#checkPermission` 处被压扁成 boolean，**好不容易保留的诊断信息最后一步丢了**。

三者合力，把"路径配置错了"这种**用户可自行修复的小问题**，变成了"思考半天最后莫名写入失败"的**用户无法自行诊断的大问题**。

修复思路一句话概括：**让状态对齐、让 reason 透传、让 UI 能告诉用户到底怎么回事。**
