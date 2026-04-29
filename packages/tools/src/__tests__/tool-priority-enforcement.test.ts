/**
 * Bug Condition Exploration Test — 系统提示词工具优先级不足
 *
 * 验证 BashTool.description 和 behaviorGuidance 是否使用强制性措辞（"禁止"/"必须"），
 * 而非弱约束措辞（"优先"）。
 *
 * 在未修复代码上，这些测试预期 FAIL — 失败即证明 bug 存在。
 *
 * Validates: Requirements 1.4, 2.4
 */
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { BashTool, getWindowsBashToolPolicyHint } from '../core/bash.js'
import { buildSystemPrompt, buildWindowsToolPolicyPrompt, getSystemPrompt } from '@core/bootstrap.js'

describe('Bug Condition — 系统提示词工具优先级不足', () => {
  /**
   * 测试 1: BashTool.description 应使用"禁止"措辞并列出具体禁止操作
   *
   * 期望行为：description 中包含"禁止"关键词，并明确列出不允许用 bash 执行的操作类型：
   * - cat/head/tail（读文件）
   * - echo/重定向（写文件）
   * - sed/awk（编辑文件）
   * - grep 命令（搜索文件内容）
   * - find/ls（查找文件）
   *
   * 当前代码使用"优先"措辞，测试将 FAIL，证明约束力度不足。
   *
   * **Validates: Requirements 1.4, 2.4**
   */
  it('BashTool.description 应包含"禁止"措辞并列出具体禁止操作', () => {
    const bash = new BashTool()
    const desc = bash.description

    // 应包含"禁止"关键词（强制性约束）
    expect(desc).toContain('禁止')

    // 应明确列出禁止用 bash 执行的操作类型
    expect(desc).toMatch(/cat|head|tail/)   // 读文件操作
    expect(desc).toMatch(/echo|重定向/)      // 写文件操作
    expect(desc).toMatch(/sed|awk/)          // 编辑文件操作
    expect(desc).toMatch(/grep/)             // 搜索文件内容（grep 命令）
    expect(desc).toMatch(/find|ls/)          // 查找文件操作
  })

  /**
   * 测试 2: behaviorGuidance 中工具优先级规则应使用"必须"和"禁止"等强制性措辞
   *
   * 通过 buildSystemPrompt + getSystemPrompt 获取包含 behaviorGuidance 的系统提示词，
   * 验证工具优先级相关规则使用强制性措辞，而非"优先使用"等弱约束。
   *
   * 当前代码的工具优先级行使用"有专用工具时优先使用"措辞，测试将 FAIL，证明约束力度不足。
   * 注意：文件路径规则中已有"必须"和"禁止"，但那不是工具优先级相关的，需要精确匹配。
   *
   * **Validates: Requirements 1.4, 2.4**
   */
  it('behaviorGuidance 工具优先级规则应使用"必须"和"禁止"措辞', () => {
    // 使用临时 cwd 构建 system prompt，触发 behaviorGuidance 生成
    // 注意：buildSystemPrompt 是幂等的，使用唯一 cwd 确保不与其他测试冲突
    const testCwd = '/tmp/__test_tool_priority_' + Date.now()
    buildSystemPrompt(testCwd, '')

    const prompt = getSystemPrompt()
    expect(prompt).toBeDefined()

    // 工具优先级规则应使用"必须使用"（而非当前的"优先使用"）
    // 当前代码：'有专用工具时优先使用：read_file（不用 cat）...'
    // 期望代码：'有专用工具时必须使用：...' 或类似强制性措辞
    expect(prompt).toMatch(/有专用工具时必须使用/)

    // 工具优先级规则应包含"禁止"条款，明确禁止用 bash 执行文件操作
    // 当前代码：'bash 只用于系统命令' — 缺少明确的"禁止"条款
    // 期望代码：包含"禁止使用 bash 执行"或"禁止用于文件操作"等措辞
    expect(prompt).toMatch(/禁止.*bash|bash.*禁止/)
  })
})

describe('Windows 工具策略提示', () => {
  it('Windows 平台提示词应注入明确的结构化工具策略', () => {
    const prompt = buildWindowsToolPolicyPrompt(true)

    expect(prompt).toContain('Windows 工具策略')
    expect(prompt).toContain('read_file')
    expect(prompt).toContain('write_file')
    expect(prompt).toContain('edit_file')
    expect(prompt).toContain('grep')
    expect(prompt).toContain('glob')
    expect(prompt).toMatch(/cd.*cwd|cwd.*cd/i)
    expect(prompt).toContain('PowerShell')
  })

  it('非 Windows 平台不应注入 Windows 专属提示', () => {
    expect(buildWindowsToolPolicyPrompt(false)).toBe('')
  })

  it.each([
    ['cat index.html', 'windows-use-read-file', 'read_file'],
    ['type index.html', 'windows-use-read-file', 'read_file'],
    ['Get-Content index.html', 'windows-use-read-file', 'read_file'],
    ['dir src', 'windows-use-glob', 'glob'],
    ['ls src', 'windows-use-glob', 'glob'],
    ['cd src && pnpm test', 'windows-use-cwd', 'bash.cwd'],
    ['echo "<html></html>" > index.html', 'windows-use-write-file', 'write_file'],
    ['Set-Content index.html "<html></html>"', 'windows-use-write-file', 'write_file'],
    ['grep "title" index.html', 'windows-use-grep', 'grep'],
  ])('识别 Windows shell 误用：%s', (command, expectedCode, expectedTool) => {
    const hint = getWindowsBashToolPolicyHint(command)

    expect(hint?.code).toBe(expectedCode)
    expect(hint?.suggestedTool).toBe(expectedTool)
    expect(hint?.message).toMatch(/不要用 bash|不要用 cd/)
  })

  it('不拦截 bash 的系统命令能力', () => {
    expect(getWindowsBashToolPolicyHint('pnpm --filter xnova-studio test')).toBeNull()
    expect(getWindowsBashToolPolicyHint('git status --short')).toBeNull()
    expect(getWindowsBashToolPolicyHint('node --version')).toBeNull()
  })

  it('Windows 下 bash 执行常见文件误用时返回结构化 hint', async () => {
    if (process.platform !== 'win32') {
      return
    }

    const bash = new BashTool()
    const result = await bash.execute(
      { command: 'cd src && pnpm test' },
      { cwd: process.cwd() },
    )

    expect(result.success).toBe(false)
    expect(result.error).toContain('工具策略提示')
    expect(result.error).toContain('cwd')
    expect(result.meta).toMatchObject({
      type: 'bash',
      exitCode: -2,
      policyCode: 'windows-use-cwd',
      suggestedTool: 'bash.cwd',
    })
  })
})


/**
 * Preservation Property Test — Bash 系统命令能力保留
 *
 * 验证 BashTool.description 仍然包含系统命令（git、构建、测试、安装依赖等）的允许说明，
 * 以及后台运行能力（run_in_background）的说明。
 *
 * 这些测试在未修复代码上应 PASS — 确认基线行为需要保留。
 * 修复后这些测试也应继续 PASS — 确认修复未破坏系统命令能力。
 *
 * Validates: Requirements 3.4
 */
describe('Preservation — Bash 系统命令能力保留', () => {
  /**
   * 系统命令关键词与 BashTool.description 中对应的匹配模式。
   *
   * 每个条目代表一个 bash 应当支持的系统命令类别：
   * - keyword: 系统命令类别名称（用于测试报告）
   * - pattern: 在 description 中匹配该类别的正则表达式
   *
   * 当前 description 包含 'bash 适合运行构建、测试、git、安装依赖等系统命令'，
   * 以及 'run_in_background=true' 后台运行能力说明。
   */
  const systemCommandEntries: Array<{ keyword: string; pattern: RegExp }> = [
    { keyword: 'git', pattern: /git/i },
    { keyword: '构建', pattern: /构建|build/i },
    { keyword: '测试', pattern: /测试|test/i },
    { keyword: '安装依赖', pattern: /安装依赖|install/i },
    { keyword: 'run_in_background', pattern: /run_in_background/ },
  ]

  /**
   * 属性测试：对所有系统命令关键词，BashTool.description 应包含相关允许说明。
   *
   * 使用 fast-check 从 systemCommandEntries 中随机抽样，验证每个系统命令类别
   * 在 description 中都有对应的匹配。这确保修复工具优先级措辞时不会意外删除
   * bash 执行系统命令的能力说明。
   *
   * **Validates: Requirements 3.4**
   */
  it('BashTool.description 应包含所有系统命令类别的允许说明（属性测试）', () => {
    const bash = new BashTool()
    const desc = bash.description

    // 使用 fast-check 从系统命令条目中随机抽样，验证每个都能匹配
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: systemCommandEntries.length - 1 }),
        (index) => {
          const entry = systemCommandEntries[index]
          if (!entry) {
            throw new Error(`系统命令测试索引越界: ${index}`)
          }
          const matched = entry.pattern.test(desc)
          if (!matched) {
            // 提供清晰的失败信息，帮助定位哪个系统命令类别缺失
            throw new Error(
              `BashTool.description 缺少系统命令类别 "${entry.keyword}" 的说明。` +
              `\n  期望匹配: ${entry.pattern}` +
              `\n  实际 description: ${desc}`
            )
          }
          return true
        }
      ),
      { numRuns: 50 } // 50 次随机抽样，足以覆盖所有 5 个条目
    )
  })

  /**
   * 单元测试：逐一验证每个系统命令关键词在 description 中存在。
   *
   * 作为属性测试的补充，确保每个关键词都被显式检查，
   * 不依赖随机抽样的覆盖率。
   *
   * **Validates: Requirements 3.4**
   */
  it('BashTool.description 应逐一包含 git、构建、测试、安装依赖、run_in_background', () => {
    const bash = new BashTool()
    const desc = bash.description

    for (const entry of systemCommandEntries) {
      expect(
        entry.pattern.test(desc),
        `description 缺少系统命令类别 "${entry.keyword}" (pattern: ${entry.pattern})`
      ).toBe(true)
    }
  })

  /**
   * 单元测试：BashTool.description 应明确表达 bash 适合系统命令的定位。
   *
   * 验证 description 中包含"系统命令"相关的定位说明，
   * 确保修复后 bash 的系统命令定位不被模糊化。
   *
   * **Validates: Requirements 3.4**
   */
  it('BashTool.description 应包含"系统命令"定位说明', () => {
    const bash = new BashTool()
    const desc = bash.description

    // description 应明确提到 bash 适合/用于系统命令
    expect(desc).toMatch(/系统命令/)
  })
})
