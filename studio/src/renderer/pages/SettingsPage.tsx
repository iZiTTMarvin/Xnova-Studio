import { MemoryOverviewCard } from '../components/MemoryOverviewCard'
import { ProviderSettingsCard } from '../components/ProviderSettingsCard'
import { SettingsToolsPageLayout } from '../components/SettingsToolsPageLayout'
import { useMemoryOverview } from '../hooks/useMemoryOverview'
import { useProviderSettingsForm } from '../hooks/useProviderSettingsForm'
import type { SettingsToolsPageViewModel } from '../hooks/useSettingsToolsPageModel'
import type { StudioMemoryApi, StudioSettingsApi } from '../../shared/studio-bridge-contract'

export interface StudioSettingsPageProps {
  page: SettingsToolsPageViewModel
  settingsApi: StudioSettingsApi | null
  memoryApi: StudioMemoryApi | null
}

export function StudioSettingsPage(props: StudioSettingsPageProps) {
  const providerForm = useProviderSettingsForm(props.settingsApi)
  const memoryOverview = useMemoryOverview(props.memoryApi)

  return (
    <SettingsToolsPageLayout page={props.page}>
      <ProviderSettingsCard
        status={providerForm.status}
        snapshot={providerForm.snapshot}
        draft={providerForm.draft}
        error={providerForm.error}
        saveMessage={providerForm.saveMessage}
        isSaving={providerForm.isSaving}
        testingProviderId={providerForm.testingProviderId}
        testResults={providerForm.testResults}
        onDefaultProviderChange={providerForm.setDefaultProvider}
        onDefaultModelChange={providerForm.setDefaultModel}
        onSubAgentModelChange={providerForm.setSubAgentModel}
        onAddProvider={providerForm.addProvider}
        onUpdateProvider={providerForm.updateProvider}
        onRemoveProvider={providerForm.removeProvider}
        onSave={providerForm.save}
        onTestProvider={providerForm.testConnection}
      />

      <MemoryOverviewCard
        status={memoryOverview.status}
        snapshot={memoryOverview.snapshot}
        error={memoryOverview.error}
        actionMessage={memoryOverview.actionMessage}
        isRebuilding={memoryOverview.isRebuilding}
        onRebuild={memoryOverview.rebuild}
      />
    </SettingsToolsPageLayout>
  )
}
