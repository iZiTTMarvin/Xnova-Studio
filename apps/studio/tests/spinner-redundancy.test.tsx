// @vitest-environment jsdom

/**
 * Bug 1 探索性测试：冗余 Spinner 渲染
 *
 * 验证 StructuredMessageView 在 isLiveMessage=true 时不应渲染冗余的
 * conversation-assistant-spinner 元素。下方已有 ThinkingPlaceholderRow
 * 提供独立的进度指示（三点跳动动画），Xnova 标签旁的 spinner 是多余的。
 *
 * **Validates: Requirements 1.1, 2.1**
 */

import { cleanup, render } from '@testing-library/react'
import * as fc from 'fast-check'
import { afterEach, describe, expect, it } from 'vitest'
import { ConversationTimeline } from '../src/renderer/components/ConversationTimeline'

afterEach(() => {
  cleanup()
})

describe('Bug Condition: StructuredMessageView 冗余 Spinner', () => {
  /**
   * Property 1: Bug Condition — StructuredMessageView 冗余 Spinner
   *
   * 当 isRunActive=true 且 liveConversation.blocks 包含至少一个 text block 时，
   * 渲染的是 StructuredMessageView（isLiveMessage=true），而非 ThinkingPlaceholderRow。
   *
   * 期望行为：StructuredMessageView 不应渲染 conversation-assistant-spinner 元素。
   * 在未修复代码上，此测试应 FAIL（spinner 元素存在，证明 bug 存在）。
   *
   * **Validates: Requirements 1.1, 2.1**
   */
  it('isLiveMessage=true 时 StructuredMessageView 不应渲染冗余 spinner', () => {
    render(
      <ConversationTimeline
        session={null}
        isRunActive={true}
        liveConversation={{
          pendingUserText: '帮我分析项目结构',
          blocks: [
            {
              id: 'text-1',
              type: 'text',
              content: '正在分析项目结构…',
            },
          ],
        }}
      />,
    )

    // StructuredMessageView 在 isLiveMessage=true 时不应渲染 spinner
    // 进度指示应仅由 ThinkingPlaceholderRow / LiveActivityIndicator 负责
    const liveRow = document.querySelector('.conversation-assistant-row--live')
    expect(liveRow).toBeTruthy()

    // 核心断言：live 消息区域内不应存在冗余 spinner
    const spinner = liveRow!.querySelector('.conversation-assistant-spinner')
    expect(spinner).toBeNull()
  })

  it('多个 blocks（text + tool）时 StructuredMessageView 同样不应渲染冗余 spinner', () => {
    render(
      <ConversationTimeline
        session={null}
        isRunActive={true}
        liveConversation={{
          pendingUserText: '帮我读取文件',
          blocks: [
            {
              id: 'text-1',
              type: 'text',
              content: '让我先查看一下文件内容。',
            },
            {
              id: 'tool-1',
              type: 'tool',
              toolCallId: 'tool-1',
              toolName: 'read_file',
              args: { path: 'src/index.ts' },
              status: 'running',
            },
          ],
        }}
      />,
    )

    const liveRow = document.querySelector('.conversation-assistant-row--live')
    expect(liveRow).toBeTruthy()

    // 核心断言：即使有多个 blocks，live 消息区域内也不应存在冗余 spinner
    const spinner = liveRow!.querySelector('.conversation-assistant-spinner')
    expect(spinner).toBeNull()
  })
})


/**
 * Preservation Property: ThinkingPlaceholderRow Spinner 保留
 *
 * ThinkingPlaceholderRow 在 showThinkingPlaceholder=true 时渲染，
 * 条件为：isRunActive=true, pendingUserText 非空, blocks 为空。
 * 此时 ThinkingPlaceholderRow 是唯一的进度指示器，其 spinner 必须保留。
 *
 * 这些测试在未修复代码上应 PASS，确认基线行为。
 * Bug 1 修复（移除 StructuredMessageView 的冗余 spinner）不应影响此组件。
 *
 * **Validates: Requirements 3.1**
 */
describe('Preservation: ThinkingPlaceholderRow Spinner 保留', () => {
  /**
   * 基础验证：ThinkingPlaceholderRow 渲染时必须包含 spinner 元素。
   *
   * 当 isRunActive=true、pendingUserText 非空、blocks 为空时，
   * ConversationTimeline 渲染 ThinkingPlaceholderRow，
   * 其中的 spinner 是唯一的进度指示，必须存在。
   *
   * **Validates: Requirements 3.1**
   */
  it('ThinkingPlaceholderRow 渲染时包含 spinner 元素', () => {
    render(
      <ConversationTimeline
        session={null}
        isRunActive={true}
        liveConversation={{
          pendingUserText: '帮我分析项目结构',
          blocks: [],
        }}
        currentRunStep="Xnova 正在思考…"
      />,
    )

    // ThinkingPlaceholderRow 应通过 data-testid 可定位
    const placeholder = document.querySelector('[data-testid="conversation-thinking-placeholder"]')
    expect(placeholder).toBeTruthy()

    // 核心保留断言：ThinkingPlaceholderRow 内部必须有 spinner
    const spinner = placeholder!.querySelector('.conversation-assistant-spinner')
    expect(spinner).toBeTruthy()
  })

  /**
   * 属性测试：对所有有效的 currentRunStep 文案值，
   * ThinkingPlaceholderRow 始终渲染 spinner 动画。
   *
   * 使用 fast-check 生成随机字符串作为 currentRunStep，
   * 验证无论文案内容如何，spinner 始终存在。
   *
   * **Validates: Requirements 3.1**
   */
  it('property: 对所有有效 currentRunStep 值，ThinkingPlaceholderRow 始终渲染 spinner', () => {
    // 生成器：非空字符串作为 currentRunStep（模拟各种运行步骤文案）
    const currentRunStepArb = fc.oneof(
      // 常见中文文案
      fc.constantFrom(
        'Xnova 正在思考…',
        '正在读取文件…',
        '正在分析代码…',
        '正在执行工具…',
        '模型正在处理…',
      ),
      // 随机非空字符串（含 unicode）
      fc.string({ minLength: 1, maxLength: 200 }),
      // null / undefined 场景（组件会使用默认文案）
      fc.constant(null),
      fc.constant(undefined),
    )

    fc.assert(
      fc.property(currentRunStepArb, (currentRunStep) => {
        cleanup()

        render(
          <ConversationTimeline
            session={null}
            isRunActive={true}
            liveConversation={{
              pendingUserText: '用户输入内容',
              blocks: [],
            }}
            currentRunStep={currentRunStep}
          />,
        )

        // ThinkingPlaceholderRow 必须被渲染
        const placeholder = document.querySelector(
          '[data-testid="conversation-thinking-placeholder"]',
        )
        if (!placeholder) {
          return false // ThinkingPlaceholderRow 未渲染，属性不满足
        }

        // spinner 必须存在于 ThinkingPlaceholderRow 内部
        const spinner = placeholder.querySelector('.conversation-assistant-spinner')
        if (!spinner) {
          return false // spinner 缺失，属性不满足
        }

        // 三点跳动动画也必须存在（ThinkingPlaceholderRow 的另一个进度指示）
        const dots = placeholder.querySelector('.conversation-thinking-placeholder-dots')
        if (!dots) {
          return false // 三点动画缺失，属性不满足
        }

        return true
      }),
      { numRuns: 50 }, // 50 次随机运行，覆盖各种 currentRunStep 值
    )
  })

  /**
   * 验证 ThinkingPlaceholderRow 的 label 正确显示 currentRunStep 文案。
   *
   * **Validates: Requirements 3.1**
   */
  it('ThinkingPlaceholderRow 显示 currentRunStep 文案或默认文案', () => {
    const customLabel = '正在读取文件…'
    render(
      <ConversationTimeline
        session={null}
        isRunActive={true}
        liveConversation={{
          pendingUserText: '帮我读取文件',
          blocks: [],
        }}
        currentRunStep={customLabel}
      />,
    )

    const placeholder = document.querySelector('[data-testid="conversation-thinking-placeholder"]')
    expect(placeholder).toBeTruthy()

    // spinner 必须存在
    const spinner = placeholder!.querySelector('.conversation-assistant-spinner')
    expect(spinner).toBeTruthy()

    // label 文案应正确显示
    const label = placeholder!.querySelector('.conversation-thinking-placeholder-label')
    expect(label).toBeTruthy()
    expect(label!.textContent).toBe(customLabel)
  })
})
