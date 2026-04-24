// src/config/toml/errors.ts
/**
 * TOML 解析与校验的显式错误类型
 *
 * 设计要点：
 * - 禁止 silent fallback：任何错误必须抛出并带上定位信息
 * - parser 错误带 line / column（1-based）
 * - validator 错误带 path（点分路径，指向非法字段）
 */

export class TomlParseError extends Error {
  readonly line: number
  readonly column: number

  constructor(message: string, line: number, column: number) {
    super(`TOML parse error at line ${line}:${column} — ${message}`)
    this.name = 'TomlParseError'
    this.line = line
    this.column = column
  }
}

export class TomlValidationError extends Error {
  readonly path: string

  constructor(message: string, path: string) {
    super(`TOML validation error at "${path}": ${message}`)
    this.name = 'TomlValidationError'
    this.path = path
  }
}
