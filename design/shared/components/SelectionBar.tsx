import { CELL_MINUTES, formatDuration } from '../model/time.ts'

interface SelectionBarProps {
  readonly count: number
  readonly busy: boolean
  readonly onClear: () => void
  readonly onErase: () => void
}

export function SelectionBar({ count, busy, onClear, onErase }: SelectionBarProps) {
  const minutes = count * CELL_MINUTES
  return (
    <footer className={`tb-selection-bar${count > 0 ? ' has-selection' : ''}`} data-testid="selection-bar" data-minutes={minutes}>
      {count > 0 ? (
        <>
          <span className="tb-selection-summary">
            <strong>{formatDuration(minutes)}</strong>
            <span>{count} 格</span>
          </span>
          <span className="tb-selection-spacer" />
          <button type="button" data-testid="clear-selection" disabled={busy} onClick={onClear}>不选</button>
          <button type="button" className="tb-erase-button" data-testid="erase-selection" disabled={busy} onClick={onErase}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.35" aria-hidden="true"><path d="M5.5 3h7v9h-7L2 7.5 5.5 3Z" /><path d="m8 6 3 3M11 6l-3 3" /></svg>
            橡皮
          </button>
        </>
      ) : (
        <>
          <span>点选或拖动时间格</span>
          <span className="tb-selection-spacer" />
          <span className="tb-grid-unit">10 分钟 / 格</span>
        </>
      )}
    </footer>
  )
}
