import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type {
  StudioHostState,
  StudioShellSnapshot,
} from '../../shared/studio-bridge-contract'
import type {
  ResolvedWorkPreference,
  WorkPreferenceRestoreSources,
  WorkPreferenceRestoreStatus,
} from '../utils/work-preferences'
import { sanitizeShellSnapshot } from '../utils/conversation-memory-guards'

export interface RecoveryState {
  status: WorkPreferenceRestoreStatus
  sources: WorkPreferenceRestoreSources
  projectDefaults: ResolvedWorkPreference['projectDefaults']
}

function createInitialRecoveryState(): RecoveryState {
  return {
    status: {
      kind: 'empty',
      message: '当前没有可恢复的最近工作状态，已使用项目推荐值。',
    },
    sources: {
      session: 'none',
      mode: 'builtin',
      agent: 'none',
      model: 'none',
    },
    projectDefaults: {
      mode: 'standard',
      agentId: null,
      modelId: null,
    },
  }
}

function createInitialSessionState() {
  return {
    hostStatus: 'disabled' as 'loading' | 'ready' | 'disabled' | 'error',
    hostState: {
      workspacePath: null,
      lastSelection: null,
    } satisfies StudioHostState,
    hostError: null as string | null,
    isOpeningWorkspace: false,
    shellStatus: 'disabled' as 'loading' | 'ready' | 'disabled' | 'error',
    shellSnapshot: null as StudioShellSnapshot | null,
    shellError: null as string | null,
    selectedProjectPath: null as string | null,
    selectedSessionId: null as string | null,
    recoveryState: createInitialRecoveryState(),
  }
}

export interface SessionStoreState {
  hostStatus: 'loading' | 'ready' | 'disabled' | 'error'
  hostState: StudioHostState
  hostError: string | null
  isOpeningWorkspace: boolean
  shellStatus: 'loading' | 'ready' | 'disabled' | 'error'
  shellSnapshot: StudioShellSnapshot | null
  shellError: string | null
  selectedProjectPath: string | null
  selectedSessionId: string | null
  recoveryState: RecoveryState
}

export interface SessionStoreActions {
  setHostStatus(status: SessionStoreState['hostStatus']): void
  setHostState(state: StudioHostState): void
  setHostError(error: string | null): void
  setIsOpeningWorkspace(value: boolean): void
  setShellStatus(status: SessionStoreState['shellStatus']): void
  setShellSnapshot(snapshot: StudioShellSnapshot | null): void
  setShellError(error: string | null): void
  setSelectedProjectPath(path: string | null): void
  setSelectedSessionId(sessionId: string | null): void
  setRecoveryState(state: RecoveryState | ((current: RecoveryState) => RecoveryState)): void
  resetSessionState(): void
}

export const useSessionStore = create<SessionStoreState & SessionStoreActions>()(
  immer((set) => ({
    ...createInitialSessionState(),
    setHostStatus(status) {
      set((state) => {
        state.hostStatus = status
      })
    },
    setHostState(nextState) {
      set((state) => {
        state.hostState = nextState
      })
    },
    setHostError(error) {
      set((state) => {
        state.hostError = error
      })
    },
    setIsOpeningWorkspace(value) {
      set((state) => {
        state.isOpeningWorkspace = value
      })
    },
    setShellStatus(status) {
      set((state) => {
        state.shellStatus = status
      })
    },
    setShellSnapshot(snapshot) {
      set((state) => {
        state.shellSnapshot =
          snapshot === null ? null : sanitizeShellSnapshot(snapshot)
      })
    },
    setShellError(error) {
      set((state) => {
        state.shellError = error
      })
    },
    setSelectedProjectPath(path) {
      set((state) => {
        state.selectedProjectPath = path
      })
    },
    setSelectedSessionId(sessionId) {
      set((state) => {
        state.selectedSessionId = sessionId
      })
    },
    setRecoveryState(input) {
      set((state) => {
        state.recoveryState =
          typeof input === 'function'
            ? input(state.recoveryState)
            : input
      })
    },
    resetSessionState() {
      set((state) => {
        Object.assign(state, createInitialSessionState())
      })
    },
  })),
)

export const useActiveSessionId = () =>
  useSessionStore((state) => state.selectedSessionId)
export const useSelectedProject = () =>
  useSessionStore((state) => state.selectedProjectPath)
