import { useMemo } from 'react'
import type { RuntimeInspectResult, StudioHostState, StudioShellSnapshot } from '../../shared/studio-bridge-contract'

export type SettingsToolsPageStatus = 'loading' | 'empty' | 'error' | 'disabled' | 'ready'

export interface SettingsToolsHighlightItem {
  label: string
  value: string
}

export interface SettingsToolsSectionCardViewModel {
  id: string
  title: string
  status: SettingsToolsPageStatus
  summary: string
  detail: string
}

export interface SettingsToolsPageViewModel {
  eyebrow: string
  title: string
  description: string
  status: SettingsToolsPageStatus
  statusMessage: string
  highlights: SettingsToolsHighlightItem[]
  sections: SettingsToolsSectionCardViewModel[]
  warnings: string[]
}

export interface UseSettingsToolsPageModelInput {
  hostStatus: 'loading' | 'ready' | 'disabled' | 'error'
  hostState: StudioHostState
  hostError: string | null
  shellStatus: 'loading' | 'ready' | 'disabled' | 'error'
  shellSnapshot: StudioShellSnapshot | null
  shellError: string | null
  runtimeStatus: 'loading' | 'ready' | 'disabled' | 'error'
  runtimeInspectResult: RuntimeInspectResult | null
  runtimeError: string | null
}

function derivePageStatus(
  input: UseSettingsToolsPageModelInput,
): SettingsToolsPageStatus {
  if (
    input.hostStatus === 'disabled' ||
    input.shellStatus === 'disabled' ||
    input.runtimeStatus === 'disabled'
  ) {
    return 'disabled'
  }

  if (
    input.hostStatus === 'loading' ||
    input.shellStatus === 'loading' ||
    input.runtimeStatus === 'loading'
  ) {
    return 'loading'
  }

  if (
    input.hostStatus === 'error' ||
    input.shellStatus === 'error' ||
    input.runtimeStatus === 'error'
  ) {
    return 'error'
  }

  if (!input.hostState.workspacePath) {
    return 'empty'
  }

  return 'ready'
}

function getPrimaryErrorMessage(input: UseSettingsToolsPageModelInput): string {
  return input.runtimeError ?? input.shellError ?? input.hostError ?? '未知错误'
}

function getSettingsStatusMessage(
  status: SettingsToolsPageStatus,
  input: UseSettingsToolsPageModelInput,
): string {
  switch (status) {
    case 'loading':
      return '正在读取桌面主壳配置状态…'
    case 'disabled':
      return '当前宿主桥接不可用，设置能力暂时不可读取。'
    case 'error':
      return `设置状态读取失败：${getPrimaryErrorMessage(input)}`
    case 'empty':
      return '尚未绑定 Workspace，当前只展示全局设置骨架。'
    case 'ready':
      return '桌面设置壳已接入，后续子任务会把 Provider / Memory 详情逐步填充进来。'
  }
}

function getToolsStatusMessage(
  status: SettingsToolsPageStatus,
  input: UseSettingsToolsPageModelInput,
): string {
  switch (status) {
    case 'loading':
      return '正在读取桌面工具状态…'
    case 'disabled':
      return '当前宿主桥接不可用，工具状态暂时不可读取。'
    case 'error':
      return `运行时状态读取失败：${getPrimaryErrorMessage(input)}`
    case 'empty':
      return '尚未绑定 Workspace，当前只展示工具壳与管理入口。'
    case 'ready':
      return '桌面工具壳已接入，状态卡片会在后续子任务中逐步补齐。'
  }
}

function dedupeWarnings(input: UseSettingsToolsPageModelInput): string[] {
  const warnings = new Set<string>()

  for (const warning of input.shellSnapshot?.warnings ?? []) {
    warnings.add(warning)
  }

  for (const warning of input.runtimeInspectResult?.configWarnings ?? []) {
    warnings.add(warning)
  }

  if (input.runtimeInspectResult?.ok) {
    for (const warning of input.runtimeInspectResult.snapshot.warnings) {
      warnings.add(warning)
    }
  }

  return [...warnings]
}

function getProviderLabel(input: UseSettingsToolsPageModelInput): string | null {
  if (input.runtimeInspectResult?.ok) {
    return input.runtimeInspectResult.snapshot.provider
  }

  return input.shellSnapshot?.defaults.providerId ?? null
}

function getModelLabel(input: UseSettingsToolsPageModelInput): string | null {
  if (input.runtimeInspectResult?.ok) {
    return input.runtimeInspectResult.snapshot.model
  }

  return input.shellSnapshot?.defaults.modelId ?? null
}

function getRuntimeHealthLabel(input: UseSettingsToolsPageModelInput): string {
  if (input.runtimeInspectResult?.ok) {
    return input.runtimeInspectResult.snapshot.isRunning ? '运行中' : '已连接'
  }

  switch (input.runtimeStatus) {
    case 'loading':
      return '检查中'
    case 'disabled':
      return '不可用'
    case 'error':
      return '异常'
    default:
      return '待接入'
  }
}

function toDeferredSectionStatus(
  status: SettingsToolsPageStatus,
): SettingsToolsPageStatus {
  return status === 'ready' ? 'empty' : status
}

function createSettingsSections(
  status: SettingsToolsPageStatus,
  input: UseSettingsToolsPageModelInput,
): SettingsToolsSectionCardViewModel[] {
  const provider = getProviderLabel(input)
  const model = getModelLabel(input)
  const providerStatus =
    status === 'ready' && (provider || model) ? 'ready' : status === 'ready' ? 'empty' : status

  return [
    {
      id: 'providers',
      title: 'Provider 与模型',
      status: providerStatus,
      summary:
        providerStatus === 'loading'
          ? '等待宿主返回当前默认 Provider 与模型。'
          : providerStatus === 'disabled'
            ? '宿主桥接未连接，无法读取当前 Provider 默认值。'
            : providerStatus === 'error'
              ? '未能读取当前 Provider 状态。'
              : providerStatus === 'empty'
                ? '已进入桌面设置壳，等待 Provider / TOML 表单接入。'
                : `当前默认值：${provider ?? '未配置'} / ${model ?? '未配置'}`,
      detail: '下一子任务将接入 config.toml / project.toml、默认 Provider / Model 与 test connection。',
    },
    {
      id: 'memory',
      title: 'Memory',
      status: toDeferredSectionStatus(status),
      summary:
        status === 'loading'
          ? '正在准备 Memory 概览骨架。'
          : status === 'disabled'
            ? '宿主不可用时无法读取 Memory 相关状态。'
            : status === 'error'
              ? 'Memory 状态读取失败，已阻止静默降级。'
              : status === 'empty'
                ? '尚未绑定 Workspace，当前仅展示全局 Memory 入口。'
                : 'Memory 概览、降级提示与 rebuild 入口将在后续子任务接入。',
      detail: '本子任务只建立骨架，不提前实现概览统计、降级详情或 rebuild 流程。',
    },
  ]
}

function createToolsSections(
  status: SettingsToolsPageStatus,
): SettingsToolsSectionCardViewModel[] {
  return [
    {
      id: 'mcp',
      title: 'MCP 状态',
      status: toDeferredSectionStatus(status),
      summary:
        status === 'loading'
          ? '正在准备 MCP 状态卡片骨架。'
          : status === 'disabled'
            ? '宿主不可用时无法读取 MCP 连接状态。'
            : status === 'error'
              ? 'MCP 状态读取失败，错误不会再以 silent failure 方式隐藏。'
              : status === 'empty'
                ? '尚未绑定 Workspace，当前仅展示管理入口占位。'
                : 'MCP 状态卡片与管理入口将在后续子任务接入。',
      detail: '后续只补状态卡片与管理入口，不扩成第二套重型运维后台。',
    },
    {
      id: 'skills-plugins',
      title: 'Skills / Plugins',
      status: toDeferredSectionStatus(status),
      summary:
        status === 'loading'
          ? '正在准备 Skills / Plugins 分布骨架。'
          : status === 'disabled'
            ? '宿主不可用时无法读取 Skills / Plugins 来源分布。'
            : status === 'error'
              ? 'Skills / Plugins 状态读取失败，错误已显式暴露。'
              : status === 'empty'
                ? '尚未绑定 Workspace，当前仅展示分布与管理入口占位。'
                : 'Skills / Plugins 状态卡片、来源分布与管理入口将在后续子任务接入。',
      detail: '后续子任务会补来源分布、最近/常用展示与管理入口，不回退成旧 Web 管理壳。',
    },
  ]
}

export function useSettingsToolsPageModel(
  input: UseSettingsToolsPageModelInput,
): {
  settingsPage: SettingsToolsPageViewModel
  toolsPage: SettingsToolsPageViewModel
} {
  return useMemo(() => {
    const status = derivePageStatus(input)
    const warnings = dedupeWarnings(input)
    const provider = getProviderLabel(input)
    const model = getModelLabel(input)

    return {
      settingsPage: {
        eyebrow: '设置',
        title: '设置与配置',
        description: '把全局配置与项目默认值收进桌面主壳，而不是继续散落在旧 Web 页面里。',
        status,
        statusMessage: getSettingsStatusMessage(status, input),
        highlights: [
          {
            label: '当前 Workspace',
            value: input.hostState.workspacePath ?? '全局设置',
          },
          {
            label: '当前 Provider',
            value: provider ?? '待接入',
          },
          {
            label: '当前模型',
            value: model ?? '待接入',
          },
        ],
        sections: createSettingsSections(status, input),
        warnings,
      },
      toolsPage: {
        eyebrow: '工具',
        title: '工具状态与管理入口',
        description: 'MCP、Skills、Plugins 会以状态卡片进入主壳，而不是另起一套桌面运维后台。',
        status,
        statusMessage: getToolsStatusMessage(status, input),
        highlights: [
          {
            label: '当前 Workspace',
            value: input.hostState.workspacePath ?? '未绑定',
          },
          {
            label: '运行时状态',
            value: getRuntimeHealthLabel(input),
          },
          {
            label: '告警数量',
            value: String(warnings.length),
          },
        ],
        sections: createToolsSections(status),
        warnings,
      },
    }
  }, [input])
}
