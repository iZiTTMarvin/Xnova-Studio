// src/config/toml/serializer.ts
/**
 * 最小 TOML serializer —— 与 parser.ts 严格对称
 *
 * 设计原则：
 * - 输出必须能被同仓库 parser 无损 re-parse（round-trip 语义等价）
 * - 只覆盖 parser 支持的子集：string / boolean / number / array / 嵌套 table
 * - 空字符串、空数组必须显式输出（禁止被视为“无值”而丢失）
 * - 非法值（undefined / null / function / NaN / Infinity）必须显式抛错
 *
 * 章节排版策略：
 * - 顶层先输出所有标量/数组字段
 * - 再按顺序递归输出子 table：
 *   - 仅当子 table 自身含有标量字段时才写入 `[a.b]` 节头
 *   - 否则直接向下穿透到更深一层 `[a.b.c]`
 *   - 这与 parser 对 section 的语义一致
 */

type Scalar = string | number | boolean
type TomlArray = Scalar[] | TomlArray[]
type TomlTable = { [key: string]: TomlValue }
type TomlValue = Scalar | TomlArray | TomlTable

function isPlainObject(value: unknown): value is TomlTable {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  )
}

function escapeBasicString(input: string): string {
  let out = ''
  for (const ch of input) {
    switch (ch) {
      case '\\':
        out += '\\\\'
        break
      case '"':
        out += '\\"'
        break
      case '\n':
        out += '\\n'
        break
      case '\r':
        out += '\\r'
        break
      case '\t':
        out += '\\t'
        break
      default: {
        const code = ch.charCodeAt(0)
        if (code < 0x20) {
          // 控制字符统一用 \u 转义，保证 parser 不会误判为换行
          out += `\\u${code.toString(16).padStart(4, '0')}`
        } else {
          out += ch
        }
      }
    }
  }
  return out
}

function isValidBareKey(key: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(key) && key.length > 0
}

function formatKey(key: string): string {
  if (isValidBareKey(key)) return key
  return `"${escapeBasicString(key)}"`
}

function formatScalar(value: unknown, path: string): string {
  if (typeof value === 'string') {
    return `"${escapeBasicString(value)}"`
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false'
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`cannot serialize non-finite number at "${path}"`)
    }
    return String(value)
  }
  throw new Error(`unsupported scalar type at "${path}": ${typeof value}`)
}

function formatValue(value: unknown, path: string): string {
  if (Array.isArray(value)) {
    const parts = value.map((item, i) => {
      if (Array.isArray(item)) {
        return formatValue(item, `${path}[${i}]`)
      }
      if (isPlainObject(item)) {
        throw new Error(`arrays of tables are not supported at "${path}[${i}]"`)
      }
      return formatScalar(item, `${path}[${i}]`)
    })
    return `[${parts.join(', ')}]`
  }
  return formatScalar(value, path)
}

/**
 * 把 `{ key: 'value' }` 以及嵌套表按 TOML 节头顺序输出
 */
function emitScope(
  obj: Record<string, unknown>,
  path: string[],
  lines: string[],
): void {
  const scalarKeys: string[] = []
  const tableKeys: string[] = []
  for (const key of Object.keys(obj)) {
    if (isPlainObject(obj[key])) tableKeys.push(key)
    else scalarKeys.push(key)
  }

  // 顶层标量直接写；子 scope 若有标量，先写节头
  if (path.length > 0 && scalarKeys.length > 0) {
    if (lines.length > 0) lines.push('')
    lines.push(`[${path.map(formatKey).join('.')}]`)
  }

  for (const key of scalarKeys) {
    const value = obj[key]
    if (value === undefined) {
      throw new Error(`cannot serialize undefined at "${[...path, key].join('.')}"`)
    }
    if (value === null) {
      throw new Error(`cannot serialize null at "${[...path, key].join('.')}"`)
    }
    lines.push(`${formatKey(key)} = ${formatValue(value, [...path, key].join('.'))}`)
  }

  for (const key of tableKeys) {
    emitScope(obj[key] as Record<string, unknown>, [...path, key], lines)
  }
}

/**
 * 把纯对象序列化为 TOML 文本
 *
 * 失败场景：
 * - 值为 undefined / null / function / symbol / NaN / Infinity：显式抛错
 * - 数组中出现嵌套表（array of tables）：显式抛错（parser 也不支持）
 *
 * 调用方必须确保传入的是已 validated 的 schema 对象。
 *
 * 类型策略：形参用 `object` 以同时兼容 `Record<string, unknown>` 与具体 schema 接口
 * （例如 `UserConfigToml`），内部再用 type guard 校验为 plain object。
 */
export function stringifyToml(value: object): string {
  if (!isPlainObject(value)) {
    throw new Error('stringifyToml expects a plain object at the top level')
  }
  const lines: string[] = []
  emitScope(value as Record<string, unknown>, [], lines)
  return lines.length === 0 ? '' : lines.join('\n') + '\n'
}
