# Minimal Test Baseline Status

## 背景

在正式开始 `Xnova Studio v1` 编码前，需要先确认仓库里的最小验证命令是否可稳定执行。

本次检查时间：2026-04-21

## 执行结果

### 1. `cli/` 下 `pnpm typecheck`

执行目录：

- `D:\visual_ProgrammingSoftware\毕设and简历Projects\Xnova-Code\cli`

结果：

- 失败

直接原因：

- `node_modules` 未安装
- `tsc` 不可用

关键输出：

```text
WARN Local package.json exists, but node_modules missing
'tsc' is not recognized as an internal or external command
```

### 2. `cli/web/` 下 `pnpm build:check`

执行目录：

- `D:\visual_ProgrammingSoftware\毕设and简历Projects\Xnova-Code\cli\web`

结果：

- 失败

直接原因：

- `node_modules` 未安装
- `tsc` 不可用

关键输出：

```text
WARN Local package.json exists, but node_modules missing
'tsc' is not recognized as an internal or external command
```

### 3. `cli/` 下 `pnpm test`

执行目录：

- `D:\visual_ProgrammingSoftware\毕设and简历Projects\Xnova-Code\cli`

结果：

- 失败

直接原因：

- `node_modules` 未安装
- `vitest` 不可用

关键输出：

```text
WARN Local package.json exists, but node_modules missing
'vitest' is not recognized as an internal or external command
```

## 结论

当前最小测试基线**未建立完成**。

这不是“业务代码测试没过”，而是更前置的环境问题：

1. 依赖尚未安装
2. 因而无法判断现有 TypeScript 与 Vitest 是否真实通过

## 建议作为后续 Phase 1 的最前置子任务

建议在正式编码前增加一个明确的 baseline 任务，例如：

- `1-01-test-baseline`

最低目标：

1. 在 `cli/` 与 `cli/web/` 正确安装依赖
2. 让以下命令至少可以执行到“真实编译/测试结果”层，而不是卡在工具缺失：
   - `cli`: `pnpm typecheck`
   - `cli`: `pnpm test`
   - `cli/web`: `pnpm build:check`
3. 若命令执行后仍有代码级错误，再将其作为真正的 baseline 修复项继续拆分
