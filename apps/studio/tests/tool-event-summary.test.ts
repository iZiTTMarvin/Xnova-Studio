import { describe, expect, it } from 'vitest'
import { createToolEventSummary } from '../src/renderer/utils/tool-event-summary'

describe('tool event summary', () => {
  it('write_file 只展示路径和内容规模，不泄漏完整 content', () => {
    const content = ['标题', '第一行内容', '第二行内容'].join('\n')
    const summary = createToolEventSummary('write_file', {
      path: 'D:/workspace/demo/SPEC.md',
      content,
    })

    expect(summary).toEqual({
      title: '写入文件',
      target: 'SPEC.md',
      detail: `${content.length} 字符 / 3 行`,
      severity: 'normal',
    })
  })

  it('read_file 只展示目标路径', () => {
    const summary = createToolEventSummary('read_file', {
      path: 'D:/workspace/demo/index.html',
      content: '<html>不应展示读取内容</html>',
    })

    expect(summary).toEqual({
      title: '读取文件',
      target: 'index.html',
      detail: null,
      severity: 'normal',
    })
  })

  it('bash 展示命令摘要和 cwd，并标记为 warning', () => {
    const command = 'pnpm --filter xnova-studio test -- --runInBand --verbose --reporter=dot --retry=0'
    const summary = createToolEventSummary('bash', {
      command,
      cwd: 'D:/workspace/demo',
    })

    expect(summary.title).toBe('执行命令')
    expect(summary.target).toHaveLength(81)
    expect(summary.target?.endsWith('…')).toBe(true)
    expect(summary.detail).toBe('D:/workspace/demo')
    expect(summary.severity).toBe('warning')
  })

  it('bash 失败摘要包含工具策略提示时展示建议工具并标记为 error', () => {
    const resultSummary = [
      '[工具策略提示] 不要用 bash 读文件，请改用 read_file 工具并传 path。',
      '建议工具: read_file',
      '原因: read_file 会走统一的 workspace、截断和摘要策略。',
    ].join('\n')

    const summary = createToolEventSummary(
      'bash',
      {
        command: 'cat index.html',
        cwd: 'D:/workspace/demo',
      },
      resultSummary,
    )

    expect(summary.title).toBe('执行命令')
    expect(summary.target).toBe('cat index.html')
    expect(summary.detail).toContain('改用 read_file')
    expect(summary.detail).toContain('建议工具: read_file')
    expect(summary.severity).toBe('error')
  })
})
