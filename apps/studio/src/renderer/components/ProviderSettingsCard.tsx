import { useEffect, useMemo, useState } from 'react'
import type {
  StudioProviderSettingsEntry,
  StudioProviderSettingsSnapshot,
} from '../../shared/studio-bridge-contract'
import type {
  AddProviderInput,
  ProviderTestResultView,
} from '../hooks/useProviderSettingsForm'
import './ProviderSettingsCard.css'

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
  onAddProvider: (input: AddProviderInput) => boolean
  onRenameProvider: (providerId: string, nextProviderId: string) => boolean
  onUpdateProvider: (
    providerId: string,
    updater: (provider: StudioProviderSettingsEntry) => StudioProviderSettingsEntry,
  ) => void
  onRemoveProvider: (providerId: string) => void
  onSave: () => Promise<void>
  onTestProvider: (providerId: string) => Promise<void>
}

function protocolLabel(protocol: StudioProviderSettingsEntry['protocol']): string {
  return protocol === 'openai' ? 'openai compatible' : 'anthropic compatible'
}

function normalizeModelItems(items: string[]): string[] {
  return items
    .map((item) => item.trim())
    .filter(Boolean)
}

export function ProviderSettingsCard(props: ProviderSettingsCardProps) {
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [newProviderName, setNewProviderName] = useState('')
  const [newProviderProtocol, setNewProviderProtocol] = useState<AddProviderInput['protocol']>('openai')
  const [providerNameDraft, setProviderNameDraft] = useState('')
  const [modelEditorOpen, setModelEditorOpen] = useState(true)
  const [newModelDraft, setNewModelDraft] = useState('')

  const providers = props.draft?.providers ?? []

  useEffect(() => {
    if (providers.length === 0) {
      setSelectedProviderId(null)
      return
    }

    const firstProvider = providers[0]
    if (!firstProvider) {
      return
    }

    if (!selectedProviderId || !providers.some((provider) => provider.id === selectedProviderId)) {
      setSelectedProviderId(firstProvider.id)
    }
  }, [providers, selectedProviderId])

  const selectedProvider = useMemo(
    () => providers.find((provider) => provider.id === selectedProviderId) ?? null,
    [providers, selectedProviderId],
  )
  const normalizedNewModel = newModelDraft.trim()
  const canAddModel =
    Boolean(selectedProvider) &&
    normalizedNewModel.length > 0 &&
    !(selectedProvider?.models ?? []).includes(normalizedNewModel)

  useEffect(() => {
    setProviderNameDraft(selectedProvider?.id ?? '')
    setNewModelDraft('')
  }, [selectedProvider?.id])

  const updateSelectedProvider = (
    updater: (provider: StudioProviderSettingsEntry) => StudioProviderSettingsEntry,
  ): void => {
    if (!selectedProvider) {
      return
    }
    props.onUpdateProvider(selectedProvider.id, updater)
  }

  const applyRename = (): void => {
    if (!selectedProvider) {
      return
    }

    const normalized = providerNameDraft.trim()
    if (!normalized || normalized === selectedProvider.id) {
      setProviderNameDraft(selectedProvider.id)
      return
    }

    if (props.onRenameProvider(selectedProvider.id, normalized)) {
      setSelectedProviderId(normalized)
    }
  }

  const addModel = (): void => {
    if (!selectedProvider) {
      return
    }

    const normalized = normalizedNewModel
    if (!normalized || selectedProvider.models.includes(normalized)) {
      return
    }

    updateSelectedProvider((provider) => ({
      ...provider,
      models: [...provider.models, normalized],
    }))
    setModelEditorOpen(true)
    setNewModelDraft('')
  }

  const addProvider = (): void => {
    const normalized = newProviderName.trim()
    if (!normalized) {
      return
    }

    if (
      props.onAddProvider({
        providerId: normalized,
        protocol: newProviderProtocol,
      })
    ) {
      setSelectedProviderId(normalized)
      setNewProviderName('')
      setNewProviderProtocol('openai')
      setIsAddDialogOpen(false)
    }
  }

  return (
    <div className="provider-settings-shell">
      <div className="provider-settings-header">
        <div>
          <h3>模型服务</h3>
          <p>先添加平台，再配置密钥与地址。</p>
        </div>
        <button
          type="button"
          className="secondary-button"
          onClick={() => {
            setIsAddDialogOpen(true)
          }}
          disabled={props.status !== 'ready'}
        >
          添加平台
        </button>
      </div>

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

      {props.snapshot?.warnings.length ? (
        <div className="provider-feedback provider-feedback-warning">
          {props.snapshot.warnings.map((warning) => (
            <strong key={warning}>{warning}</strong>
          ))}
        </div>
      ) : null}

      {props.status !== 'ready' || !props.draft ? (
        <p className="provider-placeholder-text">
          {props.status === 'loading'
            ? '正在读取模型服务配置…'
            : props.status === 'disabled'
              ? '当前宿主桥接不可用，无法编辑模型服务配置。'
              : props.status === 'error'
                ? '模型服务配置读取失败。'
                : '暂无可编辑配置。'}
        </p>
      ) : (
        <div className="provider-settings-panels">
          <section className="provider-platform-list" aria-label="平台列表">
            {providers.map((provider) => (
              <button
                key={provider.id}
                type="button"
                className={`provider-platform-item ${
                  selectedProvider?.id === provider.id ? 'provider-platform-item-active' : ''
                }`}
                onClick={() => {
                  setSelectedProviderId(provider.id)
                }}
              >
                <strong>{provider.id}</strong>
                <span>{protocolLabel(provider.protocol)}</span>
              </button>
            ))}
          </section>

          <section className="provider-platform-detail" aria-label="平台详情">
            {!selectedProvider ? (
              <p className="provider-placeholder-text">请先选择一个平台。</p>
            ) : (
              <>
                <div className="provider-detail-toolbar">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      void props.onTestProvider(selectedProvider.id)
                    }}
                    disabled={props.testingProviderId === selectedProvider.id}
                  >
                    {props.testingProviderId === selectedProvider.id ? '测试中…' : '测试连接'}
                  </button>
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => {
                      void props.onSave()
                    }}
                    disabled={props.isSaving}
                  >
                    {props.isSaving ? '保存中…' : '保存配置'}
                  </button>
                </div>

                {props.testResults[selectedProvider.id] ? (
                  <div
                    className={`provider-feedback ${
                      props.testResults[selectedProvider.id]?.ok
                        ? 'provider-feedback-success'
                        : 'provider-feedback-error'
                    }`}
                  >
                    <strong>{props.testResults[selectedProvider.id]?.message}</strong>
                  </div>
                ) : null}

                <div className="provider-form-grid">
                  <label className="provider-field">
                    <span>平台名称</span>
                    <div className="provider-inline-field">
                      <input
                        aria-label="当前平台名称"
                        value={providerNameDraft}
                        onChange={(event) => {
                          setProviderNameDraft(event.target.value)
                        }}
                        onBlur={applyRename}
                      />
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={applyRename}
                      >
                        应用名称
                      </button>
                    </div>
                  </label>

                  <label className="provider-field">
                    <span>API 密钥</span>
                    <input
                      aria-label="API 密钥"
                      type="password"
                      value={selectedProvider.apiKey}
                      onChange={(event) => {
                        const value = event.target.value
                        updateSelectedProvider((provider) => ({
                          ...provider,
                          apiKey: value,
                        }))
                      }}
                    />
                  </label>

                  <label className="provider-field">
                    <span>API 地址</span>
                    <input
                      aria-label="API 地址"
                      value={selectedProvider.baseURL ?? ''}
                      onChange={(event) => {
                        const value = event.target.value.trim()
                        updateSelectedProvider((provider) => ({
                          ...provider,
                          baseURL: value || null,
                        }))
                      }}
                    />
                  </label>
                </div>

                <div className="provider-model-header">
                  <strong>模型列表</strong>
                  <div className="provider-model-actions">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => {
                        setModelEditorOpen((current) => !current)
                      }}
                    >
                      管理模型
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={addModel}
                      disabled={!canAddModel}
                    >
                      添加模型
                    </button>
                  </div>
                </div>

                <div className="provider-inline-field">
                  <input
                    aria-label="新增模型"
                    value={newModelDraft}
                    placeholder="输入模型 ID，例如 gpt-4.1-mini"
                    onChange={(event) => {
                      setNewModelDraft(event.target.value)
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        addModel()
                      }
                    }}
                  />
                </div>

                {modelEditorOpen ? (
                  <div className="provider-model-list">
                    {selectedProvider.models.length > 0 ? (
                      selectedProvider.models.map((model, index) => (
                        <div key={`${selectedProvider.id}-model-${index}`} className="provider-model-row">
                          <input
                            aria-label={`模型 #${index + 1}`}
                            value={model}
                            onChange={(event) => {
                              const value = event.target.value
                              updateSelectedProvider((provider) => ({
                                ...provider,
                                models: provider.models.map((item, itemIndex) =>
                                  itemIndex === index ? value : item,
                                ),
                              }))
                            }}
                            onBlur={() => {
                              updateSelectedProvider((provider) => ({
                                ...provider,
                                models: normalizeModelItems(provider.models),
                              }))
                            }}
                          />
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => {
                              updateSelectedProvider((provider) => ({
                                ...provider,
                                models: provider.models.filter((_, itemIndex) => itemIndex !== index),
                              }))
                            }}
                          >
                            {`删除模型 #${index + 1}`}
                          </button>
                        </div>
                      ))
                    ) : (
                      <p className="provider-model-empty">暂无模型，请先输入模型 ID 后添加。</p>
                    )}
                  </div>
                ) : null}

                <button
                  type="button"
                  className="danger-button"
                  onClick={() => {
                    props.onRemoveProvider(selectedProvider.id)
                  }}
                >
                  删除平台
                </button>
              </>
            )}
          </section>
        </div>
      )}

      {isAddDialogOpen ? (
        <div
          className="provider-add-dialog-backdrop"
          role="presentation"
          onClick={() => {
            setIsAddDialogOpen(false)
          }}
        >
          <section
            className="provider-add-dialog"
            role="dialog"
            aria-label="添加平台"
            aria-modal="true"
            onClick={(event) => {
              event.stopPropagation()
            }}
          >
            <h4>添加平台</h4>
            <label className="provider-field">
              <span>平台名称</span>
              <input
                aria-label="平台名称"
                value={newProviderName}
                onChange={(event) => {
                  setNewProviderName(event.target.value)
                }}
                placeholder="例如 openrouter"
              />
            </label>

            <label className="provider-field">
              <span>平台类型</span>
              <select
                aria-label="平台类型"
                value={newProviderProtocol}
                onChange={(event) => {
                  setNewProviderProtocol(event.target.value as AddProviderInput['protocol'])
                }}
              >
                <option value="openai">openai compatible</option>
                <option value="anthropic">anthropic compatible</option>
              </select>
            </label>

            <div className="provider-add-dialog-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setIsAddDialogOpen(false)
                }}
              >
                取消
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={addProvider}
              >
                确认添加
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  )
}
