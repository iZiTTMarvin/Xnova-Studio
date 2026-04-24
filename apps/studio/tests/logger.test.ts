import { describe, expect, it, vi } from 'vitest'
import { createMainLogger } from '../src/main/logger'

describe('main logger', () => {
  it('输出包含时间戳、级别和模块前缀的结构化日志', () => {
    const output = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }

    const logger = createMainLogger(output)
    logger.info('应用已启动', { windowCount: 1 })

    expect(output.info).toHaveBeenCalledTimes(1)

    const [line, details] = output.info.mock.calls[0] ?? []
    expect(String(line)).toMatch(/^\[[0-9]{4}-[0-9]{2}-[0-9]{2}T/)
    expect(String(line)).toContain('[INFO]')
    expect(String(line)).toContain('[studio/main]')
    expect(String(line)).toContain('应用已启动')
    expect(details).toEqual({ windowCount: 1 })
  })
})
