import type { BrowserWindowConstructorOptions } from 'electron'

export interface RendererTargetInput {
  devServerUrl?: string
  rendererHtmlPath: string
}

export interface RendererTarget {
  type: 'url' | 'file'
  value: string
}

export function createMainWindowOptions(preloadPath: string): BrowserWindowConstructorOptions {
  return {
    title: 'Xnova Studio',
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  }
}

export function resolveRendererTarget(input: RendererTargetInput): RendererTarget {
  if (input.devServerUrl) {
    return {
      type: 'url',
      value: input.devServerUrl,
    }
  }

  return {
    type: 'file',
    value: input.rendererHtmlPath,
  }
}
