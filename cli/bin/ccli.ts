// bin/ccli.ts

/**
 * xnova 入口 — 根据参数判断运行模式：
 *
 * 1. 非交互模式（Pipe Mode）：有 prompt 时直接执行，纯文本输出，执行完退出
 *    - xnova "问题"
 *    - xnova -p "问题"
 *    - cat file | xnova "分析一下"
 *
 * 2. 交互模式（REPL）：无 prompt 时启动 Ink 界面
 *    - xnova
 *    - xnova --resume
 *    - xnova --resume <sessionId>
 */

// ═══ 快速退出路径 ═══
// APP_VERSION 极轻量（只导出一个字符串常量），可安全静态 import。
// 重模块（pipe-runner / initializer / workspace-trust）延迟到参数解析之后按需 dynamic import，
// 使 --help / --version 跳过 2.4s 的模块加载开销。
import { APP_VERSION } from '../src/version.js'

// ═══ --help / -h ═══

function printHelp(): void {
  const help = `
  ╔══════════════════════════════════════════════════════════════╗
  ║                    XnovaCode CLI v${APP_VERSION}                    ║
  ║          开源多模型 AI 编程助手 / Multi-Model AI Agent          ║
  ╚══════════════════════════════════════════════════════════════╝

  用法 / Usage:
    xnova                              交互模式 / Interactive REPL
    xnova "你的问题"                    管道模式 / Pipe mode (single query)
    xnova --web                        启动 Web Dashboard / Start Web Dashboard

  选项 / Options:

    通用 / General:
      -h, --help                       显示帮助信息 / Show this help message
      -V, --version                    显示版本号 / Show version number

    管道模式 / Pipe Mode:
      -p, --prompt <text>              指定问题 / Specify prompt text
      -m, --model <name>               指定模型 / Specify model name
          --provider <name>            指定供应商 / Specify provider name
      -y, --yes                        自动批准工具调用 / Auto-approve all tool calls
          --no-tools                   禁用工具，纯对话 / Disable tools, chat only
          --json                       JSON 结构化输出 / Structured JSON output
      -v, --verbose                    详细输出到 stderr / Verbose output to stderr

    交互模式 / Interactive Mode:
          --resume [sessionId]         恢复会话 / Resume last or specific session
          --web                        启动 Web Dashboard / Start Web Dashboard (port 9800)

  示例 / Examples:

    # 交互式对话 / Interactive chat
    xnova

    # 单次提问 / Single query
    xnova "这段代码有什么问题"

    # 管道输入 / Pipe input
    cat error.log | xnova "分析这个错误"

    # JSON 输出（适用于 CI）/ JSON output (for CI)
    xnova -p "生成测试用例" --json --yes

    # 恢复历史会话 / Resume session
    xnova --resume

    # Web Dashboard + 终端同步 / Web Dashboard with CLI sync
    xnova --web

  交互指令 / Slash Commands:

    /model (/m)        切换模型 / Switch model
    /compact           压缩上下文 / Compress context
    /context           上下文使用率 / Context usage
    /resume            恢复历史会话 / Resume session
    /fork              对话分支 / Fork conversation
    /usage (/cost)     Token 用量统计 / Token usage stats
    /gc (/cleanup)     清理过期数据 / Cleanup expired data
    /skills            Skills 管理 / Manage skills
    /remember (/mem)   记忆管理 / Memory management
    /mcp               MCP 状态 / MCP server status
    /bridge            Bridge 管理 / Bridge server control
    /plugins           插件列表 / List plugins
    /clear             清空对话 / Clear conversation
    /exit (/quit)      强制退出 / Force exit
    /help              查看帮助 / Show help

  快捷键 / Keyboard Shortcuts:

    Enter              提交输入 / Submit input
    Alt+Enter          换行 / New line
    Escape / Ctrl+C    中断流式 / Interrupt streaming
    Ctrl+C × 2         强制退出 / Force exit
    Ctrl+B             SubAgent 面板 / SubAgent panel
    Home / Ctrl+A      跳到行首 / Jump to line start
    End / Ctrl+E       跳到行尾 / Jump to line end

  配置 / Configuration:

    ~/.xnovacode/config.json               主配置（Provider / Model）
    ~/.xnovacode/mcp.json                  MCP Server 连接配置
    XNOVACODE.md / CLAUDE.md               System Prompt 指令注入
    <cwd>/.xnovacode/settings.local.json   项目级工具权限白名单
    <cwd>/.xnovacode/hooks.json            项目级事件钩子

  文档 / Documentation:
    GitHub: https://github.com/1207575273/Xnova-Code
    npm:    https://www.npmjs.com/package/xnova-cli
`
  process.stdout.write(help)
}

// ═══ 参数解析（无外部依赖） ═══

interface CliArgs {
  prompt: string | null
  model: string | null
  provider: string | null
  resumeSessionId: string | undefined
  showResumeOnStart: boolean
  yes: boolean
  noTools: boolean
  json: boolean
  verbose: boolean
  web: boolean
  help: boolean
  version: boolean
}

function parseArgs(argv: string[]): CliArgs {
  const result: CliArgs = {
    prompt: null, model: null, provider: null,
    resumeSessionId: undefined, showResumeOnStart: false,
    yes: false, noTools: false, json: false, verbose: false, web: false,
    help: false, version: false,
  }

  const positional: string[] = []
  let i = 0
  while (i < argv.length) {
    const arg = argv[i]!
    if (arg === '-h' || arg === '--help') {
      result.help = true
    } else if (arg === '-V' || arg === '--version') {
      result.version = true
    } else if (arg === '-p' || arg === '--prompt') {
      result.prompt = argv[++i] ?? ''
    } else if (arg === '-m' || arg === '--model') {
      result.model = argv[++i] ?? ''
    } else if (arg === '--provider') {
      result.provider = argv[++i] ?? ''
    } else if (arg === '--resume') {
      const next = argv[i + 1]
      if (next && !next.startsWith('-')) {
        result.resumeSessionId = next
        i++
      } else {
        result.showResumeOnStart = true
      }
    } else if (arg === '--yes' || arg === '-y') {
      result.yes = true
    } else if (arg === '--no-tools') {
      result.noTools = true
    } else if (arg === '--json') {
      result.json = true
    } else if (arg === '--verbose' || arg === '-v') {
      result.verbose = true
    } else if (arg === '--web') {
      result.web = true
    } else if (!arg.startsWith('-')) {
      positional.push(arg)
    }
    i++
  }

  // 位置参数作为 prompt（-p 优先）
  if (result.prompt == null && positional.length > 0) {
    result.prompt = positional.join(' ')
  }

  return result
}

const args = parseArgs(process.argv.slice(2))

// ═══ --help / --version 快速退出 ═══

if (args.help) {
  printHelp()
  process.exit(0)
}

if (args.version) {
  process.stdout.write(`xnova v${APP_VERSION}\n`)
  process.exit(0)
}

// ═══ 入口职责：解析 argv → 选 host → 启动 ═══

const { runCliHost } = await import('../src/host/cli/launcher.js')
await runCliHost(args)
