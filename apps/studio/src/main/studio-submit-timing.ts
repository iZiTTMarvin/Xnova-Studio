import type { MainLogger } from './logger'
import type { StudioRuntimeEvent } from '../shared/studio-bridge-contract'

export interface RuntimeSubmitTimingClientMarks {
  userSubmitClickedAt?: number
  rendererRuntimeSubmitInvokedAt?: number
  ipcRuntimeSubmitReceivedAt?: number
}

interface StudioSubmitTimingOptions {
  enabled: boolean
  logger: Pick<MainLogger, 'info'>
  clientMarks?: RuntimeSubmitTimingClientMarks
  now?: () => number
}

interface TimingMark {
  stage: string
  at: number
  details?: Record<string, unknown>
}

interface SummaryLineInput {
  label: string
  from: string
  to: string
}

const SAFE_DETAIL_KEYS = new Set([
  'providerId',
  'modelId',
  'phase',
  'chunkType',
  'elapsedMs',
  'attempt',
  'status',
  'source',
])

const SENSITIVE_DETAIL_KEY_PATTERN =
  /(api[_-]?key|authorization|token|secret|password|prompt|content|messages|headers|cookie)/i

const SUMMARY_LINES: SummaryLineInput[] = [
  {
    label: 'user click -> renderer submit invoked',
    from: 'user_submit_clicked',
    to: 'renderer_runtime_submit_invoked',
  },
  {
    label: 'renderer submit -> main received',
    from: 'renderer_runtime_submit_invoked',
    to: 'ipc_runtime_submit_received',
  },
  {
    label: 'main received -> runtime service start',
    from: 'ipc_runtime_submit_received',
    to: 'runtime_service_submit_start',
  },
  {
    label: 'runtime acquire',
    from: 'runtime_acquire_start',
    to: 'runtime_acquire_done',
  },
  {
    label: 'config load',
    from: 'config_load_start',
    to: 'config_load_done',
  },
  {
    label: 'main received -> runtime submit start',
    from: 'ipc_runtime_submit_received',
    to: 'runtime_instance_submit_start',
  },
  {
    label: 'runtime submit start -> first runtime event',
    from: 'runtime_instance_submit_start',
    to: 'runtime_first_event_received',
  },
  {
    label: 'runtime bootstrap',
    from: 'runtime_bootstrap_start',
    to: 'runtime_bootstrap_done',
  },
  {
    label: 'tool registry ready',
    from: 'runtime_bootstrap_done',
    to: 'tool_registry_ready',
  },
  {
    label: 'history hydration',
    from: 'history_hydration_start',
    to: 'history_hydration_done',
  },
  {
    label: 'context build',
    from: 'context_build_start',
    to: 'context_build_done',
  },
  {
    label: 'runtime submit start -> model request started',
    from: 'runtime_instance_submit_start',
    to: 'model_request_started',
  },
  {
    label: 'provider stream open',
    from: 'provider_chat_start',
    to: 'provider_stream_open_start',
  },
  {
    label: 'provider first raw chunk',
    from: 'provider_stream_open_start',
    to: 'provider_stream_first_chunk',
  },
  {
    label: 'first chunk',
    from: 'model_request_started',
    to: 'model_first_chunk',
  },
  {
    label: 'first text delta',
    from: 'model_request_started',
    to: 'first_text_delta',
  },
  {
    label: 'first visible progress',
    from: 'renderer_runtime_submit_invoked',
    to: 'first_visible_progress',
  },
  {
    label: 'first tool visible',
    from: 'renderer_runtime_submit_invoked',
    to: 'first_tool_intent_or_tool_start',
  },
  {
    label: 'total',
    from: 'renderer_runtime_submit_invoked',
    to: 'runtime_submit_resolved_or_rejected',
  },
]

function isFiniteTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function sanitizeDetails(
  details?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!details) {
    return undefined
  }

  const safeEntries = Object.entries(details).filter(([key, value]) => {
    if (SENSITIVE_DETAIL_KEY_PATTERN.test(key)) {
      return false
    }
    if (!SAFE_DETAIL_KEYS.has(key)) {
      return false
    }
    return (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    )
  })

  return safeEntries.length > 0 ? Object.fromEntries(safeEntries) : undefined
}

function formatDuration(ms: number): string {
  if (ms < 1_000) {
    return `${Math.max(0, Math.round(ms))}ms`
  }
  return `${Math.round((ms / 1_000) * 10) / 10}s`
}

function getFirstMark(marks: TimingMark[], stage: string): TimingMark | null {
  return marks.find((mark) => mark.stage === stage) ?? null
}

function buildSummaryLines(marks: TimingMark[]): string[] {
  return SUMMARY_LINES.flatMap((line) => {
    const from = getFirstMark(marks, line.from)
    const to = getFirstMark(marks, line.to)
    if (!from || !to || to.at < from.at) {
      return []
    }

    return [`- ${line.label}: ${formatDuration(to.at - from.at)}`]
  })
}

export function isStudioSubmitTimingEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.XNOVA_TIMING_DEBUG === '1' || env.NODE_ENV === 'development'
}

export function createStudioSubmitTiming(
  options: StudioSubmitTimingOptions,
) {
  const marks: TimingMark[] = []
  const now = options.now ?? (() => Date.now())
  let finished = false

  const markAt = (
    stage: string,
    at: number,
    details?: Record<string, unknown>,
  ): void => {
    if (!options.enabled || !isFiniteTimestamp(at)) {
      return
    }

    const sanitizedDetails = sanitizeDetails(details)
    marks.push({
      stage,
      at,
      ...(sanitizedDetails === undefined ? {} : { details: sanitizedDetails }),
    })
  }

  const mark = (
    stage: string,
    details?: Record<string, unknown>,
  ): void => {
    markAt(stage, now(), details)
  }

  const markFirst = (
    stage: string,
    details?: Record<string, unknown>,
  ): void => {
    if (marks.some((markItem) => markItem.stage === stage)) {
      return
    }
    mark(stage, details)
  }

  if (options.clientMarks?.userSubmitClickedAt !== undefined) {
    markAt('user_submit_clicked', options.clientMarks.userSubmitClickedAt)
  }
  if (options.clientMarks?.rendererRuntimeSubmitInvokedAt !== undefined) {
    markAt(
      'renderer_runtime_submit_invoked',
      options.clientMarks.rendererRuntimeSubmitInvokedAt,
    )
  }
  if (options.clientMarks?.ipcRuntimeSubmitReceivedAt !== undefined) {
    markAt(
      'ipc_runtime_submit_received',
      options.clientMarks.ipcRuntimeSubmitReceivedAt,
    )
  }

  return {
    mark,
    markAt,
    markFirst,
    markRuntimeEvent(event: StudioRuntimeEvent): void {
      markFirst('runtime_first_event_received')
      if (event.type === 'timing_mark') {
        const stage =
          typeof event.payload?.stage === 'string' ? event.payload.stage : null
        if (stage) {
          markFirst(stage, event.payload)
        }
        return
      }

      switch (event.type) {
        case 'model_request_started':
          markFirst('model_request_started', event.payload)
          break
        case 'model_first_chunk':
          markFirst('model_first_chunk', event.payload)
          if (event.payload?.chunkType === 'tool_call') {
            markFirst('first_tool_intent_or_tool_start', event.payload)
          }
          break
        case 'model_request_finished':
          markFirst('model_request_finished', event.payload)
          break
        case 'model_request_failed':
          markFirst('model_request_failed', event.payload)
          break
        case 'text_delta':
          markFirst('first_text_delta')
          markFirst('first_visible_progress')
          break
        case 'tool_start':
          markFirst('first_tool_intent_or_tool_start', event.payload)
          markFirst('first_visible_progress')
          break
        case 'tool_end':
        case 'context_update':
        case 'warning':
          markFirst('first_visible_progress')
          break
        default:
          break
      }
    },
    finish(status: 'completed' | 'failed' | 'cancelled'): void {
      if (!options.enabled || marks.length === 0 || finished) {
        return
      }
      finished = true

      const lines = buildSummaryLines(marks)
      if (lines.length === 0) {
        return
      }

      options.logger.info(`Submit timing:\n${lines.join('\n')}`, {
        status,
        marks: marks.map((markItem) => ({
          stage: markItem.stage,
          at: markItem.at,
          ...(markItem.details ? { details: markItem.details } : {}),
        })),
      })
    },
  }
}
