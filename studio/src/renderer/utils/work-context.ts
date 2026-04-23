import type {
  StudioModeId,
  StudioProjectSessionSummary,
  StudioShellDefaults,
} from '../../shared/studio-bridge-contract'

export interface WorkContext {
  projectPath: string | null
  branch: string | null
  agentId: string | null
  modelId: string | null
  mode: StudioModeId
  contextUsageLabel: string | null
  runningSubagents: number
}

export interface WorkContextInput {
  selectedProjectPath: string | null
  activeSession: StudioProjectSessionSummary | null
  defaults: StudioShellDefaults | null
  agentId: string | null
  modelId: string | null
  mode: StudioModeId
  contextUsageLabel: string | null
}

export function resolveWorkContext(input: WorkContextInput): WorkContext {
  return {
    projectPath: input.selectedProjectPath ?? input.defaults?.projectPath ?? null,
    branch: input.activeSession?.gitBranch ?? input.defaults?.branch ?? null,
    agentId: input.agentId ?? input.defaults?.agentId ?? null,
    modelId: input.modelId ?? input.activeSession?.modelId ?? input.defaults?.modelId ?? null,
    mode: input.mode,
    contextUsageLabel: input.contextUsageLabel,
    runningSubagents:
      input.activeSession?.subagents.filter((subagent) => subagent.status === 'running').length ??
      0,
  }
}
