import { useEffect, useState } from 'react'
import type {
  StudioSkillsPluginsApi,
  StudioSkillsPluginsOverviewSnapshot,
} from '../../shared/studio-bridge-contract'

export interface UseSkillsPluginsOverviewResult {
  status: 'loading' | 'ready' | 'disabled' | 'error'
  snapshot: StudioSkillsPluginsOverviewSnapshot | null
  error: string | null
}

export function useSkillsPluginsOverview(
  api: StudioSkillsPluginsApi | null,
): UseSkillsPluginsOverviewResult {
  const [status, setStatus] = useState<'loading' | 'ready' | 'disabled' | 'error'>(
    api ? 'loading' : 'disabled',
  )
  const [snapshot, setSnapshot] = useState<StudioSkillsPluginsOverviewSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!api) {
      setStatus('disabled')
      setError('当前宿主桥接不可用，Skills / Plugins 状态暂时不可读取。')
      setSnapshot(null)
      return
    }

    let disposed = false
    setStatus('loading')
    setError(null)

    void api
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
  }, [api])

  return {
    status,
    snapshot,
    error,
  }
}
