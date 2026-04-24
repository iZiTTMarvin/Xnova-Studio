// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ContextBar,
  CONTEXT_BAR_FIELDS,
} from '../src/renderer/components/ContextBar'
import {
  resolveWorkContext,
  type WorkContextInput,
} from '../src/renderer/utils/work-context'

afterEach(() => {
  cleanup()
})

function createInput(
  overrides: Partial<WorkContextInput> = {},
): WorkContextInput {
  return {
    selectedProjectPath: 'D:/workspace/demo',
    activeSession: {
      sessionId: 'session-1',
      projectPath: 'D:/workspace/demo',
      title: '实现主壳',
      updatedAt: '2026-04-22T10:00:00.000Z',
      gitBranch: 'main',
      messageCount: 12,
      subagents: [
        {
          agentId: 'explorer-1',
          description: '扫描 renderer',
          status: 'running',
        },
      ],
    },
    defaults: {
      projectPath: 'D:/workspace/demo',
      branch: 'main',
      agentId: 'general',
      modelId: 'claude-sonnet-4-6',
      providerId: 'anthropic',
      recommendedMode: null,
      allowedModes: ['standard', 'xforge'],
    },
    agentId: 'general',
    modelId: 'claude-sonnet-4-6',
    mode: 'standard',
    contextUsageLabel: '42%',
    ...overrides,
  }
}

describe('work context and context bar', () => {
  it('resolveWorkContext 以单一结构返回项目/分支/Agent/模型/Context/SubAgent 数量', () => {
    expect(resolveWorkContext(createInput())).toEqual({
      projectPath: 'D:/workspace/demo',
      branch: 'main',
      agentId: 'general',
      modelId: 'claude-sonnet-4-6',
      mode: 'standard',
      contextUsageLabel: '42%',
      runningSubagents: 1,
    })
  })

  it('ContextBar 按固定顺序渲染六个字段，并且不包含第二个 mode 入口', () => {
    render(
      <ContextBar
        workContext={resolveWorkContext(createInput())}
      />,
    )

    const items = within(screen.getByLabelText('工作上下文条'))
      .getAllByTestId('context-bar-field')
      .map((node) => node.getAttribute('data-field-key'))

    expect(items).toEqual(CONTEXT_BAR_FIELDS.map((field) => field.key))
    expect(screen.queryByRole('button', { name: '标准模式' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'XForge' })).toBeNull()
  })

  it('空态与 disabled 态会显示 placeholder，而不是直接消失', () => {
    render(
      <ContextBar
        workContext={resolveWorkContext(
          createInput({
            selectedProjectPath: null,
            activeSession: null,
            defaults: {
              projectPath: null,
              branch: null,
              agentId: null,
              modelId: null,
              providerId: 'anthropic',
              recommendedMode: null,
              allowedModes: ['standard', 'xforge'],
            },
            agentId: null,
            modelId: null,
            contextUsageLabel: null,
          }),
        )}
      />,
    )

    expect(screen.getByText('未绑定项目')).toBeTruthy()
    expect(screen.getByText('未知分支')).toBeTruthy()
    expect(screen.getByText('未选择 Agent')).toBeTruthy()
    expect(screen.getByText('未选择模型')).toBeTruthy()
    expect(screen.getByText('Context 未连接')).toBeTruthy()
    expect(screen.getByText('0 个运行中')).toBeTruthy()
  })

  it('在主壳传入操作回调时，每个上下文字段都可点击触发对应动作', () => {
    const handleFieldSelect = vi.fn()

    render(
      <ContextBar
        workContext={resolveWorkContext(createInput())}
        onFieldSelect={handleFieldSelect}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '当前项目 D:/workspace/demo' }))
    fireEvent.click(screen.getByRole('button', { name: '当前 Agent general' }))
    fireEvent.click(screen.getByRole('button', { name: '运行中的 SubAgent 1 个运行中' }))

    expect(handleFieldSelect).toHaveBeenNthCalledWith(1, 'project')
    expect(handleFieldSelect).toHaveBeenNthCalledWith(2, 'agent')
    expect(handleFieldSelect).toHaveBeenNthCalledWith(3, 'runningSubagents')
  })
})
