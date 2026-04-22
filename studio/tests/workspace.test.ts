import { describe, expect, it, vi } from 'vitest'
import { selectWorkspaceDirectory } from '../src/main/workspace'

function createLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }
}

describe('workspace directory selection', () => {
  it('成功选择目录时返回 selected 语义', async () => {
    const logger = createLogger()
    const dialog = {
      showOpenDialog: vi.fn().mockResolvedValue({
        canceled: false,
        filePaths: ['D:/workspace'],
      }),
    }
    const fileSystem = {
      stat: vi.fn().mockResolvedValue({
        isDirectory: () => true,
      }),
    }

    const result = await selectWorkspaceDirectory({
      dialog,
      fileSystem,
      logger,
    })

    expect(result).toEqual({
      ok: true,
      code: 'selected',
      path: 'D:/workspace',
    })
    expect(logger.info).toHaveBeenCalled()
  })

  it('用户取消选择时返回 cancelled 语义', async () => {
    const logger = createLogger()
    const dialog = {
      showOpenDialog: vi.fn().mockResolvedValue({
        canceled: true,
        filePaths: [],
      }),
    }
    const fileSystem = {
      stat: vi.fn(),
    }

    const result = await selectWorkspaceDirectory({
      dialog,
      fileSystem,
      logger,
    })

    expect(result).toEqual({
      ok: false,
      code: 'cancelled',
      message: '用户取消了 workspace 目录选择',
    })
    expect(fileSystem.stat).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalled()
  })

  it('对话框返回空路径时返回 empty 语义', async () => {
    const logger = createLogger()
    const dialog = {
      showOpenDialog: vi.fn().mockResolvedValue({
        canceled: false,
        filePaths: [],
      }),
    }
    const fileSystem = {
      stat: vi.fn(),
    }

    const result = await selectWorkspaceDirectory({
      dialog,
      fileSystem,
      logger,
    })

    expect(result).toEqual({
      ok: false,
      code: 'empty',
      message: 'workspace 目录选择结果为空',
    })
    expect(logger.warn).toHaveBeenCalled()
  })

  it('对话框返回无效目录时返回 invalid 语义', async () => {
    const logger = createLogger()
    const dialog = {
      showOpenDialog: vi.fn().mockResolvedValue({
        canceled: false,
        filePaths: ['workspace'],
      }),
    }
    const fileSystem = {
      stat: vi.fn(),
    }

    const result = await selectWorkspaceDirectory({
      dialog,
      fileSystem,
      logger,
    })

    expect(result).toEqual({
      ok: false,
      code: 'invalid',
      message: 'workspace 目录路径无效: workspace',
    })
    expect(fileSystem.stat).not.toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalled()
  })

  it('目录校验抛出异常时返回 error 语义', async () => {
    const logger = createLogger()
    const dialog = {
      showOpenDialog: vi.fn().mockResolvedValue({
        canceled: false,
        filePaths: ['D:/workspace'],
      }),
    }
    const fileSystem = {
      stat: vi.fn().mockRejectedValue(new Error('disk unavailable')),
    }

    const result = await selectWorkspaceDirectory({
      dialog,
      fileSystem,
      logger,
    })

    expect(result).toEqual({
      ok: false,
      code: 'error',
      message: 'workspace 目录校验失败: disk unavailable',
    })
    expect(logger.error).toHaveBeenCalled()
  })
})
