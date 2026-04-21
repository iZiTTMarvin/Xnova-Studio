# Xnova Studio v1 Implementation Breakdown

## 目的

本目录用于把 `docs/xnova-studio-v1开发文档.md` 进一步拆成可执行的阶段任务文档。

适用场景：

- 分阶段推进开发
- 把某一个阶段单独交给 Agent / Claude / Codex 审核
- 做 issue 拆分、迭代排期、并行分工

## 文档清单

1. [Phase 1 - Runtime Foundation](D:/visual_ProgrammingSoftware/毕设and简历Projects/Xnova-Code/docs/implement/phase1-runtime-foundation.md)
2. [Phase 2 - Config Migration](D:/visual_ProgrammingSoftware/毕设and简历Projects/Xnova-Code/docs/implement/phase2-config-migration.md)
3. [Phase 3 - Agent System](D:/visual_ProgrammingSoftware/毕设and简历Projects/Xnova-Code/docs/implement/phase3-agent-system.md)
4. [Phase 4 - Electron Host](D:/visual_ProgrammingSoftware/毕设and简历Projects/Xnova-Code/docs/implement/phase4-electron-host.md)
5. [Phase 5 - Project-aware Shell](D:/visual_ProgrammingSoftware/毕设and简历Projects/Xnova-Code/docs/implement/phase5-project-aware-shell.md)
6. [Phase 6 - Settings and Tools](D:/visual_ProgrammingSoftware/毕设and简历Projects/Xnova-Code/docs/implement/phase6-settings-and-tools.md)
7. [Phase 7 - Polish and Release](D:/visual_ProgrammingSoftware/毕设and简历Projects/Xnova-Code/docs/implement/phase7-polish-and-release.md)

## 推荐阅读顺序

1. 先读 [开发文档](D:/visual_ProgrammingSoftware/毕设and简历Projects/Xnova-Code/docs/xnova-studio-v1开发文档.md)
2. 再读本目录的 `README`
3. 然后按 `Phase 1 -> Phase 7` 顺序逐份看

## 阶段依赖

```text
Phase 1 -> Phase 2 -> Phase 3
    └──────────────┬──────────────┘
                   v
                Phase 4
                   v
                Phase 5
                   v
                Phase 6
                   v
                Phase 7
```

补充说明：

- `Phase 1` 是整个项目的地基，必须优先完成
- `Phase 2` 和 `Phase 3` 虽然都依赖 `Phase 1`，但具体实现可局部并行
- `Phase 4` 必须消费已经相对稳定的 runtime 边界
- `Phase 5` 是第一个真正把产品形态拉起来的阶段
- `Phase 6` 偏向把现有资产纳入桌面主体验
- `Phase 7` 负责把“能跑”变成“能长期用”

## 审批建议

如果你要做交叉审批，建议按下面顺序发给 Claude：

1. 核心设计文档
2. 开发文档
3. `docs/implement/README.md`
4. 当前要审的具体 phase 文档

## 使用建议

每个 phase 文档都可以直接变成：

- Issue Epic
- Sprint 目标
- PR 范围说明
- Agent 子任务输入文档

建议每完成一个 phase，就回写：

- 完成情况
- 实际偏差
- 新发现风险
- 需要追加到下一 phase 的任务

