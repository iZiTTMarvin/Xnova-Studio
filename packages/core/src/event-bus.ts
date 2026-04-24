// src/core/event-bus.ts

import type { AgentEvent } from './agent-loop.js'
import { dbg } from './debug.js'

export interface StatusBarPayload {
  sys: {
    memPercent: number
    memUsedBytes: number
    memTotalBytes: number
    cpuPercent: number
  }
  proc: {
    memPercent: number
    memUsedBytes: number
    cpuPercent: number
    elapsedMs: number
  }
  token: {
    inputTokens: number
    outputTokens: number
    costByCurrency: Record<string, number>
    callCount: number
  } | null
  context: {
    usedPercentage: number
    level: string
  } | null
}

export type BridgeEvent =
  | { type: 'user_input'; text: string; source: 'cli' | 'web'; imageIds?: string[] }
  | { type: 'permission_response'; allow: boolean; always?: boolean; source: 'cli' | 'web' }
  | { type: 'question_response'; cancelled: boolean; answers?: Record<string, string | string[]>; source: 'cli' | 'web' }
  | { type: 'config_changed'; provider: string; model: string }
  | { type: 'client_connect'; clientId: string; clientType: 'cli' | 'web' }
  | { type: 'client_disconnect'; clientId: string }
  | { type: 'todo_update'; todos: Array<{ id: string; content: string; status: 'pending' | 'in_progress' | 'completed' }> }
  | { type: 'subagent_spawn'; parentToolCallId: string; agentId: string; name: string; agentType: string; description: string; maxTurns: number }
  | { type: 'subagent_progress'; agentId: string; name: string; agentType: string; description: string; turn: number; maxTurns: number; currentTool?: string }
  | { type: 'subagent_done'; agentId: string; name: string; description: string; success: boolean; output: string }
  | { type: 'subagent_event'; agentId: string; detail: SubAgentDetail }
  | { type: 'subagent_control'; agentId: string; action: 'stop'; reason: string; source: 'cli' | 'web' }
  | { type: 'context_update'; usedPercentage: number; lastInputTokens: number; effectiveWindow: number; level: string }
  | { type: 'compact_status'; status: 'start' | 'done' | 'error'; strategy?: string; message?: string }
  | { type: 'status_bar'; data: StatusBarPayload }
  | { type: 'resume_session'; sessionId: string; source: 'web' }

export type SubAgentDetail =
  | { kind: 'tool_start'; toolName: string; toolCallId: string; args?: Record<string, unknown> }
  | { kind: 'tool_done'; toolName: string; toolCallId: string; durationMs?: number; success?: boolean; resultSummary?: string }
  | { kind: 'text'; text: string }
  | { kind: 'error'; error: string }

export type BusEvent = AgentEvent | BridgeEvent

interface ConnectedClient {
  clientId: string
  clientType: 'cli' | 'web'
}

type Handler = (event: BusEvent) => void

export class EventBus {
  readonly #handlers = new Set<Handler>()
  readonly #clients: ConnectedClient[] = []

  on(handler: Handler): () => void {
    this.#handlers.add(handler)
    return () => {
      this.#handlers.delete(handler)
    }
  }

  onType<T extends BusEvent['type']>(
    type: T,
    handler: (event: Extract<BusEvent, { type: T }>) => void,
  ): () => void {
    return this.on((event) => {
      if (event.type === type) {
        handler(event as Extract<BusEvent, { type: T }>)
      }
    })
  }

  emit(event: BusEvent): void {
    if (event.type === 'client_connect') {
      this.#clients.push({ clientId: event.clientId, clientType: event.clientType })
    } else if (event.type === 'client_disconnect') {
      const index = this.#clients.findIndex((client) => client.clientId === event.clientId)
      if (index !== -1) {
        this.#clients.splice(index, 1)
      }
    }

    for (const handler of this.#handlers) {
      try {
        handler(event)
      } catch (error) {
        dbg(
          `[EventBus] handler threw on event "${event.type}": ${
            error instanceof Error ? error.message : String(error)
          }\n`,
        )
      }
    }
  }

  getClients(): readonly ConnectedClient[] {
    return this.#clients
  }
}

export const eventBus = new EventBus()

export function toSerializableEvent(event: AgentEvent): Record<string, unknown> | null {
  if (event.type === 'permission_request') {
    return { type: 'permission_request', toolName: event.toolName, args: event.args }
  }
  if (event.type === 'user_question_request') {
    return { type: 'user_question_request', questions: event.questions }
  }
  return event as Record<string, unknown>
}
