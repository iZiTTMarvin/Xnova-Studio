// src/tools/bash.ts
import { spawn } from 'node:child_process'
import { execa } from 'execa'
import { resolveShell } from '@platform/shell-resolver.js'
import { detectPlatform } from '@platform/detector.js'
import { getSnapshotPath } from '@platform/shell-snapshot.js'
import { registerProcess, unregisterProcess, appendOutput, markDone } from './process-tracker.js'
import type { Tool, ToolContext, ToolResult } from './types.js'

/** 默认超时 120 秒 */
const DEFAULT_TIMEOUT_MS = 120_000
/** 最大超时 600 秒（10 分钟） */
const MAX_TIMEOUT_MS = 600_000
/** Bash 工具策略拦截使用的退出码，不代表真实 shell 进程退出。 */
const POLICY_BLOCK_EXIT_CODE = -2

export interface BashToolPolicyHint {
  code:
    | 'windows-use-cwd'
    | 'windows-use-read-file'
    | 'windows-use-glob'
    | 'windows-use-write-file'
    | 'windows-use-edit-file'
    | 'windows-use-grep'
  suggestedTool: string
  message: string
  reason: string
}

export class BashTool implements Tool {
  readonly name = 'bash'
  readonly dangerous = true
  readonly description = [
    '执行 Shell 命令并返回 stdout + stderr 输出。',
    '',
    'bash 仅限于系统命令（git、npm/pnpm、构建、测试、安装依赖、进程管理等），禁止用于文件操作。',
    '',
    '禁止使用 bash 执行以下操作：',
    '• cat/head/tail（用 read_file）',
    '• echo >/>> 和重定向（用 write_file）',
    '• sed/awk（用 edit_file）',
    '• grep 命令（用 grep 工具）',
    '• find/ls（用 glob 工具）',
    '',
    '注意事项：',
    '• 长时间运行的命令（如 dev server）请设置 run_in_background=true，之后用 task_output 查看输出',
    '• 超时默认 120 秒，最大 600 秒（10 分钟），超时后进程会被终止',
    '• 避免执行破坏性命令（rm -rf /、git push --force 等），除非用户明确要求',
  ].join('\n')
  readonly parameters = {
    type: 'object',
    properties: {
      command: { type: 'string', description: '要执行的 shell 命令' },
      cwd: { type: 'string', description: '工作目录（默认当前目录）' },
      timeout: {
        type: 'number',
        description: '超时毫秒数（默认 120000，上限 600000）',
      },
      run_in_background: {
        type: 'boolean',
        description: '后台运行，立即返回 PID。用 task_output 读取输出，用 kill_shell 终止进程',
      },
    },
    required: ['command'],
  }

  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const command = String(args['command'] ?? '')
    if (!command.trim()) {
      return { success: false, output: '', error: '命令不能为空' }
    }

    const cwd = String(args['cwd'] ?? ctx.cwd)
    const shell = resolveShell()
    const runInBackground = args['run_in_background'] === true
    const platform = detectPlatform()
    const policyHint = platform.isWindows ? getWindowsBashToolPolicyHint(command) : null

    /**
     * Windows 下最常见的卡点不是 shell 真失败，而是模型用 shell 去做本该由结构化工具
     * 负责的文件操作。这里直接失败并返回可执行 hint，让 AgentLoop 下一轮能改用正确工具。
     */
    if (policyHint) {
      return buildPolicyFailureResult(command, policyHint)
    }

    // 解析 timeout：无效值 / 负数 / 0 → 默认值，超过上限 → 截断
    const rawTimeout = Number(args['timeout'])
    const timeout =
      !Number.isFinite(rawTimeout) || rawTimeout <= 0
        ? DEFAULT_TIMEOUT_MS
        : Math.min(rawTimeout, MAX_TIMEOUT_MS)

    // ---- 后台运行模式 ----
    if (runInBackground) {
      return this.#runBackground(shell, command, cwd)
    }

    // ---- 前台运行（等待结束）----
    // 有快照时 source 快照并跳过 login shell（-l），省去 .bashrc 完整初始化
    const snapshotPath = getSnapshotPath()
    const finalCommand = snapshotPath
      ? `source '${snapshotPath}' 2>/dev/null || true && ${command}`
      : command
    const shellArgs = snapshotPath
      ? ['-c', finalCommand]           // 有快照：不传 -l
      : [...shell.args, finalCommand]  // 无快照：保持原行为

    // 用 child_process.spawn 替代 execa（减少模块开销），手动实现 timeout
    return new Promise<ToolResult>((resolve) => {
      let timedOut = false
      let aborted = false
      let settled = false
      let stdout = ''
      let stderr = ''

      const child = spawn(shell.path, shellArgs, {
        cwd,
        stdio: 'pipe',
        windowsHide: true,
      })

      const finish = (result: ToolResult) => {
        if (settled) return
        settled = true
        if (ctx.signal) {
          ctx.signal.removeEventListener('abort', abortHandler)
        }
        resolve(result)
      }

      const abortHandler = () => {
        aborted = true
        child.kill('SIGTERM')
        setTimeout(() => { try { child.kill('SIGKILL') } catch { /* 进程可能已退出 */ } }, 500)
      }

      if (ctx.signal?.aborted) {
        abortHandler()
      } else {
        ctx.signal?.addEventListener('abort', abortHandler, { once: true })
      }

      // 手动 timeout：到时间 kill 进程
      const timer = setTimeout(() => {
        timedOut = true
        child.kill('SIGTERM')
        // 给 SIGTERM 500ms 宽限期，之后强制 SIGKILL
        setTimeout(() => { try { child.kill('SIGKILL') } catch { /* SIGTERM 后进程已退出，SIGKILL 抛 ESRCH 是预期行为 */ } }, 500)
      }, timeout)

      child.stdout?.on('data', (d: Buffer) => { stdout += d.toString() })
      child.stderr?.on('data', (d: Buffer) => { stderr += d.toString() })

      child.on('close', (code) => {
        clearTimeout(timer)
        const output = [stdout, stderr].filter(Boolean).join('\n')
        // 结构化 meta：让 LLM 精确感知命令执行状态
        const meta = {
          type: 'bash' as const,
          exitCode: code ?? -1,
          command: command.length > 200 ? command.slice(0, 200) + '...' : command,
          timedOut,
        }

        if (aborted) {
          finish({ success: false, output, error: '命令已中断', meta })
        } else if (timedOut) {
          finish({ success: false, output, error: `Command timed out after ${timeout}ms`, meta })
        } else if (code === 0) {
          finish({ success: true, output: output || '(no output)', meta })
        } else {
          finish({ success: false, output: output || '', error: `Exit code ${code}`, meta })
        }
      })

      child.on('error', (err) => {
        clearTimeout(timer)
        finish({ success: false, output: '', error: err.message })
      })
    })
  }

  /** 后台模式：启动进程后立即 unref 并返回 PID */
  #runBackground(
    shell: { path: string; args: string[] },
    command: string,
    cwd: string,
  ): ToolResult {
    try {
      const child = execa(shell.path, [...shell.args, command], {
        cwd,
        detached: true,
        stdio: 'pipe',  // 管道模式，捕获输出供 task_output 读取
      })
      // 分离子进程，不阻塞父进程退出
      child.unref()

      // 关键：execa 返回的是 Promise-like 对象，后台进程退出时如果 exitCode != 0
      // 会产生 rejected promise。不捕获会导致 unhandled rejection 崩溃主进程。
      child.catch(() => { /* 后台进程退出错误静默忽略 */ })

      const pid = child.pid
      if (pid != null) {
        // 注册到进程追踪器，供 kill_shell / task_output 工具使用
        registerProcess(pid, command, cwd)

        // 捕获 stdout / stderr 输出到 tracker 缓冲区
        child.stdout?.on('data', (data: Buffer) => appendOutput(pid, data.toString()))
        child.stderr?.on('data', (data: Buffer) => appendOutput(pid, data.toString()))

        // unref stdio 流，不阻塞父进程退出（仅 Socket 类型有 unref）
        if (child.stdout && 'unref' in child.stdout) (child.stdout as any).unref()
        if (child.stderr && 'unref' in child.stderr) (child.stderr as any).unref()

        // 进程退出时记录退出码，延迟清理（给 task_output 留读取窗口）
        child.on('exit', (code) => {
          markDone(pid, code)
          // 30 秒后自动清理，避免内存泄漏
          setTimeout(() => unregisterProcess(pid), 30_000).unref()
        })
      }
      const killHint = buildKillHint(pid)
      return {
        success: true,
        output: `Background process started (pid: ${pid}). Use task_output tool to read output, or kill_shell to stop it.\n${killHint}`,
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      return { success: false, output: '', error: message }
    }
  }
}

/**
 * 识别 Windows/PowerShell 下容易导致黑盒失败的 shell 文件操作。
 *
 * bash 仍然允许 git、pnpm、测试、构建、进程管理等系统命令；这里只拦截项目已经有
 * 专用工具覆盖的文件读写、搜索、列目录和 cwd 切换写法。
 */
export function getWindowsBashToolPolicyHint(command: string): BashToolPolicyHint | null {
  const normalized = unwrapShellLauncher(command.trim())
  if (!normalized) return null

  if (usesInlineCd(normalized)) {
    return {
      code: 'windows-use-cwd',
      suggestedTool: 'bash.cwd',
      message: '不要用 cd 或 cd && command 改工作目录，请把目标目录传给 bash 工具的 cwd 参数。',
      reason: 'Windows / PowerShell 的目录切换只影响当前 shell 进程，容易让后续工具仍在旧目录执行。',
    }
  }

  if (/^\s*(?:cat|type|get-content|gc|head|tail)\b/i.test(normalized)) {
    return {
      code: 'windows-use-read-file',
      suggestedTool: 'read_file',
      message: '不要用 bash 读文件，请改用 read_file 工具并传 path。',
      reason: 'read_file 会走统一的 workspace、截断和摘要策略，比 shell 读文件更安全可控。',
    }
  }

  if (/^\s*(?:dir|ls|get-childitem|gci)\b/i.test(normalized)) {
    return {
      code: 'windows-use-glob',
      suggestedTool: 'glob',
      message: '不要用 bash 列目录，请改用 glob 工具并传 pattern。',
      reason: 'glob 会按项目忽略规则匹配文件，避免 Windows shell 别名和路径语义差异。',
    }
  }

  if (/^\s*find\b/i.test(normalized)) {
    return {
      code: 'windows-use-glob',
      suggestedTool: 'glob',
      message: '不要用 bash 查找文件，请改用 glob 工具；需要搜索文件内容时使用 grep 工具。',
      reason: 'Windows 下 find 语义容易与 Unix find 混淆，结构化工具能返回稳定结果。',
    }
  }

  if (usesShellWrite(normalized)) {
    return {
      code: 'windows-use-write-file',
      suggestedTool: 'write_file',
      message: '不要用 bash 写入或创建文件，请改用 write_file；修改已有文件时用 edit_file。',
      reason: 'write_file/edit_file 会做 workspace 边界检查和结构化结果上报，避免重定向写入失败后不可见。',
    }
  }

  if (/^\s*(?:sed|awk)\b/i.test(normalized)) {
    return {
      code: 'windows-use-edit-file',
      suggestedTool: 'edit_file',
      message: '不要用 bash 编辑文件，请改用 edit_file 工具并提供 old_str/new_str。',
      reason: 'edit_file 能返回明确 diff 和失败原因，避免 sed/awk 在 Windows shell 中行为不一致。',
    }
  }

  if (/^\s*(?:grep|findstr|select-string)\b/i.test(normalized)) {
    return {
      code: 'windows-use-grep',
      suggestedTool: 'grep',
      message: '不要用 bash 搜索文件内容，请改用 grep 工具并传 pattern。',
      reason: 'grep 工具会按 workspace 和忽略规则搜索，并给 UI 返回稳定摘要。',
    }
  }

  return null
}

function unwrapShellLauncher(command: string): string {
  const trimmed = command.trim()
  const shellLauncher = /^(?:powershell(?:\.exe)?|pwsh(?:\.exe)?|cmd(?:\.exe)?)\s+(?:-NoProfile\s+)?(?:-Command|-c|\/c)\s+(.+)$/i.exec(trimmed)
  if (!shellLauncher?.[1]) return trimmed
  return stripOuterQuotes(shellLauncher[1].trim())
}

function stripOuterQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1).trim()
  }
  return value
}

function usesInlineCd(command: string): boolean {
  return /^\s*(?:cd|chdir|set-location|sl)\b[\s\S]*(?:&&|;)/i.test(command)
}

function usesShellWrite(command: string): boolean {
  if (/^\s*(?:set-content|out-file|add-content)\b/i.test(command)) return true
  if (/^\s*new-item\b[\s\S]*\b(?:-itemtype|-type)\s+file\b/i.test(command)) return true
  return /^\s*(?:echo|printf)\b[\s\S]*(?:^|[^>])(?:>{1,2})(?![>&])/i.test(command)
}

function formatPolicyHint(hint: BashToolPolicyHint): string {
  return [
    `[工具策略提示] ${hint.message}`,
    `建议工具: ${hint.suggestedTool}`,
    `原因: ${hint.reason}`,
  ].join('\n')
}

function buildPolicyFailureResult(command: string, hint: BashToolPolicyHint): ToolResult {
  return {
    success: false,
    output: formatPolicyHint(hint),
    error: formatPolicyHint(hint),
    meta: {
      type: 'bash',
      exitCode: POLICY_BLOCK_EXIT_CODE,
      command: command.length > 200 ? command.slice(0, 200) + '...' : command,
      timedOut: false,
      policyCode: hint.code,
      suggestedTool: hint.suggestedTool,
      hint: hint.message,
    },
  }
}

/**
 * 根据平台生成终止后台进程的提示命令。
 *
 * Windows + Git Bash 环境下 `kill PID` 对 Windows 原生进程不可靠，
 * 而 `taskkill /F /PID <pid>` 的 `/F` 会被 MSYS 路径转换解释为 Unix 路径。
 * 解决方案：使用双斜杠 `//F` 绕过 MSYS 路径转换。
 */
function buildKillHint(pid: number | undefined): string {
  if (pid == null) return ''
  const { isWindows } = detectPlatform()
  if (isWindows) {
    // 双斜杠绕过 MSYS 的 Unix 路径自动转换
    return `Use "taskkill //F //PID ${pid}" to stop it.`
  }
  return `Use "kill ${pid}" to stop it.`
}
