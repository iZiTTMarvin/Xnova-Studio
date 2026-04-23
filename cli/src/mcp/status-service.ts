import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { MCP_CONFIG_PATHS, loadMcpConfigWithSources, type McpConfigWithSources, type McpServerConfig } from '../config/mcp-config.js'

export type McpTransportType = 'stdio' | 'sse' | 'streamable-http' | 'http'

export interface McpServerConfigInput {
  transport: McpTransportType
  command?: string
  args?: string[]
  url?: string | null
  headers?: Record<string, string>
}

export interface McpOverviewSnapshot {
  status: 'unconfigured' | 'connected' | 'failed'
  statusMessage: string
  writableConfigPath: string
  servers: Array<{
    name: string
    transport: McpTransportType
    status: 'connected' | 'failed'
    source: string
    writable: boolean
    toolCount: number
    toolNames: string[]
    error?: string
  }>
  warnings: string[]
}

export interface McpMutationResult {
  success: boolean
  message: string
  snapshot?: McpOverviewSnapshot
}

interface McpStatusManager {
  connectAll(): Promise<void>
  getStatus(): Array<{
    name: string
    status: 'connected' | 'failed'
    source: string
    toolCount: number
    toolNames: string[]
    error?: string
  }>
  disconnectAll(): Promise<void>
}

export interface ReadMcpOverviewOptions {
  configPaths?: string[]
  loadConfigWithSources?: (configPaths: string[]) => McpConfigWithSources
  createManager?: (config: McpConfigWithSources) => McpStatusManager | Promise<McpStatusManager>
}

export interface McpMutationOptions extends ReadMcpOverviewOptions {}

function getConfigPaths(configPaths?: string[]): string[] {
  return configPaths ?? [...MCP_CONFIG_PATHS]
}

function getWritableConfigPath(configPaths?: string[]): string {
  return getConfigPaths(configPaths)[0]!
}

function detectTransport(config: McpServerConfig): McpTransportType {
  if (config.command) return 'stdio'
  if (config.type === 'sse') return 'sse'
  if (config.type === 'streamable-http') return 'streamable-http'
  return 'http'
}

function buildConfigFromInput(
  input: McpServerConfigInput,
): McpServerConfig {
  if (input.transport === 'stdio') {
    const config: McpServerConfig = {}
    if (input.command) {
      config.command = input.command
    }
    if (input.args) {
      config.args = input.args
    }
    return config
  }

  const config: McpServerConfig = {
    type: input.transport,
  }
  if (input.url) {
    config.url = input.url
  }
  if (input.headers) {
    config.headers = input.headers
  }
  return config
}

function validateServerInput(
  name: string,
  config: McpServerConfigInput,
): string | null {
  if (!name.trim()) {
    return 'MCP Server 名称不能为空。'
  }

  if (config.transport === 'stdio' && !config.command?.trim()) {
    return 'stdio MCP Server 需要 command。'
  }

  if (config.transport !== 'stdio' && !config.url?.trim()) {
    return '远程 MCP Server 需要 URL。'
  }

  return null
}

function loadWritableConfig(path: string): { mcpServers: Record<string, McpServerConfig> } {
  if (!existsSync(path)) {
    return { mcpServers: {} }
  }

  const parsed = JSON.parse(readFileSync(path, 'utf-8')) as {
    mcpServers?: Record<string, McpServerConfig>
  }
  return {
    mcpServers: parsed.mcpServers ?? {},
  }
}

async function buildServerSnapshots(
  config: McpConfigWithSources,
  createManager: NonNullable<ReadMcpOverviewOptions['createManager']>,
  writableConfigPath: string,
): Promise<McpOverviewSnapshot['servers']> {
  const manager = await createManager(config)
  await manager.connectAll()
  const statuses = manager.getStatus()
  await manager.disconnectAll()

  return statuses.map((server: {
    name: string
    status: 'connected' | 'failed'
    source: string
    toolCount: number
    toolNames: string[]
    error?: string
  }) => ({
    name: server.name,
    transport: detectTransport(config.mcpServers[server.name]!),
    status: server.status,
    source: server.source,
    writable: server.source === writableConfigPath,
    toolCount: server.toolCount,
    toolNames: server.toolNames,
    ...(server.error ? { error: server.error } : {}),
  }))
}

export async function readMcpOverview(
  options: ReadMcpOverviewOptions = {},
): Promise<McpOverviewSnapshot> {
  const configPaths = getConfigPaths(options.configPaths)
  const writableConfigPath = getWritableConfigPath(configPaths)
  const config =
    (options.loadConfigWithSources ?? loadMcpConfigWithSources)(configPaths)

  if (Object.keys(config.mcpServers).length === 0) {
    return {
      status: 'unconfigured',
      statusMessage: '尚未配置 MCP Server。',
      writableConfigPath,
      servers: [],
      warnings: [],
    }
  }

  const createManager =
    options.createManager ??
    (async (input: McpConfigWithSources) => {
      const { McpManager } = await import('./mcp-manager.js')
      return new McpManager(input)
    })
  const servers = await buildServerSnapshots(
    config,
    async (input) => await createManager(input),
    writableConfigPath,
  )
  const status = servers.some((server) => server.status === 'failed')
    ? 'failed'
    : 'connected'

  return {
    status,
    statusMessage:
      status === 'connected'
        ? '全部 MCP Server 已连接。'
        : 'MCP 状态异常，至少一个 Server 连接失败。',
    writableConfigPath,
    servers,
    warnings: [],
  }
}

export async function addMcpServer(
  input: { name: string; config: McpServerConfigInput },
  options: McpMutationOptions = {},
): Promise<McpMutationResult> {
  const validationError = validateServerInput(input.name, input.config)
  if (validationError) {
    return {
      success: false,
      message: validationError,
    }
  }

  const writableConfigPath = getWritableConfigPath(options.configPaths)
  const data = loadWritableConfig(writableConfigPath)
  if (data.mcpServers[input.name]) {
    return {
      success: false,
      message: `MCP Server "${input.name}" 已存在。`,
    }
  }

  data.mcpServers[input.name] = buildConfigFromInput(input.config)
  mkdirSync(dirname(writableConfigPath), { recursive: true })
  writeFileSync(writableConfigPath, JSON.stringify(data, null, 2), 'utf-8')

  return {
    success: true,
    message: 'MCP Server 已添加。',
    snapshot: await readMcpOverview(options),
  }
}

export async function deleteMcpServer(
  name: string,
  options: McpMutationOptions = {},
): Promise<McpMutationResult> {
  const writableConfigPath = getWritableConfigPath(options.configPaths)
  const data = loadWritableConfig(writableConfigPath)
  if (!data.mcpServers[name]) {
    return {
      success: false,
      message: `MCP Server "${name}" 不存在于可写配置中。`,
    }
  }

  delete data.mcpServers[name]
  mkdirSync(dirname(writableConfigPath), { recursive: true })
  writeFileSync(writableConfigPath, JSON.stringify(data, null, 2), 'utf-8')

  return {
    success: true,
    message: 'MCP Server 已删除。',
    snapshot: await readMcpOverview(options),
  }
}
