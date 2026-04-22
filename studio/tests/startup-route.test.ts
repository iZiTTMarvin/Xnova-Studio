import { describe, expect, it } from 'vitest'
import {
  resolveStartupRoute,
  type StartupRouteInput,
} from '../src/renderer/utils/startup-route'

function createInput(
  overrides: Partial<StartupRouteInput> = {},
): StartupRouteInput {
  const input: StartupRouteInput = {
    recentProject: null,
    recentSession: null,
    ...overrides,
  }
  return input
}

describe('resolveStartupRoute', () => {
  it('用户显式要求空白聊天页时强制走 blank-chat', () => {
    expect(
      resolveStartupRoute(
        createInput({
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
          userOverride: 'blank-chat',
        }),
      ),
    ).toEqual({
      kind: 'blank-chat',
      reason: 'user-override',
    })
  })

  it('没有最近项目时默认进入空白聊天页', () => {
    expect(resolveStartupRoute(createInput())).toEqual({
      kind: 'blank-chat',
      reason: 'no-recent-project',
    })
  })

  it('最近项目与最近会话都有效时恢复最近工作会话', () => {
    expect(
      resolveStartupRoute(
        createInput({
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
        }),
      ),
    ).toEqual({
      kind: 'restore-session',
      projectPath: 'D:/workspace/demo',
      sessionId: 'session-1',
    })
  })

  it('最近项目路径失效时降级到空白聊天页并返回可见原因', () => {
    expect(
      resolveStartupRoute(
        createInput({
          recentProject: {
            path: 'D:/workspace/missing',
            lastActiveAt: 10,
            exists: false,
          },
          recentSession: {
            projectPath: 'D:/workspace/missing',
            sessionId: 'session-1',
            valid: true,
          },
        }),
      ),
    ).toEqual({
      kind: 'blank-chat',
      reason: 'project-missing',
      projectPath: 'D:/workspace/missing',
    })
  })

  it('最近会话损坏时降级到空白聊天页并返回可见原因', () => {
    expect(
      resolveStartupRoute(
        createInput({
          recentProject: {
            path: 'D:/workspace/demo',
            lastActiveAt: 10,
            exists: true,
          },
          recentSession: {
            projectPath: 'D:/workspace/demo',
            sessionId: 'session-1',
            valid: false,
          },
        }),
      ),
    ).toEqual({
      kind: 'blank-chat',
      reason: 'session-invalid',
      projectPath: 'D:/workspace/demo',
      sessionId: 'session-1',
    })
  })
})
