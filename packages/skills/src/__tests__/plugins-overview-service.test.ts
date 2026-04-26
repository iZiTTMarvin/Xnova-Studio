import { describe, it, expect, vi } from 'vitest'
import { readSkillsPluginsOverview } from '../plugins-overview-service.js'

describe('skills/plugins overview service', () => {
  it('计算来源分布，并按最近 / 常用排序 skill', async () => {
    const snapshot = await readSkillsPluginsOverview({
      skillStore: {
        discover: vi.fn(async () => []),
        getAll: () => [
          {
            name: 'commit',
            description: 'commit helper',
            filePath: '/skills/commit/SKILL.md',
            source: 'builtin' as const,
          },
          {
            name: 'repo-plugin:deploy',
            description: 'deploy helper',
            filePath: '/plugins/repo/skills/deploy/SKILL.md',
            source: 'plugin' as const,
            pluginName: 'repo-plugin',
          },
        ],
      },
      sessionStore: {
        list: () => [
          {
            sessionId: 'session-2',
            projectSlug: 'demo',
            cwd: 'D:/workspace/demo',
            firstMessage: 'recent',
            updatedAt: '2026-04-23T10:00:00.000Z',
            gitBranch: 'main',
            fileSize: 0,
            filePath: 'D:/workspace/demo/session-2.jsonl',
          },
          {
            sessionId: 'session-1',
            projectSlug: 'demo',
            cwd: 'D:/workspace/demo',
            firstMessage: 'older',
            updatedAt: '2026-04-22T10:00:00.000Z',
            gitBranch: 'main',
            fileSize: 0,
            filePath: 'D:/workspace/demo/session-1.jsonl',
          },
        ],
        loadMessages: (sessionId: string) =>
          sessionId === 'session-2'
            ? {
                conversationSchemaVersion: 2,
                sessionId,
                provider: 'anthropic',
                model: 'claude-sonnet-4-6',
                cwd: 'D:/workspace/demo',
                messages: [
                  {
                    id: 'assistant-2',
                    role: 'assistant' as const,
                    blocks: [
                      {
                        id: 'tool-a',
                        type: 'tool' as const,
                        toolCallId: 'a',
                        toolName: 'skill',
                        args: { name: 'repo-plugin:deploy' },
                        status: 'done' as const,
                      },
                      {
                        id: 'tool-b',
                        type: 'tool' as const,
                        toolCallId: 'b',
                        toolName: 'skill',
                        args: { name: 'commit' },
                        status: 'done' as const,
                      },
                    ],
                  },
                ],
                leafEventUuid: null,
              }
            : {
                conversationSchemaVersion: 2,
                sessionId,
                provider: 'anthropic',
                model: 'claude-sonnet-4-6',
                cwd: 'D:/workspace/demo',
                messages: [
                  {
                    id: 'assistant-1',
                    role: 'assistant' as const,
                    blocks: [
                      {
                        id: 'tool-c',
                        type: 'tool' as const,
                        toolCallId: 'c',
                        toolName: 'skill',
                        args: { name: 'commit' },
                        status: 'done' as const,
                      },
                    ],
                  },
                ],
                leafEventUuid: null,
              },
      },
      listPlugins: () => [
        {
          name: 'repo-plugin',
          installPath: '/plugins/repo-plugin',
          source: 'xnova' as const,
          version: '1.0.0',
          skillCount: 2,
          hasHooks: true,
          description: 'deploy helpers',
        },
      ],
    })

    expect(snapshot.status).toBe('ready')
    expect(snapshot.sourceDistribution).toEqual([
      { source: 'builtin', count: 1 },
      { source: 'plugin', count: 1 },
    ])
    expect(snapshot.recentSkills[0]?.name).toBe('repo-plugin:deploy')
    expect(snapshot.frequentSkills[0]?.name).toBe('commit')
    expect(snapshot.plugins[0]?.name).toBe('repo-plugin')
  })

  it('在没有任何 skill / plugin 时返回 empty 状态', async () => {
    const snapshot = await readSkillsPluginsOverview({
      skillStore: {
        discover: vi.fn(async () => []),
        getAll: () => [],
      },
      sessionStore: {
        list: () => [],
        loadMessages: () => ({
          conversationSchemaVersion: 2,
          sessionId: 'empty',
          provider: '',
          model: '',
          cwd: '',
          messages: [],
          leafEventUuid: null,
        }),
      },
      listPlugins: () => [],
    })

    expect(snapshot.status).toBe('empty')
    expect(snapshot.recentSkills).toEqual([])
    expect(snapshot.frequentSkills).toEqual([])
    expect(snapshot.plugins).toEqual([])
  })
})
