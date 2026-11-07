import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CELL, MAX_ROW_H, MIN_ROW_H, PER_HOUR, WEEKDAY_LABELS,
  durationLabel, minutesOfRecord, recordAt, runsOf, snapDown, tagInitials,
  type DayRecord, type Run, type TimeTag,
} from './model.ts'
import { TagShelf } from './TagShelf.tsx'

interface Props {
  readonly layer: 'actual' | 'plan'
  readonly days: readonly string[]
  readonly today: string
  readonly nowMinute: number
  readonly focus: { readonly date: string; readonly token: number }
  readonly onExtend: (side: 'before' | 'after') => void
  readonly onTopDateChange: (date: string) => void
  /** Already sliced onto each local day by the Adapter; the canvas never re-derives days. */
  readonly records: ReadonlyMap<string, readonly DayRecord[]>
  readonly tags: readonly TimeTag[]
  readonly busy: boolean
  readonly onAssign: (runs: readonly Run[], tagId: number | null) => void
  readonly onEdit: (date: string, record: DayRecord) => void
}

interface DragState {
  readonly date: string
  readonly minute: number
  moved: boolean
  readonly wasSelected: boolean
}

const FALLBACK_COLOR = '#477bc7'
const CHECK = <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M2.5 6.4l2.3 2.3L9.5 3.7" /></svg>

/** Selection runs never cross an hour boundary: each hour row draws its own box. */
function splitByHour(runs: readonly Run[]): Run[] {
  const out: Run[] = []
  for (const run of runs) {
    let start = run.start
    while (start < run.end) {
      const hourEnd = (Math.floor(start / 60) + 1) * 60
      const end = Math.min(run.end, hourEnd)
      out.push({ date: run.date, start, end })
      start = end
    }
  }
  return out
}

/** One day column: the date mark, the hour scale, the ten-minute grid, its blocks and its selection. */
const DayColumn = memo(function DayColumn({
  day, rowH, today, records, selected, nowMin, tagName, tagColor, onCellDown, onBlockEdit,
}: {
  day: string
  rowH: number
  today: string
  records: readonly DayRecord[]
  selected: ReadonlySet<number> | undefined
  nowMin: number | undefined
  tagName: (id: number) => string
  tagColor: (id: number) => string
  onCellDown: (event: React.PointerEvent<HTMLDivElement>) => void
  onBlockEdit: (date: string, record: DayRecord) => void
}) {
  const date = new Date(`${day}T12:00:00`)
  const height = 24 * rowH
  const cells = Array.from({ length: 24 * PER_HOUR }, (_, index) => ({
    minute: Math.floor(index / PER_HOUR) * 60 + (index % PER_HOUR) * CELL,
    last: index % PER_HOUR === PER_HOUR - 1,
  }))
  const selRuns = selected === undefined ? [] : splitByHour(runsOf(day, [...selected]))

  const onCellContextMenu = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    const minute = Number(target.dataset.min)
    if (!Number.isFinite(minute)) return
    const record = recordAt(records, minute)
    if (record === undefined) return
    event.preventDefault()
    onBlockEdit(day, record)
  }, [records, day, onBlockEdit])

  return (
    <div className="tb-day" data-day={day} style={{ height }}>
      <div className="tb-gutter">
        <div className="tb-datemark">
          <span className="m">{date.getMonth() + 1}月</span>
          <span className="d">{date.getDate()}</span>
          <span className="w">{WEEKDAY_LABELS[(date.getDay() + 6) % 7]}</span>
          {day === today && <span className="t today">今天</span>}
        </div>
      </div>
      <div className="tb-hours" style={{ height }}>
        {Array.from({ length: 24 }, (_, hour) => (
          <span key={hour} className={nowMin !== undefined && hour === Math.floor(nowMin / 60) ? 'now' : ''} style={{ top: hour * rowH + 4 }}>{hour}</span>
        ))}
      </div>
      <div className="tb-grid" data-day={day} style={{ height }}>
        <div className="tb-cells" style={{ gridAutoRows: `${rowH}px` }} onPointerDown={onCellDown} onContextMenu={onCellContextMenu}>
          {cells.map(cell => (
            <div key={cell.minute} className={`tb-cell${cell.last ? ' hourlast' : ''}`} data-day={day} data-min={cell.minute} />
          ))}
        </div>
        <div className="tb-blocks">
          {records.map(record => {
            const fullName = tagName(record.timeTagId)
            const shortLabel = record.note === undefined || record.note === '' ? tagInitials(fullName) : record.note
            const tooltip = record.note === undefined || record.note === '' ? fullName : `${fullName} · ${record.note}`
            const color = tagColor(record.timeTagId)
            const nodes = []
            for (let minute = snapDown(record.start); minute < record.end; minute += CELL) {
              nodes.push(
                <div
                  key={`${record.id}:${minute}`}
                  className="tb-blk"
                  style={{
                    left: `calc(${(((minute % 60) / CELL) / PER_HOUR) * 100}% + 0.5px)`,
                    width: `calc(${100 / PER_HOUR}% - 1px)`,
                    top: Math.floor(minute / 60) * rowH + 0.5,
                    height: rowH - 1,
                    background: color,
                  }}
                  title={tooltip}
                >
                  <span>{shortLabel}</span>
                </div>,
              )
            }
            return nodes
          })}
        </div>
        <div className="tb-sel">
          {selRuns.map(run => {
            const from = (run.start % 60) / CELL
            const count = (run.end - run.start) / CELL
            return (
              <div
                key={run.start}
                className="tb-selbox"
                style={{
                  left: `calc(${(from / PER_HOUR) * 100}% + 1.5px)`,
                  width: `calc(${(count / PER_HOUR) * 100}% - 3px)`,
                  top: Math.floor(run.start / 60) * rowH + 1.5,
                  height: rowH - 3,
                }}
              >
                {Array.from({ length: count }, (_, index) => (
                  <i key={index} style={{ left: `${(index / count) * 100}%`, width: `${100 / count}%` }}>{CHECK}</i>
                ))}
              </div>
            )
          })}
          {nowMin !== undefined && (
            <div
              className="tb-nowline"
              style={{
                left: `calc(${((nowMin % 60) / 60) * 100}% - 1px)`,
                top: Math.floor(nowMin / 60) * rowH + 1.5,
                height: rowH - 3,
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
})

export function TimeCanvas(props: Props) {
  const { layer, days, today, nowMinute, focus, onExtend, onTopDateChange, records, tags, busy, onAssign, onEdit } = props
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const selectedRef = useRef<Map<string, Set<number>>>(new Map())
  const [rowH, setRowH] = useState(40)
  const [selected, setSelected] = useState<Map<string, Set<number>>>(() => new Map())
  const [jumpVisible, setJumpVisible] = useState(false)
  void layer

  const timeTags = useMemo(() => tags.filter(tag => tag.kind === 'time'), [tags])
  const tagOf = useCallback((id: number) => timeTags.find(tag => tag.id === id), [timeTags])
  const tagName = useCallback((id: number) => tagOf(id)?.name ?? `标签 ${id}`, [tagOf])
  const tagColor = useCallback((id: number) => tagOf(id)?.color ?? FALLBACK_COLOR, [tagOf])

  /** One screen holds one day: fit 24 hours into the visible height. */
  useEffect(() => {
    const element = scrollRef.current
    if (element === null) return
    const fit = () => {
      const height = element.clientHeight
      if (height === 0) return
      setRowH(Math.min(MAX_ROW_H, Math.max(MIN_ROW_H, height / 24)))
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(element)
    return () => { observer.disconnect() }
  }, [])

  const scrollToDate = useCallback((date: string, smooth: boolean) => {
    const element = scrollRef.current
    const day = element?.querySelector<HTMLElement>(`.tb-day[data-day="${date}"]`)
    if (element === null || day === null || day === undefined) return
    element.scrollTo({ top: day.offsetTop, behavior: smooth ? 'smooth' : 'auto' })
  }, [])

  const appliedFocus = useRef(0)
  const focusedDay = useRef(focus.date)
  const anchor = useRef<{ date: string; offset: number } | null>(null)
  useEffect(() => {
    if (appliedFocus.current === focus.token) return
    const element = scrollRef.current
    const day = element?.querySelector<HTMLElement>(`.tb-day[data-day="${focus.date}"]`)
    if (element === null || day === null || day === undefined) return
    appliedFocus.current = focus.token
    focusedDay.current = focus.date
    anchor.current = null
    element.scrollTo({ top: day.offsetTop, behavior: 'auto' })
  }, [focus, days, rowH])

  useEffect(() => {
    const held = anchor.current
    const element = scrollRef.current
    if (held === null || element === null) return
    const day = element.querySelector<HTMLElement>(`.tb-day[data-day="${held.date}"]`)
    if (day === null || day === undefined) return
    element.scrollTop = day.offsetTop + held.offset
  }, [days])

  useEffect(() => {
    const element = scrollRef.current
    const day = element?.querySelector<HTMLElement>(`.tb-day[data-day="${focusedDay.current}"]`)
    if (element === null || day === null || day === undefined) return
    element.scrollTo({ top: day.offsetTop, behavior: 'auto' })
  }, [rowH])

  const edgeRef = useRef<'before' | 'after' | null>(null)
  useEffect(() => { edgeRef.current = null }, [days])

  const reportedTop = useRef('')
  const onScroll = useCallback(() => {
    const element = scrollRef.current
    if (element === null) return
    const day = element.querySelector<HTMLElement>(`.tb-day[data-day="${today}"]`)
    if (day !== null && day !== undefined) setJumpVisible(Math.abs(element.scrollTop - day.offsetTop) > 12)
    const columns = element.querySelectorAll<HTMLElement>('.tb-day')
    let top = ''
    let topOffset = 0
    for (const column of columns) {
      if (column.offsetTop <= element.scrollTop + 1) {
        top = column.dataset.day ?? top
        topOffset = column.offsetTop
      } else break
    }
    if (top !== '') {
      anchor.current = { date: top, offset: element.scrollTop - topOffset }
      if (top !== reportedTop.current) {
        reportedTop.current = top
        onTopDateChange(top)
      }
    }
    const threshold = element.clientHeight * 0.75
    const side = element.scrollTop < threshold
      ? 'before'
      : element.scrollTop + element.clientHeight > element.scrollHeight - threshold ? 'after' : null
    if (side === null) {
      edgeRef.current = null
      return
    }
    if (edgeRef.current === side) return
    edgeRef.current = side
    onExtend(side)
  }, [onExtend, onTopDateChange, today])

  const writeSelection = useCallback((next: Map<string, Set<number>>) => {
    selectedRef.current = next
    setSelected(next)
  }, [])

  const setDayMinutes = useCallback((date: string, minutes: readonly number[]) => {
    const next = new Map(selectedRef.current)
    if (minutes.length === 0) next.delete(date)
    else next.set(date, new Set(minutes))
    writeSelection(next)
  }, [writeSelection])

  const onCellDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    const date = target.dataset.day
    const minute = Number(target.dataset.min)
    if (date === undefined || !Number.isFinite(minute)) return
    event.preventDefault()
    const current = selectedRef.current.get(date)
    const wasSelected = current?.has(minute) ?? false
    dragRef.current = { date, minute, moved: false, wasSelected }
    if (!wasSelected) setDayMinutes(date, [...(current ?? []), minute])
  }, [setDayMinutes])

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const drag = dragRef.current
      if (drag === null) return
      const target = event.target as HTMLElement | null
      const date = target?.dataset?.day
      const minute = Number(target?.dataset?.min)
      if (date === undefined || date !== drag.date || !Number.isFinite(minute)) return
      if (!drag.moved && minute === drag.minute) return
      drag.moved = true
      const minutes: number[] = []
      for (let value = Math.min(drag.minute, minute); value <= Math.max(drag.minute, minute); value += CELL) minutes.push(value)
      setDayMinutes(drag.date, minutes)
    }
    const up = () => {
      const drag = dragRef.current
      if (drag === null) return
      dragRef.current = null
      if (drag.moved || !drag.wasSelected) return
      const current = selectedRef.current.get(drag.date) ?? new Set<number>()
      setDayMinutes(drag.date, [...current].filter(minute => minute !== drag.minute))
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [setDayMinutes])

  const clearSelection = useCallback(() => writeSelection(new Map()), [writeSelection])

  const runs = useMemo(() => {
    const list: Run[] = []
    for (const [date, minutes] of selected) list.push(...runsOf(date, [...minutes]))
    return list
  }, [selected])

  const totalMinutes = useMemo(() => {
    let total = 0
    for (const minutes of selected.values()) total += minutes.size * CELL
    return total
  }, [selected])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target !== null && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      if (event.key === 'Escape') {
        if (selectedRef.current.size > 0) clearSelection()
        return
      }
      if (event.key !== 'Delete' && event.key !== 'Backspace') return
      const list: Run[] = []
      for (const [date, minutes] of selectedRef.current) list.push(...runsOf(date, [...minutes]))
      if (list.length === 0) return
      event.preventDefault()
      onAssign(list, null)
      clearSelection()
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey) }
  }, [onAssign, clearSelection])

  const assign = (tagId: number) => {
    if (runs.length === 0) return
    onAssign(runs, tagId)
    clearSelection()
  }

  const handleBlockEdit = useCallback((date: string, record: DayRecord) => {
    clearSelection()
    onEdit(date, record)
  }, [clearSelection, onEdit])

  const nowMin = days.includes(today) ? nowMinute : undefined

  return (
    <>
      <div className="tb-tb">
        <div className="tb-tb-main">
          <div className="tb-scroll" ref={scrollRef} onScroll={onScroll} aria-label="时间块画布">
            <div className="tb-days">
              {days.map(day => (
                <DayColumn
                  key={day}
                  day={day}
                  rowH={rowH}
                  today={today}
                  records={records.get(day) ?? []}
                  selected={selected.get(day)}
                  nowMin={day === today ? nowMin : undefined}
                  tagName={tagName}
                  tagColor={tagColor}
                  onCellDown={onCellDown}
                  onBlockEdit={handleBlockEdit}
                />
              ))}
            </div>
            <button className={`tb-jump${jumpVisible ? ' on' : ''}`} type="button" onClick={() => scrollToDate(today, true)}>回到今天</button>
          </div>
        </div>
        <TagShelf tags={timeTags} onAssign={assign} />
      </div>
      {totalMinutes > 0 && (
        <div className="tb-sel-badge" role="status">
          {durationLabel(totalMinutes)}
        </div>
      )}
    </>
  )
}
