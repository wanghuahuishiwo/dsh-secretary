import { useEffect, useState } from 'react'
import { CELL, clock, durationLabel, type DayRecord, type TimeTag } from './model.ts'

export interface SheetTarget {
  readonly layer: 'actual' | 'plan'
  readonly date: string
  readonly record: DayRecord
}

interface RecordSheetProps {
  readonly target: SheetTarget
  readonly tags: readonly TimeTag[]
  readonly busy: boolean
  readonly onClose: () => void
  readonly onSave: (patch: { start: number; end: number; timeTagId: number; note?: string }) => void
  readonly onDelete: () => void
}

/** 记录编辑浮层：调整时间、换标签、写备注、删除。 */
export function RecordSheet({ target, tags, busy, onClose, onSave, onDelete }: RecordSheetProps) {
  const [start, setStart] = useState(target.record.start)
  const [end, setEnd] = useState(target.record.end)
  const [tagId, setTagId] = useState(target.record.timeTagId)
  const [note, setNote] = useState(target.record.note ?? '')
  const timeTags = tags.filter(tag => tag.kind === 'time')

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey) }
  }, [onClose])

  return (
    <div className="tb-sheet on" role="dialog" aria-label="编辑记录">
      <div className="grab" />
      <div className="row">
        <span className="time">{clock(start)} – {clock(end)}</span>
        <span className="dur">{durationLabel(end - start)}</span>
        <span className="grow" />
        <button className="tb-step" type="button" disabled={end - start <= CELL} onClick={() => setStart(Math.max(0, start - CELL))}>−</button>
        <button className="tb-step" type="button" disabled={end >= 1440} onClick={() => setEnd(Math.min(1440, end + CELL))}>＋</button>
      </div>
      <div className="tb-picks">
        {timeTags.map(tag => (
          <button key={tag.id} type="button" className={tag.id === tagId ? 'on' : ''} style={{ background: tag.color ?? '#477bc7' }} onClick={() => setTagId(tag.id)}>{tag.name}</button>
        ))}
      </div>
      <input className="tb-note" placeholder="备注（可空）" value={note} onChange={event => setNote(event.target.value)} />
      <div className="tb-acts">
        <button className="tb-btn danger" type="button" disabled={busy} onClick={onDelete}>删除</button>
        <button className="tb-btn primary" type="button" disabled={busy} onClick={() => onSave({ start, end, timeTagId: tagId, note: note === '' ? undefined : note })}>完成</button>
      </div>
    </div>
  )
}
