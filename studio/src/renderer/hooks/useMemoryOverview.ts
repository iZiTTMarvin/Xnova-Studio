import { useEffect, useState } from 'react'
import type {
  StudioMemoryOverviewSnapshot,
  StudioMemoryRebuildResult,
  StudioMemoryApi,
} from '../../shared/studio-bridge-contract'

export interface UseMemoryOverviewResult {
  status: 'loading' | 'ready' | 'disabled' | 'error'
  snapshot: StudioMemoryOverviewSnapshot | null
  error: string | null
  actionMessage: string | null
  isRebuilding: boolean
  rebuild: () => Promise<void>
}

export function useMemoryOverview(
  memoryApi: StudioMemoryApi | null,
): UseMemoryOverviewResult {
  const [status, setStatus] = useState<'loading' | 'ready' | 'disabled' | 'error'>(
    memoryApi ? 'loading' : 'disabled',
  )
  const [snapshot, setSnapshot] = useState<StudioMemoryOverviewSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [isRebuilding, setIsRebuilding] = useState(false)

  useEffect(() => {
    if (!memoryApi) {
      setStatus('disabled')
      setError('当前宿主桥接不可用，Memory 状态暂时不可读取。')
      setSnapshot(null)
      return
    }

    let disposed = false
    setStatus('loading')
    setError(null)
    setActionMessage(null)

    void memoryApi
      .getOverview()
      .then((nextSnapshot) => {
        if (disposed) {
          return
        }
        setSnapshot(nextSnapshot)
        setStatus('ready')
      })
      .catch((reason) => {
        if (disposed) {
          return
        }
        setStatus('error')
        setError(reason instanceof Error ? reason.message : String(reason))
      })

    return () => {
      disposed = true
    }
  }, [memoryApi])

  const rebuild = async (): Promise<void> => {
    if (!memoryApi) {
      return
    }

    setIsRebuilding(true)
    setActionMessage(null)
    setError(null)

    try {
      const result: StudioMemoryRebuildResult = await memoryApi.rebuild()
      setActionMessage(result.message)
      if (result.snapshot) {
        setSnapshot(result.snapshot)
        setStatus('ready')
      }
      if (!result.success) {
        setError(result.message)
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setIsRebuilding(false)
    }
  }

  return {
    status,
    snapshot,
    error,
    actionMessage,
    isRebuilding,
    rebuild,
  }
}
