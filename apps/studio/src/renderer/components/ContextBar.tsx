import type { WorkContext } from '../utils/work-context'

export interface ContextBarFieldSpec {
  key:
    | 'project'
    | 'branch'
    | 'agent'
    | 'model'
    | 'contextUsage'
    | 'runningSubagents'
  label: string
  actionLabel: string
  isMono?: boolean
}

export const CONTEXT_BAR_FIELDS: ContextBarFieldSpec[] = [
  { key: 'project', label: '项目', actionLabel: '当前项目', isMono: true },
  { key: 'branch', label: '分支', actionLabel: '当前分支', isMono: true },
  { key: 'agent', label: 'Agent', actionLabel: '当前 Agent' },
  { key: 'model', label: '模型', actionLabel: '当前模型', isMono: true },
  { key: 'contextUsage', label: 'Context', actionLabel: '上下文使用量', isMono: true },
  { key: 'runningSubagents', label: 'SubAgent', actionLabel: '运行中的 SubAgent', isMono: true },
]

function getFieldValue(key: ContextBarFieldSpec['key'], workContext: WorkContext): string {
  switch (key) {
    case 'project':
      return workContext.projectPath ?? '未绑定项目'
    case 'branch':
      return workContext.branch ?? '未知分支'
    case 'agent':
      return workContext.agentId ?? '未选择 Agent'
    case 'model':
      return workContext.modelId ?? '未选择模型'
    case 'contextUsage':
      return workContext.contextUsageLabel ?? 'Context 未连接'
    case 'runningSubagents':
      return workContext.runningSubagents > 0
        ? `${workContext.runningSubagents} 个运行中`
        : '0 个运行中'
  }
}

export interface ContextBarProps {
  workContext: WorkContext
  onFieldSelect?: (key: ContextBarFieldSpec['key']) => void
}

/**
 * 工作上下文条 — 紧凑 HUD Strip
 *
 * 位于输入框附近，长期展示当前工作状态。
 * 视觉上像一条轻量信息带，不是六张并排卡片。
 * 字段顺序固定：项目 → 分支 → Agent → 模型 → Context → SubAgent
 */
export function ContextBar(props: ContextBarProps) {
  return (
    <section className="context-strip" aria-label="工作上下文条">
      {CONTEXT_BAR_FIELDS.map((field) => {
        const value = getFieldValue(field.key, props.workContext)
        const content = (
          <>
            <span className="context-label">{field.label}</span>
            <span className={`context-value ${field.isMono ? 'context-value-mono' : ''}`}>
              {value}
            </span>
          </>
        )

        if (props.onFieldSelect) {
          return (
            <button
              key={field.key}
              type="button"
              className="context-item context-item-button"
              data-testid="context-bar-field"
              data-field-key={field.key}
              aria-label={`${field.actionLabel} ${value}`}
              title={value}
              onClick={() => {
                props.onFieldSelect?.(field.key)
              }}
            >
              {content}
            </button>
          )
        }

        return (
          <div
            key={field.key}
            className="context-item"
            data-testid="context-bar-field"
            data-field-key={field.key}
            title={value}
          >
            {content}
          </div>
        )
      })}
    </section>
  )
}
