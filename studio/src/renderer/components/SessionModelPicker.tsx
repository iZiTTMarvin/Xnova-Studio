import { useEffect, useMemo, useState } from 'react'
import type { StudioSettingsApi } from '../../shared/studio-bridge-contract'

interface ProviderOption {
  id: string
  models: string[]
}

export interface SessionModelPickerProps {
  settingsApi: StudioSettingsApi | null
  currentProviderId: string | null
  currentModelId: string | null
  disabled?: boolean
  onChange: (providerId: string, modelId: string) => void
}

function pickResolvedProvider(
  providers: ProviderOption[],
  preferredProviderId: string | null,
): ProviderOption | null {
  if (preferredProviderId) {
    const matched = providers.find((provider) => provider.id === preferredProviderId)
    if (matched) {
      return matched
    }
  }

  return providers[0] ?? null
}

export function SessionModelPicker(props: SessionModelPickerProps) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'disabled' | 'error'>(
    props.settingsApi ? 'loading' : 'disabled',
  )
  const [providers, setProviders] = useState<ProviderOption[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!props.settingsApi) {
      setStatus('disabled')
      setProviders([])
      setError(null)
      return
    }

    let disposed = false
    setStatus('loading')
    setError(null)

    void props.settingsApi
      .getProviderSettings()
      .then((snapshot) => {
        if (disposed) {
          return
        }

        const nextProviders = snapshot.editableConfig.providers.map((provider) => ({
          id: provider.id,
          models: [...provider.models],
        }))
        setProviders(nextProviders)
        setStatus('ready')
      })
      .catch((reason) => {
        if (disposed) {
          return
        }

        setStatus('error')
        setError(reason instanceof Error ? reason.message : String(reason))
      })

    return () => {
      disposed = true
    }
  }, [props.settingsApi])

  const selectedProvider = useMemo(
    () => pickResolvedProvider(providers, props.currentProviderId),
    [props.currentProviderId, providers],
  )

  const selectedModel = useMemo(() => {
    if (!selectedProvider) {
      return props.currentModelId ?? null
    }

    if (
      props.currentModelId &&
      selectedProvider.models.includes(props.currentModelId)
    ) {
      return props.currentModelId
    }

    return selectedProvider.models[0] ?? null
  }, [props.currentModelId, selectedProvider])

  useEffect(() => {
    if (!selectedProvider || !selectedModel) {
      return
    }

    if (
      selectedProvider.id !== props.currentProviderId ||
      selectedModel !== props.currentModelId
    ) {
      props.onChange(selectedProvider.id, selectedModel)
    }
  }, [
    props.currentModelId,
    props.currentProviderId,
    props.onChange,
    selectedModel,
    selectedProvider,
  ])

  if (status === 'disabled') {
    return <span className="composer-model-fallback">模型配置暂不可用</span>
  }

  if (status === 'loading') {
    return <span className="composer-model-fallback">模型加载中…</span>
  }

  if (status === 'error') {
    return <span className="composer-model-fallback">{error ?? '模型读取失败'}</span>
  }

  if (!selectedProvider) {
    return <span className="composer-model-fallback">请先在设置中配置模型服务</span>
  }

  return (
    <div className="composer-model-picker" aria-label="会话模型选择">
      <label className="composer-model-field">
        <span>平台</span>
        <select
          aria-label="会话平台"
          value={selectedProvider.id}
          disabled={props.disabled}
          onChange={(event) => {
            const nextProvider =
              providers.find((provider) => provider.id === event.target.value) ?? null
            const nextModel = nextProvider?.models[0] ?? ''
            props.onChange(event.target.value, nextModel)
          }}
        >
          {providers.map((provider) => (
            <option key={provider.id} value={provider.id}>
              {provider.id}
            </option>
          ))}
        </select>
      </label>

      <label className="composer-model-field">
        <span>模型</span>
        <select
          aria-label="会话模型"
          value={selectedModel ?? ''}
          disabled={props.disabled || selectedProvider.models.length === 0}
          onChange={(event) => {
            props.onChange(selectedProvider.id, event.target.value)
          }}
        >
          {selectedProvider.models.map((modelId) => (
            <option key={modelId} value={modelId}>
              {modelId}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
