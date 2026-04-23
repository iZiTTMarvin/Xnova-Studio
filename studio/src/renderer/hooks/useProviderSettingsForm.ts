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

function formatTestResult(result: StudioProviderConnectionTestResult): ProviderTestResultView {
  if (result.success) {
    return {
      ok: true,
      message: `✅ ${result.model} 连通成功（${result.durationMs}ms）`,
    }
  }

  return {
    ok: false,
    message: `❌ ${result.model ?? result.providerId}: ${result.error}`,
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
  addProvider: (providerId: string) => boolean
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
      setError('当前宿主桥接不可用，Provider 配置暂时不可读取。')
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

  const providerMap = useMemo(() => {
    return new Map((draft?.providers ?? []).map((provider) => [provider.id, provider]))
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
  }

  const addProvider = (providerId: string): boolean => {
    const normalized = providerId.trim()
    if (!normalized) {
      setError('新增 Provider ID 不能为空。')
      return false
    }

    if (providerMap.has(normalized)) {
      setError(`Provider "${normalized}" 已存在。`)
      return false
    }

    setDraft((currentDraft) =>
      currentDraft
        ? {
            ...currentDraft,
            providers: [
              ...currentDraft.providers,
              {
                id: normalized,
                apiKey: '',
                baseURL: null,
                protocol: normalized === 'anthropic' ? 'anthropic' : 'openai',
                models: [],
                visionModels: [],
              },
            ],
          }
        : currentDraft,
    )
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

      return {
        ...currentDraft,
        providers: currentDraft.providers.map((provider) =>
          provider.id === providerId ? updater(provider) : provider,
        ),
      }
    })
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
          : 'Provider 配置已保存',
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
          message: `❌ ${providerId}: ${reason instanceof Error ? reason.message : String(reason)}`,
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
    updateProvider,
    removeProvider,
    save,
    testConnection,
  }
}
