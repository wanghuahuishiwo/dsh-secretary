import { useCallback, useEffect, useRef, useState } from 'react'
import type { TimeLayer } from './contract.ts'
import { WEEKDAY_LABELS, clock, durationLabel, weekdayOf, type DayRecord } from './model.ts'

/**
 * The only record container: a sheet pulled up from the bottom of the rail.
 * `recordId` absent means the parallel-record list; present means that record's
 * detail. Both views share one sheet, so closing always closes the whole sheet.
 */
export interface SheetTarget {
  readonly layer: TimeLayer
  readonly date: string
  readonly minute: number
  readonly recordId?: number
}

interface RecordsSheetProps {
  readonly target: SheetTarget
  /** Records covering `target.minute`, earliest first: the list the sheet drills into. */
  readonly records: readonly DayRecord[]
  readonly tagName: (id: number) => string
  readonly tagColor: (id: number) => string
  readonly busy: boolean
  readonly onClose: () => void
  readonly onBack: () => void
  readonly onOpenRecord: (recordId: number) => void
  readonly onNoteChange: (record: DayRecord, note: string | undefined) => void
  readonly onDelete: (record: DayRecord) => void
}

const NOTE_DEBOUNCE_MS = 400
const DISMISS_DRAG_PX = 64

function weekdayLabel(date: string): string {
  return WEEKDAY_LABELS[weekdayOf(date) - 1]
}

function noteOf(record: DayRecord): string {
  return record.note ?? ''
}

/** 备注输入即生效：400ms 防抖调用 updateBlock，没有保存按钮，写错靠 Undo。 */
export function RecordsSheet({
  target, records, tagName, tagColor, busy, onClose, onBack, onOpenRecord, onNoteChange, onDelete,
}: RecordsSheetProps) {
  const record = target.recordId === undefined
    ? undefined
    : records.find(item => item.id === target.recordId)
  const hasParent = records.length > 1

  const [note, setNote] = useState(() => (record === undefined ? '' : noteOf(record)))
  const noteRef = useRef(note)
  noteRef.current = note
  const savedRef = useRef(note)
  const noteSaveRef = useRef(onNoteChange)
  noteSaveRef.current = onNoteChange
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  const recordId = record?.id

  // 列表 → 详情的同一次渲染里就把输入切成该记录的备注，避免先渲染空值再被 effect 补上。
  const [openRecordId, setOpenRecordId] = useState(recordId)
  if (openRecordId !== recordId) {
    setOpenRecordId(recordId)
    const value = record === undefined ? '' : noteOf(record)
    setNote(value)
    noteRef.current = value
    savedRef.current = value
  }

  useEffect(() => {
    if (record === undefined || busy) return
    if (note === savedRef.current) return
    const timer = window.setTimeout(() => {
      savedRef.current = note
      noteSaveRef.current(record, note === '' ? undefined : note)
    }, NOTE_DEBOUNCE_MS)
    return () => { window.clearTimeout(timer) }
  }, [busy, note, record])

  /** 关闭、返回上一级前先把还在防抖窗口里的输入落盘。 */
  const flush = useCallback(() => {
    if (record === undefined) return
    if (noteRef.current === savedRef.current) return
    savedRef.current = noteRef.current
    noteSaveRef.current(record, noteRef.current === '' ? undefined : noteRef.current)
  }, [record])

  const dismiss = useCallback(() => {
    flush()
    closeRef.current()
  }, [flush])

  const back = useCallback(() => {
    flush()
    onBack()
  }, [flush, onBack])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') dismiss() }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey) }
  }, [dismiss])

  // 把把手向下拖过阈值即关闭整张 sheet；未过阈值回弹。
  const [dragOffset, setDragOffset] = useState(0)
  const offsetRef = useRef(0)
  const onGrabDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    const startY = event.clientY
    const move = (pointer: PointerEvent) => {
      const offset = Math.max(0, pointer.clientY - startY)
      offsetRef.current = offset
      setDragOffset(offset)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      const offset = offsetRef.current
      offsetRef.current = 0
      setDragOffset(0)
      if (offset >= DISMISS_DRAG_PX) dismiss()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <>
      <div className="tb-sheet-scrim" onClick={dismiss} />
      <div
        className="tb-sheet on"
        role="dialog"
        aria-label={record === undefined ? `${records.length} 条并行记录` : '记录详情'}
        style={dragOffset > 0 ? { transform: `translateY(${dragOffset}px)`, transition: 'none' } : undefined}
      >
        <div className="grab" role="separator" aria-label="向下拖动关闭" onPointerDown={onGrabDown} />

        {record === undefined ? (
          <>
            <div className="tb-sheet-head">
              <span className="tb-sheet-title">{records.length} 条并行记录</span>
              <span className="tb-sheet-sub">{weekdayLabel(target.date)} {clock(target.minute)}</span>
              <button className="tb-sheet-close" type="button" aria-label="关闭" onClick={dismiss}>×</button>
            </div>
            <div className="tb-sheet-body">
              {records.map(item => {
                const itemNote = noteOf(item)
                return (
                  <button
                    key={item.id}
                    className="tb-sheet-row"
                    type="button"
                    onClick={() => onOpenRecord(item.id)}
                  >
                    <i className="dot" style={{ background: tagColor(item.timeTagId) }} />
                    <span className="nm">{tagName(item.timeTagId)}</span>
                    <time>{clock(item.start)}–{clock(item.end)}</time>
                    <span className="dur">{durationLabel(item.end - item.start)}</span>
                    <span className="arrow" aria-hidden="true">›</span>
                    {itemNote !== '' && <span className="note-line">{itemNote}</span>}
                  </button>
                )
              })}
            </div>
          </>
        ) : (
          <>
            <div className="tb-sheet-head">
              {hasParent && (
                <button className="tb-sheet-back" type="button" aria-label={`返回 ${records.length} 条记录`} onClick={back}>
                  <span className="chev" aria-hidden="true">‹</span>
                  <span>{records.length} 条记录</span>
                </button>
              )}
              <i className="dot" style={{ background: tagColor(record.timeTagId) }} />
              <span className="tb-sheet-title">{tagName(record.timeTagId)}</span>
              <button className="tb-sheet-close" type="button" aria-label="关闭" onClick={dismiss}>×</button>
            </div>
            <div className="tb-sheet-meta">
              {weekdayLabel(target.date)} {clock(record.start)} – {clock(record.end)} · {durationLabel(record.end - record.start)}
            </div>
            <div className="tb-sheet-body">
              <input
                className="tb-note"
                placeholder="添加备注（输入即保存）"
                aria-label="备注"
                value={note}
                autoFocus
                onChange={event => setNote(event.target.value)}
              />
            </div>
            <div className="tb-sheet-actions">
              <button className="tb-del" type="button" disabled={busy} onClick={() => onDelete(record)}>删除记录</button>
            </div>
          </>
        )}
      </div>
    </>
  )
}
