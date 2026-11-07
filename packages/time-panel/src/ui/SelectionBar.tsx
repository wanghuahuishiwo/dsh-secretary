import type { DayRecord } from './model.ts'

const ERASER = <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M5.5 3h7v9h-7l-3.5-4.5z" /><path d="M8 6l3 3M11 6l-3 3" /></svg>

interface SelectionBarProps {
  readonly totalMinutes: number
  readonly whole: { readonly date: string; readonly record: DayRecord } | undefined
  readonly busy: boolean
  readonly hasRuns: boolean
  readonly tagName: (id: number) => string
  readonly tagColor: (id: number) => string
  readonly onEdit: (date: string, record: DayRecord) => void
  readonly onClear: () => void
  readonly onErase: () => void
}

/** 底部选区栏：分钟统计、整条记录识别、备注入口、不选与橡皮。 */
export function SelectionBar({ totalMinutes, whole, busy, hasRuns, tagName, tagColor, onEdit, onClear, onErase }: SelectionBarProps) {
  return (
    <div className="sec-status" style={{ visibility: totalMinutes > 0 ? 'visible' : 'hidden' }} aria-hidden={totalMinutes === 0}>
      <span>
        {whole === undefined
          ? <>选择了 <b>{totalMinutes}</b> 分钟</>
          : (
            <span className="sec-chip">
              <i style={{ background: tagColor(whole.record.timeTagId) }} />
              {tagName(whole.record.timeTagId)}{whole.record.note === undefined || whole.record.note === '' ? '' : ` · ${whole.record.note}`}
            </span>
          )
        }
      </span>
      <span className="grow" />
      {whole !== undefined && (
        <button className="sec-sb" type="button" disabled={busy} onClick={() => onEdit(whole.date, whole.record)}>备注</button>
      )}
      <button className="sec-sb" type="button" onClick={onClear}>不选</button>
      <button className="sec-sb erase" type="button" disabled={busy || !hasRuns} onClick={onErase}>{ERASER}橡皮</button>
    </div>
  )
}
