import type { StudioBridgeApi } from '../shared/studio-bridge-contract'

declare global {
  interface Window {
    xnovaStudio?: StudioBridgeApi
  }
}

declare module '*.png' {
  const src: string
  export default src
}

declare module '*.svg' {
  const src: string
  export default src
}

export {}
