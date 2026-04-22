import { describe, expect, it } from 'vitest'
import { buildSmokeScript, readSmokeConfig } from '../src/main/smoke'

describe('smoke helpers', () => {
  it('从环境变量读取 smoke 开关与预置 workspace', () => {
    expect(
      readSmokeConfig({
        STUDIO_SMOKE: '1',
        STUDIO_SMOKE_WORKSPACE: 'D:/workspace/demo',
      }),
    ).toEqual({
      enabled: true,
      workspacePath: 'D:/workspace/demo',
    })

    expect(readSmokeConfig({})).toEqual({
      enabled: false,
      workspacePath: null,
    })
  })

  it('smoke 脚本会驱动 host.getState/openWorkspace/runtime.inspect', () => {
    const script = buildSmokeScript()

    expect(script).toContain('window.xnovaStudio')
    expect(script).toContain('bridge.host.getState()')
    expect(script).toContain('bridge.host.openWorkspace()')
    expect(script).toContain('bridge.runtime.inspect({ refresh: true })')
  })
})
