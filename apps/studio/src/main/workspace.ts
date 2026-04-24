import path from 'node:path'
import type { BrowserWindow, OpenDialogOptions, OpenDialogReturnValue } from 'electron'
import type { MainLogger } from './logger'
import type { WorkspaceSelectionResult } from '../shared/studio-bridge-contract'

export interface WorkspaceDialog {
  showOpenDialog(
    browserWindow: BrowserWindow | undefined,
    options: OpenDialogOptions,
  ): Promise<OpenDialogReturnValue>
}

export interface WorkspaceFileSystem {
  stat(targetPath: string): Promise<{
    isDirectory(): boolean
  }>
}

export interface SelectWorkspaceDirectoryOptions {
  browserWindow?: BrowserWindow
  dialog: WorkspaceDialog
  fileSystem: WorkspaceFileSystem
  logger: Pick<MainLogger, 'info' | 'warn' | 'error'>
}

export async function selectWorkspaceDirectory(
  options: SelectWorkspaceDirectoryOptions,
): Promise<WorkspaceSelectionResult> {
  let selection: OpenDialogReturnValue

  try {
    selection = await options.dialog.showOpenDialog(options.browserWindow, {
      buttonLabel: '打开 Workspace',
      properties: ['openDirectory'],
      title: '选择 Workspace 目录',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    options.logger.error('workspace 目录选择失败', error)
    return {
      ok: false,
      code: 'error',
      message: `workspace 目录选择失败: ${message}`,
    }
  }

  if (selection.canceled) {
    options.logger.info('用户取消了 workspace 目录选择')
    return {
      ok: false,
      code: 'cancelled',
      message: '用户取消了 workspace 目录选择',
    }
  }

  const selectedPath = selection.filePaths[0]?.trim()

  if (!selectedPath) {
    options.logger.warn('workspace 目录选择结果为空')
    return {
      ok: false,
      code: 'empty',
      message: 'workspace 目录选择结果为空',
    }
  }

  if (!path.isAbsolute(selectedPath)) {
    options.logger.warn('workspace 目录路径无效', selectedPath)
    return {
      ok: false,
      code: 'invalid',
      message: `workspace 目录路径无效: ${selectedPath}`,
    }
  }

  try {
    const statResult = await options.fileSystem.stat(selectedPath)

    if (!statResult.isDirectory()) {
      options.logger.warn('workspace 目录路径无效', selectedPath)
      return {
        ok: false,
        code: 'invalid',
        message: `workspace 目录路径无效: ${selectedPath}`,
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    options.logger.error('workspace 目录校验失败', error)
    return {
      ok: false,
      code: 'error',
      message: `workspace 目录校验失败: ${message}`,
    }
  }

  options.logger.info('workspace 目录选择成功', { path: selectedPath })
  return {
    ok: true,
    code: 'selected',
    path: selectedPath,
  }
}
