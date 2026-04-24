import { useEffect, useState } from 'react'
import type {
  StudioMcpApi,
  StudioMcpOverviewSnapshot,
  StudioMcpServerMutationInput,
} from '../../shared/studio-bridge-contract'

export interface UseMcpOverviewResult {
  status: 'loading' | 'ready' | 'disabled' | 'error'
  snapshot: StudioMcpOverviewSnapshot | null
  error: string | null
  actionMessage: string | null
  isMutating: boolean
  addServer: (input: StudioMcpServerMutationInput) => Promise<void>
  deleteServer: (name: string) => Promise<void>
}

export function useMcpOverview(
  mcpApi: StudioMcpApi | null,
): UseMcpOverviewResult {
  const [status, setStatus] = useState<'loading' | 'ready' | 'disabled' | 'error'>(
    mcpApi ? 'loading' : 'disabled',
  )
  const [snapshot, setSnapshot] = useState<StudioMcpOverviewSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [isMutating, setIsMutating] = useState(false)

  useEffect(() => {
    if (!mcpApi) {
      setStatus('disabled')
      setError('当前宿主桥接不可用，MCP 状态暂时不可读取。')
      setSnapshot(null)
      return
    }

    let disposed = false
    setStatus('loading')
    setError(null)
    setActionMessage(null)

    void mcpApi
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
  }, [mcpApi])

  const addServer = async (input: StudioMcpServerMutationInput): Promise<void> => {
    if (!mcpApi) {
      return
    }

    setIsMutating(true)
    setActionMessage(null)
    setError(null)

    try {
      const result = await mcpApi.addServer(input)
      setActionMessage(result.message)
      if (result.snapshot) {
        setSnapshot(result.snapshot)
      }
      if (!result.success) {
        setError(result.message)
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setIsMutating(false)
    }
  }

  const deleteServer = async (name: string): Promise<void> => {
    if (!mcpApi) {
      return
    }

    setIsMutating(true)
    setActionMessage(null)
    setError(null)

    try {
      const result = await mcpApi.deleteServer(name)
      setActionMessage(result.message)
      if (result.snapshot) {
        setSnapshot(result.snapshot)
      }
      if (!result.success) {
        setError(result.message)
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setIsMutating(false)
    }
  }

  return {
    status,
    snapshot,
    error,
    actionMessage,
    isMutating,
    addServer,
    deleteServer,
  }
}
