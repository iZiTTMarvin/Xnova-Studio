// src/tools/agent/user-agent-store.ts

/**
 * UserAgentStore — 用户自定义 agent 的持久化 CRUD 服务
 *
 * 文件存储路径：~/.xnovacode/agents/{id}.md
 * 文件格式：TOML frontmatter（--- 分隔符）+ Markdown 正文
 *
 * 职责：
 * - list / load / save / delete 用户 agent 文件
 * - 保存前统一走 schema validator（拒绝非法 frontmatter）
 * - 从模板创建 / 从空白创建
 * - 处理重复 id、非法字段、文件冲突等错误场景
 *
 * 规范来源：
 * - .trellis/spec/backend/agent-schema-v1.md
 * - .trellis/tasks/04-22-phase3-user-agent-crud/prd.md
 *
 * 错误处理原则（error-handling.md §1）：
 * - 保存前非法 agent 直接拒绝（快速失败）
 * - 文件读写失败记录错误并向上抛出（不静默吞错）
 */

import {
  readFileSync,
  writeFileSync,
  unlinkSync,
  existsSync,
  mkdirSync,
  readdirSync,
} from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { parseAgentFile, AgentValidationError } from './parser.js'
import { assertValidAgentId } from './id-utils.js'
import { renderTemplate, renderBlankAgent, findTemplate, BUILTIN_TEMPLATES } from './agent-templates.js'
import type { LoadedAgentDefinitionV1 } from './schema-v1.js'
import type { AgentTemplate } from './agent-templates.js'

// ═══════════════════════════════════════════════
// 错误类型
// ═══════════════════════════════════════════════

/** 用户 agent 存储操作错误 */
export class UserAgentStoreError extends Error {
  readonly code: 'DUPLICATE_ID' | 'NOT_FOUND' | 'INVALID_AGENT' | 'IO_ERROR'

  constructor(
    message: string,
    code: 'DUPLICATE_ID' | 'NOT_FOUND' | 'INVALID_AGENT' | 'IO_ERROR',
  ) {
    super(message)
    this.name = 'UserAgentStoreError'
    this.code = code
  }
}

// ═══════════════════════════════════════════════
// Store 类
// ═══════════════════════════════════════════════

/**
 * 用户 agent CRUD 服务。
 *
 * 默认存储路径：~/.xnovacode/agents/
 * 测试时可注入自定义路径（通过 createUserAgentStore(dir)）。
 */
export class UserAgentStore {
  readonly #dir: string

  constructor(dir: string) {
    this.#dir = dir
  }

  /** 确保存储目录存在 */
  #ensureDir(): void {
    if (!existsSync(this.#dir)) {
      mkdirSync(this.#dir, { recursive: true })
    }
  }

  /** 根据 agent id 计算文件路径 */
  #filePath(id: string): string {
    try {
      const safeId = assertValidAgentId(id, 'agent id')
      return join(this.#dir, `${safeId}.md`)
    } catch (err) {
      throw new UserAgentStoreError(
        err instanceof Error ? err.message : `非法 agent id: ${String(err)}`,
        'INVALID_AGENT',
      )
    }
  }

  // ─── List ──────────────────────────────────────────────────────────────

  /**
   * 列出所有用户 agent（忽略解析失败的文件，记录警告）。
   *
   * @returns 成功加载的 agent 列表（按 id 排序）
   */
  listAll(): LoadedAgentDefinitionV1[] {
    this.#ensureDir()
    const result: LoadedAgentDefinitionV1[] = []

    let files: string[]
    try {
      files = readdirSync(this.#dir)
    } catch (err) {
      throw new UserAgentStoreError(
        `读取 agent 目录失败 (${this.#dir})：${String(err)}`,
        'IO_ERROR',
      )
    }

    for (const file of files) {
      if (!file.endsWith('.md')) continue
      const filePath = join(this.#dir, file)
      try {
        const content = readFileSync(filePath, 'utf-8')
        const { frontmatter, body } = parseAgentFile(content, filePath)
        result.push({ source: 'user', frontmatter, body, filePath })
      } catch (err) {
        // 降级：跳过损坏文件，记录警告，不阻断其他 agent 加载
        console.warn(`[UserAgentStore] 跳过损坏的 agent 文件 ${filePath}：${String(err)}`)
      }
    }

    return result.sort((a, b) => a.frontmatter.id.localeCompare(b.frontmatter.id))
  }

  /**
   * 根据 id 加载单个用户 agent。
   *
   * @throws UserAgentStoreError(NOT_FOUND) 若文件不存在
   * @throws UserAgentStoreError(INVALID_AGENT) 若文件解析失败
   */
  load(id: string): LoadedAgentDefinitionV1 {
    const filePath = this.#filePath(id)
    const content = this.loadRaw(id)
    try {
      const { frontmatter, body } = parseAgentFile(content, filePath)
      return { source: 'user', frontmatter, body, filePath }
    } catch (err) {
      if (err instanceof AgentValidationError) {
        throw new UserAgentStoreError(err.message, 'INVALID_AGENT')
      }
      throw new UserAgentStoreError(`解析 agent 文件失败 (${filePath})：${String(err)}`, 'INVALID_AGENT')
    }
  }

  /**
   * 读取文件原始内容（供编辑器 round-trip 序列化使用）
   *
   * @throws UserAgentStoreError(NOT_FOUND) 若文件不存在
   */
  loadRaw(id: string): string {
    const filePath = this.#filePath(id)
    if (!existsSync(filePath)) {
      throw new UserAgentStoreError(`用户 agent "${id}" 不存在`, 'NOT_FOUND')
    }
    try {
      return readFileSync(filePath, 'utf-8')
    } catch (err) {
      throw new UserAgentStoreError(`读取 agent 文件失败 (${filePath})：${String(err)}`, 'IO_ERROR')
    }
  }

  // ─── Save ──────────────────────────────────────────────────────────────

  /**
   * 保存（创建或更新）用户 agent 文件。
   *
   * 保存前执行 schema 校验，拒绝非法 agent（快速失败）。
   *
   * @param content - 完整文件内容（含 frontmatter + 正文）
   * @param options.overwrite - 若文件已存在是否覆盖（默认 false = 拒绝重复 id）
   * @throws UserAgentStoreError(DUPLICATE_ID) 若 id 已存在且未设置 overwrite
   * @throws UserAgentStoreError(INVALID_AGENT) 若 frontmatter 校验失败
   */
  save(
    content: string,
    options: { overwrite?: boolean } = {},
  ): LoadedAgentDefinitionV1 {
    // 先校验内容合法性
    let frontmatter: LoadedAgentDefinitionV1['frontmatter']
    let body: string
    try {
      const parsed = parseAgentFile(content)
      frontmatter = parsed.frontmatter
      body = parsed.body
    } catch (err) {
      if (err instanceof AgentValidationError) {
        throw new UserAgentStoreError(err.message, 'INVALID_AGENT')
      }
      throw new UserAgentStoreError(`agent 内容解析失败：${String(err)}`, 'INVALID_AGENT')
    }

    const filePath = this.#filePath(frontmatter.id)

    // 重复 id 校验
    if (!options.overwrite && existsSync(filePath)) {
      throw new UserAgentStoreError(
        `用户 agent id "${frontmatter.id}" 已存在，如需更新请使用 overwrite 选项`,
        'DUPLICATE_ID',
      )
    }

    // 写入文件
    this.#ensureDir()
    try {
      writeFileSync(filePath, content, 'utf-8')
    } catch (err) {
      throw new UserAgentStoreError(`写入 agent 文件失败 (${filePath})：${String(err)}`, 'IO_ERROR')
    }

    return { source: 'user', frontmatter, body, filePath }
  }

  // ─── Delete ────────────────────────────────────────────────────────────

  /**
   * 删除用户 agent 文件。
   *
   * @throws UserAgentStoreError(NOT_FOUND) 若文件不存在
   */
  delete(id: string): void {
    const filePath = this.#filePath(id)
    if (!existsSync(filePath)) {
      throw new UserAgentStoreError(`用户 agent "${id}" 不存在`, 'NOT_FOUND')
    }
    try {
      unlinkSync(filePath)
    } catch (err) {
      throw new UserAgentStoreError(`删除 agent 文件失败 (${filePath})：${String(err)}`, 'IO_ERROR')
    }
  }

  // ─── 脚手架创建 ──────────────────────────────────────────────────────

  /**
   * 从模板创建新的用户 agent 文件（并保存）。
   *
   * @param templateId - 模板 id（见 agent-templates.ts BUILTIN_TEMPLATES）
   * @param id - 新 agent 的 id
   * @param name - 新 agent 的显示名称
   * @param summary - 新 agent 的副标题
   * @throws UserAgentStoreError 若模板不存在、id 重复或内容非法
   */
  createFromTemplate(
    templateId: string,
    id: string,
    name: string,
    summary: string,
  ): LoadedAgentDefinitionV1 {
    const template = findTemplate(templateId)
    if (!template) {
      throw new UserAgentStoreError(
        `模板 "${templateId}" 不存在，可用模板：${BUILTIN_TEMPLATES.map(t => t.templateId).join(', ')}`,
        'NOT_FOUND',
      )
    }
    const content = renderTemplate(template, id, name, summary)
    return this.save(content, { overwrite: false })
  }

  /**
   * 从空白创建新的用户 agent 文件（并保存）。
   *
   * @param id - 新 agent 的 id
   * @param name - 新 agent 的显示名称
   * @throws UserAgentStoreError 若 id 重复或内容非法
   */
  createBlank(id: string, name: string): LoadedAgentDefinitionV1 {
    const content = renderBlankAgent(id, name)
    return this.save(content, { overwrite: false })
  }

  /** 是否存在指定 id 的用户 agent */
  exists(id: string): boolean {
    return existsSync(this.#filePath(id))
  }

  /** 获取存储目录路径 */
  get dir(): string {
    return this.#dir
  }
}

// ═══════════════════════════════════════════════
// 工厂函数与模块级单例
// ═══════════════════════════════════════════════

/**
 * 创建 UserAgentStore 实例。
 * @param dir - 可选，自定义存储目录（默认 ~/.xnovacode/agents/）
 */
export function createUserAgentStore(dir?: string): UserAgentStore {
  const agentDir = dir ?? join(homedir(), '.xnovacode', 'agents')
  return new UserAgentStore(agentDir)
}

/** 模块级单例（生产环境使用默认路径） */
export const userAgentStore: UserAgentStore = createUserAgentStore()
