// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ProjectShellSidebar,
  type SidebarBlockStatus,
} from '../src/renderer/components/ProjectShellSidebar'

afterEach(() => {
  cleanup()
})

function renderSidebar(options?: {
  projectStatus?: SidebarBlockStatus
  chatStatus?: SidebarBlockStatus
  onOpenSettings?: () => void
}) {
  return render(
    <ProjectShellSidebar
      activeNavId="quick-chat"
      onNavigate={vi.fn()}
      onOpenSettings={options?.onOpenSettings ?? vi.fn()}
      projectBlock={{
        title: '项目',
        status: options?.projectStatus ?? 'ready',
        message: '暂无项目数据',
        content: <div>项目内容区域</div>,
      }}
      chatBlock={{
        title: '聊天',
        status: options?.chatStatus ?? 'ready',
        message: 'scratchpad 暂无内容',
        content: <div>聊天内容区域</div>,
      }}
    />,
  )
}

describe('project-aware sidebar information architecture', () => {
  it('按固定顺序渲染一级导航', () => {
    renderSidebar()

    const nav = screen.getByRole('navigation', { name: 'Studio 一级导航' })
    const labels = within(nav)
      .getAllByRole('button')
      .map((button) => button.textContent?.trim())

    expect(labels).toEqual([
      '新对话',
      '搜索',
      'Agents',
      '项目',
      '工具',
    ])
  })

  it('设置作为底部 utility 入口，独立于主导航', () => {
    const onOpenSettings = vi.fn()
    renderSidebar({ onOpenSettings })

    const nav = screen.getByRole('navigation', { name: 'Studio 一级导航' })
    expect(within(nav).queryByRole('button', { name: '设置' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '设置' }))
    expect(onOpenSettings).toHaveBeenCalledTimes(1)
  })

  it('项目与聊天两个 block 可以独立折叠 / 展开', () => {
    renderSidebar()

    expect(screen.getByText('项目内容区域')).toBeTruthy()
    expect(screen.getByText('聊天内容区域')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '折叠项目' }))
    expect(screen.queryByText('项目内容区域')).toBeNull()
    expect(screen.getByText('聊天内容区域')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '折叠聊天' }))
    expect(screen.queryByText('聊天内容区域')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '展开项目' }))
    expect(screen.getByText('项目内容区域')).toBeTruthy()
  })

  it('loading / empty / disabled 状态在 UI 上真实可见', () => {
    const { rerender } = render(
      <ProjectShellSidebar
        activeNavId="quick-chat"
        onNavigate={vi.fn()}
        onOpenSettings={vi.fn()}
        projectBlock={{
          title: '项目',
          status: 'loading',
          message: '正在加载项目结构…',
          content: <div>项目内容区域</div>,
        }}
        chatBlock={{
          title: '聊天',
          status: 'empty',
          message: 'scratchpad 暂无内容',
          content: <div>聊天内容区域</div>,
        }}
      />,
    )

    expect(screen.getByText('正在加载项目结构…')).toBeTruthy()
    expect(screen.getByText('scratchpad 暂无内容')).toBeTruthy()

    rerender(
      <ProjectShellSidebar
        activeNavId="quick-chat"
        onNavigate={vi.fn()}
        onOpenSettings={vi.fn()}
        projectBlock={{
          title: '项目',
          status: 'disabled',
          message: '当前宿主不可用',
          content: <div>项目内容区域</div>,
        }}
        chatBlock={{
          title: '聊天',
          status: 'disabled',
          message: 'scratchpad 暂不可用',
          content: <div>聊天内容区域</div>,
        }}
      />,
    )

    expect(screen.getByText('当前宿主不可用')).toBeTruthy()
    expect(screen.getByText('scratchpad 暂不可用')).toBeTruthy()
  })
})
