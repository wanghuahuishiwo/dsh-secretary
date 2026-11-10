import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CELL, MAX_ROW_H, MIN_ROW_H, PER_HOUR, WEEKDAY_LABELS,
  cellRecords, durationLabel, runsOf,
  type DayRecord, type Run, type TimeTag,
} from './model.ts'
import { CanvasGradient } from './CanvasGradient.tsx'
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
  readonly onAssign: (runs: readonly Run[], tagId: number | null, mode: 'overwrite' | 'parallel') => void
  /** 双击已有记录块时打开该格的记录详情 sheet。 */
  readonly onOpen: (date: string, minute: number) => void
}

interface DragState {
  readonly date: string
  readonly minute: number
  moved: boolean
  readonly wasSelected: boolean
}

const FALLBACK_COLOR = '#477bc7'
const MONTH_LABELS = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月']
const SUPERSCRIPT = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹']

/** The count badge stays a single glyph up to nine records. */
function countGlyph(count: number): string {
  return count < SUPERSCRIPT.length ? SUPERSCRIPT[count] : String(count)
}

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
  day, rowH, today, records, selected, nowMin, tagName, tagColor, onCellDown, onCellContextMenu,
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
  onCellContextMenu: (event: React.MouseEvent<HTMLDivElement>) => void
}) {
  const date = new Date(`${day}T12:00:00`)
  const height = 24 * rowH
  const cells = Array.from({ length: 24 * PER_HOUR }, (_, index) => ({
    minute: Math.floor(index / PER_HOUR) * 60 + (index % PER_HOUR) * CELL,
    last: index % PER_HOUR === PER_HOUR - 1,
  }))
  const selRuns = selected === undefined ? [] : splitByHour(runsOf(day, [...selected]))
  /** One collapsed cell shows its earliest record; overlaps stay behind a count badge. */
  const rows = useMemo(() => cellRecords(records), [records])

  /** A hidden record starts showing once the earlier records above it end. */
  const firstShown = useMemo(() => {
    const first = new Map<number, number>()
    for (const cell of rows) if (!first.has(cell.record.id)) first.set(cell.record.id, cell.minute)
    return first
  }, [rows])

  return (
    <div className="tb-day" data-day={day} style={{ height }}>
      <div className="tb-gutter">
        <div className={`tb-datemark${day === today ? ' today' : ''}`}>
          <span className="m">{MONTH_LABELS[date.getMonth()]}</span>
          <span className="d">{date.getDate()}</span>
          <span className="w">{WEEKDAY_LABELS[(date.getDay() + 6) % 7]}</span>
          {day === today && <span className="t today">今天</span>}
        </div>
      </div>
      <div className="tb-hours" style={{ height }}>
        {Array.from({ length: 24 }, (_, hour) => (
          <span key={hour} className={nowMin !== undefined && hour === Math.floor(nowMin / 60) ? 'now' : ''} style={{ top: hour * rowH + 4 }}>{hour}:00</span>
        ))}
      </div>
      <div className="tb-grid" data-day={day} style={{ height }} onPointerDown={onCellDown} onContextMenu={onCellContextMenu}>
        <div className="tb-cells" style={{ gridAutoRows: `${rowH}px` }}>
          {cells.map(cell => (
            <div key={cell.minute} className={`tb-cell${cell.last ? ' hourlast' : ''}`} data-day={day} data-min={cell.minute} />
          ))}
        </div>
        <div className="tb-blocks">
          {rows.map(({ minute, record, count }) => {
            /** 画布上的块内文字恒为标签名；备注只出现在 tooltip 与详情 sheet 里。 */
            const name = tagName(record.timeTagId)
            const note = record.note?.trim() ?? ''
            const tooltip = count > 1
              ? `${name}${note === '' ? '' : ` · ${note}`} · 另有 ${count - 1} 条并行记录`
              : note === '' ? name : `${name} · ${note}`
            return (
              <div
                key={`${record.id}:${minute}`}
                className="tb-blk"
                data-day={day}
                data-min={minute}
                style={{
                  left: `${(((minute % 60) / CELL) / PER_HOUR) * 100}%`,
                  width: `${100 / PER_HOUR}%`,
                  top: Math.floor(minute / 60) * rowH + 0.5,
                  height: rowH - 1,
                  backgroundColor: tagColor(record.timeTagId),
                }}
                title={tooltip}
              >
                {minute === firstShown.get(record.id) && <span>{name}</span>}
              </div>
            )
          })}
          {/* 数量角标只是视觉指示：不可点、不抢块的手势。 */}
          {rows.filter(cell => cell.count > 1).map(cell => (
            <span
              key={`more:${cell.minute}`}
              className="tb-more"
              aria-hidden="true"
              style={{
                left: `calc(${((((cell.minute % 60) / CELL) + 1) / PER_HOUR) * 100}% - 14px)`,
                top: Math.floor(cell.minute / 60) * rowH,
              }}
            >
              {countGlyph(cell.count)}
            </span>
          ))}
        </div>
        <div className="tb-lines" aria-hidden="true" style={{ gridAutoRows: `${rowH}px` }}>
          {Array.from({ length: 24 * PER_HOUR }, (_, index) => <i key={index} />)}
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
  const { layer, days, today, nowMinute, focus, onExtend, onTopDateChange, records, tags, onAssign, onOpen } = props
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const selectedRef = useRef<Map<string, Set<number>>>(new Map())
  const [rowH, setRowH] = useState(40)
  const [selected, setSelected] = useState<Map<string, Set<number>>>(() => new Map())
  const [jumpVisible, setJumpVisible] = useState(false)
  const [parallel, setParallel] = useState(false)
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
    setParallel(false)
  }, [])

  const setDayMinutes = useCallback((date: string, minutes: readonly number[]) => {
    const next = new Map(selectedRef.current)
    if (minutes.length === 0) next.delete(date)
    else next.set(date, new Set(minutes))
    writeSelection(next)
  }, [writeSelection])

  const clearSelection = useCallback(() => writeSelection(new Map()), [writeSelection])

  /** 空格与记录块共用一次 pointerdown：单击与拖动都从选区手势开始。 */
  const onCellDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-day][data-min]')
    if (target === null) return
    const date = target.dataset.day
    const minute = Number(target.dataset.min)
    if (date === undefined || !Number.isFinite(minute)) return
    event.preventDefault()
    const current = selectedRef.current.get(date)
    const wasSelected = current?.has(minute) ?? false
    dragRef.current = { date, minute, moved: false, wasSelected }
    if (!wasSelected) setDayMinutes(date, [...(current ?? []), minute])
  }, [setDayMinutes])

  /** 右键记录块打开记录详情：与产品既有快捷键一致，单击仍是选区手势。 */
  const onCellContextMenu = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-day][data-min]')
    if (target === null) return
    const date = target.dataset.day
    const minute = Number(target.dataset.min)
    if (date === undefined || !Number.isFinite(minute)) return
    const list = records.get(date) ?? []
    if (!list.some(record => record.start <= minute && minute < record.end)) return
    event.preventDefault()
    clearSelection()
    onOpen(date, minute)
  }, [clearSelection, onOpen, records])

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const drag = dragRef.current
      if (drag === null) return
      const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-day][data-min]')
      const date = target?.dataset.day
      const minute = Number(target?.dataset.min)
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
      if (drag.moved) return
      if (!drag.wasSelected) return
      const current = selectedRef.current.get(drag.date) ?? new Set<number>()
      setDayMinutes(drag.date, [...current].filter(minute => minute !== drag.minute))
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [clearSelection, onOpen, setDayMinutes])

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

  /** Only show the overwrite/parallel choice when a run actually covers something. */
  const overlapsExisting = useMemo(() => {
    for (const run of runs) {
      const list = records.get(run.date)
      if (list !== undefined && list.some(record => record.start < run.end && record.end > run.start)) return true
    }
    return false
  }, [runs, records])

  useEffect(() => {
    if (!overlapsExisting) setParallel(false)
  }, [overlapsExisting])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target !== null && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      if (event.key === 'Tab' && overlapsExisting) {
        event.preventDefault()
        setParallel(value => !value)
        return
      }
      if (event.key === 'Escape') {
        if (selectedRef.current.size > 0) clearSelection()
        return
      }
      if (event.key !== 'Delete' && event.key !== 'Backspace') return
      const list: Run[] = []
      for (const [date, minutes] of selectedRef.current) list.push(...runsOf(date, [...minutes]))
      if (list.length === 0) return
      event.preventDefault()
      onAssign(list, null, 'overwrite')
      clearSelection()
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey) }
  }, [onAssign, clearSelection, overlapsExisting])

  const assign = (tagId: number) => {
    if (runs.length === 0) return
    onAssign(runs, tagId, parallel ? 'parallel' : 'overwrite')
    clearSelection()
  }

  const nowMin = days.includes(today) ? nowMinute : undefined

  return (
    <>
      <div className="tb-tb">
        <div className="tb-tb-main">
          <CanvasGradient />
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
                  onCellContextMenu={onCellContextMenu}
                />
              ))}
            </div>
            <button className={`tb-jump${jumpVisible ? ' on' : ''}`} type="button" onClick={() => scrollToDate(today, true)}>回到今天</button>
          </div>
        </div>
        <TagShelf tags={timeTags} onAssign={assign} />
      </div>
      {totalMinutes > 0 && (
        <div className={`tb-sel-badge${overlapsExisting ? ' split' : ''}`}>
          <span role="status">{durationLabel(totalMinutes)}</span>
          {overlapsExisting && (
            <span className="tb-sel-mode" role="group" aria-label="写入方式" title="按 Tab 切换覆盖／并行" aria-keyshortcuts="Tab">
              <button type="button" className={parallel ? '' : 'on'} aria-pressed={!parallel} onClick={() => setParallel(false)}>覆盖</button>
              <button type="button" className={parallel ? 'on' : ''} aria-pressed={parallel} onClick={() => setParallel(true)}>并行</button>
            </span>
          )}
        </div>
      )}
    </>
  )
}
