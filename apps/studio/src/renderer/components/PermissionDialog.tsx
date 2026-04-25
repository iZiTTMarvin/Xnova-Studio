import { useEffect, useMemo, useState } from 'react'
import type {
  PermissionDialogRequest,
  PermissionDialogResponse,
} from '../../shared/studio-bridge-contract'
import './PermissionDialog.css'

interface PermissionDialogProps {
  request: PermissionDialogRequest | null
  onRespond(response: PermissionDialogResponse): void | Promise<void>
}

interface PermissionRiskPresentation {
  label: string
  className: string
}

function getPermissionRisk(toolName: string): PermissionRiskPresentation {
  switch (toolName) {
    case 'bash':
    case 'kill_shell':
      return {
        label: '高风险',
        className: 'permission-dialog-risk-high',
      }
    case 'git':
      return {
        label: '中风险',
        className: 'permission-dialog-risk-medium',
      }
    default:
      return {
        label: '需确认',
        className: 'permission-dialog-risk-default',
      }
  }
}

function formatArgValue(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (value === null) {
    return 'null'
  }

  return JSON.stringify(value)
}

function getImportantArgs(request: PermissionDialogRequest): Array<[string, string]> {
  const priorityKeys = ['command', 'cwd', 'pid', 'path']
  const result: Array<[string, string]> = []

  for (const key of priorityKeys) {
    if (request.args[key] !== undefined) {
      result.push([key, formatArgValue(request.args[key])])
    }
  }

  if (result.length > 0) {
    return result
  }

  return Object.entries(request.args)
    .slice(0, 4)
    .map(([key, value]) => [key, formatArgValue(value)])
}

export function PermissionDialog({
  request,
  onRespond,
}: PermissionDialogProps) {
  const [remember, setRemember] = useState(false)

  useEffect(() => {
    setRemember(false)
  }, [request?.requestId])

  const risk = useMemo(
    () => (request ? getPermissionRisk(request.toolName) : null),
    [request],
  )
  const importantArgs = useMemo(
    () => (request ? getImportantArgs(request) : []),
    [request],
  )

  if (!request || !risk) {
    return null
  }

  const respond = (allow: boolean): void => {
    void onRespond({
      requestId: request.requestId,
      allow,
      remember,
    })
  }

  return (
    <div className="permission-dialog-backdrop" role="presentation">
      <section
        className="permission-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="工具权限确认"
      >
        <div className="permission-dialog-header">
          <div>
            <p className="permission-dialog-eyebrow">权限请求</p>
            <h2>{request.toolName}</h2>
          </div>
          <span className={`permission-dialog-risk ${risk.className}`}>
            {risk.label}
          </span>
        </div>

        <p className="permission-dialog-description">{request.description}</p>

        {importantArgs.length > 0 ? (
          <dl className="permission-dialog-args">
            {importantArgs.map(([key, value]) => (
              <div key={key} className="permission-dialog-arg">
                <dt>{key}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        <label className="permission-dialog-remember">
          <input
            type="checkbox"
            checked={remember}
            onChange={(event) => {
              setRemember(event.currentTarget.checked)
            }}
          />
          <span>本次会话记住</span>
        </label>

        <div className="permission-dialog-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              respond(false)
            }}
          >
            拒绝
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() => {
              respond(true)
            }}
          >
            允许
          </button>
        </div>
      </section>
    </div>
  )
}
