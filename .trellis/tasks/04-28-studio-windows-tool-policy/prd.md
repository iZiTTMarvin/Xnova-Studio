# 子任务: Windows 工具策略与 Shell 失败提示

## Goal

降低 Windows 环境下模型误用 shell 命令导致的失败和黑盒感，尤其是 `cat/dir/type/cd &&` 等命令在 PowerShell/Windows 中行为不一致的问题。该任务优先通过提示词策略、工具错误提示和结构化错误改善体验。

## What I Already Know

- 当前项目运行环境主要是 Windows。
- `bash`、`git`、`kill_shell` 属于交互权限工具。
- 审计文档指出模型仍可能在 Windows 下用 shell 读取文件或试图用 `cd` 改长期 cwd。
- 项目已有 `read_file/write_file/edit_file/glob/grep` 等结构化工具，优先级应高于 shell 读写。

## Scope

- `packages/core/src/bootstrap.ts` 中 system prompt / behavior guidance。
- `packages/tools/**` 中 shell/bash/git 工具错误提示。
- `apps/studio/src/renderer/utils/tool-event-summary.ts` 如需要展示更友好的错误摘要。
- 相关测试。

## Requirements

- Windows 下追加工具策略提示：
  - 读文件优先用 `read_file`。
  - 搜索优先用 `grep/glob`。
  - 写文件优先用 `write_file/edit_file`。
  - 不要用 shell 的 `cat/type/Get-Content` 读大文件。
  - 不要用 `cd` 试图改变长期 cwd；应使用工具参数中的 cwd。
  - PowerShell 命令需要显式说明 shell 语义。
- shell 工具遇到常见误用时返回结构化 hint：
  - `cat`/`type` 读取文件失败：建议 `read_file`。
  - `dir`/`ls` 列目录失败：建议 `glob`。
  - `cd && command`：建议传入 cwd 参数。
- 错误摘要展示：
  - 用户能看到“命令失败原因”和“建议改用哪个工具”。
- 不影响非 Windows 平台提示词。

## Acceptance Criteria

- [ ] Windows 平台 system prompt 包含明确工具策略。
- [ ] 常见 shell 误用返回结构化 hint。
- [ ] UI 工具错误摘要能显示建议。
- [ ] 非 Windows 平台不注入 Windows 专属策略。

## Tests Required

- system prompt 快照测试：
  - Windows 注入。
  - 非 Windows 不注入。
- bash/shell 工具单元测试：
  - `cat/type/dir/cd &&` hint。
- renderer summary 测试：
  - resultSummary 中的 hint 可读。

## Out of Scope

- 不禁用 shell。
- 不改变权限模型。
- 不重写工具执行引擎。

## Technical Notes

- 这是低优先级质量任务，但对 Windows 用户体验有直接帮助。
- 应保持提示短而明确，避免污染模型主任务能力。
