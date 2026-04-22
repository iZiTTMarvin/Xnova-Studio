import type { StudioBridgeApi } from '../shared/studio-bridge-contract'

declare global {
  interface Window {
    xnovaStudio?: StudioBridgeApi
  }
}

export {}
