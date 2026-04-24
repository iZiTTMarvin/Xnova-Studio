import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { SessionStore } from '@persistence/session-store.js'
import { SessionStore as DefaultSessionStore } from '@persistence/session-store.js'
import type { SkillStore } from './engine/store.js'
import { SkillStore as DefaultSkillStore } from './engine/store.js'
import type { SkillMetadata } from './engine/types.js'

export interface SkillsPluginsOverviewSnapshot {
  status: 'ready' | 'empty' | 'error'
  statusMessage: string
  sourceDistribution: Array<{
    source: SkillMetadata['source']
    count: number
  }>
  recentSkills: Array<{
    name: string
    source: SkillMetadata['source']
    lastUsedAt: string
  }>
  frequentSkills: Array<{
    name: string
    source: SkillMetadata['source']
    useCount: number
  }>
  plugins: PluginStatusInfo[]
  warnings: string[]
}

export interface PluginStatusInfo {
  name: string
  source: 'xnova' | 'claude-code' | 'manual'
  version: string
  skillCount: number
  hasHooks: boolean
  description?: string
}

export interface ReadSkillsPluginsOverviewOptions {
  skillStore?: Pick<SkillStore, 'discover' | 'getAll'>
  sessionStore?: Pick<SessionStore, 'list' | 'loadMessages'>
  listPlugins?: () => PluginStatusInfo[]
}

function listInstalledPlugins(): PluginStatusInfo[] {
  const pluginsDir = join(homedir(), '.xnovacode', 'plugins')
  if (!existsSync(pluginsDir)) {
    return []
  }

  const results: PluginStatusInfo[] = []
  for (const entry of readdirSync(pluginsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue
    }

    const pluginDir = join(pluginsDir, entry.name)
    const skillsDir = join(pluginDir, 'skills')
    const hasHooks = existsSync(join(pluginDir, 'hooks', 'hooks.json'))
    const skillCount = existsSync(skillsDir)
      ? readdirSync(skillsDir, { withFileTypes: true })
          .filter((dirent) => dirent.isDirectory() && existsSync(join(skillsDir, dirent.name, 'SKILL.md')))
          .length
      : 0

    let version = 'unknown'
    let description = ''
    const metaCandidates = [
      join(pluginDir, '.claude-plugin', 'plugin.json'),
      join(pluginDir, 'plugin.json'),
    ]
    for (const metaPath of metaCandidates) {
      if (!existsSync(metaPath)) {
        continue
      }

      try {
        const meta = JSON.parse(readFileSync(metaPath, 'utf-8')) as {
          version?: string
          description?: string
        }
        version = meta.version ?? version
        description = meta.description ?? description
        break
      } catch {
        // 插件元数据损坏时仅保留默认值
      }
    }

    results.push({
      name: entry.name,
      source: 'xnova',
      version,
      skillCount,
      hasHooks,
      ...(description ? { description } : {}),
    })
  }

  return results
}

function buildSourceDistribution(skills: SkillMetadata[]): SkillsPluginsOverviewSnapshot['sourceDistribution'] {
  const counts = new Map<SkillMetadata['source'], number>()
  for (const skill of skills) {
    counts.set(skill.source, (counts.get(skill.source) ?? 0) + 1)
  }
  return [...counts.entries()].map(([source, count]) => ({ source, count }))
}

function collectSkillUsage(
  skillsByName: Map<string, SkillMetadata>,
  sessionStore: Pick<SessionStore, 'list' | 'loadMessages'>,
): {
  recent: SkillsPluginsOverviewSnapshot['recentSkills']
  frequent: SkillsPluginsOverviewSnapshot['frequentSkills']
} {
  const usage = new Map<
    string,
    { source: SkillMetadata['source']; useCount: number; lastUsedAt: string }
  >()

  const sessions = sessionStore.list({ limit: 20 })
  for (const session of sessions) {
    try {
      const snapshot = sessionStore.loadMessages(session.sessionId)
      for (const message of snapshot.messages) {
        for (const toolEvent of message.toolEvents ?? []) {
          if (toolEvent.toolName !== 'skill') {
            continue
          }
          const name = toolEvent.args['name']
          if (typeof name !== 'string') {
            continue
          }
          const skill = skillsByName.get(name)
          if (!skill) {
            continue
          }
          const current = usage.get(name)
          usage.set(name, {
            source: skill.source,
            useCount: (current?.useCount ?? 0) + 1,
            lastUsedAt:
              !current || session.updatedAt > current.lastUsedAt
                ? session.updatedAt
                : current.lastUsedAt,
          })
        }
      }
    } catch {
      // 单个会话损坏时跳过，不阻断概览
    }
  }

  const entries = [...usage.entries()].map(([name, info]) => ({ name, ...info }))
  const recent = [...entries]
    .sort((left, right) => right.lastUsedAt.localeCompare(left.lastUsedAt))
    .slice(0, 5)
    .map(({ name, source, lastUsedAt }) => ({ name, source, lastUsedAt }))

  const frequent = [...entries]
    .sort((left, right) => {
      if (right.useCount !== left.useCount) {
        return right.useCount - left.useCount
      }
      return right.lastUsedAt.localeCompare(left.lastUsedAt)
    })
    .slice(0, 5)
    .map(({ name, source, useCount }) => ({ name, source, useCount }))

  return { recent, frequent }
}

export async function readSkillsPluginsOverview(
  options: ReadSkillsPluginsOverviewOptions = {},
): Promise<SkillsPluginsOverviewSnapshot> {
  const warnings: string[] = []
  const skillStore = options.skillStore ?? new DefaultSkillStore()
  const sessionStore =
    options.sessionStore ??
    new DefaultSessionStore(join(homedir(), '.xnovacode', 'sessions'))

  let skills: SkillMetadata[] = []
  try {
    await skillStore.discover()
    skills = skillStore.getAll()
  } catch (error) {
    warnings.push(`skills discover failed: ${error instanceof Error ? error.message : String(error)}`)
  }

  let plugins: PluginStatusInfo[] = []
  try {
    plugins = (options.listPlugins ?? listInstalledPlugins)()
  } catch (error) {
    warnings.push(`plugins scan failed: ${error instanceof Error ? error.message : String(error)}`)
  }

  const skillsByName = new Map(skills.map((skill) => [skill.name, skill]))
  const usage = collectSkillUsage(skillsByName, sessionStore)

  const status = skills.length === 0 && plugins.length === 0 ? 'empty' : 'ready'

  return {
    status,
    statusMessage:
      status === 'empty'
        ? '当前没有可见的 Skills / Plugins。'
        : 'Skills / Plugins 状态已加载。',
    sourceDistribution: buildSourceDistribution(skills),
    recentSkills: usage.recent,
    frequentSkills: usage.frequent,
    plugins,
    warnings,
  }
}
