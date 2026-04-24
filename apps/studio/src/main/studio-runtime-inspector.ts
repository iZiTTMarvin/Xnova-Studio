import { ConfigManager, type CCodeConfig } from '@config/config-manager.js'
import {
  inspectRuntimeConfig,
  type RuntimeInspectSnapshot,
  type RuntimeSnapshot,
} from '@xnova/runtime'
import type {
  RuntimeInspectRequest,
  RuntimeInspectResult,
  StudioHostState,
} from '../shared/studio-bridge-contract'

export interface StudioRuntimeInspector {
  inspect(
    request: RuntimeInspectRequest,
    hostState: StudioHostState,
  ): Promise<RuntimeInspectResult>
}

export interface CreateStudioRuntimeInspectorOptions {
  configManager?: Pick<ConfigManager, 'load' | 'getLastWarnings'>
  inspectRuntimeConfig?: (input: { config: CCodeConfig }) => RuntimeInspectSnapshot
  getRuntimeSnapshot?: (
    hostState: StudioHostState,
  ) => RuntimeSnapshot | RuntimeInspectSnapshot | null
}

export function createStudioRuntimeInspector(
  options: CreateStudioRuntimeInspectorOptions = {},
): StudioRuntimeInspector {
  const configManager = options.configManager ?? new ConfigManager()
  const runtimeInspector = options.inspectRuntimeConfig ?? inspectRuntimeConfig

  return {
    async inspect(_request, hostState) {
      try {
        const liveRuntimeSnapshot = options.getRuntimeSnapshot?.(hostState)
        const snapshot =
          liveRuntimeSnapshot ??
          runtimeInspector({
            config: configManager.load(),
          })
        const configWarnings = configManager.getLastWarnings()
        const issues =
          hostState.workspacePath === null
            ? [
                {
                  code: 'runtime-not-ready' as const,
                  severity: 'warning' as const,
                  message: '当前尚未绑定 Workspace，runtime 未就绪。',
                },
              ]
            : []

        return {
          ok: true,
          status: issues.length > 0 ? 'not-ready' : 'ready',
          snapshot: {
            sessionId: snapshot.sessionId,
            isRunning: snapshot.isRunning,
            provider: snapshot.provider,
            model: snapshot.model,
            warnings: [...snapshot.warnings],
          },
          workspacePath: hostState.workspacePath,
          configWarnings,
          issues,
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return {
          ok: false,
          status: 'error',
          error: `runtime inspect 失败: ${message}`,
          workspacePath: hostState.workspacePath,
          configWarnings: configManager.getLastWarnings(),
          issues: [],
        }
      }
    },
  }
}
