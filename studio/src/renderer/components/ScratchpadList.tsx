import type { StudioScratchpadEntry } from '../../shared/studio-bridge-contract'

export interface ScratchpadListProps {
  entries: StudioScratchpadEntry[]
}

export function ScratchpadList(props: ScratchpadListProps) {
  return (
    <section className="scratchpad-list" aria-label="Scratchpad 聊天列表">
      {props.entries.length === 0 ? (
        <div className="sidebar-block-state sidebar-block-state-empty">
          <p>全局聊天只保留 scratchpad 语义。</p>
        </div>
      ) : (
        <div className="tree-list">
          {props.entries.map((entry) => (
            <div key={entry.id} className="tree-item">
              <strong>{entry.title}</strong>
              <span>{entry.updatedAt ?? '未开始'}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
