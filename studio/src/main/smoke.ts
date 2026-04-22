import type { MainLogger } from './logger'

export interface SmokeConfig {
  enabled: boolean
  workspacePath: string | null
}

export interface SmokeWebContentsLike {
  executeJavaScript(script: string): Promise<unknown>
  once?(event: 'did-finish-load', listener: () => void): void
}

export function readSmokeConfig(env: NodeJS.ProcessEnv): SmokeConfig {
  return {
    enabled: env.STUDIO_SMOKE === '1',
    workspacePath: env.STUDIO_SMOKE_WORKSPACE?.trim() || null,
  }
}

export function buildSmokeScript(): string {
  return `
    (async () => {
      const bridge = window.xnovaStudio;
      if (!bridge) {
        throw new Error('window.xnovaStudio 不可用');
      }

      const initialState = await bridge.host.getState();
      const openWorkspace = await bridge.host.openWorkspace();
      const runtimeInspect = await bridge.runtime.inspect({ refresh: true });

      return {
        initialState,
        openWorkspace,
        runtimeInspect,
      };
    })();
  `
}

export async function runSmokeScenario(
  webContents: SmokeWebContentsLike,
  logger: Pick<MainLogger, 'info'>,
): Promise<void> {
  if (webContents.once) {
    await new Promise<void>((resolve) => {
      webContents.once?.('did-finish-load', () => {
        resolve()
      })
    })
  }

  const result = await webContents.executeJavaScript(buildSmokeScript())
  logger.info('Smoke 结果', result)
}
