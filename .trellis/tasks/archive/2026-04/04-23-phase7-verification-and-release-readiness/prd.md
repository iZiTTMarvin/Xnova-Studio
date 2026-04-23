# Phase 7 · Verification and Release Readiness

> **阶段**：Phase 7 Polish and Release · 子任务 F
> **优先级**：P0
> **状态**：planning
> **来源**：[`docs/implement/phase7-polish-and-release.md`](../../../docs/implement/phase7-polish-and-release.md)、[`docs/implement/phase5-project-aware-shell.md`](../../../docs/implement/phase5-project-aware-shell.md)、[`docs/implement/phase6-settings-and-tools.md`](../../../docs/implement/phase6-settings-and-tools.md)

---

## 1. 问题

Phase 7 同时覆盖恢复、错误态、性能与打包，若没有一个独立验证任务，前面几个子任务即使局部完成，也无法证明“v1 已具备对外试用基础”。尤其是重启恢复、配置损坏、路径失效、打包安装这些链路，必须有统一质量门。

## 2. 目标

建立 Phase 7 最终验证门：

- 测试补齐并稳定运行
- typecheck / build / packaging 验证通过
- Electron smoke / 恢复路径验证通过
- 手工 critical path 覆盖冷启动 / 热启动 / 重启恢复
- 只做验证与收口，不再加功能

## 3. 范围

### 包含

- Phase 7 相关测试清单整理
- 缺失回归测试补齐
- typecheck / build / smoke / packaging 验证
- 手工 critical path 清单与 release readiness 判断

### 不包含

- 新功能扩展
- 再次改动范围外文档
- 发布后的运维能力

## 4. 依赖

- **Blocked-by**：所有其他 Phase 7 子任务

## 5. 子任务

- [ ] 整理 Phase 7 测试矩阵
- [ ] 补齐缺失的单元 / 集成 / 回归测试
- [ ] 运行并记录 typecheck / build / packaging 验证
- [ ] 运行并记录 Electron smoke 与恢复验证
- [ ] 手工走完 critical path，并给出 release readiness 结论

## 6. 相关文件

- `docs/implement/phase7-polish-and-release.md`
- `docs/implement/phase5-project-aware-shell.md`
- `docs/implement/phase6-settings-and-tools.md`
- `studio/package.json`
- `studio/src/main/smoke.ts`
- `studio/tests/**`
- `cli/src/**/__tests__/**`
- `README.md`
- `CHANGELOG.md`

## 7. 验收标准

- [ ] Phase 7 相关测试已补齐并稳定运行
- [ ] typecheck 通过
- [ ] build 通过
- [ ] packaging 验证通过
- [ ] Electron smoke 与恢复路径验证通过
- [ ] 手工 critical path 可执行
- [ ] 可以明确判断是否达到“对外试用基础”

## 8. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 只测成功路径 | 必须覆盖配置损坏、路径失效、memory / subagent 边缘状态 |
| 只在开发态通过，不代表打包态可用 | 把 packaging 验证纳入质量门 |
| 验证阶段继续加功能 | 在任务范围中明确禁止扩 scope |

## 9. 测试策略

- 单元 / 集成：
  - 恢复逻辑
  - 错误态展示
  - memory / subagent 边缘状态
  - 打包相关配置校验
- 运行时：
  - `pnpm -C cli test`
  - `pnpm -C cli typecheck`
  - `pnpm -C studio test`
  - `pnpm -C studio typecheck`
  - `pnpm -C studio build`
  - 打包脚本验证
  - Electron smoke
- 手工：
  - Windows 打包安装
  - 首次启动
  - 冷启动 / 热启动 / 重启恢复

## 10. 完成定义

1. Phase 7 的功能和边界都被验证过
2. 最终可以明确说明是否具备对外试用基础
3. 收口阶段不会再继续降级任务或扩 scope
