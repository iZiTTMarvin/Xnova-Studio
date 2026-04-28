// src/runtime/index.ts

/**
 * Runtime 公共导出
 *
 * 只暴露公共契约，内部实现细节不导出。
 * Host 通过此文件消费 runtime，不得越级 import runtime 内部模块。
 */

export { createRuntime } from './create-runtime.js'
export {
  createEngineServiceApi,
  LEGACY_COMMAND_CAPABILITY_MAP,
} from './engine-service-api.js'
export { inspectRuntimeConfig } from './inspect.js'
export { NoopBridge, CallbackBridge } from './bridge.js'
export { makeEvent, makeWarningEvent, makeErrorEvent } from './events.js'
export type {
  ResolvedConfig,
  RuntimeEvent,
  RuntimeEventType,
  PermissionRequest,
  PermissionResolution,
  UserQuestionRequest,
  UserQuestionResult,
  RuntimeSubmitInput,
  RuntimePreparedSnapshot,
  RuntimeAttachment,
  RuntimeSnapshot,
  RuntimeTurnResult,
  RuntimeConfigInput,
  RuntimeHostBridge,
  RuntimeInstance,
} from './types.js'
export type { RuntimeInspectConfigInput, RuntimeInspectSnapshot } from './inspect.js'
export type {
  EngineServiceApi,
  RuntimeCommandService,
  RuntimeSetModelInput,
  RuntimeModelSelection,
  RuntimeCompactContextInput,
  RuntimeCompactContextResult,
  RuntimeContextSnapshot,
  SessionService,
  SessionRestoreInput,
  SessionRestoreResult,
  SessionForkInput,
  MemoryService,
  MemoryWriteInput,
  McpService,
  SkillsService,
  UsageService,
  UsageSummary,
  PluginService,
  MaintenanceService,
  CreateEngineServiceApiOptions,
} from './engine-service-api.js'
