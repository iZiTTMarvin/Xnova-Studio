import { describe, expect, it } from 'vitest'
import { createMainWindowOptions, resolveRendererTarget } from '../src/main/app-shell'

describe('studio app shell helpers', () => {
  it('为主窗口提供最小安全默认值', () => {
    const options = createMainWindowOptions('C:/studio/preload/index.js')

    expect(options.title).toBe('Xnova Studio')
    expect(options.width).toBe(1280)
    expect(options.height).toBe(800)
    expect(options.webPreferences?.preload).toBe('C:/studio/preload/index.js')
    expect(options.webPreferences?.contextIsolation).toBe(true)
    expect(options.webPreferences?.nodeIntegration).toBe(false)
    expect(options.webPreferences?.sandbox).toBe(true)
  })

  it('开发模式优先返回 dev server 地址', () => {
    const target = resolveRendererTarget({
      devServerUrl: 'http://127.0.0.1:5173',
      rendererHtmlPath: 'dist/renderer/index.html',
    })

    expect(target).toEqual({
      type: 'url',
      value: 'http://127.0.0.1:5173',
    })
  })

  it('非开发模式回退到本地构建产物', () => {
    const target = resolveRendererTarget({
      rendererHtmlPath: 'dist/renderer/index.html',
    })

    expect(target).toEqual({
      type: 'file',
      value: 'dist/renderer/index.html',
    })
  })
})
