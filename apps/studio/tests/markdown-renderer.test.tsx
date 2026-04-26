// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MarkdownContent } from '../src/renderer/utils/markdown-renderer'

afterEach(() => {
  cleanup()
})

describe('MarkdownContent — 扩展语法', () => {
  it('# / ## / ### 渲染为 h1 / h2 / h3', () => {
    render(
      <MarkdownContent
        text={['# 一级标题', '## 二级标题', '### 三级标题'].join('\n')}
      />,
    )

    expect(screen.getByText('一级标题').tagName).toBe('H1')
    expect(screen.getByText('二级标题').tagName).toBe('H2')
    expect(screen.getByText('三级标题').tagName).toBe('H3')
  })

  it('> 引用渲染为 blockquote，并按行连接', () => {
    const { container } = render(
      <MarkdownContent
        text={['> 第一行引用', '> 第二行引用'].join('\n')}
      />,
    )

    const blockquote = container.querySelector('blockquote.md-blockquote')
    expect(blockquote).not.toBeNull()
    expect(blockquote?.textContent).toContain('第一行引用')
    expect(blockquote?.textContent).toContain('第二行引用')
  })

  it('~~strike~~ 渲染为 <del>', () => {
    const { container } = render(<MarkdownContent text="这是 ~~删除~~ 文本" />)

    const del = container.querySelector('del')
    expect(del?.textContent).toBe('删除')
  })

  it('表格 (| ... |) 正确解析 header 与 body', () => {
    const tableSource = [
      '| 名称 | 数量 |',
      '|------|------|',
      '| Foo  | 1    |',
      '| Bar  | 2    |',
    ].join('\n')
    const { container } = render(<MarkdownContent text={tableSource} />)

    const table = container.querySelector('table.md-table')
    expect(table).not.toBeNull()
    expect(container.querySelectorAll('thead th')).toHaveLength(2)
    expect(container.querySelectorAll('tbody tr')).toHaveLength(2)
    expect(screen.getByText('Foo')).toBeTruthy()
    expect(screen.getByText('Bar')).toBeTruthy()
  })

  it('http(s) 链接渲染为 <a target="_blank">，链接文本可见', () => {
    const { container } = render(
      <MarkdownContent text="访问 [示例](https://example.com) 了解更多" />,
    )

    const link = container.querySelector('a.md-link')
    expect(link).not.toBeNull()
    expect(link?.getAttribute('href')).toBe('https://example.com')
    expect(link?.getAttribute('target')).toBe('_blank')
    expect(link?.getAttribute('rel')).toBe('noreferrer noopener')
    expect(link?.textContent).toBe('示例')
  })

  it('javascript: / data: 等危险协议链接降级为纯文本，无 <a>', () => {
    const dangerousMarkdown = '点 [这里](javascript:alert(1))'
    const { container } = render(<MarkdownContent text={dangerousMarkdown} />)

    expect(container.querySelector('a')).toBeNull()
    expect(container.textContent).toContain('[这里](javascript:alert(1))')
  })

  it('原有 bold / inline code / 列表 / 段落仍正常工作', () => {
    const source = [
      '**加粗**',
      '`code`',
      '- item-1',
      '- item-2',
      '1. 第一',
      '2. 第二',
    ].join('\n')
    const { container } = render(<MarkdownContent text={source} />)

    expect(container.querySelector('strong')?.textContent).toBe('加粗')
    expect(container.querySelector('code.md-inline-code')?.textContent).toBe(
      'code',
    )
    expect(container.querySelectorAll('ul.md-list li')).toHaveLength(2)
    expect(container.querySelectorAll('ol.md-list li')).toHaveLength(2)
  })
})
