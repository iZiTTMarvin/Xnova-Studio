import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

function createInitialSettingsState() {
  return {
    currentMode: 'standard' as 'standard' | 'xforge',
    currentAgentId: null as string | null,
    currentProviderId: null as string | null,
    currentModelId: null as string | null,
  }
}

export interface SettingsStoreState {
  currentMode: 'standard' | 'xforge'
  currentAgentId: string | null
  currentProviderId: string | null
  currentModelId: string | null
}

export interface SettingsStoreActions {
  setCurrentMode(mode: SettingsStoreState['currentMode']): void
  setCurrentAgentId(agentId: string | null): void
  setCurrentProviderId(providerId: string | null): void
  setCurrentModelId(modelId: string | null): void
  setCurrentProviderModel(providerId: string | null, modelId: string | null): void
  resetSettingsState(): void
}

export const useSettingsStore = create<SettingsStoreState & SettingsStoreActions>()(
  immer((set) => ({
    ...createInitialSettingsState(),
    setCurrentMode(mode) {
      set((state) => {
        state.currentMode = mode
      })
    },
    setCurrentAgentId(agentId) {
      set((state) => {
        state.currentAgentId = agentId
      })
    },
    setCurrentProviderId(providerId) {
      set((state) => {
        state.currentProviderId = providerId
      })
    },
    setCurrentModelId(modelId) {
      set((state) => {
        state.currentModelId = modelId
      })
    },
    setCurrentProviderModel(providerId, modelId) {
      set((state) => {
        state.currentProviderId = providerId
        state.currentModelId = modelId
      })
    },
    resetSettingsState() {
      set((state) => {
        Object.assign(state, createInitialSettingsState())
      })
    },
  })),
)
