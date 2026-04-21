# Frontend 开发规范

> 适用范围：当前仓库中的终端 UI（`cli/src/ui/**`）与 Web UI（`cli/web/src/**`），以及未来 `Xnova Studio v1` 的 renderer 交互基线。
>
> 当前状态：基础版 bootstrap 规范。内容来源于现有 UI 代码、Web 页面代码，以及 [`docs/xnova-studio-V1核心设计文档.md`](../../../docs/xnova-studio-V1核心设计文档.md)、[`docs/xnova-studio-v1开发文档.md`](../../../docs/xnova-studio-v1开发文档.md)、[`docs/xnova-stuido-V1工程测试计划.md`](../../../docs/xnova-stuido-V1工程测试计划.md)。

## 当前基线

- 当前前端其实有两套：
  - `cli/src/ui/`：基于 Ink 的终端 UI
  - `cli/web/src/`：基于 React + Vite + Tailwind 的 Web 面板
- 未来 `Xnova Studio v1` 还会引入 `studio/src/renderer/`，但当前尚未落地。
- 因此新增 UI 规范分成两类：
  - **现有事实**：终端 UI 与 Web UI 的当前实现方式
  - **v1 基线**：桌面主体验的页面结构、模式切换、project-aware 信息架构

## 指南索引

| 指南 | 作用 | 状态 |
|---|---|---|
| [directory-structure.md](./directory-structure.md) | 终端 UI / Web UI / 未来 renderer 的目录边界 | 基础版 |
| [component-guidelines.md](./component-guidelines.md) | 组件拆分、容器/展示分层、交互模式 | 基础版 |
| [hook-guidelines.md](./hook-guidelines.md) | 自定义 Hook、订阅清理、副作用边界 | 基础版 |
| [state-management.md](./state-management.md) | 本地状态、单例状态、EventBus、配置同步 | 基础版 |
| [type-safety.md](./type-safety.md) | TS 严格模式、事件联合、外部数据校验 | 基础版 |
| [quality-guidelines.md](./quality-guidelines.md) | 页面状态、TDD、验证命令、设计回归点 | 基础版 |

## Pre-Development Checklist

开始任何 frontend 相关改动前，至少完成以下检查：

1. 确认改动目标：
   - 终端 UI：`cli/src/ui/**`
   - Web 面板：`cli/web/src/**`
   - 未来桌面 renderer：当前先参照本目录规范，新增时再细化
2. 必读 [directory-structure.md](./directory-structure.md) 与 [quality-guidelines.md](./quality-guidelines.md)。
3. 根据改动主题追加阅读：
   - 组件/页面调整：读 [component-guidelines.md](./component-guidelines.md)
   - 自定义 Hook / 事件订阅：读 [hook-guidelines.md](./hook-guidelines.md)
   - 跨端状态同步、Bridge、项目恢复：读 [state-management.md](./state-management.md) 与 [type-safety.md](./type-safety.md)
4. 若改动面向 `Xnova Studio v1` 主体验，还要核对设计文档中的：
   - `Default Main Page`
   - `Left Sidebar v1`
   - `Mode Switch`
   - `SubAgent UX`
5. 任何新增页面都必须先想清楚：
   - loading / empty / error / disabled 四类状态
   - 项目级语义与全局语义是否清晰分离

## Quality Check

提交 frontend 改动前至少确认：

- `cli` 侧终端 UI 相关类型检查通过。
- `cli/web` 侧 `pnpm build:check` 通过。
- 新状态没有造成 `project / session / agent / mode / model` 语义混乱。
- 失败态、空态、禁用态不是靠注释说明，而是界面上真实可见。
- 没有新增第二个“模式切换真入口”；`Standard / XForge` 必须保持单一主切换点。
- 若形成新的稳定交互约束，及时回写本目录 spec。
