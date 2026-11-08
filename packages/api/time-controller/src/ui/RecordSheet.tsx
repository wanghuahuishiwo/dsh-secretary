import { useEffect, useState } from 'react'
import { clock, durationLabel, type DayRecord } from './model.ts'

export interface SheetTarget {
  readonly layer: 'actual' | 'plan'
  readonly date: string
  readonly record: DayRecord
}

interface RecordSheetProps {
  readonly target: SheetTarget
  readonly busy: boolean
  readonly onClose: () => void
  readonly onSave: (note: string | undefined) => void
  readonly onDelete: () => void
}

/** 备注编辑浮层：只写备注和删除；换标签走标签架，调时间靠重画。 */
export function RecordSheet({ target, busy, onClose, onSave, onDelete }: RecordSheetProps) {
  const [note, setNote] = useState(target.record.note ?? '')

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey) }
  }, [onClose])

  return (
    <div className="tb-sheet on" role="dialog" aria-label="编辑备注">
      <div className="grab" />
      <div className="row">
        <span className="time">{clock(target.record.start)} – {clock(target.record.end)}</span>
        <span className="dur">{durationLabel(target.record.end - target.record.start)}</span>
      </div>
      <input
        className="tb-note"
        placeholder="备注（可空）"
        value={note}
        autoFocus
        onChange={event => setNote(event.target.value)}
        onKeyDown={event => { if (event.key === 'Enter') onSave(note === '' ? undefined : note) }}
      />
      <div className="tb-acts">
        <button className="tb-btn danger" type="button" disabled={busy} onClick={onDelete}>删除</button>
        <button className="tb-btn primary" type="button" disabled={busy} onClick={() => onSave(note === '' ? undefined : note)}>完成</button>
      </div>
    </div>
  )
}
