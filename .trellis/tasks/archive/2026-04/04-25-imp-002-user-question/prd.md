# IMP-002 用户交互实现

## 背景

`apps/studio/src/main/studio-runtime-service.ts` 中的 `requestUserInput` 当前固定返回 `{ answers: {}, cancelled: true }`，导致 `AskUserQuestionTool` 无法在 Studio 中向用户发起真实提问，运行时交互链路处于失效状态。

## 问题定义

- 当前实现没有把用户提问请求从 Main 推送到 Renderer
- Agent 运行过程中无法等待用户输入
- `text` / `select` / `multiselect` 三种题型都未被支持
- 无超时兜底，无法形成可审计的取消语义

## 目标

通过复用 `IMP-001` 已建立的 IPC push 模式，打通 `main -> preload -> renderer -> preload -> main` 的用户提问闭环：

1. Main 发起 `requestUserInput`
2. 通过 IPC 推送问题到 Renderer
3. Renderer 弹出 `UserQuestionDialog`
4. 用户提交或取消后通过 IPC 回传结果
5. Main 将结果返回给 runtime
6. 60 秒无响应时自动返回 `cancelled`

## 需求范围

### 类型与契约

- 新增 `UserQuestionDialogRequest`
- 新增 `UserQuestionDialogResponse`
- 保持共享 contract 统一落在 `apps/studio/src/shared/studio-bridge-contract.ts`

### IPC 通道

- 新增请求通道：`studio:user-input:request`
- 新增响应通道：`studio:user-input:respond`
- 复用 `IMP-001` 的 push + pending resolver 模式，不新增绕过 preload 的临时通道

### Main 侧

- 修改 `apps/studio/src/main/studio-runtime-service.ts`
- 将 `requestUserInput` 从固定取消改为真实等待 Renderer 响应
- 60 秒超时自动返回 `{ answers: {}, cancelled: true }`

### Renderer 侧

- 新建 `apps/studio/src/renderer/components/UserQuestionDialog.tsx`
- 根据 question.type 渲染：
  - `text`
  - `select`
  - `multiselect`
- 在 `useStudioBridge.ts` 中接收 push 事件并维护 pending question 状态
- 在 `StudioHomePage.tsx` 中挂载对话框并回传用户决策

## 非目标

- 不在本任务中实现权限弹窗
- 不引入新的全局状态容器
- 不改动 AskUserQuestionTool 的业务语义，只修复 Studio 宿主交互链路

## 设计约束

- 必须遵循 `.trellis/spec/backend/runtime-boundary.md`
- renderer 不得直接触达 runtime internals
- preload 只做安全桥与参数校验
- 必须遵循 TDD：先补失败测试，再实现
- 完成后必须更新 `CHANGELOG.md`
- 完成后必须运行 `pnpm typecheck`

## 验收标准

1. `AskUserQuestionTool` 能触发用户提问弹窗
2. 用户填写后答案能正确返回给 Agent
3. 用户取消时返回 `cancelled`
4. `text` / `select` / `multiselect` 三种题型可用
5. 60 秒无响应时自动返回 `cancelled`
6. `pnpm typecheck` 通过
