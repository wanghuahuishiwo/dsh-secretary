import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Tag } from 'dsh-secretary-tag/contract'
import {
  CELL, MAX_ROW_H, MIN_ROW_H, PER_HOUR, WEEKDAY_LABELS,
  minutesOfRecord, recordAt, recordsOfDay, runsOf, snapDown,
  type BlockLike, type DayRecord, type Run,
} from './model.ts'

interface Props {
  readonly layer: 'actual' | 'plan'
  readonly days: readonly string[]
  readonly today: string
  readonly nowMs: number
  readonly timeZone: string
  readonly blocks: readonly BlockLike[]
  readonly tags: readonly Tag[]
  readonly busy: boolean
  readonly onAssign: (runs: readonly Run[], tagId: number | null) => void
  readonly onEdit: (date: string, record: DayRecord) => void
  readonly onOpenTags: () => void
}

interface DragState {
  readonly date: string
  readonly minute: number
  moved: boolean
  readonly wasSelected: boolean
}

const FALLBACK_COLOR = '#477bc7'
const CHECK = <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M2.5 6.4l2.3 2.3L9.5 3.7" /></svg>
const ERASER = <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M5.5 3h7v9h-7l-3.5-4.5z" /><path d="M8 6l3 3M11 6l-3 3" /></svg>
const CHEVRONS = <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 5.2L6 2.4l3 2.8M3 9.5L6 6.7l3 2.8" /></svg>

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

/** Minutes from local midnight for an instant. */
function minuteOfDay(ms: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms))
  const field = (type: string) => Number(parts.find(part => part.type === type)?.value ?? 0)
  return field('hour') * 60 + field('minute')
}

/** One day column: the date mark, the hour scale, the ten-minute grid, its blocks and its selection. */
const DayColumn = memo(function DayColumn({
  day, rowH, today, records, selected, nowMin, tagName, tagColor, onCellDown,
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
}) {
  const date = new Date(`${day}T12:00:00`)
  const height = 24 * rowH
  const cells = Array.from({ length: 24 * PER_HOUR }, (_, index) => ({
    minute: Math.floor(index / PER_HOUR) * 60 + (index % PER_HOUR) * CELL,
    last: index % PER_HOUR === PER_HOUR - 1,
  }))
  const selRuns = selected === undefined ? [] : splitByHour(runsOf(day, [...selected]))

  return (
    <div className="sec-day" data-day={day} style={{ height }}>
      <div className="sec-gutter">
        <div className="sec-datemark">
          <span className="m">{date.getMonth() + 1}月</span>
          <span className="d">{date.getDate()}</span>
          <span className="w">{WEEKDAY_LABELS[(date.getDay() + 6) % 7]}</span>
          {day === today && <span className="t today">今天</span>}
        </div>
      </div>
      <div className="sec-hours" style={{ height }}>
        {Array.from({ length: 24 }, (_, hour) => (
          <span key={hour} className={nowMin !== undefined && hour === Math.floor(nowMin / 60) ? 'now' : ''} style={{ top: hour * rowH + 4 }}>{hour}</span>
        ))}
      </div>
      <div className="sec-grid" data-day={day} style={{ height }}>
        <div className="sec-cells" style={{ gridAutoRows: `${rowH}px` }} onPointerDown={onCellDown}>
          {cells.map(cell => (
            <div key={cell.minute} className={`sec-cell${cell.last ? ' hourlast' : ''}`} data-day={day} data-min={cell.minute} />
          ))}
        </div>
        <div className="sec-blocks">
          {records.map(record => {
            const label = record.note === undefined || record.note === '' ? tagName(record.timeTagId) : record.note
            const color = tagColor(record.timeTagId)
            const nodes = []
            for (let minute = snapDown(record.start); minute < record.end; minute += CELL) {
              nodes.push(
                <div
                  key={`${record.id}:${minute}`}
                  className="sec-blk"
                  style={{
                    left: `calc(${(((minute % 60) / CELL) / PER_HOUR) * 100}% + 0.5px)`,
                    width: `calc(${100 / PER_HOUR}% - 1px)`,
                    top: Math.floor(minute / 60) * rowH + 0.5,
                    height: rowH - 1,
                    background: color,
                  }}
                  title={label}
                >
                  <span>{label}</span>
                </div>,
              )
            }
            return nodes
          })}
        </div>
        <div className="sec-sel">
          {selRuns.map(run => {
            const from = (run.start % 60) / CELL
            const count = (run.end - run.start) / CELL
            return (
              <div
                key={run.start}
                className="sec-selbox"
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
              className="sec-nowline"
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
  const { layer, days, today, nowMs, timeZone, blocks, tags, busy, onAssign, onEdit, onOpenTags } = props
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const selectedRef = useRef<Map<string, Set<number>>>(new Map())
  const [rowH, setRowH] = useState(40)
  const [selected, setSelected] = useState<Map<string, Set<number>>>(() => new Map())
  const [shelfMini, setShelfMini] = useState(false)
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({})
  const [brushTagId, setBrushTagId] = useState<number | undefined>(undefined)
  const [jumpVisible, setJumpVisible] = useState(false)
  void layer

  const timeTags = useMemo(() => tags.filter(tag => tag.kind === 'time'), [tags])
  const roots = useMemo(() => timeTags.filter(tag => tag.parentId === undefined), [timeTags])
  const tagOf = useCallback((id: number) => timeTags.find(tag => tag.id === id), [timeTags])
  const tagName = useCallback((id: number) => tagOf(id)?.name ?? `标签 ${id}`, [tagOf])
  const tagColor = useCallback((id: number) => tagOf(id)?.color ?? FALLBACK_COLOR, [tagOf])

  const byDay = useMemo(() => {
    const map = new Map<string, DayRecord[]>()
    for (const day of days) map.set(day, recordsOfDay(blocks, day, timeZone, nowMs))
    return map
  }, [blocks, days, timeZone, nowMs])

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

  const scrollToToday = useCallback((smooth: boolean) => {
    const element = scrollRef.current
    const day = element?.querySelector<HTMLElement>(`.sec-day[data-day="${today}"]`)
    if (element === null || day === null || day === undefined) return
    element.scrollTo({ top: day.offsetTop, behavior: smooth ? 'smooth' : 'auto' })
  }, [today])

  useEffect(() => { scrollToToday(false) }, [scrollToToday, rowH])

  const onScroll = useCallback(() => {
    const element = scrollRef.current
    const day = element?.querySelector<HTMLElement>(`.sec-day[data-day="${today}"]`)
    if (element === null || day === null || day === undefined) return
    setJumpVisible(Math.abs(element.scrollTop - day.offsetTop) > 12)
  }, [today])

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

  const whole = useMemo(() => {
    if (selected.size !== 1) return undefined
    const [date, minutes] = [...selected][0]
    const records = byDay.get(date) ?? []
    const hit = new Set<number>()
    for (const minute of minutes) {
      const record = recordAt(records, minute)
      if (record !== undefined) hit.add(record.id)
    }
    if (hit.size !== 1) return undefined
    const record = records.find(item => item.id === [...hit][0])
    if (record === undefined) return undefined
    const covered = minutesOfRecord(record)
    if (covered.length !== minutes.size || !covered.every(minute => minutes.has(minute))) return undefined
    return { date, record }
  }, [selected, byDay])

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
    setBrushTagId(tagId)
    onAssign(runs, tagId)
    clearSelection()
  }

  const nowMin = days.includes(today) ? minuteOfDay(nowMs, timeZone) : undefined

  return (
    <>
      <div className="sec-tb">
        <div className="sec-tb-main">
          <div className="sec-scroll" ref={scrollRef} onScroll={onScroll} aria-label="时间块画布">
            <div className="sec-days">
              {days.map(day => (
                <DayColumn
                  key={day}
                  day={day}
                  rowH={rowH}
                  today={today}
                  records={byDay.get(day) ?? []}
                  selected={selected.get(day)}
                  nowMin={day === today ? nowMin : undefined}
                  tagName={tagName}
                  tagColor={tagColor}
                  onCellDown={onCellDown}
                />
              ))}
            </div>
            <button className={`sec-jump${jumpVisible ? ' on' : ''}`} type="button" onClick={() => scrollToToday(true)}>回到今天</button>
          </div>
        </div>
        <aside className={`sec-shelf${shelfMini ? ' mini' : ''}`} aria-label="时间标签架">
          {shelfMini && <span className="sec-brush" style={{ background: brushTagId === undefined ? FALLBACK_COLOR : tagColor(brushTagId) }} />}
          <button className="sec-shelf-head" type="button" onClick={() => setShelfMini(value => !value)}>
            {CHEVRONS}
            <span>合上所有内容</span>
          </button>
          <div className="sec-shelf-list">
            {roots.map(tag => {
              const kids = timeTags.filter(item => item.parentId === tag.id)
              const open = collapsed[tag.id] !== true
              return (
                <div key={tag.id} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <button
                    className="sec-cat"
                    type="button"
                    style={{ background: tag.color ?? FALLBACK_COLOR }}
                    aria-expanded={kids.length > 0 ? open : undefined}
                    onClick={event => {
                      if (kids.length > 0 && (event.target as HTMLElement).closest('.caret') !== null) {
                        setCollapsed(previous => ({ ...previous, [tag.id]: open }))
                        return
                      }
                      assign(tag.id)
                      if (kids.length > 0) setCollapsed(previous => ({ ...previous, [tag.id]: false }))
                    }}
                  >
                    <span>{tag.name}</span>
                    {kids.length > 0 && (
                      <svg className="caret" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M4 2.5L7.5 6 4 9.5" /></svg>
                    )}
                  </button>
                  {open && kids.map(kid => (
                    <button key={kid.id} className="sec-cat sub" type="button" style={{ background: kid.color ?? FALLBACK_COLOR }} onClick={() => assign(kid.id)}>
                      <span>{kid.name}</span>
                    </button>
                  ))}
                </div>
              )
            })}
          </div>
          <button className="sec-shelf-more" type="button" onClick={onOpenTags}>更多事件类别</button>
        </aside>
      </div>
      <div className="sec-status" style={{ visibility: totalMinutes > 0 ? 'visible' : 'hidden' }} aria-hidden={totalMinutes === 0}>
        <span>
          {whole === undefined
            ? <>选择了 <b>{totalMinutes}</b> 分钟</>
            : (
              <span className="sec-chip">
                <i style={{ background: tagColor(whole.record.timeTagId) }} />
                {tagName(whole.record.timeTagId)}{whole.record.note === undefined || whole.record.note === '' ? '' : ` · ${whole.record.note}`}
              </span>
            )}
        </span>
        <span className="grow" />
        {whole !== undefined && (
          <button className="sec-sb" type="button" disabled={busy} onClick={() => onEdit(whole.date, whole.record)}>备注</button>
        )}
        <button className="sec-sb" type="button" onClick={clearSelection}>不选</button>
        <button className="sec-sb erase" type="button" disabled={busy || runs.length === 0} onClick={() => {
          onAssign(runs, null)
          clearSelection()
        }}>{ERASER}橡皮</button>
      </div>
    </>
  )
}
