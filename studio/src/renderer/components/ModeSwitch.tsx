import type { StudioModeId } from '../../shared/studio-bridge-contract'

export interface ModeSwitchProps {
  currentMode: StudioModeId
  allowedModes: StudioModeId[]
  onModeChange: (mode: StudioModeId) => void
}

export function ModeSwitch(props: ModeSwitchProps) {
  return (
    <section className="mode-switch" aria-label="顶部模式切换">
      <div className="mode-switch-copy">
        <span className="mode-switch-label">模式</span>
        <strong>{props.currentMode === 'standard' ? 'Standard' : 'XForge'}</strong>
      </div>
      <div className="mode-switch-actions">
        {(['standard', 'xforge'] as StudioModeId[]).map((mode) => (
          <button
            key={mode}
            type="button"
            className={`mode-switch-button ${
              props.currentMode === mode ? 'mode-switch-button-active' : ''
            }`}
            onClick={() => {
              props.onModeChange(mode)
            }}
            disabled={!props.allowedModes.includes(mode)}
            aria-pressed={props.currentMode === mode}
          >
            {mode === 'standard' ? 'Standard' : 'XForge'}
          </button>
        ))}
      </div>
    </section>
  )
}
