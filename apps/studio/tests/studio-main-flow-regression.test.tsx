// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/renderer/App'

function clearBridge() {
  delete (window as Window & { xnovaStudio?: unknown }).xnovaStudio
}

function createBridge(options?: {
  hostState?: {
    workspacePath: string | null
    lastSelection: null
  }
  runtimeInspectResult?: unknown
  shellSnapshot?: unknown
  runtimeSubmit?: (input: unknown) => Promise<unknown>
  providerSettingsSnapshot?: unknown
}) {
  const getState = vi.fn(async () => ({
    workspacePath: null,
    lastSelection: null,
    ...(options?.hostState ?? {}),
  }))

  return {
    host: {
      getState,
      openWorkspace: vi.fn(async () => ({
        selection: {
          ok: false as const,
          code: 'cancelled' as const,
          message: '用户取消了 workspace 目录选择',
        },
        state: await getState(),
      })),
      onStateChanged: () => () => {},
    },
    runtime: {
      inspect: vi.fn(async () => options?.runtimeInspectResult ?? {
        ok: true as const,
        status: 'ready' as const,
        snapshot: {
          sessionId: null,
          isRunning: false,
          provider: 'anthropic',
          model: 'claude-sonnet-4-6',
          warnings: [],
        },
        workspacePath: options?.hostState?.workspacePath ?? null,
        configWarnings: [],
        issues: [],
      }),
      submit: vi.fn(async (input) =>
        options?.runtimeSubmit
          ? options.runtimeSubmit(input)
          : {
              ok: true as const,
              sessionId: 'session-1',
            }),
      onEvent: () => () => {},
    },
    shell: {
      getSnapshot: vi.fn(async () => options?.shellSnapshot ?? {
        startup: {
          recentProject: null,
          recentSession: null,
        },
        recentProjects: [],
        projectSessions: [],
        scratchpadEntries: [],
        defaults: {
          projectPath: options?.hostState?.workspacePath ?? null,
          branch: 'main',
          agentId: 'general',
          modelId: 'claude-sonnet-4-6',
          providerId: 'anthropic',
          recommendedMode: null,
          allowedModes: ['standard', 'xforge'],
          availablePrimaryAgentIds: ['general'],
          availableModelIds: ['claude-sonnet-4-6'],
        },
        issues: [],
        warnings: [],
      }),
    },
    settings: {
      getProviderSettings: vi.fn(async () => options?.providerSettingsSnapshot ?? {
        editableConfig: {
          defaultProvider: 'anthropic',
          defaultModel: 'claude-sonnet-4-6',
          subAgentModel: null,
          providers: [
            {
              id: 'anthropic',
              apiKey: 'sk-ant',
              baseURL: null,
              protocol: 'anthropic',
              models: ['claude-sonnet-4-6'],
              visionModels: [],
            },
            {
              id: 'openai',
              apiKey: 'sk-open',
              baseURL: null,
              protocol: 'openai',
              models: ['gpt-4.1', 'gpt-4.1-mini'],
              visionModels: [],
            },
          ],
        },
        effectiveDefaults: {
          defaultProvider: 'anthropic',
          defaultModel: 'claude-sonnet-4-6',
        },
        source: {},
        warnings: [],
      }),
      saveProviderSettings: vi.fn(),
      testProviderConnection: vi.fn(),
    },
    memory: {
      getOverview: vi.fn(async () => ({
        enabled: true,
        status: 'ready' as const,
        statusMessage: 'Embedding 已就绪（维度 1536）。',
        embedding: {
          configured: true,
          dimension: 1536,
          missingFields: [],
        },
        overview: {
          projectPath: options?.hostState?.workspacePath ?? null,
          globalEntries: 3,
          projectEntries: 2,
          vectorChunks: 10,
        },
        source: {},
        warnings: [],
      })),
      rebuild: vi.fn(async () => ({
        success: true as const,
        message: 'Memory 索引已完成重建。',
      })),
    },
    mcp: {
      getOverview: vi.fn(),
      addServer: vi.fn(),
      deleteServer: vi.fn(),
    },
    skillsPlugins: {
      getOverview: vi.fn(),
    },
  }
}

afterEach(() => {
  clearBridge()
  cleanup()
  window.localStorage.clear()
})

describe('studio main flow regression', () => {
  it('activeSession 会展示真实聊天消息流，并允许继续输入', async () => {
    ;(window as Window & { xnovaStudio?: unknown }).xnovaStudio = createBridge({
      hostState: {
        workspacePath: 'D:/workspace/demo',
        lastSelection: null,
      },
      shellSnapshot: {
        startup: {
          recentProject: {
            path: 'D:/workspace/demo',
            lastActiveAt: 10,
            exists: true,
          },
          recentSession: {
            projectPath: 'D:/workspace/demo',
            sessionId: 'session-1',
            valid: true,
          },
        },
        recentProjects: [],
        projectSessions: [
          {
            sessionId: 'session-1',
            projectPath: 'D:/workspace/demo',
            title: '继续实现 project-aware shell',
            updatedAt: '2026-04-24T00:00:00.000Z',
            gitBranch: 'main',
            messageCount: 12,
            providerId: 'anthropic',
            modelId: 'claude-sonnet-4-6',
            subagents: [],
          },
        ],
        activeSession: {
          sessionId: 'session-1',
          projectPath: 'D:/workspace/demo',
          title: '继续实现 project-aware shell',
          updatedAt: '2026-04-24T00:00:00.000Z',
          gitBranch: 'main',
          messageCount: 12,
          providerId: 'anthropic',
          modelId: 'claude-sonnet-4-6',
          leafEventUuid: 'assistant-1',
          messages: [
            {
              id: 'user-1',
              role: 'user',
              content: '请继续实现主壳聊天流。',
            },
            {
              id: 'assistant-1',
              role: 'assistant',
              content: '收到，我先把会话聊天视图补上。',
            },
          ],
          subagents: [],
        },
        scratchpadEntries: [],
        defaults: {
          projectPath: 'D:/workspace/demo',
          branch: 'main',
          agentId: 'general',
          modelId: 'claude-sonnet-4-6',
          providerId: 'anthropic',
          recommendedMode: null,
          allowedModes: ['standard', 'xforge'],
          availablePrimaryAgentIds: ['general'],
          availableModelIds: ['claude-sonnet-4-6'],
        },
        warnings: [],
        issues: [],
      },
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('请继续实现主壳聊天流。')).toBeTruthy()
    })

    expect(screen.getByText('收到，我先把会话聊天视图补上。')).toBeTruthy()
    expect(screen.getByRole('textbox', { name: '项目级新对话输入' })).toBeTruthy()
  })

  it('未绑定 Workspace 且 runtime 未就绪时，发送按钮保持禁用', async () => {
    const runtimeSubmit = vi.fn(async () => ({
      ok: true as const,
      sessionId: 'session-3',
    }))
    ;(window as Window & { xnovaStudio?: unknown }).xnovaStudio = createBridge({
      hostState: {
        workspacePath: null,
        lastSelection: null,
      },
      runtimeInspectResult: {
        ok: true as const,
        status: 'not-ready' as const,
        snapshot: {
          sessionId: null,
          isRunning: false,
          provider: 'anthropic',
          model: 'claude-sonnet-4-6',
          warnings: [],
        },
        workspacePath: null,
        configWarnings: [],
        issues: [
          {
            code: 'runtime-not-ready',
            severity: 'warning',
            message: '当前尚未绑定 Workspace，runtime 未就绪。',
          },
        ],
      },
      runtimeSubmit,
    })

    render(<App />)

    const input = await screen.findByRole('textbox', { name: '项目级新对话输入' })
    fireEvent.change(input, { target: { value: '继续实现聊天主链路' } })

    const sendButton = screen.getByRole('button', { name: '发送提示词' })
    expect(sendButton.hasAttribute('disabled')).toBe(true)
    fireEvent.click(sendButton)
    expect(runtimeSubmit).not.toHaveBeenCalled()
  })

  it('主工作页支持会话级 Provider / Model 选择，并按当前选择提交', async () => {
    const runtimeSubmit = vi.fn(async () => ({
      ok: true as const,
      sessionId: 'session-3',
    }))
    ;(window as Window & { xnovaStudio?: unknown }).xnovaStudio = createBridge({
      hostState: {
        workspacePath: 'D:/workspace/demo',
        lastSelection: null,
      },
      runtimeSubmit,
    })

    render(<App />)

    const input = await screen.findByRole('textbox', { name: '项目级新对话输入' })
    const providerSelect = await screen.findByRole('combobox', { name: '会话平台' })
    const modelSelect = await screen.findByRole('combobox', { name: '会话模型' })

    fireEvent.change(providerSelect, { target: { value: 'openai' } })
    fireEvent.change(modelSelect, { target: { value: 'gpt-4.1-mini' } })
    fireEvent.change(input, { target: { value: '请用当前会话模型继续分析。' } })
    fireEvent.click(screen.getByRole('button', { name: '发送提示词' }))

    await waitFor(() => {
      expect(runtimeSubmit).toHaveBeenCalledWith({
        text: '请用当前会话模型继续分析。',
        projectPath: 'D:/workspace/demo',
        sessionId: null,
        agentId: 'general',
        providerId: 'openai',
        modelId: 'gpt-4.1-mini',
      })
    })
  })

  it('点击 XForge 时展示暂未开放提示，而不是伪装成已切换成功', async () => {
    ;(window as Window & { xnovaStudio?: unknown }).xnovaStudio = createBridge({
      hostState: {
        workspacePath: 'D:/workspace/demo',
        lastSelection: null,
      },
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'XForge' })).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: 'XForge' }))

    expect(screen.getByText('XForge 暂未开放')).toBeTruthy()
    expect(screen.getByText('当前阶段请先使用标准模式继续主链路。')).toBeTruthy()
  })
})
