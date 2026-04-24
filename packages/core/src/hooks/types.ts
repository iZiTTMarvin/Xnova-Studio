export type HookEventType = 'SessionStart' | 'PreToolUse' | 'PostToolUse'

export interface HookAction {
  type: 'command'
  command: string
  timeout?: number
}

export interface HookRule {
  matcher: string
  hooks: HookAction[]
}

export interface HooksConfig {
  hooks: Partial<Record<HookEventType, HookRule[]>>
}

export interface ResolvedHookEntry {
  source: 'plugin' | 'project' | 'user'
  pluginName?: string
  event: HookEventType
  matcher: RegExp
  action: HookAction
  cwd: string
}

export interface HookContext {
  trigger: string
  env?: Record<string, string>
  stdin?: string
}

export interface SessionStartHookResult {
  additionalContext?: string
  userMessage?: string
}

export interface PreToolUseHookResult {
  decision: 'allow' | 'block' | 'modify'
  reason?: string
  modifiedArgs?: Record<string, unknown>
}

export interface PostToolUseHookResult {
  additionalContext?: string
  userMessage?: string
}
