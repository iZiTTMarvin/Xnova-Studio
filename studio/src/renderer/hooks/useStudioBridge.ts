import { useEffect, useState } from 'react'
import type {
  RuntimeInspectResult,
  StudioHostState,
  StudioRuntimeEvent,
} from '../../shared/studio-bridge-contract'

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function useStudioBridge() {
  const bridge = window.xnovaStudio ?? null
  const [hostStatus, setHostStatus] = useState<'loading' | 'ready' | 'disabled' | 'error'>(
    bridge ? 'loading' : 'disabled',
  )
  const [hostState, setHostState] = useState<StudioHostState>({
    workspacePath: null,
    lastSelection: null,
  })
  const [hostError, setHostError] = useState<string | null>(null)
  const [isOpeningWorkspace, setIsOpeningWorkspace] = useState(false)
  const [runtimeStatus, setRuntimeStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [runtimeResult, setRuntimeResult] = useState<RuntimeInspectResult | null>(null)
  const [lastRuntimeEvent, setLastRuntimeEvent] = useState<StudioRuntimeEvent | null>(null)

  useEffect(() => {
    if (!bridge) {
      setHostStatus('disabled')
      setHostError('宿主桥接不可用')
      return
    }

    let disposed = false
    setHostStatus('loading')
    setHostError(null)

    void bridge.host
      .getState()
      .then((state) => {
        if (disposed) {
          return
        }

        setHostState(state)
        setHostStatus('ready')
      })
      .catch((error) => {
        if (disposed) {
          return
        }

        setHostStatus('error')
        setHostError(getErrorMessage(error))
      })

    const unsubscribeHost = bridge.host.onStateChanged((state) => {
      if (disposed) {
        return
      }

      setHostState(state)
      setHostStatus('ready')
    })

    const unsubscribeRuntime = bridge.runtime.onEvent((event) => {
      if (disposed) {
        return
      }

      setLastRuntimeEvent(event)
    })

    return () => {
      disposed = true
      unsubscribeHost()
      unsubscribeRuntime()
    }
  }, [bridge])

  const openWorkspace = async (): Promise<void> => {
    if (!bridge) {
      return
    }

    setIsOpeningWorkspace(true)
    setHostError(null)

    try {
      const response = await bridge.host.openWorkspace()
      setHostState(response.state)
      if (!response.selection.ok && response.selection.code !== 'cancelled') {
        setHostError(response.selection.message)
      }
    } catch (error) {
      setHostStatus('error')
      setHostError(getErrorMessage(error))
    } finally {
      setIsOpeningWorkspace(false)
    }
  }

  const inspectRuntime = async (): Promise<void> => {
    if (!bridge) {
      return
    }

    setRuntimeStatus('loading')
    setRuntimeResult(null)

    try {
      const result = await bridge.runtime.inspect({
        refresh: true,
      })
      setRuntimeResult(result)
      setRuntimeStatus(result.ok ? 'success' : 'error')
    } catch (error) {
      setRuntimeStatus('error')
      setRuntimeResult({
        ok: false,
        error: getErrorMessage(error),
        workspacePath: hostState.workspacePath,
        configWarnings: [],
      })
    }
  }

  return {
    bridgeAvailable: bridge !== null,
    hostStatus,
    hostState,
    hostError,
    isOpeningWorkspace,
    openWorkspace,
    runtimeStatus,
    runtimeResult,
    lastRuntimeEvent,
    inspectRuntime,
  }
}
