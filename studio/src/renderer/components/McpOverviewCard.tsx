import { useState } from 'react'
import type { StudioMcpServerMutationInput, StudioMcpOverviewSnapshot } from '../../shared/studio-bridge-contract'

export interface McpOverviewCardProps {
  status: 'loading' | 'ready' | 'disabled' | 'error'
  snapshot: StudioMcpOverviewSnapshot | null
  error: string | null
  actionMessage: string | null
  isMutating: boolean
  onAddServer: (input: StudioMcpServerMutationInput) => Promise<void>
  onDeleteServer: (name: string) => Promise<void>
}

function getStatusLabel(status: 'loading' | 'ready' | 'disabled' | 'error' | 'failed' | 'connected' | 'unconfigured'): string {
  switch (status) {
    case 'loading':
      return '加载中'
    case 'ready':
      return '已接入'
    case 'disabled':
      return '不可用'
    case 'error':
    case 'failed':
      return '异常'
    case 'connected':
      return '已连接'
    case 'unconfigured':
      return '未配置'
  }
}

export function McpOverviewCard(props: McpOverviewCardProps) {
  const [showManage, setShowManage] = useState(false)
  const [name, setName] = useState('')
  const [transport, setTransport] = useState<StudioMcpServerMutationInput['config']['transport']>('stdio')
  const [command, setCommand] = useState('npx')
  const [args, setArgs] = useState('')
  const [url, setUrl] = useState('')

  return (
    <section className="feature-section-card">
      <div className="feature-section-header">
        <h3>MCP 状态</h3>
        <span
          className={`feature-section-status feature-section-status-${
            props.snapshot?.status === 'failed'
              ? 'error'
              : props.snapshot?.status === 'connected'
                ? 'ready'
                : props.snapshot?.status === 'unconfigured'
                  ? 'empty'
                  : props.status
          }`}
        >
          {getStatusLabel(props.snapshot?.status ?? props.status)}
        </span>
      </div>

      {props.error ? (
        <div className="provider-feedback provider-feedback-error">
          <strong>{props.error}</strong>
        </div>
      ) : null}

      {props.actionMessage ? (
        <div className="provider-feedback provider-feedback-success">
          <strong>{props.actionMessage}</strong>
        </div>
      ) : null}

      <p className="feature-section-summary">
        {props.snapshot?.statusMessage ??
          (props.status === 'loading'
            ? '正在读取 MCP 状态…'
            : props.status === 'disabled'
              ? '当前宿主桥接不可用，MCP 状态暂时不可读取。'
              : 'MCP 状态暂不可用。')}
      </p>

      {props.snapshot ? (
        <>
          <div className="provider-source-grid">
            <div className="provider-source-item">
              <span>主写配置</span>
              <strong>{props.snapshot.writableConfigPath}</strong>
            </div>
            <div className="provider-source-item">
              <span>Server 数量</span>
              <strong>{props.snapshot.servers.length}</strong>
            </div>
            <div className="provider-source-item">
              <span>失败数量</span>
              <strong>
                {props.snapshot.servers.filter((server) => server.status === 'failed').length}
              </strong>
            </div>
          </div>

          <div className="provider-card-list">
            {props.snapshot.servers.map((server) => (
              <article key={server.name} className="provider-item-card">
                <div className="provider-item-header">
                  <h4>{server.name}</h4>
                  <div className="provider-item-actions">
                    <span className={`feature-section-status feature-section-status-${server.status === 'connected' ? 'ready' : 'error'}`}>
                      {getStatusLabel(server.status)}
                    </span>
                    {server.writable ? (
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => {
                          void props.onDeleteServer(server.name)
                        }}
                        aria-label={`删除 ${server.name}`}
                        disabled={props.isMutating}
                      >
                        删除 {server.name}
                      </button>
                    ) : null}
                  </div>
                </div>
                <p className="feature-section-detail">
                  {server.transport}
                  {' · '}
                  {server.toolCount}
                  {' '}
                  个工具
                </p>
                {server.error ? (
                  <div className="provider-feedback provider-feedback-error">
                    <strong>{server.error}</strong>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </>
      ) : null}

      <div className="provider-toolbar">
        <button
          type="button"
          className="secondary-button"
          onClick={() => {
            setShowManage((value) => !value)
          }}
        >
          管理 MCP Servers
        </button>
      </div>

      {showManage ? (
        <div className="provider-card-list">
          <article className="provider-item-card">
            <div className="provider-item-header">
              <h4>新增 MCP Server</h4>
            </div>
            <div className="provider-form-grid">
              <label className="provider-field">
                <span>名称</span>
                <input value={name} onChange={(event) => setName(event.target.value)} />
              </label>
              <label className="provider-field">
                <span>传输</span>
                <select
                  value={transport}
                  onChange={(event) => setTransport(event.target.value as StudioMcpServerMutationInput['config']['transport'])}
                >
                  <option value="stdio">stdio</option>
                  <option value="sse">sse</option>
                  <option value="streamable-http">streamable-http</option>
                  <option value="http">http</option>
                </select>
              </label>
              <label className="provider-field">
                <span>{transport === 'stdio' ? '命令' : 'URL'}</span>
                <input
                  value={transport === 'stdio' ? command : url}
                  onChange={(event) => {
                    if (transport === 'stdio') {
                      setCommand(event.target.value)
                    } else {
                      setUrl(event.target.value)
                    }
                  }}
                />
              </label>
            </div>
            {transport === 'stdio' ? (
              <label className="provider-field">
                <span>参数（空格分隔）</span>
                <input value={args} onChange={(event) => setArgs(event.target.value)} />
              </label>
            ) : null}
            <div className="provider-toolbar">
              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  void props.onAddServer({
                    name,
                    config:
                      transport === 'stdio'
                        ? {
                            transport,
                            command,
                            args: args.split(' ').filter(Boolean),
                          }
                        : {
                            transport,
                            url,
                          },
                  })
                }}
                disabled={props.isMutating}
              >
                新增 MCP Server
              </button>
            </div>
          </article>
        </div>
      ) : null}
    </section>
  )
}
