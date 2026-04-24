# Xnova Code

Xnova Code 当前的产品主线已经收敛为 `packages/* + apps/studio`。

当前唯一有效的宿主与交付面是 **Xnova Studio**：

- `apps/studio/`：唯一主宿主（Electron `main / preload / renderer`）
- `packages/*`：共享 runtime、core 与各领域能力
- `apps/cli/`：保留空位，当前不提供可运行 CLI 产物

根 `cli/` 与根 `studio/` 已正式脱离 `pnpm workspace`，仅作为待手动删除的历史快照保留；后续不再作为脚本入口、构建入口或验收入口。

## 当前目录焦点

- `apps/studio/`：桌面主应用
- `packages/`：共享能力包
- `docs/`：发布说明、实现记录与补充文档
- `.trellis/`：workflow、spec、tasks 与归档资产

## Studio 常用命令

在仓库根目录执行：

```bash
pnpm --dir apps/studio dev
pnpm --dir apps/studio build
pnpm --dir apps/studio preview
pnpm --dir apps/studio pack:dir
pnpm --dir apps/studio pack:win
```

## 根级验证命令

```bash
pnpm typecheck
pnpm test
pnpm build
```

## Windows 打包产物

- `pnpm --dir apps/studio pack:win` 会先执行 `electron-vite build`，再用 `electron-builder` 生成 Windows NSIS 安装包
- 默认输出目录：`apps/studio/release/`
- 目录打包验证可使用 `pnpm --dir apps/studio pack:dir`

## 发布说明

- 当前试用版发布说明：`docs/release/xnova-studio-v1-trial.md`
- 版本号以 `apps/studio/package.json` 为单一来源；README、发布说明与 `CHANGELOG.md` 同步引用该版本
