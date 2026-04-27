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

export interface BindWorkspaceRequest {
  workspacePath: string
}

export interface RuntimeInspectRequest {
  refresh?: boolean
}

export interface RuntimeSubmitRequest {
  text: string
  projectPath?: string | null
  sessionId?: string | null
  agentId?: string | null
  providerId?: string | null
  modelId?: string | null
  timing?: RuntimeSubmitTimingMarks
}

export interface RuntimeSubmitTimingMarks {
  userSubmitClickedAt?: number
  rendererRuntimeSubmitInvokedAt?: number
  ipcRuntimeSubmitReceivedAt?: number
}

export type RuntimeSubmitResult =
  | {
      ok: true
      sessionId: string | null
      runId?: string
    }
  | {
      ok: false
      error: string
      runId?: string
    }

export interface RuntimeCancelRequest {
  runId?: string | null
  reason?: string
}

export type RuntimeCancelResult =
  | {
      ok: true
      runId?: string | null
    }
  | {
      ok: false
      error: string
    }

export interface PermissionDialogRequest {
  requestId: string
  toolName: string
  args: Record<string, unknown>
  description: string
}

export interface PermissionDialogResponse {
  requestId: string
  allow: boolean
  remember: boolean
}

export interface UserQuestionDialogOption {
  label: string
  description?: string
}

export interface UserQuestionDialogQuestion {
  key: string
  title: string
  type: 'select' | 'multiselect' | 'text'
  options?: UserQuestionDialogOption[]
  placeholder?: string
}

export interface UserQuestionDialogRequest {
  requestId: string
  sessionId: string
  questions: UserQuestionDialogQuestion[]
}

export interface UserQuestionDialogResponse {
  requestId: string
  cancelled: boolean
  answers: Record<string, string | string[]>
}

export type StudioModeId = 'standard' | 'xforge'

export type StudioStatusIssueCode =
  | 'runtime-not-ready'
  | 'workspace-missing'
  | 'project-config-error'

export interface StudioStatusIssue {
  code: StudioStatusIssueCode
  severity: 'warning' | 'error'
  message: string
}

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
      status: 'ready' | 'not-ready'
      snapshot: RuntimeSnapshotView
      workspacePath: string | null
      configWarnings: string[]
      issues: StudioStatusIssue[]
    }
  | {
      ok: false
      status: 'error'
      error: string
      workspacePath: string | null
      configWarnings: string[]
      issues: StudioStatusIssue[]
    }

export type StudioRunStatus =
  | 'idle'
  | 'starting'
  | 'running'
  | 'waiting_permission'
  | 'waiting_user_input'
  | 'tool_calling'
  | 'cancelling'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type StudioRunLifecycleEventType =
  | 'run_started'
  | 'model_request_started'
  | 'model_first_chunk'
  | 'model_request_finished'
  | 'model_request_failed'
  | 'text_delta'
  | 'thinking'
  | 'tool_start'
  | 'tool_end'
  | 'context_update'
  | 'warning'
  | 'run_completed'
  | 'run_failed'
  | 'run_cancelled'

export type StudioRuntimeEventType =
  | StudioRunLifecycleEventType
  | 'runtime.snapshot'
  | 'runtime.error'
  | 'permission.request'
  | 'permission.decision'
  | 'subagent_spawn'
  | 'subagent_progress'
  | 'subagent_done'
  | 'timing_mark'
  | 'turn_end'
  | 'session_end'
  | 'error'
  | (string & {})

export interface StudioRuntimeEvent {
  type: StudioRuntimeEventType
  timestamp: string
  runId?: string
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
  sessionId?: string | null
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
  stateMessage?: string | null
  partialResult?: string | null
}

export interface StudioProjectSessionSummary {
  sessionId: string
  projectPath: string
  title: string
  updatedAt: string
  gitBranch: string | null
  messageCount: number
  providerId?: string | null
  modelId?: string | null
  subagents: StudioProjectSubagentSummary[]
}

export type StudioConversationBlock =
  | {
      id: string
      type: 'text'
      content: string
    }
  | {
      id: string
      type: 'thinking'
      content: string
      startedAt?: number
      endedAt?: number
      durationMs?: number
    }
  | {
      id: string
      type: 'tool'
      toolCallId: string
      toolName: string
      args: Record<string, unknown>
      status: 'running' | 'done' | 'error'
      durationMs?: number
      success?: boolean
      resultSummary?: string
      resultFull?: string
      agentId?: string
    }
  | {
      id: string
      type: 'status'
      content: string
    }
  | {
      id: string
      type: 'system'
      content: string
      level: 'info' | 'warning' | 'error'
    }

export interface StudioConversationMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  blocks: StudioConversationBlock[]
  providerId?: string | null
  modelId?: string | null
  usage?: {
    inputTokens: number
    outputTokens: number
    cacheReadTokens: number
    cacheWriteTokens: number
  }
  llmCallCount?: number
  toolCallCount?: number
}

export interface StudioActiveSessionDetail extends StudioProjectSessionSummary {
  leafEventUuid: string | null
  messages: StudioConversationMessage[]
}

export function getMessagePlainText(
  message: Pick<StudioConversationMessage, 'blocks'>,
): string {
  return message.blocks
    .filter(
      (block): block is Extract<StudioConversationBlock, { type: 'text' }> =>
        block.type === 'text',
    )
    .map((block) => block.content)
    .join('')
    .trim()
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
  availablePrimaryAgentIds?: string[]
  availableModelIds?: string[]
}

export interface StudioShellSnapshot {
  startup: {
    recentProject: StudioStartupProjectCandidate | null
    recentSession: StudioStartupSessionCandidate | null
  }
  recentProjects: StudioRecentProjectSummary[]
  projectSessions: StudioProjectSessionSummary[]
  activeSession?: StudioActiveSessionDetail | null
  scratchpadEntries: StudioScratchpadEntry[]
  defaults: StudioShellDefaults
  issues: StudioStatusIssue[]
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
  bindWorkspace(workspacePath: string): Promise<StudioHostState>
  onStateChanged(listener: (state: StudioHostState) => void): () => void
}

export interface StudioRuntimeApi {
  inspect(input?: RuntimeInspectRequest): Promise<RuntimeInspectResult>
  submit(input: RuntimeSubmitRequest): Promise<RuntimeSubmitResult>
  cancel(input?: RuntimeCancelRequest): Promise<RuntimeCancelResult>
  onEvent(listener: (event: StudioRuntimeEvent) => void): () => void
}

export interface StudioPermissionApi {
  onRequest(listener: (request: PermissionDialogRequest) => void): () => void
  respond(input: PermissionDialogResponse): Promise<void>
}

export interface StudioUserInputApi {
  onRequest(listener: (request: UserQuestionDialogRequest) => void): () => void
  respond(input: UserQuestionDialogResponse): Promise<void>
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
  permission: StudioPermissionApi
  userInput: StudioUserInputApi
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
  hostBindWorkspace: 'studio:host:bind-workspace',
  hostStateChanged: 'studio:host:state-changed',
  runtimeInspect: 'studio:runtime:inspect',
  runtimeSubmit: 'studio:runtime:submit',
  runtimeCancel: 'studio:runtime:cancel',
  runtimeEvent: 'studio:runtime:event',
  permissionRequest: 'studio:permission:request',
  permissionRespond: 'studio:permission:respond',
  userInputRequest: 'studio:user-input:request',
  userInputRespond: 'studio:user-input:respond',
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
