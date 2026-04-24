// src/components/ModelSelector.tsx

import { useState, useEffect, useMemo } from 'react'
import { apiGet } from '../hooks/useApi'

interface ProviderConfig {
  apiKey: string
  baseURL?: string
  protocol?: string
  models: string[]
  visionModels?: string[]
}

interface CCodeConfig {
  defaultProvider: string
  defaultModel: string
  subAgentModel?: string
  providers: Record<string, ProviderConfig>
}

interface SettingsResponse {
  config: CCodeConfig
}

interface ModelSelectorProps {
  currentProvider?: string
  currentModel?: string
  onChange: (provider: string, model: string) => void
}

export function ModelSelector({ currentProvider, currentModel, onChange }: ModelSelectorProps) {
  const [config, setConfig] = useState<CCodeConfig | null>(null)

  useEffect(() => {
    apiGet<SettingsResponse>('/api/settings')
      .then(d => setConfig(d.config))
      .catch(() => {})
  }, [])

  const providerNames = useMemo(() => config ? Object.keys(config.providers) : [], [config])

  const selectedProvider = useMemo(() => {
    if (!config) return currentProvider ?? ''
    const name = currentProvider ?? config.defaultProvider
    return providerNames.includes(name) ? name : (providerNames[0] ?? '')
  }, [config, currentProvider, providerNames])

  const availableModels = useMemo(() => {
    if (!config || !selectedProvider) return []
    return config.providers[selectedProvider]?.models ?? []
  }, [config, selectedProvider])

  const selectedModel = useMemo(() => {
    if (!config) return currentModel ?? ''
    const name = currentModel ?? config.defaultModel
    return availableModels.includes(name) ? name : (availableModels[0] ?? '')
  }, [config, currentModel, availableModels])

  useEffect(() => {
    if (selectedProvider && selectedModel) {
      onChange(selectedProvider, selectedModel)
    }
  // Only fire when actual resolved values change, not on every render
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProvider, selectedModel])

  if (!config || providerNames.length === 0) {
    return (
      <div className="flex items-center gap-2 px-4 py-1.5 border-t border-border bg-surface/50">
        <span className="text-xs text-txt-muted">未配置 Provider</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 px-4 py-1.5 border-t border-border bg-surface/50">
      <div className="flex items-center gap-1.5">
        <label className="text-xs text-txt-secondary shrink-0">Provider</label>
        <select
          value={selectedProvider}
          onChange={e => {
            const prov = config.providers[e.target.value]
            const firstModel = prov?.models?.[0] ?? ''
            onChange(e.target.value, firstModel)
          }}
          className="bg-elevated text-sm rounded px-2 py-1 outline-none focus:ring-1 focus:border-accent max-w-[180px]"
        >
          {providerNames.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>

      <div className="flex items-center gap-1.5">
        <label className="text-xs text-txt-secondary shrink-0">Model</label>
        {availableModels.length > 0 ? (
          <select
            value={selectedModel}
            onChange={e => onChange(selectedProvider, e.target.value)}
            className="bg-elevated text-sm rounded px-2 py-1 outline-none focus:ring-1 focus:border-accent max-w-[320px]"
          >
            {availableModels.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        ) : (
          <span className="text-xs text-txt-muted">该 Provider 暂无模型</span>
        )}
      </div>
    </div>
  )
}
