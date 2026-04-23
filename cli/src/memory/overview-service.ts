import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { ConfigManager, MemoryConfig } from '../config/config-manager.js'
import { FileStore } from './storage/file-store.js'

export type MemoryOverviewStatus = 'disabled' | 'bm25' | 'ready' | 'degraded'

export interface MemoryOverviewSnapshot {
  enabled: boolean
  status: MemoryOverviewStatus
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

export interface MemoryRebuildResult {
  success: boolean
  message: string
  snapshot?: MemoryOverviewSnapshot
}

export interface ReadMemoryOverviewOptions {
  configManager: Pick<ConfigManager, 'load' | 'getLastWarnings' | 'getPaths'>
  fileStore?: Pick<FileStore, 'scan'>
  getStoredEmbeddingDimension?: () => number | null | Promise<number | null>
  countVectorChunks?: () => number | Promise<number>
}

export interface RebuildMemoryIndexOptions extends ReadMemoryOverviewOptions {
  createMemoryManager?: (input: {
    projectPath: string
    memoryConfig: MemoryConfig
  }) => Promise<{ rebuild(): Promise<void> }>
}

function describeSource(
  manager: Pick<ConfigManager, 'getPaths'>,
  projectPath: string | null,
): MemoryOverviewSnapshot['source'] {
  const paths = manager.getPaths()
  const out: MemoryOverviewSnapshot['source'] = {}
  if (existsSync(paths.tomlPath)) out.userToml = paths.tomlPath
  if (existsSync(paths.jsonPath)) out.legacyJson = paths.jsonPath
  if (projectPath) {
    const projectTomlPath = join(projectPath, '.xnovacode', 'project.toml')
    if (existsSync(projectTomlPath)) {
      out.projectToml = projectTomlPath
    }
  }
  return out
}

function resolveEmbeddingMissingFields(memoryConfig: MemoryConfig | undefined): string[] {
  const embedding = memoryConfig?.embedding
  const missing: string[] = []
  if (!embedding?.apiKey || embedding.apiKey === 'your-embedding-api-key') {
    missing.push('api_key')
  }
  if (
    !embedding?.baseURL ||
    embedding.baseURL === 'https://your-embedding-api-base-url/v4'
  ) {
    missing.push('base_url')
  }
  if (!embedding?.model || embedding.model === 'your-embedding-model') {
    missing.push('model')
  }
  return missing
}

function resolveStatus(
  enabled: boolean,
  missingFields: string[],
  dimension: number | null,
): { status: MemoryOverviewStatus; message: string } {
  if (!enabled) {
    return {
      status: 'disabled',
      message: 'Memory 当前未启用。',
    }
  }

  if (missingFields.length > 0) {
    return {
      status: 'bm25',
      message: 'Embedding 未完整配置，当前降级为 BM25 关键词检索。',
    }
  }

  if (!dimension || dimension <= 0) {
    return {
      status: 'degraded',
      message: 'Embedding 已配置，但向量索引未就绪，当前降级为 BM25 关键词检索。',
    }
  }

  return {
    status: 'ready',
    message: `Embedding 已就绪（维度 ${dimension}）。`,
  }
}

async function defaultGetStoredEmbeddingDimension(): Promise<number | null> {
  try {
    const module = await import('../persistence/db.js')
    return module.getStoredEmbeddingDimension()
  } catch {
    return null
  }
}

async function defaultCountVectorChunks(): Promise<number> {
  try {
    const module = await import('../persistence/db.js')
    const db = module.getDb()
    const row = db.prepare('SELECT COUNT(*) as count FROM memory_vectors').get() as
      | { count: number }
      | undefined
    return Number(row?.count ?? 0)
  } catch {
    return 0
  }
}

async function createDefaultMemoryManager(input: {
  projectPath: string
  memoryConfig: MemoryConfig
}): Promise<{ rebuild(): Promise<void> }> {
  const [{ MemoryManager }, { ProviderEmbedding }, { LibsqlVectorStore }] =
    await Promise.all([
      import('./core/memory-manager.js'),
      import('./rag/embedding/provider-embedding.js'),
      import('./storage/libsql-vector-store.js'),
    ])

  const embeddingConfig = input.memoryConfig.embedding!
  const dimension = embeddingConfig.dimension ?? 1024
  const embedding = new ProviderEmbedding({
    providerName: 'embedding',
    apiKey: embeddingConfig.apiKey!,
    baseURL: embeddingConfig.baseURL!,
    model: embeddingConfig.model!,
    dimension,
  })
  const vectorStore = new LibsqlVectorStore(dimension)
  await vectorStore.initialize()

  const manager = new MemoryManager({
    cwd: input.projectPath,
    embedding,
    vectorStore,
  })
  await manager.initialize()
  return manager
}

export async function readMemoryOverview(
  projectPath: string | null,
  options: ReadMemoryOverviewOptions,
): Promise<MemoryOverviewSnapshot> {
  const warnings = [...options.configManager.getLastWarnings()]
  const config = options.configManager.load()
  const enabled = Boolean(config.memory?.enabled)
  const missingFields = resolveEmbeddingMissingFields(config.memory)
  const fileStore = options.fileStore ?? new FileStore()
  const globalMemoryDir = join(homedir(), '.xnovacode', 'memory')
  const projectMemoryDir = projectPath ? join(projectPath, '.xnovacode', 'memory') : null

  let globalEntries = 0
  let projectEntries = 0
  try {
    globalEntries = (await fileStore.scan(globalMemoryDir, 'global')).length
  } catch (error) {
    warnings.push(`global memory scan failed: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (projectPath && projectMemoryDir) {
    try {
      projectEntries = (await fileStore.scan(projectMemoryDir, 'project')).length
    } catch (error) {
      warnings.push(`project memory scan failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const dimension = await (
    options.getStoredEmbeddingDimension ?? defaultGetStoredEmbeddingDimension
  )()
  const vectorChunks = await (options.countVectorChunks ?? defaultCountVectorChunks)()
  const status = resolveStatus(enabled, missingFields, dimension)

  return {
    enabled,
    status: status.status,
    statusMessage: status.message,
    embedding: {
      configured: missingFields.length === 0,
      dimension,
      missingFields,
    },
    overview: {
      projectPath,
      globalEntries,
      projectEntries,
      vectorChunks,
    },
    source: describeSource(options.configManager, projectPath),
    warnings,
  }
}

export async function rebuildMemoryIndex(
  projectPath: string | null,
  options: RebuildMemoryIndexOptions,
): Promise<MemoryRebuildResult> {
  const config = options.configManager.load()
  if (!config.memory?.enabled) {
    return {
      success: false,
      message: 'Memory 未启用，无法重建索引。',
    }
  }

  const missingFields = resolveEmbeddingMissingFields(config.memory)
  if (missingFields.length > 0) {
    return {
      success: false,
      message: 'Embedding 配置不完整，无法重建向量索引。',
    }
  }

  if (!projectPath) {
    return {
      success: false,
      message: '未绑定 Workspace，无法重建 Memory 索引。',
    }
  }

  try {
    const manager =
      (options.createMemoryManager ?? createDefaultMemoryManager)({
        projectPath,
        memoryConfig: config.memory,
      })
    const memoryManager = await manager
    await memoryManager.rebuild()

    const snapshot = await readMemoryOverview(projectPath, options)
    return {
      success: true,
      message: 'Memory 索引已完成重建。',
      snapshot,
    }
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error),
    }
  }
}
