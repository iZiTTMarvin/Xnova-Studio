import { contextBridge, ipcRenderer } from 'electron'
import { createStudioBridgeApi } from './studio-bridge-api'
import { STUDIO_BRIDGE_GLOBAL_KEY } from '../shared/studio-bridge-contract'

export function exposeStudioBridge(): void {
  try {
    const api = createStudioBridgeApi({
      ipcRenderer,
    })
    contextBridge.exposeInMainWorld(STUDIO_BRIDGE_GLOBAL_KEY, api)
  } catch (error) {
    console.error('[studio/preload] bridge 初始化失败', error)
  }
}

exposeStudioBridge()
