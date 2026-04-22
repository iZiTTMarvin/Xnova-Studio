// src/config/toml/parser.ts
/**
 * 最小 TOML parser — 只覆盖 XnovaCode 配置所需子集
 *
 * 支持：
 * - 键值对：key = value（value 可为 string / boolean / integer / float / 数组）
 * - Section 头：[a.b.c]
 * - 嵌套 key：[providers.anthropic]
 * - 字符串：双引号 "..."（支持常见转义 \\ \" \n \t \r）
 * - 整数：-?\d+（不含下划线）
 * - 浮点数：-?\d+\.\d+
 * - 布尔：true / false
 * - 数组：字符串数组 / 数字数组 / 布尔数组（不支持混合类型）
 * - 注释：# 开头（整行或行末）
 *
 * 显式不支持（需要时抛 TomlParseError）：
 * - 多行字符串
 * - 字面量字符串（单引号）
 * - 日期时间
 * - inline table（`{ a = 1 }`）
 * - 下划线数字分隔
 * - 十六进制 / 八进制 / 二进制整数
 * - 数组表（[[...]]）
 *
 * 设计原则：
 * - 任何语法错误必须显式抛错；禁止 silent fallback
 * - 重复 key 视为非法（防止用户误以为后者生效）
 */

import { TomlParseError } from './errors.js'

type TomlValue = string | number | boolean | TomlValue[] | TomlObject
interface TomlObject {
  [key: string]: TomlValue
}

interface Cursor {
  readonly text: string
  pos: number
  line: number
  col: number
}

function makeCursor(text: string): Cursor {
  return { text, pos: 0, line: 1, col: 1 }
}

function advance(cur: Cursor, count: number = 1): void {
  for (let i = 0; i < count; i++) {
    const ch = cur.text[cur.pos]
    if (ch === '\n') {
      cur.line++
      cur.col = 1
    } else {
      cur.col++
    }
    cur.pos++
  }
}

function peek(cur: Cursor, offset: number = 0): string {
  return cur.text[cur.pos + offset] ?? ''
}

function atEnd(cur: Cursor): boolean {
  return cur.pos >= cur.text.length
}

function skipWhitespaceInline(cur: Cursor): void {
  while (!atEnd(cur)) {
    const ch = peek(cur)
    if (ch === ' ' || ch === '\t') advance(cur)
    else break
  }
}

function skipCommentToEol(cur: Cursor): void {
  while (!atEnd(cur) && peek(cur) !== '\n') advance(cur)
}

function skipToNextLine(cur: Cursor): void {
  while (!atEnd(cur) && peek(cur) !== '\n') advance(cur)
  if (!atEnd(cur)) advance(cur) // 跳过 \n
}

function parseString(cur: Cursor): string {
  if (peek(cur) !== '"') {
    throw new TomlParseError('expected string starting with "', cur.line, cur.col)
  }
  advance(cur) // 跳过开头 "
  let out = ''
  while (!atEnd(cur)) {
    const ch = peek(cur)
    if (ch === '\n') {
      throw new TomlParseError('unterminated string (newline before closing quote)', cur.line, cur.col)
    }
    if (ch === '\\') {
      advance(cur)
      const esc = peek(cur)
      switch (esc) {
        case '"': out += '"'; break
        case '\\': out += '\\'; break
        case 'n': out += '\n'; break
        case 'r': out += '\r'; break
        case 't': out += '\t'; break
        default:
          throw new TomlParseError(`unsupported escape sequence \\${esc}`, cur.line, cur.col)
      }
      advance(cur)
      continue
    }
    if (ch === '"') {
      advance(cur) // 跳过结束 "
      return out
    }
    out += ch
    advance(cur)
  }
  throw new TomlParseError('unterminated string (reached EOF)', cur.line, cur.col)
}

function parseBareKey(cur: Cursor): string {
  const start = cur.pos
  while (!atEnd(cur)) {
    const ch = peek(cur)
    if (/[A-Za-z0-9_-]/.test(ch)) advance(cur)
    else break
  }
  if (cur.pos === start) {
    throw new TomlParseError('expected bare key', cur.line, cur.col)
  }
  return cur.text.slice(start, cur.pos)
}

function parseKeyPath(cur: Cursor): string[] {
  const parts: string[] = []
  while (true) {
    skipWhitespaceInline(cur)
    if (peek(cur) === '"') {
      parts.push(parseString(cur))
    } else {
      parts.push(parseBareKey(cur))
    }
    skipWhitespaceInline(cur)
    if (peek(cur) === '.') {
      advance(cur)
      continue
    }
    break
  }
  return parts
}

function parseNumberOrBool(cur: Cursor): TomlValue {
  // 布尔
  if (cur.text.startsWith('true', cur.pos)) {
    advance(cur, 4)
    return true
  }
  if (cur.text.startsWith('false', cur.pos)) {
    advance(cur, 5)
    return false
  }
  // 数字
  const start = cur.pos
  if (peek(cur) === '-' || peek(cur) === '+') advance(cur)
  let hasDigit = false
  while (!atEnd(cur) && /[0-9]/.test(peek(cur))) {
    advance(cur)
    hasDigit = true
  }
  let isFloat = false
  if (peek(cur) === '.' && /[0-9]/.test(peek(cur, 1))) {
    isFloat = true
    advance(cur) // .
    while (!atEnd(cur) && /[0-9]/.test(peek(cur))) advance(cur)
  }
  if (!hasDigit) {
    throw new TomlParseError('expected value (number, bool, string or array)', cur.line, cur.col)
  }
  const raw = cur.text.slice(start, cur.pos)
  const num = isFloat ? parseFloat(raw) : parseInt(raw, 10)
  if (Number.isNaN(num)) {
    throw new TomlParseError(`invalid number literal "${raw}"`, cur.line, cur.col)
  }
  return num
}

function parseArray(cur: Cursor): TomlValue[] {
  if (peek(cur) !== '[') {
    throw new TomlParseError('expected array starting with [', cur.line, cur.col)
  }
  advance(cur) // [
  const out: TomlValue[] = []
  while (!atEnd(cur)) {
    // 跳过空白与换行与注释
    while (!atEnd(cur)) {
      const ch = peek(cur)
      if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
        advance(cur)
      } else if (ch === '#') {
        skipCommentToEol(cur)
      } else {
        break
      }
    }
    if (peek(cur) === ']') {
      advance(cur)
      return out
    }
    out.push(parseValue(cur))
    // 跳过空白与换行
    while (!atEnd(cur)) {
      const ch = peek(cur)
      if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') advance(cur)
      else if (ch === '#') skipCommentToEol(cur)
      else break
    }
    if (peek(cur) === ',') {
      advance(cur)
      continue
    }
    if (peek(cur) === ']') {
      advance(cur)
      return out
    }
    throw new TomlParseError('expected , or ] in array', cur.line, cur.col)
  }
  throw new TomlParseError('unterminated array (reached EOF)', cur.line, cur.col)
}

function parseValue(cur: Cursor): TomlValue {
  skipWhitespaceInline(cur)
  const ch = peek(cur)
  if (ch === '"') return parseString(cur)
  if (ch === '[') return parseArray(cur)
  if (ch === '{') {
    throw new TomlParseError('inline tables are not supported in this minimal TOML parser', cur.line, cur.col)
  }
  if (ch === '' || ch === '\n' || ch === '\r' || ch === '#') {
    throw new TomlParseError('expected value but found end of line', cur.line, cur.col)
  }
  return parseNumberOrBool(cur)
}

/** 在嵌套对象上按 path 寻址并设置 key；冲突抛错 */
function setNested(
  root: TomlObject,
  path: string[],
  value: TomlValue,
  cur: Cursor,
): void {
  let obj: TomlObject = root
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i]!
    const existing = obj[key]
    if (existing === undefined) {
      const next: TomlObject = {}
      obj[key] = next
      obj = next
    } else if (typeof existing === 'object' && !Array.isArray(existing)) {
      obj = existing as TomlObject
    } else {
      throw new TomlParseError(
        `key path conflict at "${path.slice(0, i + 1).join('.')}" (already a scalar)`,
        cur.line,
        cur.col,
      )
    }
  }
  const leaf = path[path.length - 1]!
  if (Object.prototype.hasOwnProperty.call(obj, leaf)) {
    throw new TomlParseError(`duplicate key "${path.join('.')}"`, cur.line, cur.col)
  }
  obj[leaf] = value
}

/** 创建或取回 section 对应的嵌套对象；不允许重复声明同一 section */
function openSection(
  root: TomlObject,
  sections: Set<string>,
  path: string[],
  cur: Cursor,
): TomlObject {
  const joined = path.join('.')
  if (sections.has(joined)) {
    throw new TomlParseError(`duplicate section [${joined}]`, cur.line, cur.col)
  }
  sections.add(joined)
  let obj: TomlObject = root
  for (let i = 0; i < path.length; i++) {
    const key = path[i]!
    const existing = obj[key]
    if (existing === undefined) {
      const next: TomlObject = {}
      obj[key] = next
      obj = next
    } else if (typeof existing === 'object' && !Array.isArray(existing)) {
      obj = existing as TomlObject
    } else {
      throw new TomlParseError(
        `section path conflict at "${path.slice(0, i + 1).join('.')}" (already a scalar)`,
        cur.line,
        cur.col,
      )
    }
  }
  return obj
}

/**
 * 解析 TOML 文本为纯对象
 *
 * 任何语法错误都会抛出 {@link TomlParseError}，带 line/column。
 * 禁止静默回退；调用方必须处理异常。
 */
export function parseToml(text: string): TomlObject {
  const cur = makeCursor(text)
  const root: TomlObject = {}
  let current: TomlObject = root
  const declaredSections = new Set<string>()

  while (!atEnd(cur)) {
    skipWhitespaceInline(cur)
    const ch = peek(cur)
    if (ch === '' || atEnd(cur)) break
    if (ch === '\n') {
      advance(cur)
      continue
    }
    if (ch === '\r') {
      advance(cur)
      continue
    }
    if (ch === '#') {
      skipCommentToEol(cur)
      continue
    }
    if (ch === '[') {
      advance(cur) // [
      if (peek(cur) === '[') {
        throw new TomlParseError('array of tables [[...]] is not supported', cur.line, cur.col)
      }
      skipWhitespaceInline(cur)
      const path = parseKeyPath(cur)
      skipWhitespaceInline(cur)
      if (peek(cur) !== ']') {
        throw new TomlParseError('expected ] to close section header', cur.line, cur.col)
      }
      advance(cur) // ]
      skipWhitespaceInline(cur)
      // 行末允许注释
      if (!atEnd(cur) && peek(cur) === '#') skipCommentToEol(cur)
      if (!atEnd(cur) && peek(cur) !== '\n' && peek(cur) !== '\r') {
        throw new TomlParseError('unexpected content after section header', cur.line, cur.col)
      }
      current = openSection(root, declaredSections, path, cur)
      skipToNextLine(cur)
      continue
    }
    // 键值对
    const keyLine = cur.line
    const keyCol = cur.col
    const path = parseKeyPath(cur)
    skipWhitespaceInline(cur)
    if (peek(cur) !== '=') {
      throw new TomlParseError('expected = after key', cur.line, cur.col)
    }
    advance(cur) // =
    skipWhitespaceInline(cur)
    // 检查是否是“裸 = 后面什么都没有”
    if (atEnd(cur) || peek(cur) === '\n' || peek(cur) === '\r' || peek(cur) === '#') {
      throw new TomlParseError('missing value after =', keyLine, keyCol)
    }
    const value = parseValue(cur)
    setNested(current, path, value, cur)
    skipWhitespaceInline(cur)
    if (!atEnd(cur) && peek(cur) === '#') skipCommentToEol(cur)
    if (!atEnd(cur) && peek(cur) !== '\n' && peek(cur) !== '\r') {
      throw new TomlParseError('unexpected content after value', cur.line, cur.col)
    }
    skipToNextLine(cur)
  }

  return root
}
