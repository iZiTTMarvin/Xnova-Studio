import type { CCodeConfig } from '@config/config-manager.js'

export interface RuntimeInspectConfigInput {
  config: CCodeConfig
}

export interface RuntimeInspectSnapshot {
  sessionId: string | null
  isRunning: boolean
  provider: string
  model: string
  warnings: string[]
}

/**
 * 生成 Phase 4 最小 runtime 检查结果。
 *
 * 这里故意不触发完整 bootstrap/AgentLoop，只返回共享 runtime
 * 当前最基础、最稳定的配置视图，供桌面宿主验证“可消费 runtime”。
 */
export function inspectRuntimeConfig(
  input: RuntimeInspectConfigInput,
): RuntimeInspectSnapshot {
  return {
    sessionId: null,
    isRunning: false,
    provider: input.config.defaultProvider,
    model: input.config.defaultModel,
    warnings: [],
  }
}
