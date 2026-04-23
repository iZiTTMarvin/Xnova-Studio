import { useMemo, useState } from 'react'
import type { StudioMemoryApi, StudioSettingsApi } from '../../shared/studio-bridge-contract'
import { MemoryOverviewCard } from './MemoryOverviewCard'
import { ProviderSettingsCard } from './ProviderSettingsCard'
import { useMemoryOverview } from '../hooks/useMemoryOverview'
import { useProviderSettingsForm } from '../hooks/useProviderSettingsForm'
import './StudioSettingsDialog.css'

type SettingsModuleId = 'providers' | 'default-model' | 'memory'

interface SettingsModuleItem {
  id: SettingsModuleId
  label: string
}

const SETTINGS_MODULES: SettingsModuleItem[] = [
  { id: 'providers', label: '模型服务' },
  { id: 'default-model', label: '默认模型' },
  { id: 'memory', label: '全局记忆' },
]

export interface StudioSettingsDialogProps {
  open: boolean
  onClose: () => void
  settingsApi: StudioSettingsApi | null
  memoryApi: StudioMemoryApi | null
  workspacePath: string | null
}

interface DefaultModelPanelProps {
  status: 'loading' | 'ready' | 'disabled' | 'error'
  draft: {
    defaultProvider: string
    defaultModel: string
    subAgentModel?: string | null
    providers: Array<{
      id: string
      models: string[]
    }>
  } | null
  isSaving: boolean
  error: string | null
  saveMessage: string | null
  onDefaultProviderChange: (providerId: string) => void
  onDefaultModelChange: (modelId: string) => void
  onSubAgentModelChange: (modelId: string) => void
  onSave: () => Promise<void>
}

function DefaultModelPanel(props: DefaultModelPanelProps) {
  return (
    <section className="settings-module-card" aria-label="默认模型模块">
      <header className="settings-module-header">
        <h3>默认模型</h3>
        <p>设置新会话默认使用的模型。</p>
      </header>

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

      {props.status !== 'ready' || !props.draft ? (
        <p className="settings-module-hint">
          {props.status === 'loading'
            ? '正在读取默认模型配置…'
            : props.status === 'disabled'
              ? '当前宿主桥接不可用，无法编辑默认模型。'
              : props.status === 'error'
                ? '默认模型配置读取失败。'
                : '暂无可编辑配置。'}
        </p>
      ) : (
        <div className="settings-module-form-grid">
          <label className="provider-field">
            <span>默认平台</span>
            <select
              aria-label="默认平台"
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
            <span>子代理默认模型</span>
            <input
              aria-label="子代理默认模型"
              value={props.draft.subAgentModel ?? ''}
              onChange={(event) => {
                props.onSubAgentModelChange(event.target.value)
              }}
              placeholder="留空则继承默认模型"
            />
          </label>

          <div className="settings-module-actions">
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                void props.onSave()
              }}
              disabled={props.isSaving}
            >
              {props.isSaving ? '保存中…' : '保存默认模型'}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

export function StudioSettingsDialog(props: StudioSettingsDialogProps) {
  const [activeModule, setActiveModule] = useState<SettingsModuleId>('providers')
  const providerForm = useProviderSettingsForm(props.settingsApi)
  const memoryOverview = useMemoryOverview(props.memoryApi)

  const statusText = useMemo(() => {
    const providerStatus =
      providerForm.status === 'ready'
        ? '模型服务就绪'
        : providerForm.status === 'loading'
          ? '模型服务加载中'
          : providerForm.status === 'disabled'
            ? '模型服务不可用'
            : '模型服务异常'
    const memoryStatus =
      memoryOverview.status === 'ready'
        ? '记忆就绪'
        : memoryOverview.status === 'loading'
          ? '记忆加载中'
          : memoryOverview.status === 'disabled'
            ? '记忆不可用'
            : '记忆异常'
    return `${providerStatus} · ${memoryStatus}`
  }, [memoryOverview.status, providerForm.status])

  if (!props.open) {
    return null
  }

  return (
    <div
      className="studio-settings-dialog-backdrop"
      role="presentation"
      onClick={props.onClose}
    >
      <section
        className="studio-settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="设置"
        onClick={(event) => {
          event.stopPropagation()
        }}
      >
        <header className="studio-settings-dialog-header">
          <div>
            <h2>设置</h2>
            <p className="studio-settings-dialog-subtitle">{statusText}</p>
          </div>
          <button
            type="button"
            className="secondary-button"
            aria-label="关闭设置"
            onClick={props.onClose}
          >
            关闭设置
          </button>
        </header>

        <div className="studio-settings-dialog-meta">
          <span>工作区</span>
          <strong className="mono">{props.workspacePath ?? '未绑定'}</strong>
        </div>

        <div className="studio-settings-dialog-content">
          <aside className="studio-settings-nav" aria-label="设置模块">
            {SETTINGS_MODULES.map((module) => (
              <button
                key={module.id}
                type="button"
                className={`studio-settings-nav-item ${
                  activeModule === module.id ? 'studio-settings-nav-item-active' : ''
                }`}
                aria-pressed={activeModule === module.id}
                onClick={() => {
                  setActiveModule(module.id)
                }}
              >
                {module.label}
              </button>
            ))}
          </aside>

          <div className="studio-settings-module-content">
            {activeModule === 'providers' ? (
              <ProviderSettingsCard
                status={providerForm.status}
                snapshot={providerForm.snapshot}
                draft={providerForm.draft}
                error={providerForm.error}
                saveMessage={providerForm.saveMessage}
                isSaving={providerForm.isSaving}
                testingProviderId={providerForm.testingProviderId}
                testResults={providerForm.testResults}
                onAddProvider={providerForm.addProvider}
                onRenameProvider={providerForm.renameProvider}
                onUpdateProvider={providerForm.updateProvider}
                onRemoveProvider={providerForm.removeProvider}
                onSave={providerForm.save}
                onTestProvider={providerForm.testConnection}
              />
            ) : null}

            {activeModule === 'default-model' ? (
              <DefaultModelPanel
                status={providerForm.status}
                draft={providerForm.draft}
                isSaving={providerForm.isSaving}
                error={providerForm.error}
                saveMessage={providerForm.saveMessage}
                onDefaultProviderChange={providerForm.setDefaultProvider}
                onDefaultModelChange={providerForm.setDefaultModel}
                onSubAgentModelChange={providerForm.setSubAgentModel}
                onSave={providerForm.save}
              />
            ) : null}

            {activeModule === 'memory' ? (
              <MemoryOverviewCard
                status={memoryOverview.status}
                snapshot={memoryOverview.snapshot}
                error={memoryOverview.error}
                actionMessage={memoryOverview.actionMessage}
                isRebuilding={memoryOverview.isRebuilding}
                onRebuild={memoryOverview.rebuild}
              />
            ) : null}
          </div>
        </div>
      </section>
    </div>
  )
}
