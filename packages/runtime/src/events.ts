// src/runtime/events.ts

/**
 * Runtime 事件工具函数
 *
 * 提供创建标准 RuntimeEvent 的工厂函数，
 * 避免各处手写 timestamp / type 字段。
 *
 * 约束：不得 import ink / electron / ui/*
 */

import type { RuntimeEvent, RuntimeEventType } from './types.js'

/** 创建一个 RuntimeEvent */
export function makeEvent(
  type: RuntimeEventType,
  payload?: Record<string, unknown>,
  sessionId?: string,
  agentId?: string,
): RuntimeEvent {
  return {
    type,
    timestamp: new Date().toISOString(),
    ...(sessionId ? { sessionId } : {}),
    ...(agentId ? { agentId } : {}),
    ...(payload ? { payload } : {}),
  }
}

/** 创建 warning 事件 */
export function makeWarningEvent(message: string, sessionId?: string): RuntimeEvent {
  return makeEvent('warning', { message }, sessionId)
}

/** 创建 error 事件 */
export function makeErrorEvent(error: string, sessionId?: string): RuntimeEvent {
  return makeEvent('error', { error }, sessionId)
}
