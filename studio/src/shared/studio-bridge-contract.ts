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

export interface StudioHostApi {
  getState(): Promise<StudioHostState>
  openWorkspace(): Promise<OpenWorkspaceResponse>
  onStateChanged(listener: (state: StudioHostState) => void): () => void
}

export interface StudioRuntimeApi {
  inspect(input?: RuntimeInspectRequest): Promise<RuntimeInspectResult>
  onEvent(listener: (event: StudioRuntimeEvent) => void): () => void
}

export interface StudioBridgeApi {
  host: StudioHostApi
  runtime: StudioRuntimeApi
}

export const STUDIO_BRIDGE_GLOBAL_KEY = 'xnovaStudio'

export const STUDIO_BRIDGE_CHANNELS = {
  hostGetState: 'studio:host:get-state',
  hostOpenWorkspace: 'studio:host:open-workspace',
  hostStateChanged: 'studio:host:state-changed',
} as const
