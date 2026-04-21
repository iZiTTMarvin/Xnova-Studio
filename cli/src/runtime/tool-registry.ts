// src/runtime/tool-registry.ts

/**
 * Runtime Tool Registry 构建器
 *
 * 从 bootstrap.ts 抽出 buildRegistry() 逻辑，
 * bootstrap.ts 改为调用此模块（兼容层保留）。
 *
 * 约束：不得 import ink / electron / ui/*
 */

import { ToolRegistry } from '../tools/core/registry.js'
import { ReadFileTool } from '../tools/core/read-file.js'
import { WriteFileTool } from '../tools/core/write-file.js'
import { EditFileTool } from '../tools/core/edit-file.js'
import { GlobTool } from '../tools/core/glob.js'
import { GrepTool } from '../tools/core/grep.js'
import { BashTool } from '../tools/core/bash.js'
import { GitTool } from '../tools/core/git.js'
import { KillShellTool } from '../tools/core/kill-shell.js'
import { TaskOutputTool } from '../tools/core/task-output.js'
import { TodoWriteTool } from '../tools/ext/todo-write.js'
import { DispatchAgentTool } from '../tools/agent/dispatch-agent.js'
import { ControlAgentTool } from '../tools/agent/control-agent.js'
import { registerBuiltInAgents } from '../tools/agent/built-in.js'
import { AskUserQuestionTool } from '../tools/ext/ask-user-question.js'
import { VerifyCodeTool } from '../tools/ext/verify-code.js'
import { SkillTool } from '../skills/engine/skill-tool.js'
import type { SkillStore } from '../skills/engine/store.js'
import type { MemoryManager } from '../memory/core/memory-manager.js'
import { MemoryWriteTool } from '../memory/tools/memory-write-tool.js'
import { MemorySearchTool } from '../memory/tools/memory-search-tool.js'
import { MemoryDeleteTool } from '../memory/tools/memory-delete-tool.js'

export interface BuildRegistryOptions {
  skillStore: SkillStore
  memoryManager?: MemoryManager | null
}

/**
 * 构建包含全部内置工具的 ToolRegistry。
 * 幂等：每次调用返回新实例（调用方负责缓存）。
 */
export function buildToolRegistry(options: BuildRegistryOptions): ToolRegistry {
  // 确保内置 Agent 定义已注册（幂等）
  registerBuiltInAgents()

  const reg = new ToolRegistry()
  reg.register(new ReadFileTool())
  reg.register(new WriteFileTool())
  reg.register(new EditFileTool())
  reg.register(new GlobTool())
  reg.register(new GrepTool())
  reg.register(new BashTool())
  reg.register(new GitTool())
  reg.register(new KillShellTool())
  reg.register(new TaskOutputTool())
  reg.register(new TodoWriteTool())
  reg.register(new DispatchAgentTool())
  reg.register(new ControlAgentTool())
  reg.register(new AskUserQuestionTool())
  reg.register(new VerifyCodeTool())
  reg.register(new SkillTool(options.skillStore))

  if (options.memoryManager) {
    reg.register(new MemoryWriteTool(options.memoryManager))
    reg.register(new MemorySearchTool(options.memoryManager))
    reg.register(new MemoryDeleteTool(options.memoryManager))
  }

  return reg
}
