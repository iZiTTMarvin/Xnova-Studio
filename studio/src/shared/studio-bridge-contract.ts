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

export interface StudioBridgeApi {
  host: StudioHostApi
  runtime: StudioRuntimeApi
  shell: StudioShellApi
}

export const STUDIO_BRIDGE_GLOBAL_KEY = 'xnovaStudio'

export const STUDIO_BRIDGE_CHANNELS = {
  hostGetState: 'studio:host:get-state',
  hostOpenWorkspace: 'studio:host:open-workspace',
  hostStateChanged: 'studio:host:state-changed',
  runtimeInspect: 'studio:runtime:inspect',
  runtimeEvent: 'studio:runtime:event',
  shellGetSnapshot: 'studio:shell:get-snapshot',
} as const
