# Bootstrap Spec Baseline Research

## 目的

为 `.trellis/spec/` 建立第一版可执行基础规范，服务于后续 `Xnova Studio v1` 开发。

本研究不是为了定义最终架构，而是为了回答：

1. 当前仓库已经有哪些真实代码模式？
2. 在需求还未完全落地前，哪些规范可以先作为基础版固化？
3. 哪些内容必须标记为“v1 基线”，而不是伪装成现状？

## 结论

### 1. 仓库并非空白，`cli/` 已经形成真实代码骨架

当前 `cli/` 已有以下稳定目录：

- `src/core/`
- `src/config/`
- `src/persistence/`
- `src/providers/`
- `src/memory/`
- `src/tools/`
- `src/hooks/`
- `src/server/`
- `src/ui/`
- `web/src/`

因此第一版 spec 不应只写“理想做法”，而应先把这些既有边界记录下来。

### 2. 后端当前事实是“单仓 + 单 CLI 主实现”，不是已完成的 shared runtime

从以下文件可确认：

- `cli/src/core/bootstrap.ts`
- `cli/src/config/config-manager.ts`
- `cli/src/persistence/db.ts`
- `cli/src/providers/registry.ts`

当前 reality：

- 共享运行时还未真正拆成 `runtime/` 与 `host/cli/`
- 配置主事实源仍是 `~/.xnovacode/config.json`
- 数据持久化已采用 `libsql + SQLite + JSONL`
- Memory / MCP / Hook / Plugin / Agent 均已有初步实现

因此 backend spec 采用“双层表达”：

- 现有事实
- v1 基线

### 3. 前端当前事实是“双宿主”

从以下文件可确认：

- `cli/src/ui/App.tsx`
- `cli/src/ui/useChat.ts`
- `cli/web/src/pages/SettingsPage.tsx`
- `cli/web/src/components/Sidebar.tsx`
- `cli/web/src/hooks/useTheme.ts`

当前 reality：

- 终端 UI 使用 Ink
- Web UI 使用 React + Vite + Tailwind
- `studio/renderer` 尚未存在

因此 frontend spec 必须明确：

- 当前修改落在哪个宿主
- 未来桌面 renderer 尚未落地时，只能作为设计基线记录，不能伪装成已有代码

### 4. 需求文档已经足够支撑“基础版 spec”

主要来源：

- `docs/xnova-studio-V1核心设计文档.md`
- `docs/xnova-studio-v1开发文档.md`
- `docs/xnova-stuido-V1工程测试计划.md`

这些文档已锁定的关键约束包括：

- `shared runtime + dual host`
- 默认首页是空白聊天页
- 左侧一级导航收敛
- `Standard / XForge` 单一主切换入口
- `project > user > builtin` 配置优先级
- `agent.max_parallel_subagents = 5`
- 高风险链路必须 TDD

因此在“需求还没完全开发”阶段，仍然可以先把这些约束固化为基础版 spec。

## 落地策略

本次 spec 编写采用以下策略：

1. `index.md` 增加 `Pre-Development Checklist` 与 `Quality Check`
2. backend/frontend 各主题文件补齐基础版规范
3. 对尚未实现的结构，明确标注为 `v1 基线`
4. 对已存在但不理想的写法，记录为“当前事实 + 后续不要继续扩散”
5. 增加 bootstrap 验收测试，防止 spec 重新退化为占位模板

## 仍待后续补充的 spec

后续进入真实开发后，建议继续新增或细化：

- runtime boundary 专项 spec
- config TOML migration 专项 spec
- agent schema v1 专项 spec
- bridge / IPC / event contract 专项 spec
- project-aware restore 专项 spec

## 本次变更产物

- `.trellis/spec/backend/*.md`
- `.trellis/spec/frontend/*.md`
- `.trellis/scripts/tests/test_spec_bootstrap.py`

这些内容现在足以支持：

- `trellis-before-dev` 读取真实规范
- `trellis-check` 基于基础规则做最低限度校验
- 后续开发阶段在此基础上逐步细化，而不是每次从占位模板重写
