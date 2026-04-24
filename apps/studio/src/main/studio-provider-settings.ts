import { ConfigManager } from '@config/config-manager.js'
import {
  readProviderSettingsSnapshot,
  saveProviderSettings,
  testProviderConnection,
  type ProviderConnectionTestInput,
  type ProviderConnectionTestResult,
  type ProviderSettingsSnapshot,
  type SaveProviderSettingsInput,
  type SaveProviderSettingsResult,
} from '@config/provider-settings.js'
import type {
  StudioHostState,
  StudioProviderConnectionTestRequest,
  StudioProviderConnectionTestResult,
  StudioProviderSettingsSaveInput,
  StudioProviderSettingsSaveResult,
  StudioProviderSettingsSnapshot,
} from '../shared/studio-bridge-contract'

function toSnapshot(snapshot: ProviderSettingsSnapshot): StudioProviderSettingsSnapshot {
  return snapshot
}

function toSaveResult(result: SaveProviderSettingsResult): StudioProviderSettingsSaveResult {
  return {
    success: result.success,
    ...(result.snapshot ? { snapshot: toSnapshot(result.snapshot) } : {}),
    ...(result.error ? { error: result.error } : {}),
  }
}

function toConnectionResult(
  result: ProviderConnectionTestResult,
): StudioProviderConnectionTestResult {
  return result
}

export interface StudioProviderSettingsService {
  getSnapshot(hostState: StudioHostState): Promise<StudioProviderSettingsSnapshot>
  save(
    input: StudioProviderSettingsSaveInput,
    hostState: StudioHostState,
  ): Promise<StudioProviderSettingsSaveResult>
  testConnection(
    input: StudioProviderConnectionTestRequest,
    hostState: StudioHostState,
  ): Promise<StudioProviderConnectionTestResult>
}

export interface CreateStudioProviderSettingsServiceOptions {
  configManager?: ConfigManager
  readProviderSettingsSnapshotFn?: typeof readProviderSettingsSnapshot
  saveProviderSettingsFn?: typeof saveProviderSettings
  testProviderConnectionFn?: typeof testProviderConnection
}

export function createStudioProviderSettingsService(
  options: CreateStudioProviderSettingsServiceOptions = {},
): StudioProviderSettingsService {
  const configManager = options.configManager ?? new ConfigManager()
  const readSnapshot = options.readProviderSettingsSnapshotFn ?? readProviderSettingsSnapshot
  const saveSettings = options.saveProviderSettingsFn ?? saveProviderSettings
  const testConnection = options.testProviderConnectionFn ?? testProviderConnection

  return {
    async getSnapshot(hostState) {
      return toSnapshot(
        readSnapshot(hostState.workspacePath, {
          configManager,
        }),
      )
    },
    async save(input, hostState) {
      return toSaveResult(
        saveSettings(input as SaveProviderSettingsInput, {
          projectPath: hostState.workspacePath,
          configManager,
        }),
      )
    },
    async testConnection(input) {
      return toConnectionResult(
        await testConnection(input as ProviderConnectionTestInput),
      )
    },
  }
}
