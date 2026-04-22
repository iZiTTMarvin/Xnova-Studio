import { describe, expect, it } from 'vitest'
import {
  StudioBridgeValidationError,
  assertStudioNoPayload,
  parseStudioHostState,
  parseStudioOpenWorkspaceResponse,
  parseStudioRuntimeInspectRequest,
} from '../src/preload/studio-validators'

describe('studio preload validators', () => {
  it('拒绝多余参数与非法 runtime inspect payload', () => {
    expect(() => assertStudioNoPayload({ extra: true }, 'studio.host.getState')).toThrow(
      StudioBridgeValidationError,
    )

    expect(() => parseStudioRuntimeInspectRequest({ refresh: 'yes' })).toThrow(
      StudioBridgeValidationError,
    )
  })

  it('校验 host state 与 openWorkspace 响应结构', () => {
    expect(
      parseStudioHostState({
        workspacePath: 'D:/workspace/demo',
        lastSelection: {
          ok: true,
          code: 'selected',
          path: 'D:/workspace/demo',
        },
      }),
    ).toEqual({
      workspacePath: 'D:/workspace/demo',
      lastSelection: {
        ok: true,
        code: 'selected',
        path: 'D:/workspace/demo',
      },
    })

    expect(
      parseStudioOpenWorkspaceResponse({
        selection: {
          ok: false,
          code: 'cancelled',
          message: '用户取消了 workspace 目录选择',
        },
        state: {
          workspacePath: null,
          lastSelection: null,
        },
      }),
    ).toEqual({
      selection: {
        ok: false,
        code: 'cancelled',
        message: '用户取消了 workspace 目录选择',
      },
      state: {
        workspacePath: null,
        lastSelection: null,
      },
    })
  })
})
