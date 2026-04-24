# Xnova Code

Xnova Code 是当前仓库的主工程，目标是把 `cli/` 运行时与 `apps/studio/` Electron 桌面主壳逐步收敛到同一套 project-aware 工作流。

当前对外试用的桌面产物名为 **Xnova Studio**。

## 仓库结构

- `apps/studio/`：当前主宿主（Electron `main / preload / renderer`）
- `apps/cli/`：CLI 宿主占位（后续迁移使用）
- `packages/runtime/`：运行时包占位（后续子任务迁入实现）
- `packages/core/`：核心领域包占位（后续子任务迁入实现）
- `cli/`：历史供体与迁移参考（本阶段不作为新功能主落点）
- `studio/`：已冻结的旧桌面目录，脚本已转发到 `apps/studio/`
- `docs/implement/`：Phase 文档与验收标准
- `.trellis/`：任务、spec 与 workflow 资产

## Studio 常用命令

在仓库根目录执行：

```bash
pnpm --dir apps/studio dev
pnpm --dir apps/studio build
pnpm --dir apps/studio preview
pnpm --dir apps/studio pack:dir
pnpm --dir apps/studio pack:win
```

## Windows 打包产物

- `pnpm --dir apps/studio pack:win` 会先执行 `electron-vite build`，再用 `electron-builder` 生成 Windows NSIS 安装包
- 默认输出目录：`apps/studio/release/`
- 目录打包验证可使用 `pnpm --dir apps/studio pack:dir`

## 发布说明

- 当前试用版发布说明：`docs/release/xnova-studio-v1-trial.md`
- 版本号以 `apps/studio/package.json` 为单一来源；README、发布说明与 CHANGELOG 同步引用该版本
