# Frontend 开发规范

> 适用范围：当前仓库的 Studio renderer 主线（`apps/studio/src/renderer/**`），以及与其直接相关的 shared UI contract（`apps/studio/src/shared/**`）。`cli/src/ui/**` 与 `cli/web/src/**` 仅作为交互对照与迁移参考，不再是前端主实现。
>
> 当前状态：`apps/studio/src/renderer/**` 已成为唯一主前端；主链路围绕 `StudioHomePage + useStudioBridge + shared bridge contract` 收敛。

## 当前基线

- 当前主前端只有一套：`apps/studio/src/renderer/**`
- `apps/studio/src/shared/**` 负责 renderer 与 host 共用的 DTO / 事件类型
- `apps/studio/src/main/**` 与 `src/preload/**` 不是前端实现层，但任何 renderer 能力都必须通过它们暴露的 bridge 契约获取
- `cli/src/ui/**` 与 `cli/web/src/**` 只保留为 legacy 体验参考；如果要复现其中能力，应迁移交互契约，而不是继续把新功能落回旧目录

## 指南索引

| 指南 | 作用 | 状态 |
|---|---|---|
| [directory-structure.md](./directory-structure.md) | renderer / shared / main / preload 的目录边界 | 当前主线 |
| [component-guidelines.md](./component-guidelines.md) | 组件拆分、容器/展示分层、交互模式 | 基础版 |
| [hook-guidelines.md](./hook-guidelines.md) | 自定义 Hook、订阅清理、副作用边界 | 基础版 |
| [state-management.md](./state-management.md) | 本地状态、会话状态、bridge 状态同步 | 基础版 |
| [type-safety.md](./type-safety.md) | TS 严格模式、事件联合、外部数据校验 | 基础版 |
| [quality-guidelines.md](./quality-guidelines.md) | 页面状态、TDD、验证命令、设计回归点 | 基础版 |
| [project-shell-v1.md](./project-shell-v1.md) | Studio 主壳：冷启动、项目侧栏、上下文条、模式切换、聊天主链路 | 当前主线 |

## Pre-Development Checklist

开始任何 frontend 相关改动前，至少完成以下检查：

1. 确认改动目标：
   - 页面 / 壳层：`apps/studio/src/renderer/pages/**`
   - 组件：`apps/studio/src/renderer/components/**`
   - Bridge Hook / 订阅：`apps/studio/src/renderer/hooks/**`
   - 纯函数 / 恢复逻辑：`apps/studio/src/renderer/utils/**`
   - 共享 contract：`apps/studio/src/shared/**`
2. 必读 [directory-structure.md](./directory-structure.md) 与 [quality-guidelines.md](./quality-guidelines.md)。
3. 根据改动主题追加阅读：
   - 组件/页面调整：读 [component-guidelines.md](./component-guidelines.md)
   - 自定义 Hook / runtime 事件订阅：读 [hook-guidelines.md](./hook-guidelines.md)
   - 跨层状态同步、启动恢复、会话偏好恢复：读 [state-management.md](./state-management.md) 与 [type-safety.md](./type-safety.md)
   - Studio 主壳、输入区、模式切换、项目/聊天块、会话时间线、模型选择器：加读 [project-shell-v1.md](./project-shell-v1.md)
4. 任何 renderer 改动都先确认：
   - loading / empty / error / disabled 是否都真实可见
   - 是否需要同步更新 `apps/studio/src/shared/studio-bridge-contract.ts`
   - 是否会影响 `useStudioBridge` 的恢复逻辑、runtime 门禁或 live conversation 状态
5. 不要把“和 CLI 一样能用”的需求理解成继续维护旧 `cli/web`；Studio 才是主交付面。

## Quality Check

提交 frontend 改动前至少确认：

- `pnpm --filter xnova-studio typecheck` 通过。
- 涉及 renderer 逻辑、交互恢复、bridge 订阅时，`pnpm --filter xnova-studio test` 通过。
- 涉及构建、alias、native bridge、shared contract 时，额外验证 `pnpm --filter xnova-studio build`。
- 新状态没有造成 `project / session / agent / mode / model / runtime-ready` 语义混乱。
- 失败态、空态、禁用态不是靠注释说明，而是界面上真实可见。
- 没有新增第二个“模式切换真入口”；`Standard / XForge` 必须保持顶部唯一入口。
- 若形成新的稳定交互约束，及时回写本目录 spec。

## 专项 Spec 触发器

下列改动默认必须读取对应专项 spec：

- `project-shell-v1.md`
  - 改动 `apps/studio/src/renderer/pages/StudioHomePage.tsx`
  - 改动 `ProjectShellSidebar`、`ModeSwitch`、`ContextBar`
  - 改动 `ConversationTimeline`、`SessionModelPicker`
  - 改动 `useStudioBridge`、`startup-route.ts`、`work-context.ts`
  - 改动冷启动恢复、项目/会话恢复、submit 主链路、runtime-not-ready 门禁
  - 改动 `apps/studio/src/shared/studio-bridge-contract.ts` 中与壳层相关的 contract
