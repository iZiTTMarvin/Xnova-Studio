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
  StudioProviderSettingsEntry,
  StudioProviderSettingsSaveInput,
  StudioProviderSettingsSaveResult,
  StudioProviderSettingsSnapshot,
  RuntimeInspectRequest,
  RuntimeInspectResult,
  RuntimeSnapshotView,
  StudioHostState,
  StudioModeId,
  StudioProjectSessionSummary,
  StudioRecentProjectSummary,
  StudioScratchpadEntry,
  StudioShellDefaults,
  StudioShellSnapshot,
  StudioShellSnapshotRequest,
  StudioStartupProjectCandidate,
  StudioStartupSessionCandidate,
  StudioRuntimeEvent,
  WorkspaceSelectionResult,
} from '../shared/studio-bridge-contract'

export class StudioBridgeValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StudioBridgeValidationError'
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertPlainObject(
  value: unknown,
  subject: string,
): Record<string, unknown> {
  if (!isPlainObject(value)) {
    throw new StudioBridgeValidationError(`${subject} 必须是对象。`)
  }

  return value
}

function parseOptionalString(
  value: unknown,
  subject: string,
): string | undefined {
  if (value === undefined) {
    return undefined
  }

  if (typeof value !== 'string') {
    throw new StudioBridgeValidationError(`${subject} 必须是字符串。`)
  }

  return value
}

function parseStringArray(value: unknown, subject: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new StudioBridgeValidationError(`${subject} 必须是字符串数组。`)
  }

  return [...value]
}

export function assertStudioNoPayload(
  payload: unknown,
  methodName: string,
): void {
  if (payload !== undefined) {
    throw new StudioBridgeValidationError(`${methodName} 不接受参数。`)
  }
}

export function parseStudioRuntimeInspectRequest(
  payload: unknown,
): RuntimeInspectRequest {
  if (payload === undefined) {
    return {}
  }

  const value = assertPlainObject(payload, 'runtime.inspect 参数')
  if (Object.keys(value).some((key) => key !== 'refresh')) {
    throw new StudioBridgeValidationError('runtime.inspect 只允许 refresh 字段。')
  }
  if (value.refresh !== undefined && typeof value.refresh !== 'boolean') {
    throw new StudioBridgeValidationError('runtime.inspect.refresh 必须是布尔值。')
  }

  return value.refresh === undefined ? {} : { refresh: value.refresh }
}

export function parseStudioShellSnapshotRequest(
  payload: unknown,
): StudioShellSnapshotRequest {
  if (payload === undefined) {
    return {}
  }

  const value = assertPlainObject(payload, 'shell.getSnapshot 参数')
  if (Object.keys(value).some((key) => key !== 'projectPath')) {
    throw new StudioBridgeValidationError('shell.getSnapshot 只允许 projectPath 字段。')
  }
  if (
    value.projectPath !== undefined &&
    value.projectPath !== null &&
    typeof value.projectPath !== 'string'
  ) {
    throw new StudioBridgeValidationError('shell.getSnapshot.projectPath 必须是字符串或 null。')
  }

  return value.projectPath === undefined ? {} : { projectPath: value.projectPath as string | null }
}

function parseProviderSettingsEntry(
  payload: unknown,
  subject: string,
): StudioProviderSettingsEntry {
  const value = assertPlainObject(payload, subject)
  if (typeof value.id !== 'string') {
    throw new StudioBridgeValidationError(`${subject}.id 必须是字符串。`)
  }
  if (typeof value.apiKey !== 'string') {
    throw new StudioBridgeValidationError(`${subject}.apiKey 必须是字符串。`)
  }
  if (
    value.baseURL !== null &&
    value.baseURL !== undefined &&
    typeof value.baseURL !== 'string'
  ) {
    throw new StudioBridgeValidationError(`${subject}.baseURL 必须是字符串或 null。`)
  }
  if (value.protocol !== 'anthropic' && value.protocol !== 'openai') {
    throw new StudioBridgeValidationError(`${subject}.protocol 必须是 anthropic 或 openai。`)
  }

  return {
    id: value.id,
    apiKey: value.apiKey,
    baseURL: value.baseURL === undefined ? null : (value.baseURL as string | null),
    protocol: value.protocol,
    models: parseStringArray(value.models, `${subject}.models`),
    visionModels:
      value.visionModels === undefined
        ? []
        : parseStringArray(value.visionModels, `${subject}.visionModels`),
  }
}

export function parseStudioProviderSettingsSaveInput(
  payload: unknown,
): StudioProviderSettingsSaveInput {
  const value = assertPlainObject(payload, 'settings.saveProviderSettings')
  if (typeof value.defaultProvider !== 'string') {
    throw new StudioBridgeValidationError('settings.saveProviderSettings.defaultProvider 必须是字符串。')
  }
  if (typeof value.defaultModel !== 'string') {
    throw new StudioBridgeValidationError('settings.saveProviderSettings.defaultModel 必须是字符串。')
  }
  if (
    value.subAgentModel !== undefined &&
    value.subAgentModel !== null &&
    typeof value.subAgentModel !== 'string'
  ) {
    throw new StudioBridgeValidationError('settings.saveProviderSettings.subAgentModel 必须是字符串或 null。')
  }
  if (!Array.isArray(value.providers)) {
    throw new StudioBridgeValidationError('settings.saveProviderSettings.providers 必须是数组。')
  }

  return {
    defaultProvider: value.defaultProvider,
    defaultModel: value.defaultModel,
    subAgentModel:
      value.subAgentModel === undefined
        ? null
        : (value.subAgentModel as string | null),
    providers: value.providers.map((item, index) =>
      parseProviderSettingsEntry(item, `settings.saveProviderSettings.providers[${index}]`),
    ),
  }
}

function parseProviderSettingsSource(
  payload: unknown,
): StudioProviderSettingsSnapshot['source'] {
  const value = assertPlainObject(payload, 'settings.source')
  return {
    ...(parseOptionalString(value.userToml, 'settings.source.userToml')
      ? { userToml: value.userToml as string }
      : {}),
    ...(parseOptionalString(value.projectToml, 'settings.source.projectToml')
      ? { projectToml: value.projectToml as string }
      : {}),
    ...(parseOptionalString(value.legacyJson, 'settings.source.legacyJson')
      ? { legacyJson: value.legacyJson as string }
      : {}),
  }
}

export function parseStudioProviderSettingsSnapshot(
  payload: unknown,
): StudioProviderSettingsSnapshot {
  const value = assertPlainObject(payload, 'settings.getProviderSettings 响应')
  const editableConfig = assertPlainObject(
    value.editableConfig,
    'settings.editableConfig',
  )
  const effectiveDefaults = assertPlainObject(
    value.effectiveDefaults,
    'settings.effectiveDefaults',
  )

  if (typeof editableConfig.defaultProvider !== 'string') {
    throw new StudioBridgeValidationError('settings.editableConfig.defaultProvider 必须是字符串。')
  }
  if (typeof editableConfig.defaultModel !== 'string') {
    throw new StudioBridgeValidationError('settings.editableConfig.defaultModel 必须是字符串。')
  }
  if (
    editableConfig.subAgentModel !== null &&
    editableConfig.subAgentModel !== undefined &&
    typeof editableConfig.subAgentModel !== 'string'
  ) {
    throw new StudioBridgeValidationError('settings.editableConfig.subAgentModel 必须是字符串或 null。')
  }
  if (!Array.isArray(editableConfig.providers)) {
    throw new StudioBridgeValidationError('settings.editableConfig.providers 必须是数组。')
  }
  if (typeof effectiveDefaults.defaultProvider !== 'string') {
    throw new StudioBridgeValidationError('settings.effectiveDefaults.defaultProvider 必须是字符串。')
  }
  if (typeof effectiveDefaults.defaultModel !== 'string') {
    throw new StudioBridgeValidationError('settings.effectiveDefaults.defaultModel 必须是字符串。')
  }

  return {
    editableConfig: {
      defaultProvider: editableConfig.defaultProvider,
      defaultModel: editableConfig.defaultModel,
      subAgentModel:
        editableConfig.subAgentModel === undefined
          ? null
          : (editableConfig.subAgentModel as string | null),
      providers: editableConfig.providers.map((item, index) =>
        parseProviderSettingsEntry(item, `settings.editableConfig.providers[${index}]`),
      ),
    },
    effectiveDefaults: {
      defaultProvider: effectiveDefaults.defaultProvider,
      defaultModel: effectiveDefaults.defaultModel,
    },
    source: parseProviderSettingsSource(value.source),
    warnings:
      value.warnings === undefined
        ? []
        : parseStringArray(value.warnings, 'settings.warnings'),
  }
}

export function parseStudioProviderSettingsSaveResult(
  payload: unknown,
): StudioProviderSettingsSaveResult {
  const value = assertPlainObject(payload, 'settings.saveProviderSettings 响应')
  if (typeof value.success !== 'boolean') {
    throw new StudioBridgeValidationError('settings.saveProviderSettings.success 必须是布尔值。')
  }

  if (value.success) {
    return {
      success: true,
      snapshot: parseStudioProviderSettingsSnapshot(value.snapshot),
    }
  }

  if (typeof value.error !== 'string') {
    throw new StudioBridgeValidationError('settings.saveProviderSettings.error 必须是字符串。')
  }

  return {
    success: false,
    error: value.error,
  }
}

export function parseStudioProviderConnectionTestRequest(
  payload: unknown,
): StudioProviderConnectionTestRequest {
  const value = assertPlainObject(payload, 'settings.testProviderConnection')
  if (typeof value.providerId !== 'string') {
    throw new StudioBridgeValidationError('settings.testProviderConnection.providerId 必须是字符串。')
  }

  return {
    providerId: value.providerId,
    config: parseProviderSettingsEntry(
      value.config,
      'settings.testProviderConnection.config',
    ),
    ...(value.model === undefined || value.model === null
      ? {}
      : {
          model: parseOptionalString(
            value.model,
            'settings.testProviderConnection.model',
          ) as string,
        }),
  }
}

export function parseStudioProviderConnectionTestResult(
  payload: unknown,
): StudioProviderConnectionTestResult {
  const value = assertPlainObject(payload, 'settings.testProviderConnection 响应')
  if (typeof value.success !== 'boolean') {
    throw new StudioBridgeValidationError('settings.testProviderConnection.success 必须是布尔值。')
  }
  if (typeof value.providerId !== 'string') {
    throw new StudioBridgeValidationError('settings.testProviderConnection.providerId 必须是字符串。')
  }

  if (value.success) {
    if (typeof value.model !== 'string') {
      throw new StudioBridgeValidationError('settings.testProviderConnection.model 必须是字符串。')
    }
    if (typeof value.durationMs !== 'number') {
      throw new StudioBridgeValidationError('settings.testProviderConnection.durationMs 必须是数字。')
    }
    return {
      success: true,
      providerId: value.providerId,
      model: value.model,
      durationMs: value.durationMs,
    }
  }

  if (typeof value.error !== 'string') {
    throw new StudioBridgeValidationError('settings.testProviderConnection.error 必须是字符串。')
  }

  return {
    success: false,
    providerId: value.providerId,
    ...(typeof value.model === 'string' ? { model: value.model } : {}),
    error: value.error,
  }
}

export function parseStudioMemoryOverviewSnapshot(
  payload: unknown,
): StudioMemoryOverviewSnapshot {
  const value = assertPlainObject(payload, 'memory.getOverview 响应')
  const embedding = assertPlainObject(value.embedding, 'memory.embedding')
  const overview = assertPlainObject(value.overview, 'memory.overview')
  const source = assertPlainObject(value.source, 'memory.source')

  if (typeof value.enabled !== 'boolean') {
    throw new StudioBridgeValidationError('memory.enabled 必须是布尔值。')
  }
  if (
    value.status !== 'disabled' &&
    value.status !== 'bm25' &&
    value.status !== 'ready' &&
    value.status !== 'degraded'
  ) {
    throw new StudioBridgeValidationError('memory.status 非法。')
  }
  if (typeof value.statusMessage !== 'string') {
    throw new StudioBridgeValidationError('memory.statusMessage 必须是字符串。')
  }
  if (typeof embedding.configured !== 'boolean') {
    throw new StudioBridgeValidationError('memory.embedding.configured 必须是布尔值。')
  }
  if (
    embedding.dimension !== null &&
    embedding.dimension !== undefined &&
    typeof embedding.dimension !== 'number'
  ) {
    throw new StudioBridgeValidationError('memory.embedding.dimension 必须是数字或 null。')
  }
  if (typeof overview.globalEntries !== 'number') {
    throw new StudioBridgeValidationError('memory.overview.globalEntries 必须是数字。')
  }
  if (typeof overview.projectEntries !== 'number') {
    throw new StudioBridgeValidationError('memory.overview.projectEntries 必须是数字。')
  }
  if (typeof overview.vectorChunks !== 'number') {
    throw new StudioBridgeValidationError('memory.overview.vectorChunks 必须是数字。')
  }
  if (
    overview.projectPath !== null &&
    overview.projectPath !== undefined &&
    typeof overview.projectPath !== 'string'
  ) {
    throw new StudioBridgeValidationError('memory.overview.projectPath 必须是字符串或 null。')
  }

  return {
    enabled: value.enabled,
    status: value.status,
    statusMessage: value.statusMessage,
    embedding: {
      configured: embedding.configured,
      dimension:
        embedding.dimension === undefined
          ? null
          : (embedding.dimension as number | null),
      missingFields:
        embedding.missingFields === undefined
          ? []
          : parseStringArray(embedding.missingFields, 'memory.embedding.missingFields'),
    },
    overview: {
      projectPath:
        overview.projectPath === undefined
          ? null
          : (overview.projectPath as string | null),
      globalEntries: overview.globalEntries,
      projectEntries: overview.projectEntries,
      vectorChunks: overview.vectorChunks,
    },
    source: {
      ...(parseOptionalString(source.userToml, 'memory.source.userToml')
        ? { userToml: source.userToml as string }
        : {}),
      ...(parseOptionalString(source.projectToml, 'memory.source.projectToml')
        ? { projectToml: source.projectToml as string }
        : {}),
      ...(parseOptionalString(source.legacyJson, 'memory.source.legacyJson')
        ? { legacyJson: source.legacyJson as string }
        : {}),
    },
    warnings:
      value.warnings === undefined
        ? []
        : parseStringArray(value.warnings, 'memory.warnings'),
  }
}

export function parseStudioMemoryRebuildResult(
  payload: unknown,
): StudioMemoryRebuildResult {
  const value = assertPlainObject(payload, 'memory.rebuild 响应')
  if (typeof value.success !== 'boolean') {
    throw new StudioBridgeValidationError('memory.rebuild.success 必须是布尔值。')
  }
  if (typeof value.message !== 'string') {
    throw new StudioBridgeValidationError('memory.rebuild.message 必须是字符串。')
  }

  return {
    success: value.success,
    message: value.message,
    ...(value.snapshot ? { snapshot: parseStudioMemoryOverviewSnapshot(value.snapshot) } : {}),
  }
}

function parseMcpServerConfigInput(
  payload: unknown,
  subject: string,
): StudioMcpServerMutationInput['config'] {
  const value = assertPlainObject(payload, subject)
  if (
    value.transport !== 'stdio' &&
    value.transport !== 'sse' &&
    value.transport !== 'streamable-http' &&
    value.transport !== 'http'
  ) {
    throw new StudioBridgeValidationError(`${subject}.transport 非法。`)
  }
  if (value.command !== undefined && typeof value.command !== 'string') {
    throw new StudioBridgeValidationError(`${subject}.command 必须是字符串。`)
  }
  if (
    value.url !== undefined &&
    value.url !== null &&
    typeof value.url !== 'string'
  ) {
    throw new StudioBridgeValidationError(`${subject}.url 必须是字符串或 null。`)
  }
  if (
    value.args !== undefined &&
    (!Array.isArray(value.args) || value.args.some((item) => typeof item !== 'string'))
  ) {
    throw new StudioBridgeValidationError(`${subject}.args 必须是字符串数组。`)
  }
  if (
    value.headers !== undefined &&
    !isPlainObject(value.headers)
  ) {
    throw new StudioBridgeValidationError(`${subject}.headers 必须是对象。`)
  }

  const headers = value.headers
    ? Object.fromEntries(
        Object.entries(value.headers).map(([key, item]) => {
          if (typeof item !== 'string') {
            throw new StudioBridgeValidationError(`${subject}.headers.${key} 必须是字符串。`)
          }
          return [key, item]
        }),
      )
    : undefined

  return {
    transport: value.transport,
    ...(typeof value.command === 'string' ? { command: value.command } : {}),
    ...(Array.isArray(value.args) ? { args: [...value.args] } : {}),
    ...(value.url === undefined ? {} : { url: value.url as string | null }),
    ...(headers ? { headers } : {}),
  }
}

export function parseStudioMcpServerMutationInput(
  payload: unknown,
): StudioMcpServerMutationInput {
  const value = assertPlainObject(payload, 'mcp.mutation')
  if (typeof value.name !== 'string') {
    throw new StudioBridgeValidationError('mcp.mutation.name 必须是字符串。')
  }

  return {
    name: value.name,
    config: parseMcpServerConfigInput(value.config, 'mcp.mutation.config'),
  }
}

function parseMcpOverviewServer(
  payload: unknown,
  subject: string,
): StudioMcpOverviewSnapshot['servers'][number] {
  const value = assertPlainObject(payload, subject)
  if (typeof value.name !== 'string') {
    throw new StudioBridgeValidationError(`${subject}.name 必须是字符串。`)
  }
  if (
    value.transport !== 'stdio' &&
    value.transport !== 'sse' &&
    value.transport !== 'streamable-http' &&
    value.transport !== 'http'
  ) {
    throw new StudioBridgeValidationError(`${subject}.transport 非法。`)
  }
  if (value.status !== 'connected' && value.status !== 'failed') {
    throw new StudioBridgeValidationError(`${subject}.status 非法。`)
  }
  if (typeof value.source !== 'string') {
    throw new StudioBridgeValidationError(`${subject}.source 必须是字符串。`)
  }
  if (typeof value.writable !== 'boolean') {
    throw new StudioBridgeValidationError(`${subject}.writable 必须是布尔值。`)
  }
  if (typeof value.toolCount !== 'number') {
    throw new StudioBridgeValidationError(`${subject}.toolCount 必须是数字。`)
  }

  return {
    name: value.name,
    transport: value.transport,
    status: value.status,
    source: value.source,
    writable: value.writable,
    toolCount: value.toolCount,
    toolNames:
      value.toolNames === undefined
        ? []
        : parseStringArray(value.toolNames, `${subject}.toolNames`),
    ...(typeof value.error === 'string' ? { error: value.error } : {}),
  }
}

export function parseStudioMcpOverviewSnapshot(
  payload: unknown,
): StudioMcpOverviewSnapshot {
  const value = assertPlainObject(payload, 'mcp.getOverview 响应')
  if (
    value.status !== 'unconfigured' &&
    value.status !== 'connected' &&
    value.status !== 'failed'
  ) {
    throw new StudioBridgeValidationError('mcp.status 非法。')
  }
  if (typeof value.statusMessage !== 'string') {
    throw new StudioBridgeValidationError('mcp.statusMessage 必须是字符串。')
  }
  if (typeof value.writableConfigPath !== 'string') {
    throw new StudioBridgeValidationError('mcp.writableConfigPath 必须是字符串。')
  }
  if (!Array.isArray(value.servers)) {
    throw new StudioBridgeValidationError('mcp.servers 必须是数组。')
  }

  return {
    status: value.status,
    statusMessage: value.statusMessage,
    writableConfigPath: value.writableConfigPath,
    servers: value.servers.map((item, index) =>
      parseMcpOverviewServer(item, `mcp.servers[${index}]`),
    ),
    warnings:
      value.warnings === undefined
        ? []
        : parseStringArray(value.warnings, 'mcp.warnings'),
  }
}

export function parseStudioMcpMutationResult(
  payload: unknown,
): StudioMcpMutationResult {
  const value = assertPlainObject(payload, 'mcp.mutation 响应')
  if (typeof value.success !== 'boolean') {
    throw new StudioBridgeValidationError('mcp.mutation.success 必须是布尔值。')
  }
  if (typeof value.message !== 'string') {
    throw new StudioBridgeValidationError('mcp.mutation.message 必须是字符串。')
  }

  return {
    success: value.success,
    message: value.message,
    ...(value.snapshot ? { snapshot: parseStudioMcpOverviewSnapshot(value.snapshot) } : {}),
  }
}

export function parseStudioSkillsPluginsOverviewSnapshot(
  payload: unknown,
): StudioSkillsPluginsOverviewSnapshot {
  const value = assertPlainObject(payload, 'skillsPlugins.getOverview 响应')
  if (
    value.status !== 'ready' &&
    value.status !== 'empty' &&
    value.status !== 'error'
  ) {
    throw new StudioBridgeValidationError('skillsPlugins.status 非法。')
  }
  if (typeof value.statusMessage !== 'string') {
    throw new StudioBridgeValidationError('skillsPlugins.statusMessage 必须是字符串。')
  }
  if (!Array.isArray(value.sourceDistribution)) {
    throw new StudioBridgeValidationError('skillsPlugins.sourceDistribution 必须是数组。')
  }
  if (!Array.isArray(value.recentSkills)) {
    throw new StudioBridgeValidationError('skillsPlugins.recentSkills 必须是数组。')
  }
  if (!Array.isArray(value.frequentSkills)) {
    throw new StudioBridgeValidationError('skillsPlugins.frequentSkills 必须是数组。')
  }
  if (!Array.isArray(value.plugins)) {
    throw new StudioBridgeValidationError('skillsPlugins.plugins 必须是数组。')
  }

  return {
    status: value.status,
    statusMessage: value.statusMessage,
    sourceDistribution: value.sourceDistribution.map((item, index) => {
      const entry = assertPlainObject(item, `skillsPlugins.sourceDistribution[${index}]`)
      if (
        entry.source !== 'builtin' &&
        entry.source !== 'plugin' &&
        entry.source !== 'user' &&
        entry.source !== 'project'
      ) {
        throw new StudioBridgeValidationError(`skillsPlugins.sourceDistribution[${index}].source 非法。`)
      }
      if (typeof entry.count !== 'number') {
        throw new StudioBridgeValidationError(`skillsPlugins.sourceDistribution[${index}].count 必须是数字。`)
      }
      return {
        source: entry.source,
        count: entry.count,
      }
    }),
    recentSkills: value.recentSkills.map((item, index) => {
      const entry = assertPlainObject(item, `skillsPlugins.recentSkills[${index}]`)
      if (typeof entry.name !== 'string' || typeof entry.lastUsedAt !== 'string') {
        throw new StudioBridgeValidationError(`skillsPlugins.recentSkills[${index}] 字段不合法。`)
      }
      if (
        entry.source !== 'builtin' &&
        entry.source !== 'plugin' &&
        entry.source !== 'user' &&
        entry.source !== 'project'
      ) {
        throw new StudioBridgeValidationError(`skillsPlugins.recentSkills[${index}].source 非法。`)
      }
      return {
        name: entry.name,
        source: entry.source,
        lastUsedAt: entry.lastUsedAt,
      }
    }),
    frequentSkills: value.frequentSkills.map((item, index) => {
      const entry = assertPlainObject(item, `skillsPlugins.frequentSkills[${index}]`)
      if (typeof entry.name !== 'string' || typeof entry.useCount !== 'number') {
        throw new StudioBridgeValidationError(`skillsPlugins.frequentSkills[${index}] 字段不合法。`)
      }
      if (
        entry.source !== 'builtin' &&
        entry.source !== 'plugin' &&
        entry.source !== 'user' &&
        entry.source !== 'project'
      ) {
        throw new StudioBridgeValidationError(`skillsPlugins.frequentSkills[${index}].source 非法。`)
      }
      return {
        name: entry.name,
        source: entry.source,
        useCount: entry.useCount,
      }
    }),
    plugins: value.plugins.map((item, index) => {
      const entry = assertPlainObject(item, `skillsPlugins.plugins[${index}]`)
      if (
        entry.source !== 'xnova' &&
        entry.source !== 'claude-code' &&
        entry.source !== 'manual'
      ) {
        throw new StudioBridgeValidationError(`skillsPlugins.plugins[${index}].source 非法。`)
      }
      if (
        typeof entry.name !== 'string' ||
        typeof entry.version !== 'string' ||
        typeof entry.skillCount !== 'number' ||
        typeof entry.hasHooks !== 'boolean'
      ) {
        throw new StudioBridgeValidationError(`skillsPlugins.plugins[${index}] 字段不合法。`)
      }
      return {
        name: entry.name,
        source: entry.source,
        version: entry.version,
        skillCount: entry.skillCount,
        hasHooks: entry.hasHooks,
        ...(typeof entry.description === 'string' ? { description: entry.description } : {}),
      }
    }),
    warnings:
      value.warnings === undefined
        ? []
        : parseStringArray(value.warnings, 'skillsPlugins.warnings'),
  }
}

function parseWorkspaceSelectionResult(
  payload: unknown,
): WorkspaceSelectionResult {
  const value = assertPlainObject(payload, 'workspace 选择结果')

  if (value.ok === true) {
    if (value.code !== 'selected' || typeof value.path !== 'string') {
      throw new StudioBridgeValidationError('workspace 成功结果格式不合法。')
    }

    return {
      ok: true,
      code: 'selected',
      path: value.path,
    }
  }

  if (
    value.ok === false &&
    typeof value.code === 'string' &&
    ['cancelled', 'empty', 'invalid', 'error'].includes(value.code) &&
    typeof value.message === 'string'
  ) {
    return {
      ok: false,
      code: value.code as 'cancelled' | 'empty' | 'invalid' | 'error',
      message: value.message,
    }
  }

  throw new StudioBridgeValidationError('workspace 结果格式不合法。')
}

export function parseStudioHostState(payload: unknown): StudioHostState {
  const value = assertPlainObject(payload, 'host state')
  if (
    value.workspacePath !== null &&
    value.workspacePath !== undefined &&
    typeof value.workspacePath !== 'string'
  ) {
    throw new StudioBridgeValidationError('hostState.workspacePath 必须是字符串或 null。')
  }

  return {
    workspacePath:
      value.workspacePath === undefined ? null : (value.workspacePath as string | null),
    lastSelection:
      value.lastSelection === undefined || value.lastSelection === null
        ? null
        : parseWorkspaceSelectionResult(value.lastSelection),
  }
}

export function parseStudioOpenWorkspaceResponse(
  payload: unknown,
): OpenWorkspaceResponse {
  const value = assertPlainObject(payload, 'openWorkspace 响应')
  return {
    selection: parseWorkspaceSelectionResult(value.selection),
    state: parseStudioHostState(value.state),
  }
}

function parseRuntimeSnapshotView(payload: unknown): RuntimeSnapshotView {
  const value = assertPlainObject(payload, 'runtime snapshot')
  if (value.sessionId !== null && value.sessionId !== undefined && typeof value.sessionId !== 'string') {
    throw new StudioBridgeValidationError('runtime.snapshot.sessionId 必须是字符串或 null。')
  }
  if (typeof value.isRunning !== 'boolean') {
    throw new StudioBridgeValidationError('runtime.snapshot.isRunning 必须是布尔值。')
  }
  if (typeof value.provider !== 'string') {
    throw new StudioBridgeValidationError('runtime.snapshot.provider 必须是字符串。')
  }
  if (typeof value.model !== 'string') {
    throw new StudioBridgeValidationError('runtime.snapshot.model 必须是字符串。')
  }

  return {
    sessionId:
      value.sessionId === undefined ? null : (value.sessionId as string | null),
    isRunning: value.isRunning,
    provider: value.provider,
    model: value.model,
    warnings:
      value.warnings === undefined
        ? []
        : parseStringArray(value.warnings, 'runtime.snapshot.warnings'),
  }
}

export function parseStudioRuntimeInspectResult(
  payload: unknown,
): RuntimeInspectResult {
  const value = assertPlainObject(payload, 'runtime inspect 响应')
  if (value.workspacePath !== null && value.workspacePath !== undefined && typeof value.workspacePath !== 'string') {
    throw new StudioBridgeValidationError('runtime.workspacePath 必须是字符串或 null。')
  }
  const workspacePath =
    value.workspacePath === undefined ? null : (value.workspacePath as string | null)
  const configWarnings =
    value.configWarnings === undefined
      ? []
      : parseStringArray(value.configWarnings, 'runtime.configWarnings')

  if (value.ok === true) {
    return {
      ok: true,
      snapshot: parseRuntimeSnapshotView(value.snapshot),
      workspacePath,
      configWarnings,
    }
  }

  if (value.ok === false && typeof value.error === 'string') {
    return {
      ok: false,
      error: value.error,
      workspacePath,
      configWarnings,
    }
  }

  throw new StudioBridgeValidationError('runtime inspect 响应格式不合法。')
}

export function parseStudioRuntimeEvent(payload: unknown): StudioRuntimeEvent {
  const value = assertPlainObject(payload, 'runtime event')
  if (typeof value.type !== 'string') {
    throw new StudioBridgeValidationError('runtime.event.type 必须是字符串。')
  }
  if (typeof value.timestamp !== 'string') {
    throw new StudioBridgeValidationError('runtime.event.timestamp 必须是字符串。')
  }

  const sessionId = parseOptionalString(value.sessionId, 'runtime.event.sessionId')
  const agentId = parseOptionalString(value.agentId, 'runtime.event.agentId')
  if (
    value.payload !== undefined &&
    !isPlainObject(value.payload)
  ) {
    throw new StudioBridgeValidationError('runtime.event.payload 必须是对象。')
  }

  return {
    type: value.type,
    timestamp: value.timestamp,
    ...(sessionId ? { sessionId } : {}),
    ...(agentId ? { agentId } : {}),
    ...(value.payload ? { payload: value.payload } : {}),
  }
}

function parseStartupProjectCandidate(
  payload: unknown,
): StudioStartupProjectCandidate {
  const value = assertPlainObject(payload, 'startup.recentProject')
  if (typeof value.path !== 'string') {
    throw new StudioBridgeValidationError('startup.recentProject.path 必须是字符串。')
  }
  if (typeof value.lastActiveAt !== 'number') {
    throw new StudioBridgeValidationError('startup.recentProject.lastActiveAt 必须是数字。')
  }
  if (typeof value.exists !== 'boolean') {
    throw new StudioBridgeValidationError('startup.recentProject.exists 必须是布尔值。')
  }

  return {
    path: value.path,
    lastActiveAt: value.lastActiveAt,
    exists: value.exists,
  }
}

function parseStartupSessionCandidate(
  payload: unknown,
): StudioStartupSessionCandidate {
  const value = assertPlainObject(payload, 'startup.recentSession')
  if (typeof value.projectPath !== 'string') {
    throw new StudioBridgeValidationError('startup.recentSession.projectPath 必须是字符串。')
  }
  if (typeof value.sessionId !== 'string') {
    throw new StudioBridgeValidationError('startup.recentSession.sessionId 必须是字符串。')
  }
  if (typeof value.valid !== 'boolean') {
    throw new StudioBridgeValidationError('startup.recentSession.valid 必须是布尔值。')
  }

  return {
    projectPath: value.projectPath,
    sessionId: value.sessionId,
    valid: value.valid,
  }
}

function parseModeId(value: unknown, subject: string): StudioModeId {
  if (value !== 'standard' && value !== 'xforge') {
    throw new StudioBridgeValidationError(`${subject} 必须是 standard 或 xforge。`)
  }

  return value
}

function parseRecentProjectSummary(
  payload: unknown,
): StudioRecentProjectSummary {
  const value = assertPlainObject(payload, 'recentProjects 项')
  if (typeof value.path !== 'string') {
    throw new StudioBridgeValidationError('recentProjects.path 必须是字符串。')
  }
  if (typeof value.name !== 'string') {
    throw new StudioBridgeValidationError('recentProjects.name 必须是字符串。')
  }
  if (typeof value.lastActiveAt !== 'number') {
    throw new StudioBridgeValidationError('recentProjects.lastActiveAt 必须是数字。')
  }
  if (typeof value.exists !== 'boolean') {
    throw new StudioBridgeValidationError('recentProjects.exists 必须是布尔值。')
  }
  if (value.gitBranch !== null && value.gitBranch !== undefined && typeof value.gitBranch !== 'string') {
    throw new StudioBridgeValidationError('recentProjects.gitBranch 必须是字符串或 null。')
  }

  return {
    path: value.path,
    name: value.name,
    lastActiveAt: value.lastActiveAt,
    exists: value.exists,
    gitBranch: value.gitBranch === undefined ? null : (value.gitBranch as string | null),
  }
}

function parseProjectSessionSummary(
  payload: unknown,
): StudioProjectSessionSummary {
  const value = assertPlainObject(payload, 'projectSessions 项')
  if (typeof value.sessionId !== 'string') {
    throw new StudioBridgeValidationError('projectSessions.sessionId 必须是字符串。')
  }
  if (typeof value.projectPath !== 'string') {
    throw new StudioBridgeValidationError('projectSessions.projectPath 必须是字符串。')
  }
  if (typeof value.title !== 'string') {
    throw new StudioBridgeValidationError('projectSessions.title 必须是字符串。')
  }
  if (typeof value.updatedAt !== 'string') {
    throw new StudioBridgeValidationError('projectSessions.updatedAt 必须是字符串。')
  }
  if (value.gitBranch !== null && value.gitBranch !== undefined && typeof value.gitBranch !== 'string') {
    throw new StudioBridgeValidationError('projectSessions.gitBranch 必须是字符串或 null。')
  }
  if (typeof value.messageCount !== 'number') {
    throw new StudioBridgeValidationError('projectSessions.messageCount 必须是数字。')
  }
  if (!Array.isArray(value.subagents)) {
    throw new StudioBridgeValidationError('projectSessions.subagents 必须是数组。')
  }

  return {
    sessionId: value.sessionId,
    projectPath: value.projectPath,
    title: value.title,
    updatedAt: value.updatedAt,
    gitBranch: value.gitBranch === undefined ? null : (value.gitBranch as string | null),
    messageCount: value.messageCount,
    subagents: value.subagents.map((subagent) => {
      const subagentValue = assertPlainObject(subagent, 'subagent 项')
      if (typeof subagentValue.agentId !== 'string') {
        throw new StudioBridgeValidationError('subagent.agentId 必须是字符串。')
      }
      if (typeof subagentValue.description !== 'string') {
        throw new StudioBridgeValidationError('subagent.description 必须是字符串。')
      }
      if (
        typeof subagentValue.status !== 'string' ||
        !['running', 'stopping', 'stopped', 'done', 'error'].includes(
          subagentValue.status,
        )
      ) {
        throw new StudioBridgeValidationError('subagent.status 非法。')
      }
      return {
        agentId: subagentValue.agentId,
        description: subagentValue.description,
        status: subagentValue.status as StudioProjectSessionSummary['subagents'][number]['status'],
      }
    }),
  }
}

function parseScratchpadEntry(payload: unknown): StudioScratchpadEntry {
  const value = assertPlainObject(payload, 'scratchpadEntries 项')
  if (typeof value.id !== 'string') {
    throw new StudioBridgeValidationError('scratchpadEntries.id 必须是字符串。')
  }
  if (typeof value.title !== 'string') {
    throw new StudioBridgeValidationError('scratchpadEntries.title 必须是字符串。')
  }
  if (value.updatedAt !== null && value.updatedAt !== undefined && typeof value.updatedAt !== 'string') {
    throw new StudioBridgeValidationError('scratchpadEntries.updatedAt 必须是字符串或 null。')
  }

  return {
    id: value.id,
    title: value.title,
    updatedAt: value.updatedAt === undefined ? null : (value.updatedAt as string | null),
  }
}

function parseShellDefaults(payload: unknown): StudioShellDefaults {
  const value = assertPlainObject(payload, 'shell.defaults')
  const parseNullableString = (field: unknown, subject: string): string | null => {
    if (field === null || field === undefined) {
      return null
    }
    if (typeof field !== 'string') {
      throw new StudioBridgeValidationError(`${subject} 必须是字符串或 null。`)
    }
    return field
  }

  if (!Array.isArray(value.allowedModes)) {
    throw new StudioBridgeValidationError('shell.defaults.allowedModes 必须是数组。')
  }

  return {
    projectPath: parseNullableString(value.projectPath, 'shell.defaults.projectPath'),
    branch: parseNullableString(value.branch, 'shell.defaults.branch'),
    agentId: parseNullableString(value.agentId, 'shell.defaults.agentId'),
    modelId: parseNullableString(value.modelId, 'shell.defaults.modelId'),
    providerId: parseNullableString(value.providerId, 'shell.defaults.providerId'),
    recommendedMode:
      value.recommendedMode === undefined || value.recommendedMode === null
        ? null
        : parseModeId(value.recommendedMode, 'shell.defaults.recommendedMode'),
    allowedModes: value.allowedModes.map((mode) =>
      parseModeId(mode, 'shell.defaults.allowedModes'),
    ),
  }
}

export function parseStudioShellSnapshot(
  payload: unknown,
): StudioShellSnapshot {
  const value = assertPlainObject(payload, 'shell.getSnapshot 响应')
  const startup = assertPlainObject(value.startup, 'shell.startup')

  if (!Array.isArray(value.recentProjects)) {
    throw new StudioBridgeValidationError('shell.recentProjects 必须是数组。')
  }
  if (!Array.isArray(value.projectSessions)) {
    throw new StudioBridgeValidationError('shell.projectSessions 必须是数组。')
  }
  if (!Array.isArray(value.scratchpadEntries)) {
    throw new StudioBridgeValidationError('shell.scratchpadEntries 必须是数组。')
  }

  return {
    startup: {
      recentProject:
        startup.recentProject === undefined || startup.recentProject === null
          ? null
          : parseStartupProjectCandidate(startup.recentProject),
      recentSession:
        startup.recentSession === undefined || startup.recentSession === null
          ? null
          : parseStartupSessionCandidate(startup.recentSession),
    },
    recentProjects: value.recentProjects.map((item) => parseRecentProjectSummary(item)),
    projectSessions: value.projectSessions.map((item) => parseProjectSessionSummary(item)),
    scratchpadEntries: value.scratchpadEntries.map((item) => parseScratchpadEntry(item)),
    defaults: parseShellDefaults(value.defaults),
    warnings:
      value.warnings === undefined
        ? []
        : parseStringArray(value.warnings, 'shell.warnings'),
  }
}
