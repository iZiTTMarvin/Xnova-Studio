import type {
  StudioRuntimeEvent,
  StudioRuntimeEventType,
} from '../shared/studio-bridge-contract'

export interface AdaptiveEventBatcherConfig {
  foregroundFlushMs: number
  backgroundFlushMs: number
  maxBufferSize: number
}

export type StudioRuntimeEventHandler = (event: StudioRuntimeEvent) => void

interface PendingDeltaChunk {
  type: 'text_delta' | 'thinking'
  text: string
  timestamp: string
  sessionId?: string
  agentId?: string
}

interface RunAccumulator {
  runId: string
  chunks: PendingDeltaChunk[]
  bufferedSize: number
  timer: ReturnType<typeof setTimeout> | null
}

const DEFAULT_CONFIG: AdaptiveEventBatcherConfig = {
  foregroundFlushMs: 33,
  backgroundFlushMs: 150,
  maxBufferSize: 200,
}

const AGGREGATABLE_TYPES = new Set<StudioRuntimeEventType>([
  'text_delta',
  'thinking',
])

const TERMINAL_TYPES = new Set<StudioRuntimeEventType>([
  'run_completed',
  'run_failed',
  'run_cancelled',
  'turn_end',
  'session_end',
  'model_request_failed',
  'error',
])

function readEventText(event: StudioRuntimeEvent): string {
  return typeof event.payload?.text === 'string' ? event.payload.text : ''
}

export class AdaptiveEventBatcher {
  private readonly config: AdaptiveEventBatcherConfig
  private readonly runs = new Map<string, RunAccumulator>()
  private handler: StudioRuntimeEventHandler | null = null
  private isForeground = true

  constructor(config?: Partial<AdaptiveEventBatcherConfig>) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    }
  }

  setHandler(handler: StudioRuntimeEventHandler): void {
    this.handler = handler
  }

  setForeground(visible: boolean): void {
    this.isForeground = visible
  }

  push(event: StudioRuntimeEvent): void {
    const runId = event.runId?.trim() || null
    if (
      this.handler === null ||
      !runId ||
      !AGGREGATABLE_TYPES.has(event.type)
    ) {
      if (runId) {
        this.flushRun(runId)
      }
      this.handler?.(event)
      if (runId && TERMINAL_TYPES.has(event.type)) {
        this.cleanupRun(runId)
      }
      return
    }

    const text = readEventText(event)
    if (!text) {
      return
    }

    const accumulator = this.ensureRun(runId)
    this.accumulate(accumulator, event, text)
    if (accumulator.bufferedSize >= this.config.maxBufferSize) {
      this.flushAccumulator(accumulator)
      return
    }
    this.scheduleFlush(accumulator)
  }

  flushRun(runId: string): void {
    const accumulator = this.runs.get(runId)
    if (!accumulator) {
      return
    }
    this.flushAccumulator(accumulator)
  }

  flushAll(): void {
    for (const accumulator of this.runs.values()) {
      this.flushAccumulator(accumulator)
    }
  }

  stop(): void {
    for (const accumulator of this.runs.values()) {
      this.clearTimer(accumulator)
    }
    this.runs.clear()
  }

  private ensureRun(runId: string): RunAccumulator {
    const existing = this.runs.get(runId)
    if (existing) {
      return existing
    }

    const created: RunAccumulator = {
      runId,
      chunks: [],
      bufferedSize: 0,
      timer: null,
    }
    this.runs.set(runId, created)
    return created
  }

  private accumulate(
    accumulator: RunAccumulator,
    event: StudioRuntimeEvent,
    text: string,
  ): void {
    const eventType = event.type as PendingDeltaChunk['type']
    const lastChunk = accumulator.chunks.at(-1)
    if (lastChunk?.type === eventType) {
      lastChunk.text += text
      lastChunk.timestamp = event.timestamp
      if (event.sessionId) {
        lastChunk.sessionId = event.sessionId
      }
      if (event.agentId) {
        lastChunk.agentId = event.agentId
      }
    } else {
      accumulator.chunks.push({
        type: eventType,
        text,
        timestamp: event.timestamp,
        ...(event.sessionId ? { sessionId: event.sessionId } : {}),
        ...(event.agentId ? { agentId: event.agentId } : {}),
      })
    }
    accumulator.bufferedSize += text.length
  }

  private scheduleFlush(accumulator: RunAccumulator): void {
    if (accumulator.timer !== null) {
      return
    }

    const delay = this.isForeground
      ? this.config.foregroundFlushMs
      : this.config.backgroundFlushMs

    accumulator.timer = setTimeout(() => {
      accumulator.timer = null
      this.flushAccumulator(accumulator)
    }, delay)
  }

  private flushAccumulator(accumulator: RunAccumulator): void {
    this.clearTimer(accumulator)
    if (this.handler === null || accumulator.chunks.length === 0) {
      accumulator.chunks = []
      accumulator.bufferedSize = 0
      return
    }

    const chunks = accumulator.chunks
    accumulator.chunks = []
    accumulator.bufferedSize = 0

    for (const chunk of chunks) {
      this.handler({
        type: chunk.type,
        timestamp: chunk.timestamp,
        runId: accumulator.runId,
        ...(chunk.sessionId ? { sessionId: chunk.sessionId } : {}),
        ...(chunk.agentId ? { agentId: chunk.agentId } : {}),
        payload: {
          text: chunk.text,
        },
      })
    }
  }

  private clearTimer(accumulator: RunAccumulator): void {
    if (accumulator.timer === null) {
      return
    }
    clearTimeout(accumulator.timer)
    accumulator.timer = null
  }

  private cleanupRun(runId: string): void {
    const accumulator = this.runs.get(runId)
    if (!accumulator) {
      return
    }
    this.clearTimer(accumulator)
    this.runs.delete(runId)
  }
}
