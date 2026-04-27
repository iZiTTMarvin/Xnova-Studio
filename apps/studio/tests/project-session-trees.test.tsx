// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProjectTreePanel } from '../src/renderer/components/ProjectTreePanel'
import { ScratchpadList } from '../src/renderer/components/ScratchpadList'

const studioHomeCss = readFileSync(
  join(process.cwd(), 'src', 'renderer', 'pages', 'StudioHomePage.css'),
  'utf-8',
)

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
  {
    sessionId: 'session-2',
    projectPath: 'D:/workspace/alpha',
    title: '整理 Alpha 工作区',
    updatedAt: '2026-04-22T11:00:00.000Z',
    gitBranch: 'feature/phase5',
    messageCount: 4,
    subagents: [],
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
        activeSubagentId={null}
        onSubagentSelect={vi.fn()}
      />,
    )

    const projectTree = screen.getByLabelText('项目树')
    expect(within(projectTree).getByText('demo')).toBeTruthy()
    expect(within(projectTree).getByText('alpha')).toBeTruthy()
    expect(within(screen.getByLabelText('demo 的会话')).getByText('实现 Phase 5 主壳')).toBeTruthy()
    expect(within(projectTree).queryByText('整理 Alpha 工作区')).toBeNull()

    fireEvent.click(
      screen.getByRole('button', {
        name: '展开 alpha 项目会话',
      }),
    )
    expect(within(screen.getByLabelText('alpha 的会话')).getByText('整理 Alpha 工作区')).toBeTruthy()
  })

  it('项目抽屉支持在当前项目下开始新对话', () => {
    const handleStartProjectSession = vi.fn()

    render(
      <ProjectTreePanel
        recentProjects={recentProjects}
        selectedProjectPath="D:/workspace/demo"
        onProjectSelect={vi.fn()}
        sessions={projectSessions}
        activeSessionId="session-1"
        onSessionSelect={vi.fn()}
        activeSubagentId={null}
        onSubagentSelect={vi.fn()}
        onStartProjectSession={handleStartProjectSession}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '在 demo 中开始新对话' }))

    expect(handleStartProjectSession).toHaveBeenCalledWith('D:/workspace/demo')
  })

  it('项目行的新对话按钮在展开和折叠状态都保持可见', () => {
    const hiddenByDefault =
      /#app\s+\.project-drawer-new-session\s*\{[^}]*opacity:\s*0\s*;/.test(studioHomeCss)

    expect(studioHomeCss).toContain('#app .project-drawer-new-session')
    expect(hiddenByDefault).toBe(false)
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
        activeSubagentId={null}
        onSubagentSelect={vi.fn()}
      />,
    )

    expect(screen.queryByText('扫描 renderer 目录')).toBeNull()

    fireEvent.click(
      screen.getByRole('button', {
        name: '展开会话 "实现 Phase 5 主壳" 的 1 个子代理',
      }),
    )
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
          activeSubagentId={null}
          onSubagentSelect={vi.fn()}
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

  it('展开后的子代理条目可点击，供主壳进入子代理会话视图', () => {
    const handleSubagentSelect = vi.fn()

    render(
      <ProjectTreePanel
        recentProjects={recentProjects}
        selectedProjectPath="D:/workspace/demo"
        onProjectSelect={vi.fn()}
        sessions={projectSessions}
        activeSessionId="session-1"
        onSessionSelect={vi.fn()}
        activeSubagentId={null}
        onSubagentSelect={handleSubagentSelect}
      />,
    )

    fireEvent.click(
      screen.getByRole('button', {
        name: '展开会话 "实现 Phase 5 主壳" 的 1 个子代理',
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: '子代理 explorer-1 运行中' }))

    expect(handleSubagentSelect).toHaveBeenCalledWith('session-1', 'explorer-1')
  })
})
