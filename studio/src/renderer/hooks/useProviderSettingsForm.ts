import { useEffect, useMemo, useState } from 'react'
import type {
  StudioProviderConnectionTestResult,
  StudioProviderSettingsEntry,
  StudioProviderSettingsSaveInput,
  StudioProviderSettingsSnapshot,
  StudioSettingsApi,
} from '../../shared/studio-bridge-contract'

export interface ProviderTestResultView {
  ok: boolean
  message: string
}

export interface AddProviderInput {
  providerId: string
  protocol: 'openai' | 'anthropic'
}

function formatTestResult(result: StudioProviderConnectionTestResult): ProviderTestResultView {
  if (result.success) {
    return {
      ok: true,
      message: `${result.model} 连通成功（${result.durationMs ?? 0}ms）`,
    }
  }

  return {
    ok: false,
    message: `${result.model ?? result.providerId}: ${result.error ?? '连接失败'}`,
  }
}

function cloneSnapshot(
  snapshot: StudioProviderSettingsSnapshot,
): StudioProviderSettingsSaveInput {
  return {
    defaultProvider: snapshot.editableConfig.defaultProvider,
    defaultModel: snapshot.editableConfig.defaultModel,
    subAgentModel: snapshot.editableConfig.subAgentModel,
    providers: snapshot.editableConfig.providers.map((provider) => ({
      ...provider,
      models: [...provider.models],
      visionModels: [...provider.visionModels],
    })),
  }
}

function resolveNextDefaultModel(provider: StudioProviderSettingsEntry): string {
  return provider.models[0] ?? ''
}

function updateTestResultKey(
  current: Record<string, ProviderTestResultView>,
  from: string,
  to: string,
): Record<string, ProviderTestResultView> {
  const currentValue = current[from]
  if (from === to || !currentValue) {
    return current
  }

  const next = { ...current }
  next[to] = currentValue
  delete next[from]
  return next
}

export interface UseProviderSettingsFormResult {
  status: 'loading' | 'ready' | 'disabled' | 'error'
  snapshot: StudioProviderSettingsSnapshot | null
  draft: StudioProviderSettingsSaveInput | null
  error: string | null
  saveMessage: string | null
  isSaving: boolean
  testingProviderId: string | null
  testResults: Record<string, ProviderTestResultView>
  setDefaultProvider: (providerId: string) => void
  setDefaultModel: (modelId: string) => void
  setSubAgentModel: (modelId: string) => void
  addProvider: (input: AddProviderInput) => boolean
  renameProvider: (providerId: string, nextProviderId: string) => boolean
  updateProvider: (
    providerId: string,
    updater: (provider: StudioProviderSettingsEntry) => StudioProviderSettingsEntry,
  ) => void
  removeProvider: (providerId: string) => void
  save: () => Promise<void>
  testConnection: (providerId: string) => Promise<void>
}

export function useProviderSettingsForm(
  settingsApi: StudioSettingsApi | null,
): UseProviderSettingsFormResult {
  const [status, setStatus] = useState<'loading' | 'ready' | 'disabled' | 'error'>(
    settingsApi ? 'loading' : 'disabled',
  )
  const [snapshot, setSnapshot] = useState<StudioProviderSettingsSnapshot | null>(null)
  const [draft, setDraft] = useState<StudioProviderSettingsSaveInput | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [testingProviderId, setTestingProviderId] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, ProviderTestResultView>>({})

  useEffect(() => {
    if (!settingsApi) {
      setStatus('disabled')
      setError('当前宿主桥接不可用，模型服务配置暂时不可读取。')
      setSnapshot(null)
      setDraft(null)
      return
    }

    let disposed = false
    setStatus('loading')
    setError(null)
    setSaveMessage(null)

    void settingsApi
      .getProviderSettings()
      .then((nextSnapshot) => {
        if (disposed) {
          return
        }
        setSnapshot(nextSnapshot)
        setDraft(cloneSnapshot(nextSnapshot))
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
  }, [settingsApi])

  const providerIds = useMemo(() => {
    return new Set((draft?.providers ?? []).map((provider) => provider.id))
  }, [draft])

  const setDefaultProvider = (providerId: string): void => {
    setDraft((currentDraft) => {
      if (!currentDraft) {
        return currentDraft
      }

      const nextProvider = currentDraft.providers.find((provider) => provider.id === providerId)
      return {
        ...currentDraft,
        defaultProvider: providerId,
        defaultModel: nextProvider ? resolveNextDefaultModel(nextProvider) : currentDraft.defaultModel,
      }
    })
    setError(null)
  }

  const setDefaultModel = (modelId: string): void => {
    setDraft((currentDraft) =>
      currentDraft
        ? {
            ...currentDraft,
            defaultModel: modelId,
          }
        : currentDraft,
    )
    setError(null)
  }

  const setSubAgentModel = (modelId: string): void => {
    setDraft((currentDraft) =>
      currentDraft
        ? {
            ...currentDraft,
            subAgentModel: modelId || null,
          }
        : currentDraft,
    )
    setError(null)
  }

  const addProvider = (input: AddProviderInput): boolean => {
    const normalized = input.providerId.trim()
    if (!normalized) {
      setError('平台名称不能为空。')
      return false
    }

    if (providerIds.has(normalized)) {
      setError(`平台 "${normalized}" 已存在。`)
      return false
    }

    setDraft((currentDraft) => {
      if (!currentDraft) {
        return currentDraft
      }

      const providers = [
        ...currentDraft.providers,
        {
          id: normalized,
          apiKey: '',
          baseURL: null,
          protocol: input.protocol,
          models: [],
          visionModels: [],
        },
      ]

      return {
        ...currentDraft,
        providers,
        defaultProvider: currentDraft.defaultProvider || normalized,
      }
    })
    setError(null)
    return true
  }

  const renameProvider = (providerId: string, nextProviderId: string): boolean => {
    const normalized = nextProviderId.trim()
    if (!normalized) {
      setError('平台名称不能为空。')
      return false
    }

    if (providerId !== normalized && providerIds.has(normalized)) {
      setError(`平台 "${normalized}" 已存在。`)
      return false
    }

    let renamed = false
    setDraft((currentDraft) => {
      if (!currentDraft) {
        return currentDraft
      }

      if (!currentDraft.providers.some((provider) => provider.id === providerId)) {
        return currentDraft
      }

      renamed = true
      return {
        ...currentDraft,
        providers: currentDraft.providers.map((provider) =>
          provider.id === providerId
            ? {
                ...provider,
                id: normalized,
              }
            : provider,
        ),
        defaultProvider:
          currentDraft.defaultProvider === providerId ? normalized : currentDraft.defaultProvider,
      }
    })

    if (!renamed) {
      return false
    }

    setTestResults((current) => updateTestResultKey(current, providerId, normalized))
    if (testingProviderId === providerId) {
      setTestingProviderId(normalized)
    }
    setError(null)
    return true
  }

  const updateProvider = (
    providerId: string,
    updater: (provider: StudioProviderSettingsEntry) => StudioProviderSettingsEntry,
  ): void => {
    setDraft((currentDraft) => {
      if (!currentDraft) {
        return currentDraft
      }

      const nextProviders = currentDraft.providers.map((provider) =>
        provider.id === providerId ? updater(provider) : provider,
      )

      const defaultProviderEntry = nextProviders.find(
        (provider) => provider.id === currentDraft.defaultProvider,
      )
      const shouldResetDefaultModel =
        Boolean(defaultProviderEntry) &&
        !defaultProviderEntry!.models.includes(currentDraft.defaultModel)

      return {
        ...currentDraft,
        providers: nextProviders,
        defaultModel:
          shouldResetDefaultModel && defaultProviderEntry
            ? resolveNextDefaultModel(defaultProviderEntry)
            : currentDraft.defaultModel,
      }
    })
    setError(null)
  }

  const removeProvider = (providerId: string): void => {
    setDraft((currentDraft) => {
      if (!currentDraft) {
        return currentDraft
      }

      const nextProviders = currentDraft.providers.filter((provider) => provider.id !== providerId)
      const nextDefaultProvider =
        currentDraft.defaultProvider === providerId
          ? (nextProviders[0]?.id ?? '')
          : currentDraft.defaultProvider
      const nextDefaultModel =
        currentDraft.defaultProvider === providerId
          ? (nextProviders[0] ? resolveNextDefaultModel(nextProviders[0]) : '')
          : currentDraft.defaultModel

      return {
        ...currentDraft,
        providers: nextProviders,
        defaultProvider: nextDefaultProvider,
        defaultModel: nextDefaultModel,
      }
    })

    setTestResults((current) => {
      if (!current[providerId]) {
        return current
      }

      const next = { ...current }
      delete next[providerId]
      return next
    })

    if (testingProviderId === providerId) {
      setTestingProviderId(null)
    }
    setError(null)
  }

  const save = async (): Promise<void> => {
    if (!settingsApi || !draft) {
      return
    }

    setIsSaving(true)
    setError(null)
    setSaveMessage(null)

    try {
      const result = await settingsApi.saveProviderSettings(draft)
      if (!result.success || !result.snapshot) {
        setError(result.error ?? '保存失败')
        return
      }

      setSnapshot(result.snapshot)
      setDraft(cloneSnapshot(result.snapshot))
      setSaveMessage(
        result.snapshot.source.userToml
          ? `已写入 ${result.snapshot.source.userToml}`
          : '配置已保存',
      )
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setIsSaving(false)
    }
  }

  const testConnection = async (providerId: string): Promise<void> => {
    if (!settingsApi || !draft) {
      return
    }

    const provider = draft.providers.find((item) => item.id === providerId)
    if (!provider) {
      return
    }

    setTestingProviderId(providerId)
    setError(null)

    try {
      const result = await settingsApi.testProviderConnection({
        providerId,
        config: provider,
        model:
          draft.defaultProvider === providerId ? draft.defaultModel : provider.models[0] ?? null,
      })
      setTestResults((current) => ({
        ...current,
        [providerId]: formatTestResult(result),
      }))
    } catch (reason) {
      setTestResults((current) => ({
        ...current,
        [providerId]: {
          ok: false,
          message: `${providerId}: ${reason instanceof Error ? reason.message : String(reason)}`,
        },
      }))
    } finally {
      setTestingProviderId(null)
    }
  }

  return {
    status,
    snapshot,
    draft,
    error,
    saveMessage,
    isSaving,
    testingProviderId,
    testResults,
    setDefaultProvider,
    setDefaultModel,
    setSubAgentModel,
    addProvider,
    renameProvider,
    updateProvider,
    removeProvider,
    save,
    testConnection,
  }
}
