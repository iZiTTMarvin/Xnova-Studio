import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ConfigManager } from '../../config/config-manager.js'
import {
  readMemoryOverview,
  rebuildMemoryIndex,
} from '../overview-service.js'

function makeWorkspace(): {
  root: string
  userDir: string
  projectDir: string
} {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const root = join(tmpdir(), `xnova-memory-overview-${stamp}`)
  const userDir = join(root, 'home', '.xnovacode')
  const projectDir = join(root, 'project')
  mkdirSync(userDir, { recursive: true })
  mkdirSync(join(projectDir, '.xnovacode'), { recursive: true })
  return { root, userDir, projectDir }
}

describe('memory overview service', () => {
  let ws: ReturnType<typeof makeWorkspace>

  beforeEach(() => {
    ws = makeWorkspace()
  })

  afterEach(() => {
    if (existsSync(ws.root)) {
      rmSync(ws.root, { recursive: true, force: true })
    }
  })

  it('embedding 配置不完整时显示 BM25 降级，并区分全局 / 项目记忆概览', async () => {
    writeFileSync(
      join(ws.userDir, 'config.toml'),
      `default_provider = "anthropic"
default_model = "claude-sonnet-4-6"

[memory]
enabled = true
`,
      'utf-8',
    )

    const snapshot = await readMemoryOverview(ws.projectDir, {
      configManager: new ConfigManager(ws.userDir),
      fileStore: {
        scan: vi
          .fn()
          .mockResolvedValueOnce([
            { id: 'global:a' },
            { id: 'global:b' },
          ])
          .mockResolvedValueOnce([
            { id: 'project:a' },
          ]),
      },
      getStoredEmbeddingDimension: () => null,
      countVectorChunks: () => 0,
    })

    expect(snapshot.enabled).toBe(true)
    expect(snapshot.status).toBe('bm25')
    expect(snapshot.statusMessage).toContain('BM25')
    expect(snapshot.overview.globalEntries).toBe(2)
    expect(snapshot.overview.projectEntries).toBe(1)
    expect(snapshot.overview.vectorChunks).toBe(0)
  })

  it('rebuild 在 embedding 配置不完整时返回明确失败', async () => {
    writeFileSync(
      join(ws.userDir, 'config.toml'),
      `default_provider = "anthropic"
default_model = "claude-sonnet-4-6"

[memory]
enabled = true
`,
      'utf-8',
    )

    const result = await rebuildMemoryIndex(ws.projectDir, {
      configManager: new ConfigManager(ws.userDir),
      createMemoryManager: vi.fn(),
    })

    expect(result.success).toBe(false)
    expect(result.message).toContain('Embedding 配置不完整')
  })

  it('rebuild 成功后返回最新概览，并暴露成功结果', async () => {
    writeFileSync(
      join(ws.userDir, 'config.toml'),
      `default_provider = "anthropic"
default_model = "claude-sonnet-4-6"

[memory]
enabled = true

[memory.embedding]
api_key = "sk-memory"
base_url = "https://api.example.com/v1"
model = "embedding-3"
dimension = 1536
`,
      'utf-8',
    )

    const rebuild = vi.fn(async () => {})

    const result = await rebuildMemoryIndex(ws.projectDir, {
      configManager: new ConfigManager(ws.userDir),
      createMemoryManager: vi.fn(async () => ({
        rebuild,
      })),
      fileStore: {
        scan: vi
          .fn()
          .mockResolvedValueOnce([{ id: 'global:a' }])
          .mockResolvedValueOnce([{ id: 'project:a' }]),
      },
      getStoredEmbeddingDimension: () => 1536,
      countVectorChunks: () => 4,
    })

    expect(result.success).toBe(true)
    expect(result.message).toContain('已完成')
    expect(result.snapshot?.status).toBe('ready')
    expect(result.snapshot?.overview.vectorChunks).toBe(4)
    expect(rebuild).toHaveBeenCalledTimes(1)
  })
})
