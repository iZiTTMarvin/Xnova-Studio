# Xnova Code

Xnova Code 是当前仓库的主工程，目标是把 `cli/` 运行时与 `studio/` Electron 桌面主壳逐步收敛到同一套 project-aware 工作流。

当前对外试用的桌面产物名为 **Xnova Studio**。

## 仓库结构

- `cli/`：共享 runtime、配置、持久化、Memory、Agent、MCP 与原有命令行主链路
- `studio/`：Electron `main / preload / renderer` 主壳与打包入口
- `docs/implement/`：Phase 文档与验收标准
- `.trellis/`：任务、spec 与 workflow 资产

## Studio 常用命令

在仓库根目录执行：

```bash
pnpm --dir studio dev
pnpm --dir studio build
pnpm --dir studio preview
pnpm --dir studio pack:dir
pnpm --dir studio pack:win
```

## Windows 打包产物

- `pnpm --dir studio pack:win` 会先执行 `electron-vite build`，再用 `electron-builder` 生成 Windows NSIS 安装包
- 默认输出目录：`studio/release/`
- 目录打包验证可使用 `pnpm --dir studio pack:dir`

## 发布说明

- 当前试用版发布说明：`docs/release/xnova-studio-v1-trial.md`
- 版本号以 `studio/package.json` 为单一来源；README、发布说明与 CHANGELOG 同步引用该版本
