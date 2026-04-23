# Phase 7 · Packaging and Release Prep

> **阶段**：Phase 7 Polish and Release · 子任务 E
> **优先级**：P0
> **状态**：planning
> **来源**：[`docs/implement/phase7-polish-and-release.md`](../../../docs/implement/phase7-polish-and-release.md) §D、[`docs/implement/phase4-electron-host.md`](../../../docs/implement/phase4-electron-host.md)

---

## 1. 问题

当前 `studio` 只有开发态与构建态，已经能跑 Electron，但还没有正式的打包脚本、Windows 安装包路径、版本信息整理和对外文档同步，因此 Phase 7 还不能称为真正的 release prep。

## 2. 目标

完成 Phase 7 的发布准备：

- Electron 打包脚本
- Windows 安装包产物链路
- 版本信息整理
- README / CHANGELOG / 发布说明同步

同时保持边界清晰：这是“能试用、能打包”的准备，不是扩产品功能。

## 3. 范围

### 包含

- `studio` 的打包方案确定与脚本落地
- Windows 安装包或可安装产物链路
- 版本号、产物命名、基础发布说明整理
- README / CHANGELOG / 文档同步

### 不包含

- 新业务功能
- 自动更新系统
- 多平台高级发布矩阵

## 4. 依赖

- **Blocked-by**：`04-23-phase7-recoverability-and-preference-restore`、`04-23-phase7-runtime-workspace-and-config-error-states`
- **Blocks**：`04-23-phase7-verification-and-release-readiness`

## 5. 子任务

- [ ] 确定 `studio` 的打包工具与配置
- [ ] 增加 Windows 打包脚本与产物输出
- [ ] 整理版本信息与产物命名
- [ ] 同步 README / CHANGELOG / 发布说明
- [ ] 补齐最小打包验证路径

## 6. 相关文件

- `studio/package.json`
- `studio/electron.vite.config.ts`
- `studio/src/main/index.ts`
- `studio/src/main/window.ts`
- `README.md`
- `CHANGELOG.md`
- `docs/implement/phase7-polish-and-release.md`

## 7. 验收标准

- [ ] 可以从仓库生成 Windows 可安装或可分发产物
- [ ] 打包脚本与开发/构建脚本职责清晰
- [ ] 版本信息有明确来源与同步方式
- [ ] README / CHANGELOG / 发布说明与当前事实一致
- [ ] 没有借打包之名改动 Phase 7 之外的产品行为

## 8. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 打包配置侵入开发主链路 | 将打包脚本与运行脚本职责分离 |
| 为了产物可出而修改现有运行边界 | 仍遵守 main / preload / renderer 既有边界 |
| 文档同步滞后 | 把 README / CHANGELOG / 发布说明纳入同一任务验收 |

## 9. 测试策略

- 自动验证：
  - 打包脚本能执行
  - 构建产物结构符合预期
- 手工验证：
  - Windows 安装或运行产物
  - 首次启动
  - 基础 workspace 打开链路

## 10. 完成定义

1. `studio` 已具备可打包、可试用的分发基础
2. 文档与版本信息能支持对外试用
3. 打包准备不会反向破坏开发态和主壳边界
