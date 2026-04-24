import { describe, expect, it } from 'vitest'
import {
  parseStudioRuntimeSubmitRequest,
  parseStudioShellSnapshot,
  parseStudioShellSnapshotRequest,
} from '../src/preload/studio-validators'

describe('studio shell contract regression', () => {
  it('runtime.submit 请求支持 providerId，shell.getSnapshot 请求支持 sessionId', () => {
    expect(
      parseStudioRuntimeSubmitRequest({
        text: '  分析当前项目结构  ',
        projectPath: 'D:/workspace/demo',
        providerId: 'openai',
        modelId: 'gpt-4.1-mini',
      }),
    ).toEqual({
      text: '分析当前项目结构',
      projectPath: 'D:/workspace/demo',
      providerId: 'openai',
      modelId: 'gpt-4.1-mini',
    })

    expect(
      parseStudioShellSnapshotRequest({
        projectPath: 'D:/workspace/demo',
        sessionId: 'session-2',
      }),
    ).toEqual({
      projectPath: 'D:/workspace/demo',
      sessionId: 'session-2',
    })
  })

  it('shell snapshot 可携带 activeSession 的真实消息明细', () => {
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
            sessionId: 'session-2',
            valid: true,
          },
        },
        recentProjects: [],
        projectSessions: [
          {
            sessionId: 'session-2',
            projectPath: 'D:/workspace/demo',
            title: '继续实现 shell',
            updatedAt: '2026-04-24T00:00:00.000Z',
            gitBranch: 'main',
            messageCount: 4,
            providerId: 'openai',
            modelId: 'gpt-4.1-mini',
            subagents: [],
          },
        ],
        activeSession: {
          sessionId: 'session-2',
          projectPath: 'D:/workspace/demo',
          title: '继续实现 shell',
          updatedAt: '2026-04-24T00:00:00.000Z',
          gitBranch: 'main',
          messageCount: 4,
          providerId: 'openai',
          modelId: 'gpt-4.1-mini',
          leafEventUuid: 'assistant-1',
          messages: [
            {
              id: 'user-1',
              role: 'user',
              content: '请继续实现 Studio 主链路。',
            },
            {
              id: 'assistant-1',
              role: 'assistant',
              content: '收到，我先把会话视图补上。',
            },
          ],
          subagents: [],
        },
        scratchpadEntries: [],
        defaults: {
          projectPath: 'D:/workspace/demo',
          branch: 'main',
          agentId: 'general',
          modelId: 'gpt-4.1-mini',
          providerId: 'openai',
          recommendedMode: null,
          allowedModes: ['standard', 'xforge'],
          availablePrimaryAgentIds: ['general'],
          availableModelIds: ['gpt-4.1-mini'],
        },
        issues: [],
        warnings: [],
      }),
    ).toMatchObject({
      activeSession: {
        sessionId: 'session-2',
        messages: [
          {
            id: 'user-1',
            role: 'user',
            content: '请继续实现 Studio 主链路。',
          },
          {
            id: 'assistant-1',
            role: 'assistant',
            content: '收到，我先把会话视图补上。',
          },
        ],
      },
    })
  })
})
