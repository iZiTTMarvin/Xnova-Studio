import type {
  StudioSkillsPluginsOverviewSnapshot,
  StudioMcpMutationResult,
  StudioMcpOverviewSnapshot,
  StudioMcpServerMutationInput,
  OpenWorkspaceResponse,
  StudioMemoryOverviewSnapshot,
  StudioMemoryRebuildResult,
  StudioProviderConnectionTestRequest,
  StudioProviderConnectionTestResult,
  StudioProviderSettingsSaveInput,
  StudioProviderSettingsSaveResult,
  StudioProviderSettingsSnapshot,
  RuntimeInspectRequest,
  RuntimeCancelRequest,
  RuntimeSubmitRequest,
  PermissionDialogRequest,
  PermissionDialogResponse,
  UserQuestionDialogRequest,
  UserQuestionDialogResponse,
  StudioBridgeApi,
  StudioHostState,
  StudioShellSnapshot,
  StudioShellSnapshotRequest,
  StudioRuntimeEvent,
} from '../shared/studio-bridge-contract'
import { STUDIO_BRIDGE_CHANNELS, type StudioIpcRendererLike } from './studio-ipc-contract'
import {
  assertStudioNoPayload,
  parseStudioHostState,
  parseStudioSkillsPluginsOverviewSnapshot,
  parseStudioMcpMutationResult,
  parseStudioMcpOverviewSnapshot,
  parseStudioMcpServerMutationInput,
  parseStudioMemoryOverviewSnapshot,
  parseStudioMemoryRebuildResult,
  parseStudioOpenWorkspaceResponse,
  parseStudioPermissionDialogRequest,
  parseStudioPermissionDialogResponse,
  parseStudioUserQuestionDialogRequest,
  parseStudioUserQuestionDialogResponse,
  parseStudioProviderConnectionTestRequest,
  parseStudioProviderConnectionTestResult,
  parseStudioProviderSettingsSaveInput,
  parseStudioProviderSettingsSaveResult,
  parseStudioProviderSettingsSnapshot,
  parseStudioShellSnapshot,
  parseStudioShellSnapshotRequest,
  parseStudioRuntimeInspectRequest,
} from './studio-validators'
import {
  createStudioRuntimeGateway,
  type StudioRuntimeGateway,
} from './studio-runtime-gateway'

export interface CreateStudioBridgeApiOptions {
  ipcRenderer: StudioIpcRendererLike
  runtimeGateway?: StudioRuntimeGateway
}

export function createStudioBridgeApi(
  options: CreateStudioBridgeApiOptions,
): StudioBridgeApi {
  let hostState: StudioHostState = {
    workspacePath: null,
    lastSelection: null,
  }

  const hostListeners = new Set<(state: StudioHostState) => void>()
  const permissionListeners = new Set<(request: PermissionDialogRequest) => void>()
  const userInputListeners = new Set<(request: UserQuestionDialogRequest) => void>()
  const runtimeGateway =
    options.runtimeGateway ?? createStudioRuntimeGateway({
      ipcRenderer: options.ipcRenderer,
    })

  options.ipcRenderer.on(
    STUDIO_BRIDGE_CHANNELS.hostStateChanged,
    (_event, payload) => {
      const nextState = parseStudioHostState(payload)
      hostState = nextState
      for (const listener of hostListeners) {
        listener(nextState)
      }
    },
  )

  options.ipcRenderer.on(
    STUDIO_BRIDGE_CHANNELS.permissionRequest,
    (_event, payload) => {
      const request = parseStudioPermissionDialogRequest(payload)
      for (const listener of permissionListeners) {
        listener(request)
      }
    },
  )

  options.ipcRenderer.on(
    STUDIO_BRIDGE_CHANNELS.userInputRequest,
    (_event, payload) => {
      const request = parseStudioUserQuestionDialogRequest(payload)
      for (const listener of userInputListeners) {
        listener(request)
      }
    },
  )

  async function getState(): Promise<StudioHostState> {
    const payload = await options.ipcRenderer.invoke(
      STUDIO_BRIDGE_CHANNELS.hostGetState,
    )
    const state = parseStudioHostState(payload)
    hostState = state
    return state
  }

  async function openWorkspace(): Promise<OpenWorkspaceResponse> {
    const payload = await options.ipcRenderer.invoke(
      STUDIO_BRIDGE_CHANNELS.hostOpenWorkspace,
    )
    const response = parseStudioOpenWorkspaceResponse(payload)
    hostState = response.state
    for (const listener of hostListeners) {
      listener(response.state)
    }
    return response
  }

  async function getShellSnapshot(
    input?: StudioShellSnapshotRequest,
  ): Promise<StudioShellSnapshot> {
    const request = parseStudioShellSnapshotRequest(input)
    const payload = await options.ipcRenderer.invoke(
      STUDIO_BRIDGE_CHANNELS.shellGetSnapshot,
      request,
    )
    return parseStudioShellSnapshot(payload)
  }

  async function getProviderSettings(): Promise<StudioProviderSettingsSnapshot> {
    const payload = await options.ipcRenderer.invoke(
      STUDIO_BRIDGE_CHANNELS.settingsGetProviderSettings,
    )
    return parseStudioProviderSettingsSnapshot(payload)
  }

  async function saveProviderSettings(
    input: StudioProviderSettingsSaveInput,
  ): Promise<StudioProviderSettingsSaveResult> {
    const request = parseStudioProviderSettingsSaveInput(input)
    const payload = await options.ipcRenderer.invoke(
      STUDIO_BRIDGE_CHANNELS.settingsSaveProviderSettings,
      request,
    )
    return parseStudioProviderSettingsSaveResult(payload)
  }

  async function testProviderConnection(
    input: StudioProviderConnectionTestRequest,
  ): Promise<StudioProviderConnectionTestResult> {
    const request = parseStudioProviderConnectionTestRequest(input)
    const payload = await options.ipcRenderer.invoke(
      STUDIO_BRIDGE_CHANNELS.settingsTestProviderConnection,
      request,
    )
    return parseStudioProviderConnectionTestResult(payload)
  }

  async function getMemoryOverview(): Promise<StudioMemoryOverviewSnapshot> {
    const payload = await options.ipcRenderer.invoke(
      STUDIO_BRIDGE_CHANNELS.memoryGetOverview,
    )
    return parseStudioMemoryOverviewSnapshot(payload)
  }

  async function rebuildMemory(): Promise<StudioMemoryRebuildResult> {
    const payload = await options.ipcRenderer.invoke(
      STUDIO_BRIDGE_CHANNELS.memoryRebuild,
    )
    return parseStudioMemoryRebuildResult(payload)
  }

  async function getMcpOverview(): Promise<StudioMcpOverviewSnapshot> {
    const payload = await options.ipcRenderer.invoke(
      STUDIO_BRIDGE_CHANNELS.mcpGetOverview,
    )
    return parseStudioMcpOverviewSnapshot(payload)
  }

  async function addMcpServer(
    input: StudioMcpServerMutationInput,
  ): Promise<StudioMcpMutationResult> {
    const request = parseStudioMcpServerMutationInput(input)
    const payload = await options.ipcRenderer.invoke(
      STUDIO_BRIDGE_CHANNELS.mcpAddServer,
      request,
    )
    return parseStudioMcpMutationResult(payload)
  }

  async function deleteMcpServer(
    name: string,
  ): Promise<StudioMcpMutationResult> {
    if (typeof name !== 'string') {
      throw new Error('studio.mcp.deleteServer 需要字符串名称。')
    }
    const payload = await options.ipcRenderer.invoke(
      STUDIO_BRIDGE_CHANNELS.mcpDeleteServer,
      { name },
    )
    return parseStudioMcpMutationResult(payload)
  }

  async function getSkillsPluginsOverview(): Promise<StudioSkillsPluginsOverviewSnapshot> {
    const payload = await options.ipcRenderer.invoke(
      STUDIO_BRIDGE_CHANNELS.skillsPluginsGetOverview,
    )
    return parseStudioSkillsPluginsOverviewSnapshot(payload)
  }

  async function respondPermission(
    input: PermissionDialogResponse,
  ): Promise<void> {
    const request = parseStudioPermissionDialogResponse(input)
    await options.ipcRenderer.invoke(
      STUDIO_BRIDGE_CHANNELS.permissionRespond,
      request,
    )
  }

  async function respondUserInput(
    input: UserQuestionDialogResponse,
  ): Promise<void> {
    const request = parseStudioUserQuestionDialogResponse(input)
    await options.ipcRenderer.invoke(
      STUDIO_BRIDGE_CHANNELS.userInputRespond,
      request,
    )
  }

  return {
    host: {
      async getState(...args: unknown[]) {
        assertStudioNoPayload(args[0], 'studio.host.getState')
        return getState()
      },
      async openWorkspace(...args: unknown[]) {
        assertStudioNoPayload(args[0], 'studio.host.openWorkspace')
        return openWorkspace()
      },
      onStateChanged(listener) {
        hostListeners.add(listener)
        return () => {
          hostListeners.delete(listener)
        }
      },
    },
    runtime: {
      async inspect(input?: RuntimeInspectRequest) {
        const request = parseStudioRuntimeInspectRequest(input)
        return runtimeGateway.inspect(request)
      },
      async submit(input: RuntimeSubmitRequest) {
        return runtimeGateway.submit(input)
      },
      async cancel(input?: RuntimeCancelRequest) {
        return runtimeGateway.cancel(input)
      },
      onEvent(listener: (event: StudioRuntimeEvent) => void) {
        return runtimeGateway.onEvent(listener)
      },
    },
    permission: {
      onRequest(listener) {
        permissionListeners.add(listener)
        return () => {
          permissionListeners.delete(listener)
        }
      },
      async respond(input: PermissionDialogResponse) {
        return respondPermission(input)
      },
    },
    userInput: {
      onRequest(listener) {
        userInputListeners.add(listener)
        return () => {
          userInputListeners.delete(listener)
        }
      },
      async respond(input: UserQuestionDialogResponse) {
        return respondUserInput(input)
      },
    },
    shell: {
      async getSnapshot(input?: StudioShellSnapshotRequest) {
        return getShellSnapshot(input)
      },
    },
    settings: {
      async getProviderSettings(...args: unknown[]) {
        assertStudioNoPayload(args[0], 'studio.settings.getProviderSettings')
        return getProviderSettings()
      },
      async saveProviderSettings(input: StudioProviderSettingsSaveInput) {
        return saveProviderSettings(input)
      },
      async testProviderConnection(input: StudioProviderConnectionTestRequest) {
        return testProviderConnection(input)
      },
    },
    memory: {
      async getOverview(...args: unknown[]) {
        assertStudioNoPayload(args[0], 'studio.memory.getOverview')
        return getMemoryOverview()
      },
      async rebuild(...args: unknown[]) {
        assertStudioNoPayload(args[0], 'studio.memory.rebuild')
        return rebuildMemory()
      },
    },
    mcp: {
      async getOverview(...args: unknown[]) {
        assertStudioNoPayload(args[0], 'studio.mcp.getOverview')
        return getMcpOverview()
      },
      async addServer(input: StudioMcpServerMutationInput) {
        return addMcpServer(input)
      },
      async deleteServer(name: string) {
        return deleteMcpServer(name)
      },
    },
    skillsPlugins: {
      async getOverview(...args: unknown[]) {
        assertStudioNoPayload(args[0], 'studio.skillsPlugins.getOverview')
        return getSkillsPluginsOverview()
      },
    },
  }
}
