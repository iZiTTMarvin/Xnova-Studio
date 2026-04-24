import type { StudioMemoryOverviewSnapshot } from '../../shared/studio-bridge-contract'

export type MemoryOverviewLoadStatus = 'loading' | 'ready' | 'disabled' | 'error'

export interface MemoryFeedbackPresentation {
  statusClassName: 'loading' | 'ready' | 'warning' | 'disabled' | 'error' | 'empty'
  statusLabel: string
  statusMessage: string
  actionHint: string | null
}

export function resolveMemoryFeedbackPresentation(input: {
  snapshot: StudioMemoryOverviewSnapshot | null
  status: MemoryOverviewLoadStatus
  error: string | null
  actionMessage: string | null
}): MemoryFeedbackPresentation {
  const snapshot = input.snapshot

  if (input.error) {
    return {
      statusClassName: 'error',
      statusLabel: '读取失败',
      statusMessage: input.error,
      actionHint: null,
    }
  }

  if (snapshot?.status === 'bm25') {
    return {
      statusClassName: 'warning',
      statusLabel: 'BM25 降级',
      statusMessage: snapshot.statusMessage,
      actionHint: '建议先补齐 Embedding 配置，再恢复向量检索。',
    }
  }

  if (snapshot?.status === 'degraded') {
    return {
      statusClassName: 'warning',
      statusLabel: '索引待恢复',
      statusMessage: snapshot.statusMessage,
      actionHint: '建议尽快进入设置页重建 Memory 索引，恢复向量检索。',
    }
  }

  if (snapshot?.status === 'disabled') {
    return {
      statusClassName: 'disabled',
      statusLabel: '未启用',
      statusMessage: snapshot.statusMessage,
      actionHint: '如需项目记忆，请先在设置页启用 Memory。',
    }
  }

  if (snapshot?.status === 'ready') {
    return {
      statusClassName: 'ready',
      statusLabel: '已就绪',
      statusMessage: snapshot.statusMessage,
      actionHint: null,
    }
  }

  if (input.status === 'loading') {
    return {
      statusClassName: 'loading',
      statusLabel: '读取中',
      statusMessage: '正在读取 Memory 状态…',
      actionHint: null,
    }
  }

  if (input.status === 'disabled') {
    return {
      statusClassName: 'disabled',
      statusLabel: '不可用',
      statusMessage: '当前宿主桥接不可用，Memory 状态暂时不可读取。',
      actionHint: null,
    }
  }

  if (input.status === 'error') {
    return {
      statusClassName: 'error',
      statusLabel: '读取失败',
      statusMessage: 'Memory 状态暂不可用。',
      actionHint: null,
    }
  }

  return {
    statusClassName: 'empty',
    statusLabel: '未返回状态',
    statusMessage: 'Memory 状态暂不可用。',
    actionHint: null,
  }
}
