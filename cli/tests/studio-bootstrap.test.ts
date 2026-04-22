import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const repoRoot = path.resolve(import.meta.dirname, '..', '..')
const studioRoot = path.join(repoRoot, 'studio')

function readStudioFile(relativePath: string): string {
  return readFileSync(path.join(studioRoot, relativePath), 'utf8')
}

describe('Phase 4 Task A studio bootstrap', () => {
  it('提供独立 studio 工程脚本与依赖入口', () => {
    expect(existsSync(path.join(studioRoot, 'package.json'))).toBe(true)

    const packageJson = JSON.parse(readStudioFile('package.json')) as {
      scripts?: Record<string, string>
      devDependencies?: Record<string, string>
      dependencies?: Record<string, string>
    }

    expect(packageJson.scripts).toMatchObject({
      dev: expect.any(String),
      build: expect.any(String),
      typecheck: expect.any(String),
      test: expect.any(String),
    })

    expect(packageJson.devDependencies?.['electron']).toBeTruthy()
    expect(packageJson.devDependencies?.['electron-vite']).toBeTruthy()
    expect(packageJson.devDependencies?.['typescript']).toBeTruthy()
    expect(packageJson.devDependencies?.['vitest']).toBeTruthy()
    expect(packageJson.dependencies?.['react']).toBeTruthy()
    expect(packageJson.dependencies?.['react-dom']).toBeTruthy()
  })

  it('落定 main、preload、renderer 入口文件与构建配置', () => {
    const requiredFiles = [
      'electron.vite.config.ts',
      'tsconfig.json',
      'src/main/index.ts',
      'src/preload/index.ts',
      'src/renderer/index.html',
      'src/renderer/main.tsx',
    ]

    for (const file of requiredFiles) {
      expect(existsSync(path.join(studioRoot, file)), file).toBe(true)
    }
  })

  it('保持 Phase 4 分层边界：不复制 CLI host，renderer 不直连宿主底层能力', () => {
    const mainEntry = readStudioFile('src/main/index.ts')
    const preloadEntry = readStudioFile('src/preload/index.ts')
    const rendererEntry = readStudioFile('src/renderer/main.tsx')
    const rendererApp = readStudioFile('src/renderer/App.tsx')

    expect(mainEntry).not.toMatch(/cli\/src\/host\/cli/i)
    expect(mainEntry).not.toMatch(/core\/bootstrap/i)
    expect(mainEntry).not.toMatch(/createRuntime/i)

    expect(preloadEntry).not.toMatch(/cli\/src\/host\/cli/i)
    expect(preloadEntry).not.toMatch(/core\/bootstrap/i)

    for (const content of [rendererEntry, rendererApp]) {
      expect(content).not.toMatch(/cli\/src\/host\/cli/i)
      expect(content).not.toMatch(/core\/bootstrap/i)
      expect(content).not.toMatch(/showOpenDialog/i)
      expect(content).not.toMatch(/node:fs/i)
      expect(content).not.toMatch(/child_process/i)
    }
  })
})
