// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import {
  readProjectWorkPreference,
  resolveWorkPreferenceRestore,
  writeProjectWorkPreference,
} from '../src/renderer/utils/work-preferences'
import type {
  StudioProjectSessionSummary,
  StudioShellDefaults,
} from '../src/shared/studio-bridge-contract'

const PROJECT_PATH = 'D:/workspace/demo'

const DEFAULTS: StudioShellDefaults = {
  projectPath: PROJECT_PATH,
  branch: 'main',
  agentId: 'general',
  modelId: 'claude-sonnet-4-6',
  providerId: 'anthropic',
  recommendedMode: 'xforge',
  allowedModes: ['standard', 'xforge'],
  availablePrimaryAgentIds: ['general', 'planner'],
  availableModelIds: ['claude-sonnet-4-6', 'gpt-4o'],
}

const PROJECT_SESSIONS: StudioProjectSessionSummary[] = [
  {
    sessionId: 'session-1',
    projectPath: PROJECT_PATH,
    title: '继续实现 project-aware shell',
    updatedAt: '2026-04-23T00:00:00.000Z',
    gitBranch: 'main',
    messageCount: 12,
    providerId: 'openai',
    modelId: 'gpt-4o',
    subagents: [],
  },
]

afterEach(() => {
  window.localStorage.clear()
})

describe('work preference restore', () => {
  it('统一存储 project 级最近偏好', () => {
    writeProjectWorkPreference(PROJECT_PATH, {
      sessionId: 'session-1',
      mode: 'standard',
      agentId: 'planner',
      modelId: 'gpt-4o',
    })

    expect(readProjectWorkPreference(PROJECT_PATH)).toEqual({
      sessionId: 'session-1',
      mode: 'standard',
      agentId: 'planner',
      modelId: 'gpt-4o',
    })
  })

  it('优先恢复项目级最近 session / mode / agent / model 选择', () => {
    writeProjectWorkPreference(PROJECT_PATH, {
      sessionId: 'session-1',
      mode: 'standard',
      agentId: 'planner',
      modelId: 'gpt-4o',
    })

    const restored = resolveWorkPreferenceRestore({
      projectPath: PROJECT_PATH,
      startupSessionId: 'session-1',
      sessions: PROJECT_SESSIONS,
      defaults: DEFAULTS,
      storedPreference: readProjectWorkPreference(PROJECT_PATH),
    })

    expect(restored).toMatchObject({
      sessionId: 'session-1',
      mode: 'standard',
      agentId: 'planner',
      modelId: 'gpt-4o',
      status: {
        kind: 'restored',
      },
      canRestoreProjectDefaults: true,
      projectDefaults: {
        mode: 'xforge',
        agentId: 'general',
        modelId: 'claude-sonnet-4-6',
      },
    })
  })

  it('最近偏好失效时回退到 startup session 与项目推荐值', () => {
    writeProjectWorkPreference(PROJECT_PATH, {
      sessionId: 'session-missing',
      mode: 'xforge',
      agentId: 'writer',
      modelId: 'gemini-2.5-pro',
    })

    const restored = resolveWorkPreferenceRestore({
      projectPath: PROJECT_PATH,
      startupSessionId: 'session-1',
      sessions: PROJECT_SESSIONS,
      defaults: {
        ...DEFAULTS,
        allowedModes: ['standard'],
      },
      storedPreference: readProjectWorkPreference(PROJECT_PATH),
    })

    expect(restored).toMatchObject({
      sessionId: 'session-1',
      mode: 'standard',
      agentId: 'general',
      modelId: 'gpt-4o',
      status: {
        kind: 'fallback',
      },
      canRestoreProjectDefaults: true,
    })
  })

  it('没有最近偏好时回落到项目推荐值并标记 empty', () => {
    const restored = resolveWorkPreferenceRestore({
      projectPath: PROJECT_PATH,
      startupSessionId: null,
      sessions: [],
      defaults: DEFAULTS,
      storedPreference: null,
    })

    expect(restored).toMatchObject({
      sessionId: null,
      mode: 'xforge',
      agentId: 'general',
      modelId: 'claude-sonnet-4-6',
      status: {
        kind: 'empty',
      },
      canRestoreProjectDefaults: false,
    })
  })
})
