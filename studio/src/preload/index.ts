import { contextBridge, ipcRenderer } from 'electron'
import { STUDIO_BRIDGE_GLOBAL_KEY } from '../shared/studio-bridge-contract'

export async function exposeStudioBridge(): Promise<void> {
  try {
    const { createStudioBridgeApi } = await import('./studio-bridge-api')
    const api = createStudioBridgeApi({
      ipcRenderer,
    })
    contextBridge.exposeInMainWorld(STUDIO_BRIDGE_GLOBAL_KEY, api)
  } catch (error) {
    console.error('[studio/preload] bridge 初始化失败', error)
  }
}

void exposeStudioBridge()
