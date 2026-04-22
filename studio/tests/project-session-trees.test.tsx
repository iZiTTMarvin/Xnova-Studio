// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProjectTreePanel } from '../src/renderer/components/ProjectTreePanel'
import { ScratchpadList } from '../src/renderer/components/ScratchpadList'

afterEach(() => {
  cleanup()
})

const recentProjects = [
  {
    path: 'D:/workspace/demo',
    name: 'demo',
    lastActiveAt: 10,
    exists: true,
    gitBranch: 'main',
  },
  {
    path: 'D:/workspace/alpha',
    name: 'alpha',
    lastActiveAt: 9,
    exists: true,
    gitBranch: 'feature/phase5',
  },
]

const projectSessions = [
  {
    sessionId: 'session-1',
    projectPath: 'D:/workspace/demo',
    title: '实现 Phase 5 主壳',
    updatedAt: '2026-04-22T10:00:00.000Z',
    gitBranch: 'main',
    messageCount: 12,
    subagents: [
      {
        agentId: 'explorer-1',
        description: '扫描 renderer 目录',
        status: 'running' as const,
      },
    ],
  },
]

describe('project session trees', () => {
  it('展示最近项目列表与项目内会话树', () => {
    render(
      <ProjectTreePanel
        recentProjects={recentProjects}
        selectedProjectPath="D:/workspace/demo"
        onProjectSelect={vi.fn()}
        sessions={projectSessions}
        activeSessionId="session-1"
        onSessionSelect={vi.fn()}
      />,
    )

    const projectTree = screen.getByLabelText('项目树')
    expect(within(projectTree).getByText('demo')).toBeTruthy()
    expect(within(projectTree).getByText('alpha')).toBeTruthy()
    expect(within(projectTree).getByText('实现 Phase 5 主壳')).toBeTruthy()
  })

  it('子代理会话默认折叠，并可独立展开', () => {
    render(
      <ProjectTreePanel
        recentProjects={recentProjects}
        selectedProjectPath="D:/workspace/demo"
        onProjectSelect={vi.fn()}
        sessions={projectSessions}
        activeSessionId="session-1"
        onSessionSelect={vi.fn()}
      />,
    )

    expect(screen.queryByText('扫描 renderer 目录')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '展开子代理 explorer-1' }))
    expect(screen.getByText('扫描 renderer 目录')).toBeTruthy()
  })

  it('全局聊天列表只保留 scratchpad 语义，不混入项目会话', () => {
    render(
      <div>
        <ProjectTreePanel
          recentProjects={recentProjects}
          selectedProjectPath="D:/workspace/demo"
          onProjectSelect={vi.fn()}
          sessions={projectSessions}
          activeSessionId="session-1"
          onSessionSelect={vi.fn()}
        />
        <ScratchpadList
          entries={[
            {
              id: 'scratchpad-default',
              title: '全局 Scratchpad',
              updatedAt: null,
            },
          ]}
        />
      </div>,
    )

    const chatList = screen.getByLabelText('Scratchpad 聊天列表')
    expect(within(chatList).getByText('全局 Scratchpad')).toBeTruthy()
    expect(within(chatList).queryByText('实现 Phase 5 主壳')).toBeNull()
  })
})
