import { McpOverviewCard } from '../components/McpOverviewCard'
import { SkillsPluginsOverviewCard } from '../components/SkillsPluginsOverviewCard'
import { SettingsToolsPageLayout } from '../components/SettingsToolsPageLayout'
import { useMcpOverview } from '../hooks/useMcpOverview'
import { useSkillsPluginsOverview } from '../hooks/useSkillsPluginsOverview'
import type { SettingsToolsPageViewModel } from '../hooks/useSettingsToolsPageModel'
import type { StudioMcpApi, StudioSkillsPluginsApi } from '../../shared/studio-bridge-contract'

export interface StudioToolsPageProps {
  page: SettingsToolsPageViewModel
  mcpApi: StudioMcpApi | null
  skillsPluginsApi: StudioSkillsPluginsApi | null
}

export function StudioToolsPage(props: StudioToolsPageProps) {
  const mcpOverview = useMcpOverview(props.mcpApi)
  const skillsPluginsOverview = useSkillsPluginsOverview(props.skillsPluginsApi)

  return (
    <SettingsToolsPageLayout page={props.page}>
      <McpOverviewCard
        status={mcpOverview.status}
        snapshot={mcpOverview.snapshot}
        error={mcpOverview.error}
        actionMessage={mcpOverview.actionMessage}
        isMutating={mcpOverview.isMutating}
        onAddServer={mcpOverview.addServer}
        onDeleteServer={mcpOverview.deleteServer}
      />

      <SkillsPluginsOverviewCard
        status={skillsPluginsOverview.status}
        snapshot={skillsPluginsOverview.snapshot}
        error={skillsPluginsOverview.error}
      />
    </SettingsToolsPageLayout>
  )
}
