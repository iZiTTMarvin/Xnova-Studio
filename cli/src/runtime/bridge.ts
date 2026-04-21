// src/runtime/bridge.ts

/**
 * RuntimeHostBridge 默认实现 — NoopBridge
 *
 * 用于测试和无宿主场景（如单元测试、pipe mode 不需要权限弹窗时）。
 * CLI host 和 Desktop host 各自实现完整的 RuntimeHostBridge。
 *
 * 约束：不得 import ink / electron / ui/*
 */

import type { RuntimeHostBridge, RuntimeEvent, PermissionRequest, PermissionResolution, UserQuestionRequest, UserQuestionResult } from './types.js'

/**
 * NoopBridge — 所有权限自动允许，事件静默丢弃。
 * 仅用于测试和 pipe mode（无交互场景）。
 */
export class NoopBridge implements RuntimeHostBridge {
  emit(_event: RuntimeEvent): void {
    // 静默丢弃
  }

  async requestPermission(_input: PermissionRequest): Promise<PermissionResolution> {
    // 无交互场景自动允许
    return { allow: true }
  }

  async requestUserInput(_input: UserQuestionRequest): Promise<UserQuestionResult> {
    // 无交互场景返回空答案
    return { answers: {}, cancelled: false }
  }
}

/**
 * CallbackBridge — 通过回调函数转发事件和权限请求。
 * CLI host 可用此实现把 runtime 事件桥接到 React state。
 */
export class CallbackBridge implements RuntimeHostBridge {
  readonly #onEvent: (event: RuntimeEvent) => void
  readonly #onPermission: (input: PermissionRequest) => Promise<PermissionResolution>
  readonly #onUserInput: ((input: UserQuestionRequest) => Promise<UserQuestionResult>) | undefined

  constructor(options: {
    onEvent: (event: RuntimeEvent) => void
    onPermission: (input: PermissionRequest) => Promise<PermissionResolution>
    onUserInput?: (input: UserQuestionRequest) => Promise<UserQuestionResult>
  }) {
    this.#onEvent = options.onEvent
    this.#onPermission = options.onPermission
    this.#onUserInput = options.onUserInput
  }

  emit(event: RuntimeEvent): void {
    this.#onEvent(event)
  }

  async requestPermission(input: PermissionRequest): Promise<PermissionResolution> {
    return this.#onPermission(input)
  }

  async requestUserInput(input: UserQuestionRequest): Promise<UserQuestionResult> {
    if (this.#onUserInput) {
      return this.#onUserInput(input)
    }
    // 降级：无 onUserInput 回调时返回空答案
    return { answers: {}, cancelled: false }
  }
}
