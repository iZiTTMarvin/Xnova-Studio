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
}

export const CONTEXT_BAR_FIELDS: ContextBarFieldSpec[] = [
  { key: 'project', label: '当前项目' },
  { key: 'branch', label: '当前分支' },
  { key: 'agent', label: '当前 Agent' },
  { key: 'model', label: '当前模型' },
  { key: 'contextUsage', label: 'Context 使用率' },
  { key: 'runningSubagents', label: '运行中的 SubAgent' },
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
      return `${workContext.runningSubagents} 个运行中`
  }
}

export interface ContextBarProps {
  workContext: WorkContext
}

export function ContextBar(props: ContextBarProps) {
  return (
    <section className="context-bar" aria-label="工作上下文条">
      {CONTEXT_BAR_FIELDS.map((field) => (
        <div
          key={field.key}
          className="context-bar-field"
          data-testid="context-bar-field"
          data-field-key={field.key}
        >
          <span className="context-bar-label">{field.label}</span>
          <strong className="context-bar-value">
            {getFieldValue(field.key, props.workContext)}
          </strong>
        </div>
      ))}
    </section>
  )
}
