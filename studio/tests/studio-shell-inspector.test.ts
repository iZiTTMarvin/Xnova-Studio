import { describe, expect, it } from 'vitest'
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
      },
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
      },
      warnings: [],
    })
  })
})
