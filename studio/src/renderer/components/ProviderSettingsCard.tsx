import { useState } from 'react'
import type {
  StudioProviderSettingsEntry,
  StudioProviderSettingsSnapshot,
} from '../../shared/studio-bridge-contract'
import type { ProviderTestResultView } from '../hooks/useProviderSettingsForm'

export interface ProviderSettingsCardProps {
  status: 'loading' | 'ready' | 'disabled' | 'error'
  snapshot: StudioProviderSettingsSnapshot | null
  draft: {
    defaultProvider: string
    defaultModel: string
    subAgentModel?: string | null
    providers: StudioProviderSettingsEntry[]
  } | null
  error: string | null
  saveMessage: string | null
  isSaving: boolean
  testingProviderId: string | null
  testResults: Record<string, ProviderTestResultView>
  onDefaultProviderChange: (providerId: string) => void
  onDefaultModelChange: (modelId: string) => void
  onSubAgentModelChange: (modelId: string) => void
  onAddProvider: (providerId: string) => boolean
  onUpdateProvider: (
    providerId: string,
    updater: (provider: StudioProviderSettingsEntry) => StudioProviderSettingsEntry,
  ) => void
  onRemoveProvider: (providerId: string) => void
  onSave: () => Promise<void>
  onTestProvider: (providerId: string) => Promise<void>
}

function updateCsv(text: string): string[] {
  return text
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function renderSourceValue(
  value: string | undefined,
): string {
  return value ?? '未提供'
}

export function ProviderSettingsCard(props: ProviderSettingsCardProps) {
  const [newProviderId, setNewProviderId] = useState('')

  return (
    <section className="feature-section-card provider-settings-card">
      <div className="feature-section-header">
        <h3>Provider 与模型</h3>
        <span className={`feature-section-status feature-section-status-${props.status}`}>
          {props.status === 'loading'
            ? '加载中'
            : props.status === 'disabled'
              ? '不可用'
              : props.status === 'error'
                ? '错误'
                : '已接入'}
        </span>
      </div>
      <p className="feature-section-summary">
        在桌面主壳里管理默认 provider、默认模型与连接测试，配置统一落到 TOML。
      </p>

      {props.error ? (
        <div className="provider-feedback provider-feedback-error">
          <strong>{props.error}</strong>
        </div>
      ) : null}

      {props.saveMessage ? (
        <div className="provider-feedback provider-feedback-success">
          <strong>{props.saveMessage}</strong>
        </div>
      ) : null}

      {props.snapshot ? (
        <div className="provider-source-grid">
          <div className="provider-source-item">
            <span>user.toml</span>
            <strong>{renderSourceValue(props.snapshot.source.userToml)}</strong>
          </div>
          <div className="provider-source-item">
            <span>project.toml</span>
            <strong>{renderSourceValue(props.snapshot.source.projectToml)}</strong>
          </div>
          <div className="provider-source-item">
            <span>effective 默认值</span>
            <strong>
              {props.snapshot.effectiveDefaults.defaultProvider}
              {' / '}
              {props.snapshot.effectiveDefaults.defaultModel}
            </strong>
          </div>
        </div>
      ) : null}

      {props.snapshot?.warnings.length ? (
        <div className="provider-feedback provider-feedback-error">
          {props.snapshot.warnings.map((warning) => (
            <strong key={warning}>{warning}</strong>
          ))}
        </div>
      ) : null}

      {props.status !== 'ready' || !props.draft ? (
        <p className="feature-section-detail">
          {props.status === 'loading'
            ? '正在从宿主读取 Provider 配置…'
            : props.status === 'disabled'
              ? '当前宿主桥接不可用，Provider 配置暂时不可读取。'
              : props.status === 'error'
                ? 'Provider 配置读取失败，请先处理错误后重试。'
                : '尚未获取可编辑的 Provider 草稿。'}
        </p>
      ) : (
        <>
          <div className="provider-form-grid">
            <label className="provider-field">
              <span>默认 Provider</span>
              <select
                aria-label="默认 Provider"
                value={props.draft.defaultProvider}
                onChange={(event) => {
                  props.onDefaultProviderChange(event.target.value)
                }}
              >
                {props.draft.providers.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.id}
                  </option>
                ))}
              </select>
            </label>

            <label className="provider-field">
              <span>默认模型</span>
              <input
                aria-label="默认模型"
                value={props.draft.defaultModel}
                onChange={(event) => {
                  props.onDefaultModelChange(event.target.value)
                }}
              />
            </label>

            <label className="provider-field">
              <span>子 Agent 模型</span>
              <input
                aria-label="子 Agent 模型"
                value={props.draft.subAgentModel ?? ''}
                onChange={(event) => {
                  props.onSubAgentModelChange(event.target.value)
                }}
                placeholder="留空则继承默认模型"
              />
            </label>
          </div>

          <div className="provider-toolbar">
            <label className="provider-field provider-field-inline">
              <span>新增 Provider ID</span>
              <input
                aria-label="新增 Provider ID"
                value={newProviderId}
                onChange={(event) => {
                  setNewProviderId(event.target.value)
                }}
                placeholder="例如 deepseek"
              />
            </label>

            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                if (props.onAddProvider(newProviderId)) {
                  setNewProviderId('')
                }
              }}
            >
              新增 Provider
            </button>

            <button
              type="button"
              className="primary-button"
              onClick={() => {
                void props.onSave()
              }}
              disabled={props.isSaving}
            >
              {props.isSaving ? '保存中…' : '保存 Provider 配置'}
            </button>
          </div>

          <div className="provider-card-list">
            {props.draft.providers.map((provider) => (
              <article key={provider.id} className="provider-item-card">
                <div className="provider-item-header">
                  <h4>{provider.id}</h4>
                  <div className="provider-item-actions">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => {
                        void props.onTestProvider(provider.id)
                      }}
                      disabled={props.testingProviderId === provider.id}
                      aria-label={`测试 ${provider.id}`}
                    >
                      {props.testingProviderId === provider.id
                        ? '测试中…'
                        : `测试 ${provider.id}`}
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => {
                        props.onRemoveProvider(provider.id)
                      }}
                      aria-label={`删除 ${provider.id}`}
                    >
                      删除 Provider
                    </button>
                  </div>
                </div>

                {props.testResults[provider.id] ? (
                  <div
                    className={`provider-feedback ${
                      props.testResults[provider.id]?.ok
                        ? 'provider-feedback-success'
                        : 'provider-feedback-error'
                    }`}
                  >
                    <strong>{props.testResults[provider.id]?.message}</strong>
                  </div>
                ) : null}

                <div className="provider-form-grid">
                  <label className="provider-field">
                    <span>协议</span>
                    <select
                      value={provider.protocol}
                      onChange={(event) => {
                        props.onUpdateProvider(provider.id, (current) => ({
                          ...current,
                          protocol: event.target.value as StudioProviderSettingsEntry['protocol'],
                        }))
                      }}
                    >
                      <option value="anthropic">anthropic</option>
                      <option value="openai">openai</option>
                    </select>
                  </label>

                  <label className="provider-field">
                    <span>API Key</span>
                    <input
                      type="password"
                      value={provider.apiKey}
                      onChange={(event) => {
                        props.onUpdateProvider(provider.id, (current) => ({
                          ...current,
                          apiKey: event.target.value,
                        }))
                      }}
                    />
                  </label>

                  <label className="provider-field">
                    <span>Base URL</span>
                    <input
                      value={provider.baseURL ?? ''}
                      onChange={(event) => {
                        props.onUpdateProvider(provider.id, (current) => ({
                          ...current,
                          baseURL: event.target.value || null,
                        }))
                      }}
                      placeholder="可选"
                    />
                  </label>
                </div>

                <div className="provider-form-grid provider-form-grid-stacked">
                  <label className="provider-field">
                    <span>模型列表</span>
                    <textarea
                      rows={3}
                      value={provider.models.join('\n')}
                      onChange={(event) => {
                        props.onUpdateProvider(provider.id, (current) => ({
                          ...current,
                          models: updateCsv(event.target.value),
                        }))
                      }}
                      placeholder="每行一个模型，或用逗号分隔"
                    />
                  </label>

                  <label className="provider-field">
                    <span>Vision 模型</span>
                    <input
                      value={provider.visionModels.join(', ')}
                      onChange={(event) => {
                        props.onUpdateProvider(provider.id, (current) => ({
                          ...current,
                          visionModels: updateCsv(event.target.value),
                        }))
                      }}
                      placeholder="可选，逗号分隔"
                    />
                  </label>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
