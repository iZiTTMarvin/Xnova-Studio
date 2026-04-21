/**
 * CLI Host Launcher 测试
 *
 * 目标：ccli 入口只负责解析参数；初始化、信任校验、REPL / Pipe Mode 委托均下沉到 host/cli。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runCliHost } from '../launcher.js'

const mocks = vi.hoisted(() => ({
  initialize: vi.fn(() => ({ created: [], warnings: [] })),
  isSensitiveDirectory: vi.fn(() => false),
  confirmWorkspaceTrust: vi.fn(async () => true),
  runPipeMode: vi.fn(async () => {}),
  startRepl: vi.fn(async () => ({ unmount: vi.fn() })),
  registerLifecycle: vi.fn(),
  getCurrentSessionId: vi.fn(() => 'session-1'),
  finalizeSession: vi.fn(),
  closeDb: vi.fn(),
  leaveAlternateScreen: vi.fn(),
  stopFileWatcher: vi.fn(),
}))

vi.mock('../../../core/initializer.js', () => ({
  initialize: mocks.initialize,
}))

vi.mock('../../../core/workspace-trust.js', () => ({
  isSensitiveDirectory: mocks.isSensitiveDirectory,
  confirmWorkspaceTrust: mocks.confirmWorkspaceTrust,
}))

vi.mock('../pipe-mode.js', () => ({
  runPipeMode: mocks.runPipeMode,
}))

vi.mock('../repl.js', () => ({
  startRepl: mocks.startRepl,
}))

vi.mock('../lifecycle.js', () => ({
  registerLifecycle: mocks.registerLifecycle,
}))

vi.mock('../../../ui/useChat.js', () => ({
  getCurrentSessionId: mocks.getCurrentSessionId,
  sessionLogger: {
    finalize: mocks.finalizeSession,
  },
}))

vi.mock('../../../persistence/index.js', () => ({
  closeDb: mocks.closeDb,
}))

vi.mock('../../../ui/terminal-screen.js', () => ({
  leaveAlternateScreen: mocks.leaveAlternateScreen,
}))

vi.mock('../../../core/bootstrap.js', () => ({
  stopFileWatcher: mocks.stopFileWatcher,
}))

describe('runCliHost()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('Pipe Mode 在 host 层完成初始化后委托给 runPipeMode()', async () => {
    await runCliHost({
      prompt: 'hello',
      model: 'gpt-4o',
      provider: 'openai',
      resumeSessionId: undefined,
      showResumeOnStart: false,
      yes: true,
      noTools: false,
      json: false,
      verbose: false,
      web: false,
      help: false,
      version: false,
    })

    expect(mocks.initialize).toHaveBeenCalledTimes(1)
    expect(mocks.runPipeMode).toHaveBeenCalledWith(expect.objectContaining({
      prompt: 'hello',
      model: 'gpt-4o',
      provider: 'openai',
      yes: true,
    }))
    expect(mocks.startRepl).not.toHaveBeenCalled()
  })

  it('REPL Mode 在 host 层处理信任校验、启动 REPL 并注册 lifecycle', async () => {
    await runCliHost({
      prompt: null,
      model: 'gpt-4o',
      provider: 'openai',
      resumeSessionId: 'resume-1',
      showResumeOnStart: true,
      yes: false,
      noTools: false,
      json: false,
      verbose: false,
      web: true,
      help: false,
      version: false,
    })

    expect(mocks.initialize).toHaveBeenCalledTimes(1)
    expect(mocks.isSensitiveDirectory).toHaveBeenCalledTimes(1)
    expect(mocks.startRepl).toHaveBeenCalledWith(expect.objectContaining({
      resumeSessionId: 'resume-1',
      showResumeOnStart: true,
      model: 'gpt-4o',
      provider: 'openai',
      web: true,
      getSessionId: expect.any(Function),
    }))
    expect(mocks.registerLifecycle).toHaveBeenCalledWith(expect.objectContaining({
      getSessionId: expect.any(Function),
      finalizeSession: expect.any(Function),
      closeDb: expect.any(Function),
      leaveAlternateScreen: expect.any(Function),
      stopFileWatcher: expect.any(Function),
    }))
  })
})
