/**
 * 零依赖简易 Markdown 渲染器。
 *
 * 支持:
 * - **bold** → <strong>
 * - ~~strike~~ → <del>
 * - `inline code` → <code>
 * - [text](http(s)://url) → <a target="_blank" rel="noreferrer noopener"> （仅 http/https 白名单）
 * - ```lang ... ``` → <pre><code>
 * - # / ## / ### → h1/h2/h3
 * - > quote → <blockquote>
 * - - item / * item → <ul><li>
 * - 1. item → <ol><li>
 * - | col1 | col2 | → <table>
 * - 普通行 → <span> (保持 inline 以兼容流式渲染)
 *
 * 不引入 react-markdown 等第三方库。安全策略：
 * - 链接 href 仅允许 http/https，否则降级为纯文本
 * - 全部走 React JSX 渲染，无 dangerouslySetInnerHTML，无 XSS 风险
 */

import React, { Fragment } from 'react'

const SAFE_LINK_PROTOCOL = /^https?:\/\//i

function isSafeLinkUrl(url: string): boolean {
  return SAFE_LINK_PROTOCOL.test(url.trim())
}

/** 渲染内联标记 (bold + strike + inline code + link) */
function renderInlineTokens(text: string): (string | React.ReactElement)[] {
  const tokens: (string | React.ReactElement)[] = []
  // 匹配顺序：**bold** | ~~strike~~ | [text](url) | `code`
  // 每个分组内部用一个捕获放主体内容；link 用两个捕获存 text 和 url
  const pattern =
    /(\*\*(.+?)\*\*|~~(.+?)~~|\[([^\]]+)\]\(([^)\s]+)\)|`([^`]+)`)/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  let tokenKey = 0

  while ((match = pattern.exec(text)) !== null) {
    // 前面的普通文本
    if (match.index > lastIndex) {
      tokens.push(text.slice(lastIndex, match.index))
    }

    if (match[2] !== undefined) {
      // **bold**
      tokens.push(<strong key={`b-${tokenKey++}`}>{match[2]}</strong>)
    } else if (match[3] !== undefined) {
      // ~~strike~~
      tokens.push(<del key={`s-${tokenKey++}`}>{match[3]}</del>)
    } else if (match[4] !== undefined && match[5] !== undefined) {
      // [text](url) — 仅 http/https，否则降级为 [text](url) 字面量以避免 javascript: / data: 等危险协议
      const linkText = match[4]
      const linkUrl = match[5]
      if (isSafeLinkUrl(linkUrl)) {
        tokens.push(
          <a
            key={`l-${tokenKey++}`}
            href={linkUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="md-link"
          >
            {linkText}
          </a>,
        )
      } else {
        tokens.push(`[${linkText}](${linkUrl})`)
      }
    } else if (match[6] !== undefined) {
      // `inline code`
      tokens.push(<code key={`c-${tokenKey++}`} className="md-inline-code">{match[6]}</code>)
    }

    lastIndex = match.index + match[0].length
  }

  // 尾部文本
  if (lastIndex < text.length) {
    tokens.push(text.slice(lastIndex))
  }

  return tokens.length > 0 ? tokens : [text]
}

interface MarkdownBlock {
  type: 'paragraph' | 'code' | 'ul' | 'ol' | 'heading' | 'quote' | 'table'
  content: string
  lang?: string | undefined
  items?: string[]
  level?: 1 | 2 | 3
  /** table 行数据：第 0 行为 header，后续为 body */
  rows?: string[][]
}

const HEADING_PATTERN = /^(#{1,3})\s+(.+)$/
const TABLE_ROW_PATTERN = /^\s*\|.*\|\s*$/
const TABLE_DELIMITER_PATTERN = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/

function parseTableRow(line: string): string[] {
  // 去掉首尾的 | 然后按 | 切分
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  return trimmed.split('|').map((cell) => cell.trim())
}

/** 将原始 Markdown 文本解析为块列表 */
function parseBlocks(raw: string): MarkdownBlock[] {
  const lines = raw.split('\n')
  const blocks: MarkdownBlock[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]!

    // 围栏代码块
    if (line.startsWith('```')) {
      const langStr = line.slice(3).trim()
      const codeLines: string[] = []
      index++
      while (index < lines.length && !(lines[index]!).startsWith('```')) {
        codeLines.push(lines[index]!)
        index++
      }
      blocks.push({ type: 'code', content: codeLines.join('\n'), lang: langStr || undefined })
      index++ // 跳过结束 ```
      continue
    }

    // ATX heading (h1-h3)
    const headingMatch = line.match(HEADING_PATTERN)
    if (headingMatch) {
      const hashes = headingMatch[1] ?? ''
      const level = Math.min(3, hashes.length) as 1 | 2 | 3
      blocks.push({ type: 'heading', content: headingMatch[2] ?? '', level })
      index++
      continue
    }

    // Blockquote（> ...）— 收集连续的引用行
    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = []
      while (index < lines.length && /^>\s?/.test(lines[index]!)) {
        quoteLines.push((lines[index]!).replace(/^>\s?/, ''))
        index++
      }
      blocks.push({ type: 'quote', content: quoteLines.join('\n') })
      continue
    }

    // 表格：| col1 | col2 |\n|------|------|\n| row1 | row2 |
    if (
      TABLE_ROW_PATTERN.test(line) &&
      index + 1 < lines.length &&
      TABLE_DELIMITER_PATTERN.test(lines[index + 1]!)
    ) {
      const headerRow = parseTableRow(line)
      index += 2 // 跳过 header 和分隔行
      const bodyRows: string[][] = []
      while (index < lines.length && TABLE_ROW_PATTERN.test(lines[index]!)) {
        bodyRows.push(parseTableRow(lines[index]!))
        index++
      }
      blocks.push({
        type: 'table',
        content: '',
        rows: [headerRow, ...bodyRows],
      })
      continue
    }

    // 无序列表（- 或 *）
    if (/^[\s]*[-*]\s+/.test(line)) {
      const items: string[] = []
      while (index < lines.length && /^[\s]*[-*]\s+/.test(lines[index]!)) {
        items.push((lines[index]!).replace(/^[\s]*[-*]\s+/, ''))
        index++
      }
      blocks.push({ type: 'ul', content: '', items })
      continue
    }

    // 有序列表
    if (/^[\s]*\d+\.\s+/.test(line)) {
      const items: string[] = []
      while (index < lines.length && /^[\s]*\d+\.\s+/.test(lines[index]!)) {
        items.push((lines[index]!).replace(/^[\s]*\d+\.\s+/, ''))
        index++
      }
      blocks.push({ type: 'ol', content: '', items })
      continue
    }

    // 空行跳过
    if (line.trim() === '') {
      index++
      continue
    }

    // 普通段落（收集连续非空行）
    const paragraphLines: string[] = []
    while (
      index < lines.length &&
      (lines[index]!).trim() !== '' &&
      !(lines[index]!).startsWith('```') &&
      !HEADING_PATTERN.test(lines[index]!) &&
      !/^>\s?/.test(lines[index]!) &&
      !TABLE_ROW_PATTERN.test(lines[index]!) &&
      !/^[\s]*[-*]\s+/.test(lines[index]!) &&
      !/^[\s]*\d+\.\s+/.test(lines[index]!)
    ) {
      paragraphLines.push(lines[index]!)
      index++
    }
    if (paragraphLines.length > 0) {
      blocks.push({ type: 'paragraph', content: paragraphLines.join('\n') })
    }
  }

  return blocks
}

export interface MarkdownContentProps {
  text: string
  className?: string
}

/**
 * 简易 Markdown 渲染组件。
 */
export function MarkdownContent(props: MarkdownContentProps) {
  const blocks = parseBlocks(props.text)

  return (
    <div className={`md-content ${props.className ?? ''}`}>
      {blocks.map((block, blockIndex) => {
        switch (block.type) {
          case 'code':
            return (
              <pre key={blockIndex} className="md-code-block">
                <code>{block.content}</code>
              </pre>
            )

          case 'heading': {
            const level = block.level ?? 1
            if (level === 1) {
              return (
                <h1 key={blockIndex} className="md-heading md-heading-1">
                  {renderInlineTokens(block.content)}
                </h1>
              )
            }
            if (level === 2) {
              return (
                <h2 key={blockIndex} className="md-heading md-heading-2">
                  {renderInlineTokens(block.content)}
                </h2>
              )
            }
            return (
              <h3 key={blockIndex} className="md-heading md-heading-3">
                {renderInlineTokens(block.content)}
              </h3>
            )
          }

          case 'quote': {
            const quoteLines = block.content.split('\n')
            return (
              <blockquote key={blockIndex} className="md-blockquote">
                {quoteLines.map((quoteLine, lineIndex) => (
                  <span key={lineIndex} className="md-blockquote-line">
                    {renderInlineTokens(quoteLine)}
                    {lineIndex < quoteLines.length - 1 ? <br /> : null}
                  </span>
                ))}
              </blockquote>
            )
          }

          case 'table': {
            const rows = block.rows ?? []
            const [header, ...body] = rows
            return (
              <table key={blockIndex} className="md-table">
                {header ? (
                  <thead>
                    <tr>
                      {header.map((cell, cellIndex) => (
                        <th key={cellIndex}>{renderInlineTokens(cell)}</th>
                      ))}
                    </tr>
                  </thead>
                ) : null}
                <tbody>
                  {body.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {row.map((cell, cellIndex) => (
                        <td key={cellIndex}>{renderInlineTokens(cell)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          }

          case 'ul':
            return (
              <ul key={blockIndex} className="md-list">
                {(block.items ?? []).map((item, itemIndex) => (
                  <li key={itemIndex}>{renderInlineTokens(item)}</li>
                ))}
              </ul>
            )

          case 'ol':
            return (
              <ol key={blockIndex} className="md-list">
                {(block.items ?? []).map((item, itemIndex) => (
                  <li key={itemIndex}>{renderInlineTokens(item)}</li>
                ))}
              </ol>
            )

          case 'paragraph':
          default: {
            const contentLines = block.content.split('\n')
            return (
              <Fragment key={blockIndex}>
                {contentLines.map((lineStr, lineIndex) => (
                  <span key={lineIndex} className="md-line">
                    {renderInlineTokens(lineStr)}
                    {lineIndex < contentLines.length - 1 ? <br /> : null}
                  </span>
                ))}
              </Fragment>
            )
          }
        }
      })}
    </div>
  )
}
