import type { StudioModeId } from '../../shared/studio-bridge-contract'

export interface ModeSwitchProps {
  currentMode: StudioModeId
  allowedModes: StudioModeId[]
  onModeChange: (mode: StudioModeId) => void
}

const MODE_LABELS: Record<StudioModeId, string> = {
  standard: '标准模式',
  xforge: 'XForge',
}

const MODE_HINTS: Record<StudioModeId, string> = {
  standard: '标准聊天驱动工作流',
  xforge: '更强的编排与自动化策略',
}

/**
 * 顶部模式切换 — 精致 Pill Segmented Control
 *
 * - 顶部唯一主切换入口
 * - 视觉上像一组精致的 segmented control，不像大型 tab 页签
 * - hover / focus 时显示简短模式说明
 * - 共享同一项目、同一 workspace、同一上下文
 */
export function ModeSwitch(props: ModeSwitchProps) {
  return (
    <section className="mode-switch" aria-label="顶部模式切换">
      {(['standard', 'xforge'] as StudioModeId[]).map((mode) => {
        const isActive = props.currentMode === mode
        const isAllowed = props.allowedModes.includes(mode)

        return (
          <button
            key={mode}
            type="button"
            className={`mode-segment ${isActive ? 'mode-segment-active' : ''}`}
            data-hint={MODE_HINTS[mode]}
            onClick={() => {
              if (isAllowed) {
                props.onModeChange(mode)
              }
            }}
            disabled={!isAllowed}
            aria-pressed={isActive}
            title={MODE_HINTS[mode]}
          >
            {MODE_LABELS[mode]}
          </button>
        )
      })}
    </section>
  )
}
