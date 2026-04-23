export type WorkspaceSelectionResult =
  | {
      ok: true
      code: 'selected'
      path: string
    }
  | {
      ok: false
      code: 'cancelled' | 'empty' | 'invalid' | 'error'
      message: string
    }

export interface StudioHostState {
  workspacePath: string | null
  lastSelection: WorkspaceSelectionResult | null
}

export interface OpenWorkspaceResponse {
  selection: WorkspaceSelectionResult
  state: StudioHostState
}

export interface RuntimeInspectRequest {
  refresh?: boolean
}

export type StudioModeId = 'standard' | 'xforge'

export interface RuntimeSnapshotView {
  sessionId: string | null
  isRunning: boolean
  provider: string
  model: string
  warnings: string[]
}

export type RuntimeInspectResult =
  | {
      ok: true
      snapshot: RuntimeSnapshotView
      workspacePath: string | null
      configWarnings: string[]
    }
  | {
      ok: false
      error: string
      workspacePath: string | null
      configWarnings: string[]
    }

export interface StudioRuntimeEvent {
  type: string
  timestamp: string
  sessionId?: string
  agentId?: string
  payload?: Record<string, unknown>
}

export interface StudioStartupProjectCandidate {
  path: string
  lastActiveAt: number
  exists: boolean
}

export interface StudioStartupSessionCandidate {
  projectPath: string
  sessionId: string
  valid: boolean
}

export interface StudioShellSnapshotRequest {
  projectPath?: string | null
}

export interface StudioRecentProjectSummary {
  path: string
  name: string
  lastActiveAt: number
  exists: boolean
  gitBranch: string | null
}

export interface StudioProjectSubagentSummary {
  agentId: string
  description: string
  status: 'running' | 'stopping' | 'stopped' | 'done' | 'error'
}

export interface StudioProjectSessionSummary {
  sessionId: string
  projectPath: string
  title: string
  updatedAt: string
  gitBranch: string | null
  messageCount: number
  subagents: StudioProjectSubagentSummary[]
}

export interface StudioScratchpadEntry {
  id: string
  title: string
  updatedAt: string | null
}

export interface StudioShellDefaults {
  projectPath: string | null
  branch: string | null
  agentId: string | null
  modelId: string | null
  providerId: string | null
  recommendedMode: StudioModeId | null
  allowedModes: StudioModeId[]
}

export interface StudioShellSnapshot {
  startup: {
    recentProject: StudioStartupProjectCandidate | null
    recentSession: StudioStartupSessionCandidate | null
  }
  recentProjects: StudioRecentProjectSummary[]
  projectSessions: StudioProjectSessionSummary[]
  scratchpadEntries: StudioScratchpadEntry[]
  defaults: StudioShellDefaults
  warnings: string[]
}

export interface StudioProviderSettingsSource {
  userToml?: string
  projectToml?: string
  legacyJson?: string
}

export interface StudioProviderSettingsEntry {
  id: string
  apiKey: string
  baseURL: string | null
  protocol: 'anthropic' | 'openai'
  models: string[]
  visionModels: string[]
}

export interface StudioProviderSettingsSnapshot {
  editableConfig: {
    defaultProvider: string
    defaultModel: string
    subAgentModel: string | null
    providers: StudioProviderSettingsEntry[]
  }
  effectiveDefaults: {
    defaultProvider: string
    defaultModel: string
  }
  source: StudioProviderSettingsSource
  warnings: string[]
}

export interface StudioProviderSettingsSaveInput {
  defaultProvider: string
  defaultModel: string
  subAgentModel?: string | null
  providers: StudioProviderSettingsEntry[]
}

export interface StudioProviderSettingsSaveResult {
  success: boolean
  snapshot?: StudioProviderSettingsSnapshot
  error?: string
}

export interface StudioProviderConnectionTestRequest {
  providerId: string
  config: StudioProviderSettingsEntry
  model?: string | null
}

export interface StudioProviderConnectionTestResult {
  success: boolean
  providerId: string
  model?: string
  durationMs?: number
  error?: string
}

export interface StudioMemoryOverviewSnapshot {
  enabled: boolean
  status: 'disabled' | 'bm25' | 'ready' | 'degraded'
  statusMessage: string
  embedding: {
    configured: boolean
    dimension: number | null
    missingFields: string[]
  }
  overview: {
    projectPath: string | null
    globalEntries: number
    projectEntries: number
    vectorChunks: number
  }
  source: {
    userToml?: string
    projectToml?: string
    legacyJson?: string
  }
  warnings: string[]
}

export interface StudioMemoryRebuildResult {
  success: boolean
  message: string
  snapshot?: StudioMemoryOverviewSnapshot
}

export interface StudioMcpServerConfigInput {
  transport: 'stdio' | 'sse' | 'streamable-http' | 'http'
  command?: string
  args?: string[]
  url?: string | null
  headers?: Record<string, string>
}

export interface StudioMcpServerSnapshot {
  name: string
  transport: 'stdio' | 'sse' | 'streamable-http' | 'http'
  status: 'connected' | 'failed'
  source: string
  writable: boolean
  toolCount: number
  toolNames: string[]
  error?: string
}

export interface StudioMcpOverviewSnapshot {
  status: 'unconfigured' | 'connected' | 'failed'
  statusMessage: string
  writableConfigPath: string
  servers: StudioMcpServerSnapshot[]
  warnings: string[]
}

export interface StudioMcpServerMutationInput {
  name: string
  config: StudioMcpServerConfigInput
}

export interface StudioMcpMutationResult {
  success: boolean
  message: string
  snapshot?: StudioMcpOverviewSnapshot
}

export interface StudioSkillsPluginsOverviewSnapshot {
  status: 'ready' | 'empty' | 'error'
  statusMessage: string
  sourceDistribution: Array<{
    source: 'builtin' | 'plugin' | 'user' | 'project'
    count: number
  }>
  recentSkills: Array<{
    name: string
    source: 'builtin' | 'plugin' | 'user' | 'project'
    lastUsedAt: string
  }>
  frequentSkills: Array<{
    name: string
    source: 'builtin' | 'plugin' | 'user' | 'project'
    useCount: number
  }>
  plugins: Array<{
    name: string
    source: 'xnova' | 'claude-code' | 'manual'
    version: string
    skillCount: number
    hasHooks: boolean
    description?: string
  }>
  warnings: string[]
}

export interface StudioHostApi {
  getState(): Promise<StudioHostState>
  openWorkspace(): Promise<OpenWorkspaceResponse>
  onStateChanged(listener: (state: StudioHostState) => void): () => void
}

export interface StudioRuntimeApi {
  inspect(input?: RuntimeInspectRequest): Promise<RuntimeInspectResult>
  onEvent(listener: (event: StudioRuntimeEvent) => void): () => void
}

export interface StudioShellApi {
  getSnapshot(input?: StudioShellSnapshotRequest): Promise<StudioShellSnapshot>
}

export interface StudioSettingsApi {
  getProviderSettings(): Promise<StudioProviderSettingsSnapshot>
  saveProviderSettings(
    input: StudioProviderSettingsSaveInput,
  ): Promise<StudioProviderSettingsSaveResult>
  testProviderConnection(
    input: StudioProviderConnectionTestRequest,
  ): Promise<StudioProviderConnectionTestResult>
}

export interface StudioMemoryApi {
  getOverview(): Promise<StudioMemoryOverviewSnapshot>
  rebuild(): Promise<StudioMemoryRebuildResult>
}

export interface StudioMcpApi {
  getOverview(): Promise<StudioMcpOverviewSnapshot>
  addServer(input: StudioMcpServerMutationInput): Promise<StudioMcpMutationResult>
  deleteServer(name: string): Promise<StudioMcpMutationResult>
}

export interface StudioSkillsPluginsApi {
  getOverview(): Promise<StudioSkillsPluginsOverviewSnapshot>
}

export interface StudioBridgeApi {
  host: StudioHostApi
  runtime: StudioRuntimeApi
  shell: StudioShellApi
  settings: StudioSettingsApi
  memory: StudioMemoryApi
  mcp: StudioMcpApi
  skillsPlugins: StudioSkillsPluginsApi
}

export const STUDIO_BRIDGE_GLOBAL_KEY = 'xnovaStudio'

export const STUDIO_BRIDGE_CHANNELS = {
  hostGetState: 'studio:host:get-state',
  hostOpenWorkspace: 'studio:host:open-workspace',
  hostStateChanged: 'studio:host:state-changed',
  runtimeInspect: 'studio:runtime:inspect',
  runtimeEvent: 'studio:runtime:event',
  shellGetSnapshot: 'studio:shell:get-snapshot',
  settingsGetProviderSettings: 'studio:settings:get-provider-settings',
  settingsSaveProviderSettings: 'studio:settings:save-provider-settings',
  settingsTestProviderConnection: 'studio:settings:test-provider-connection',
  memoryGetOverview: 'studio:memory:get-overview',
  memoryRebuild: 'studio:memory:rebuild',
  mcpGetOverview: 'studio:mcp:get-overview',
  mcpAddServer: 'studio:mcp:add-server',
  mcpDeleteServer: 'studio:mcp:delete-server',
  skillsPluginsGetOverview: 'studio:skills-plugins:get-overview',
} as const
