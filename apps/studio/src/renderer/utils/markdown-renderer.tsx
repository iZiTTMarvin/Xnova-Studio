/**
 * 零依赖简易 Markdown 渲染器。
 *
 * 支持:
 * - **bold** → <strong>
 * - `inline code` → <code>
 * - ```lang ... ``` → <pre><code>
 * - - item / * item → <ul><li>
 * - 1. item → <ol><li>
 * - 普通行 → <span> (保持 inline 以兼容流式渲染)
 *
 * 不引入 react-markdown 等第三方库。
 */

import React, { Fragment } from 'react'

/** 渲染内联标记 (bold + inline code) */
function renderInlineTokens(text: string): (string | React.ReactElement)[] {
  const tokens: (string | React.ReactElement)[] = []
  // 匹配 **bold** 和 `code`
  const pattern = /(\*\*(.+?)\*\*|`([^`]+)`)/g
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
      // `inline code`
      tokens.push(<code key={`c-${tokenKey++}`} className="md-inline-code">{match[3]}</code>)
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
  type: 'paragraph' | 'code' | 'ul' | 'ol'
  content: string
  lang?: string | undefined
  items?: string[]
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
