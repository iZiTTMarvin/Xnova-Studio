import { describe, expect, it } from 'vitest'
import {
  StudioBridgeValidationError,
  assertStudioNoPayload,
  parseStudioHostState,
  parseStudioOpenWorkspaceResponse,
  parseStudioShellSnapshot,
  parseStudioShellSnapshotRequest,
  parseStudioRuntimeEvent,
  parseStudioRuntimeCancelRequest,
  parseStudioRuntimeCancelResult,
  parseStudioRuntimeInspectRequest,
  parseStudioRuntimeInspectResult,
  parseStudioRuntimeSubmitRequest,
  parseStudioRuntimeSubmitResult,
} from '../src/preload/studio-validators'

describe('studio preload validators', () => {
  it('拒绝多余参数与非法 runtime inspect payload', () => {
    expect(() => assertStudioNoPayload({ extra: true }, 'studio.host.getState')).toThrow(
      StudioBridgeValidationError,
    )

    expect(() => parseStudioRuntimeInspectRequest({ refresh: 'yes' })).toThrow(
      StudioBridgeValidationError,
    )

    expect(() => parseStudioShellSnapshotRequest({ projectPath: 123 })).toThrow(
      StudioBridgeValidationError,
    )
  })

  it('校验 host state 与 openWorkspace 响应结构', () => {
    expect(
      parseStudioHostState({
        workspacePath: 'D:/workspace/demo',
        lastSelection: {
          ok: true,
          code: 'selected',
          path: 'D:/workspace/demo',
        },
      }),
    ).toEqual({
      workspacePath: 'D:/workspace/demo',
      lastSelection: {
        ok: true,
        code: 'selected',
        path: 'D:/workspace/demo',
      },
    })

    expect(
      parseStudioOpenWorkspaceResponse({
        selection: {
          ok: false,
          code: 'cancelled',
          message: '用户取消了 workspace 目录选择',
        },
        state: {
          workspacePath: null,
          lastSelection: null,
        },
      }),
    ).toEqual({
      selection: {
        ok: false,
        code: 'cancelled',
        message: '用户取消了 workspace 目录选择',
      },
      state: {
        workspacePath: null,
        lastSelection: null,
      },
    })
  })

  it('校验 runtime inspect 响应与 runtime 事件结构', () => {
    expect(
      parseStudioRuntimeInspectResult({
        ok: true,
        status: 'ready',
        snapshot: {
          sessionId: null,
          isRunning: false,
          provider: 'anthropic',
          model: 'claude-sonnet-4-6',
          warnings: [],
        },
        workspacePath: 'D:/workspace/demo',
        configWarnings: ['legacy migration failed'],
        issues: [],
      }),
    ).toEqual({
      ok: true,
      status: 'ready',
      snapshot: {
        sessionId: null,
        isRunning: false,
        provider: 'anthropic',
        model: 'claude-sonnet-4-6',
        warnings: [],
      },
      workspacePath: 'D:/workspace/demo',
      configWarnings: ['legacy migration failed'],
      issues: [],
    })

    expect(
      parseStudioRuntimeEvent({
        type: 'run_started',
        timestamp: '2026-04-22T00:00:00.000Z',
        runId: 'run-1',
        sessionId: 'session-1',
        payload: {
          status: 'running',
        },
      }),
    ).toEqual({
      type: 'run_started',
      timestamp: '2026-04-22T00:00:00.000Z',
      runId: 'run-1',
      sessionId: 'session-1',
      payload: {
        status: 'running',
      },
    })
  })

  it('校验 runtime submit 请求与响应结构', () => {
    expect(
      parseStudioRuntimeSubmitRequest({
        text: '  分析当前项目结构  ',
        projectPath: 'D:/workspace/demo',
        sessionId: 'session-1',
        agentId: 'general',
        modelId: 'claude-sonnet-4-6',
      }),
    ).toEqual({
      text: '分析当前项目结构',
      projectPath: 'D:/workspace/demo',
      sessionId: 'session-1',
      agentId: 'general',
      modelId: 'claude-sonnet-4-6',
    })

    expect(
      parseStudioRuntimeSubmitResult({
        ok: true,
        sessionId: 'session-1',
      }),
    ).toEqual({
      ok: true,
      sessionId: 'session-1',
    })

    expect(
      parseStudioRuntimeSubmitResult({
        ok: false,
        error: 'submit 失败',
      }),
    ).toEqual({
      ok: false,
      error: 'submit 失败',
    })

    expect(() => parseStudioRuntimeSubmitRequest({ text: '   ' })).toThrow(
      StudioBridgeValidationError,
    )
  })

  it('校验 runtime cancel 请求与响应结构', () => {
    expect(
      parseStudioRuntimeCancelRequest({
        runId: ' run-1 ',
        reason: ' user-stop ',
      }),
    ).toEqual({
      runId: 'run-1',
      reason: 'user-stop',
    })

    expect(parseStudioRuntimeCancelRequest(undefined)).toEqual({})
    expect(parseStudioRuntimeCancelResult({ ok: true, runId: 'run-1' })).toEqual({
      ok: true,
      runId: 'run-1',
    })
    expect(parseStudioRuntimeCancelResult({ ok: false, error: 'no run' })).toEqual({
      ok: false,
      error: 'no run',
    })

    expect(() => parseStudioRuntimeCancelRequest({ runId: 123 })).toThrow(
      StudioBridgeValidationError,
    )
    expect(() => parseStudioRuntimeCancelResult({ ok: false })).toThrow(
      StudioBridgeValidationError,
    )
  })

  it('校验 shell snapshot 请求与响应结构', () => {
    expect(
      parseStudioShellSnapshotRequest({
        projectPath: 'D:/workspace/demo',
      }),
    ).toEqual({
      projectPath: 'D:/workspace/demo',
    })

    expect(
      parseStudioShellSnapshot({
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
        recentProjects: [
          {
            path: 'D:/workspace/demo',
            name: 'demo',
            lastActiveAt: 10,
            exists: true,
            gitBranch: 'main',
          },
        ],
        projectSessions: [
          {
            sessionId: 'session-1',
            projectPath: 'D:/workspace/demo',
            title: '继续实现 shell',
            updatedAt: '2026-04-22T00:00:00.000Z',
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
          title: '继续实现 shell',
          updatedAt: '2026-04-22T00:00:00.000Z',
          gitBranch: 'main',
          messageCount: 12,
          providerId: 'anthropic',
          modelId: 'claude-sonnet-4-6',
          subagents: [],
          leafEventUuid: 'assistant-1',
          messages: [
            {
              id: 'assistant-1',
              role: 'assistant',
              blocks: [
                {
                  id: 'text-1',
                  type: 'text',
                  content: '我先查看目录',
                },
                {
                  id: 'tool-1',
                  type: 'tool',
                  toolCallId: 'tool-1',
                  toolName: 'read_file',
                  args: {
                    path: 'D:/workspace/demo/SPEC.md',
                  },
                  status: 'done',
                  success: true,
                },
              ],
            },
          ],
        },
        scratchpadEntries: [],
        defaults: {
          projectPath: 'D:/workspace/demo',
          branch: 'main',
          agentId: 'general',
          modelId: 'claude-sonnet-4-6',
          providerId: 'anthropic',
          recommendedMode: 'xforge',
          allowedModes: ['standard', 'xforge'],
          availablePrimaryAgentIds: ['general', 'planner'],
          availableModelIds: ['claude-sonnet-4-6', 'gpt-4o'],
        },
        issues: [
          {
            code: 'project-config-error',
            severity: 'error',
            message: '当前项目配置存在错误，已回退到 user + builtin 默认。',
          },
        ],
        warnings: [],
      }),
    ).toEqual({
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
      recentProjects: [
        {
          path: 'D:/workspace/demo',
          name: 'demo',
          lastActiveAt: 10,
          exists: true,
          gitBranch: 'main',
        },
      ],
      projectSessions: [
        {
          sessionId: 'session-1',
          projectPath: 'D:/workspace/demo',
          title: '继续实现 shell',
          updatedAt: '2026-04-22T00:00:00.000Z',
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
        title: '继续实现 shell',
        updatedAt: '2026-04-22T00:00:00.000Z',
        gitBranch: 'main',
        messageCount: 12,
        providerId: 'anthropic',
        modelId: 'claude-sonnet-4-6',
        subagents: [],
        leafEventUuid: 'assistant-1',
        messages: [
          {
            id: 'assistant-1',
            role: 'assistant',
            blocks: [
              {
                id: 'text-1',
                type: 'text',
                content: '我先查看目录',
              },
              {
                id: 'tool-1',
                type: 'tool',
                toolCallId: 'tool-1',
                toolName: 'read_file',
                args: {
                  path: 'D:/workspace/demo/SPEC.md',
                },
                status: 'done',
                success: true,
              },
            ],
          },
        ],
      },
      scratchpadEntries: [],
      defaults: {
        projectPath: 'D:/workspace/demo',
        branch: 'main',
        agentId: 'general',
        modelId: 'claude-sonnet-4-6',
        providerId: 'anthropic',
        recommendedMode: 'xforge',
        allowedModes: ['standard', 'xforge'],
        availablePrimaryAgentIds: ['general', 'planner'],
        availableModelIds: ['claude-sonnet-4-6', 'gpt-4o'],
      },
      issues: [
        {
          code: 'project-config-error',
          severity: 'error',
          message: '当前项目配置存在错误，已回退到 user + builtin 默认。',
        },
      ],
      warnings: [],
    })
  })
})
