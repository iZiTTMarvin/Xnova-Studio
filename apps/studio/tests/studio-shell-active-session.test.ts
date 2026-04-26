import { describe, expect, it } from 'vitest'
import { createStudioShellInspector } from '../src/main/studio-shell-inspector'
import type { SessionSummary } from '@persistence/session-types.js'

function createSummary(
  overrides: Partial<SessionSummary> = {},
): SessionSummary {
  return {
    sessionId: 'session-2',
    projectSlug: 'D--workspace-demo',
    cwd: 'D:/workspace/demo',
    firstMessage: '继续实现 project-aware shell',
    updatedAt: '2026-04-24T00:00:00.000Z',
    gitBranch: 'main',
    fileSize: 200,
    filePath: 'D:/workspace/demo/session-2.jsonl',
    ...overrides,
  }
}

describe('studio shell inspector active session', () => {
  it('会为当前 session 输出真实消息明细，供 renderer 渲染聊天视图', async () => {
    const inspector = createStudioShellInspector({
      store: {
        list() {
          return [createSummary()]
        },
        loadMessages() {
          return {
            conversationSchemaVersion: 2,
            sessionId: 'session-2',
            provider: 'openai',
            model: 'gpt-4.1-mini',
            cwd: 'D:/workspace/demo',
            messages: [
              {
                id: 'user-1',
                role: 'user',
                blocks: [
                  {
                    id: 'user-text-1',
                    type: 'text',
                    content: '继续实现 Studio 主链路',
                  },
                ],
              },
              {
                id: 'assistant-1',
                role: 'assistant',
                blocks: [
                  {
                    id: 'assistant-text-1',
                    type: 'text',
                    content: '收到，我先把会话视图补上。',
                  },
                ],
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
            defaultProvider: 'openai',
            defaultModel: 'gpt-4.1-mini',
            providers: {
              openai: {
                apiKey: '',
                models: ['gpt-4.1-mini'],
              },
            },
            agent: {
              default: 'general',
            },
          },
          warnings: [],
          source: {},
        }
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
      inspector.inspect(
        {
          projectPath: 'D:/workspace/demo',
          sessionId: 'session-2',
        },
        {
          workspacePath: 'D:/workspace/demo',
          lastSelection: null,
        },
      ),
    ).resolves.toMatchObject({
      activeSession: {
        sessionId: 'session-2',
        providerId: 'openai',
        modelId: 'gpt-4.1-mini',
        messages: [
          {
            id: 'user-1',
            role: 'user',
            blocks: [
              {
                id: 'user-text-1',
                type: 'text',
                content: '继续实现 Studio 主链路',
              },
            ],
          },
          {
            id: 'assistant-1',
            role: 'assistant',
            blocks: [
              {
                id: 'assistant-text-1',
                type: 'text',
                content: '收到，我先把会话视图补上。',
              },
            ],
          },
        ],
      },
    })
  })
})
