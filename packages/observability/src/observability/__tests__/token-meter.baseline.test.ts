import { describe, expect, it } from 'vitest'
import { TokenMeter } from '../token-meter.js'

type SqlRow = Record<string, unknown>

class FakeStatement {
  readonly #sql: string
  readonly #calls: unknown[][] = []
  readonly #rows: SqlRow[]

  constructor(sql: string, rows: SqlRow[] = []) {
    this.#sql = sql
    this.#rows = rows
  }

  run(...args: unknown[]): void {
    this.#calls.push(args)
  }

  all(..._args: unknown[]): SqlRow[] {
    if (this.#sql.includes('FROM pricing_rules')) {
      return this.#rows
    }
    return []
  }

  get calls(): unknown[][] {
    return this.#calls
  }
}

class FakeDb {
  insertStmt = new FakeStatement('INSERT INTO usage_logs')
  pricingStmt = new FakeStatement('SELECT * FROM pricing_rules', [
    {
      id: 1,
      model_pattern: 'gpt-4o*',
      input_price: 2,
      output_price: 4,
      cache_read_price: 1,
      cache_write_price: 3,
      currency: 'USD',
    },
  ])
  todayStmt = new FakeStatement('today')
  monthStmt = new FakeStatement('month')

  prepare(sql: string): FakeStatement {
    if (sql.includes('INSERT INTO usage_logs')) return this.insertStmt
    if (sql.includes('FROM pricing_rules')) return this.pricingStmt
    if (sql.includes('WHERE timestamp >=')) {
      if (sql.includes('COUNT(*) as callCount')) {
        if (sql.includes('GROUP BY cost_currency')) {
          return sql.includes('month') ? this.monthStmt : this.todayStmt
        }
      }
    }
    return new FakeStatement(sql)
  }
}

describe('TokenMeter baseline', () => {
  it('应保留 llm_done 记账与会话统计语义', () => {
    const db = new FakeDb()
    const meter = new TokenMeter(db as never)

    meter.bind('sid-1', 'openai', 'gpt-4o')
    meter.consume({
      type: 'llm_done',
      inputTokens: 100,
      outputTokens: 200,
      cacheReadTokens: 10,
      cacheWriteTokens: 20,
      stopReason: 'end_turn',
      ttftMs: 123,
      e2eMs: 456,
      tps: 8,
    })

    expect(db.insertStmt.calls.length).toBe(1)
    expect(meter.getSessionStats()).toEqual(
      expect.objectContaining({
        totalInputTokens: 100,
        totalOutputTokens: 200,
        totalCacheReadTokens: 10,
        totalCacheWriteTokens: 20,
        callCount: 1,
      }),
    )
  })
})
