import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createStudioShellInspector } from '../src/main/studio-shell-inspector'
import type { SessionSummary } from '../../cli/src/persistence/session-types'

function createSummary(
  overrides: Partial<SessionSummary> = {},
): SessionSummary {
  return {
    sessionId: 'session-1',
    projectSlug: 'D--workspace-demo',
    cwd: 'D:/workspace/demo',
    firstMessage: '继续实现 project-aware shell',
    updatedAt: '2026-04-22T10:00:00.000Z',
    gitBranch: 'main',
    fileSize: 120,
    filePath: 'D:/workspace/demo/session-1.jsonl',
    ...overrides,
  }
}

describe('studio shell inspector', () => {
  it('默认实现不应通过 persistence/index 间接引入 libsql 依赖', () => {
    const source = readFileSync(
      'D:\\visual_ProgrammingSoftware\\毕设and简历Projects\\Xnova-Code\\studio\\src\\main\\studio-shell-inspector.ts',
      'utf-8',
    )

    expect(source).not.toContain("cli/src/persistence/index")
  })

  it('无最近项目时返回空白启动上下文', async () => {
    const inspector = createStudioShellInspector({
      store: {
        list() {
          return []
        },
        loadMessages() {
          throw new Error('not called')
        },
        loadSubagents() {
          return []
        },
      },
      getPrimaryAgentId() {
        return 'general'
      },
      listPrimaryAgentIds() {
        return ['general']
      },
    })

    await expect(
      inspector.inspect({}, {
        workspacePath: null,
        lastSelection: null,
      }),
    ).resolves.toEqual({
      startup: {
        recentProject: null,
        recentSession: null,
      },
      recentProjects: [],
      projectSessions: [],
      scratchpadEntries: [],
      defaults: {
        projectPath: null,
        branch: null,
        agentId: 'general',
        modelId: null,
        providerId: null,
        recommendedMode: null,
        allowedModes: ['standard', 'xforge'],
        availablePrimaryAgentIds: ['general'],
        availableModelIds: [],
      },
      issues: [],
      warnings: [],
    })
  })

  it('最近会话损坏时仍返回最近项目，并跳过损坏会话列表', async () => {
    const inspector = createStudioShellInspector({
      store: {
        list() {
          return [createSummary()]
        },
        loadMessages() {
          throw new Error('broken jsonl')
        },
        loadSubagents() {
          return []
        },
      },
      getPrimaryAgentId() {
        return 'general'
      },
      listPrimaryAgentIds() {
        return ['general']
      },
      getGitBranchFn() {
        return 'main'
      },
    })

    await expect(
      inspector.inspect({}, {
        workspacePath: null,
        lastSelection: null,
      }),
    ).resolves.toEqual({
      startup: {
        recentProject: {
          path: 'D:/workspace/demo',
          lastActiveAt: Date.parse('2026-04-22T10:00:00.000Z'),
          exists: false,
        },
        recentSession: {
          projectPath: 'D:/workspace/demo',
          sessionId: 'session-1',
          valid: false,
        },
      },
      recentProjects: [
        {
          path: 'D:/workspace/demo',
          name: 'demo',
          lastActiveAt: Date.parse('2026-04-22T10:00:00.000Z'),
          exists: false,
          gitBranch: 'main',
        },
      ],
      projectSessions: [],
      scratchpadEntries: [],
      defaults: {
        projectPath: 'D:/workspace/demo',
        branch: 'main',
        agentId: 'general',
        modelId: null,
        providerId: null,
        recommendedMode: null,
        allowedModes: ['standard', 'xforge'],
        availablePrimaryAgentIds: ['general'],
        availableModelIds: [],
      },
      issues: [],
      warnings: [],
    })
  })

  it('输出可供 renderer 校验的 Agent / Model 候选，并把会话模型写入 projectSessions', async () => {
    const existingProjectPath =
      'D:\\visual_ProgrammingSoftware\\毕设and简历Projects\\Xnova-Code'
    const inspector = createStudioShellInspector({
      store: {
        list() {
          return [
            createSummary({
              cwd: existingProjectPath,
              projectSlug: 'Xnova-Code',
              filePath: `${existingProjectPath}\\session-1.jsonl`,
            }),
          ]
        },
        loadMessages() {
          return {
            sessionId: 'session-1',
            provider: 'openai',
            model: 'gpt-4o',
            cwd: existingProjectPath,
            messages: [
              {
                id: 'assistant-1',
                role: 'assistant',
                content: '继续实现 shell',
              },
            ],
            leafEventUuid: 'assistant-1',
          }
        },
        loadSubagents() {
          return []
        },
      },
      loadResolvedConfigFn() {
        return {
          effective: {
            defaultProvider: 'anthropic',
            defaultModel: 'claude-sonnet-4-6',
            providers: {
              anthropic: {
                apiKey: '',
                models: ['claude-sonnet-4-6', 'claude-opus-4-6'],
              },
            },
            agent: {
              default: 'general',
            },
          },
          warnings: ['project.toml parse error at line 1:1 — invalid value'],
          source: {},
        }
      },
      getPrimaryAgentId() {
        return 'general'
      },
      listPrimaryAgentIds() {
        return ['general', 'planner']
      },
      getGitBranchFn() {
        return 'main'
      },
    })

    await expect(
      inspector.inspect({}, {
        workspacePath: existingProjectPath,
        lastSelection: null,
      }),
    ).resolves.toMatchObject({
      projectSessions: [
        {
          sessionId: 'session-1',
          providerId: 'openai',
          modelId: 'gpt-4o',
        },
      ],
      defaults: {
        availablePrimaryAgentIds: ['general', 'planner'],
        availableModelIds: ['claude-sonnet-4-6', 'claude-opus-4-6'],
      },
      issues: [
        {
          code: 'project-config-error',
        },
      ],
    })
  })

  it('summary 缺失首条消息时，回退到首个 user 消息前 10 个字作为标题', async () => {
    const existingProjectPath =
      'D:\\visual_ProgrammingSoftware\\毕设and简历Projects\\Xnova-Code'
    const inspector = createStudioShellInspector({
      store: {
        list() {
          return [
            createSummary({
              cwd: existingProjectPath,
              projectSlug: 'Xnova-Code',
              filePath: `${existingProjectPath}\\session-1.jsonl`,
              firstMessage: '',
            }),
          ]
        },
        loadMessages() {
          return {
            sessionId: 'session-1',
            provider: 'openai',
            model: 'gpt-4o',
            cwd: existingProjectPath,
            messages: [
              {
                id: 'user-1',
                role: 'user',
                content: '这是一个用于标题回退的首条消息',
              },
              {
                id: 'assistant-1',
                role: 'assistant',
                content: '收到，我先分析代码结构。',
              },
            ],
            leafEventUuid: 'assistant-1',
          }
        },
        loadSubagents() {
          return []
        },
      },
      getPrimaryAgentId() {
        return 'general'
      },
      listPrimaryAgentIds() {
        return ['general']
      },
      getGitBranchFn() {
        return 'main'
      },
    })

    await expect(
      inspector.inspect({}, {
        workspacePath: existingProjectPath,
        lastSelection: null,
      }),
    ).resolves.toMatchObject({
      projectSessions: [
        {
          sessionId: 'session-1',
          title: '这是一个用于标题回退',
        },
      ],
    })
  })

  it('host 持有的 workspace 路径失效时回退到最近可用项目并透出结构化 issue', async () => {
    const existingProjectPath =
      'D:\\visual_ProgrammingSoftware\\毕设and简历Projects\\Xnova-Code'
    const inspector = createStudioShellInspector({
      store: {
        list() {
          return [
            createSummary({
              cwd: existingProjectPath,
              projectSlug: 'Xnova-Code',
              filePath: `${existingProjectPath}\\session-1.jsonl`,
            }),
          ]
        },
        loadMessages() {
          return {
            sessionId: 'session-1',
            provider: 'openai',
            model: 'gpt-4o',
            cwd: existingProjectPath,
            messages: [],
            leafEventUuid: 'leaf-1',
          }
        },
        loadSubagents() {
          return []
        },
      },
      getPrimaryAgentId() {
        return 'general'
      },
      listPrimaryAgentIds() {
        return ['general']
      },
      getGitBranchFn() {
        return 'main'
      },
    })

    await expect(
      inspector.inspect({}, {
        workspacePath: 'D:/workspace/missing',
        lastSelection: null,
      }),
    ).resolves.toMatchObject({
      defaults: {
        projectPath: existingProjectPath,
      },
      issues: [
        {
          code: 'workspace-missing',
          severity: 'error',
          message: '当前 Workspace 路径已失效，已回退到最近可用项目。',
        },
      ],
    })
  })

  it('把 subagent stopped/partial 状态收敛到项目会话摘要中', async () => {
    const existingProjectPath =
      'D:\\visual_ProgrammingSoftware\\毕设and简历Projects\\Xnova-Code'
    const inspector = createStudioShellInspector({
      store: {
        list() {
          return [
            createSummary({
              cwd: existingProjectPath,
              projectSlug: 'Xnova-Code',
              filePath: `${existingProjectPath}\\session-1.jsonl`,
            }),
          ]
        },
        loadMessages() {
          return {
            sessionId: 'session-1',
            provider: 'openai',
            model: 'gpt-4o',
            cwd: existingProjectPath,
            messages: [],
            leafEventUuid: 'leaf-1',
          }
        },
        loadSubagents() {
          return [
            {
              agentId: 'agent-1',
              description: '扫描 renderer',
              status: 'stopped',
              events: [
                {
                  kind: 'text',
                  text: '已经扫描到 renderer/hooks 目录。',
                },
              ],
            },
          ]
        },
      },
      getPrimaryAgentId() {
        return 'general'
      },
      listPrimaryAgentIds() {
        return ['general']
      },
      getGitBranchFn() {
        return 'main'
      },
    })

    await expect(
      inspector.inspect({}, {
        workspacePath: existingProjectPath,
        lastSelection: null,
      }),
    ).resolves.toMatchObject({
      projectSessions: [
        {
          subagents: [
            {
              agentId: 'agent-1',
              status: 'stopped',
              stateMessage: '已停止，保留部分结果。',
              partialResult: '已经扫描到 renderer/hooks 目录。',
            },
          ],
        },
      ],
    })
  })

  it('会为大会话恢复记录性能采样', async () => {
    const existingProjectPath =
      'D:\\visual_ProgrammingSoftware\\毕设and简历Projects\\Xnova-Code'
    const onPerformanceSample = vi.fn()
    const inspector = createStudioShellInspector({
      store: {
        list() {
          return [
            createSummary({
              cwd: existingProjectPath,
              projectSlug: 'Xnova-Code',
              filePath: `${existingProjectPath}\\session-1.jsonl`,
            }),
          ]
        },
        loadMessages() {
          return {
            sessionId: 'session-1',
            provider: 'openai',
            model: 'gpt-4o',
            cwd: existingProjectPath,
            messages: [],
            leafEventUuid: 'leaf-1',
          }
        },
        loadSubagents() {
          return []
        },
        inspectSession() {
          return {
            messageCount: 42,
            provider: 'openai',
            model: 'gpt-4o',
          }
        },
      },
      getPrimaryAgentId() {
        return 'general'
      },
      listPrimaryAgentIds() {
        return ['general']
      },
      getGitBranchFn() {
        return 'main'
      },
      onPerformanceSample,
    })

    await inspector.inspect({}, {
      workspacePath: existingProjectPath,
      lastSelection: null,
    })

    expect(onPerformanceSample).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'studio-shell-inspect',
        projectPath: existingProjectPath,
        sessionCount: 1,
      }),
    )
  })
})
