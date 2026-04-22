import type {
  OpenWorkspaceResponse,
  RuntimeInspectRequest,
  StudioHostState,
  WorkspaceSelectionResult,
} from '../shared/studio-bridge-contract'

export class StudioBridgeValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StudioBridgeValidationError'
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertPlainObject(
  value: unknown,
  subject: string,
): Record<string, unknown> {
  if (!isPlainObject(value)) {
    throw new StudioBridgeValidationError(`${subject} 必须是对象。`)
  }

  return value
}

export function assertStudioNoPayload(
  payload: unknown,
  methodName: string,
): void {
  if (payload !== undefined) {
    throw new StudioBridgeValidationError(`${methodName} 不接受参数。`)
  }
}

export function parseStudioRuntimeInspectRequest(
  payload: unknown,
): RuntimeInspectRequest {
  if (payload === undefined) {
    return {}
  }

  const value = assertPlainObject(payload, 'runtime.inspect 参数')
  if (Object.keys(value).some((key) => key !== 'refresh')) {
    throw new StudioBridgeValidationError('runtime.inspect 只允许 refresh 字段。')
  }
  if (value.refresh !== undefined && typeof value.refresh !== 'boolean') {
    throw new StudioBridgeValidationError('runtime.inspect.refresh 必须是布尔值。')
  }

  return value.refresh === undefined ? {} : { refresh: value.refresh }
}

function parseWorkspaceSelectionResult(
  payload: unknown,
): WorkspaceSelectionResult {
  const value = assertPlainObject(payload, 'workspace 选择结果')

  if (value.ok === true) {
    if (value.code !== 'selected' || typeof value.path !== 'string') {
      throw new StudioBridgeValidationError('workspace 成功结果格式不合法。')
    }

    return {
      ok: true,
      code: 'selected',
      path: value.path,
    }
  }

  if (
    value.ok === false &&
    typeof value.code === 'string' &&
    ['cancelled', 'empty', 'invalid', 'error'].includes(value.code) &&
    typeof value.message === 'string'
  ) {
    return {
      ok: false,
      code: value.code as 'cancelled' | 'empty' | 'invalid' | 'error',
      message: value.message,
    }
  }

  throw new StudioBridgeValidationError('workspace 结果格式不合法。')
}

export function parseStudioHostState(payload: unknown): StudioHostState {
  const value = assertPlainObject(payload, 'host state')
  if (
    value.workspacePath !== null &&
    value.workspacePath !== undefined &&
    typeof value.workspacePath !== 'string'
  ) {
    throw new StudioBridgeValidationError('hostState.workspacePath 必须是字符串或 null。')
  }

  return {
    workspacePath:
      value.workspacePath === undefined ? null : (value.workspacePath as string | null),
    lastSelection:
      value.lastSelection === undefined || value.lastSelection === null
        ? null
        : parseWorkspaceSelectionResult(value.lastSelection),
  }
}

export function parseStudioOpenWorkspaceResponse(
  payload: unknown,
): OpenWorkspaceResponse {
  const value = assertPlainObject(payload, 'openWorkspace 响应')
  return {
    selection: parseWorkspaceSelectionResult(value.selection),
    state: parseStudioHostState(value.state),
  }
}
