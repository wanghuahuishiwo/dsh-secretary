import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DeepCellLevel, DeepLevel, DeepWeekData } from './model.ts'
import { CanvasGradient } from './CanvasGradient.tsx'
import { WEEKDAY_LABELS, addDays, durationLabel, weekStartOf } from './model.ts'

interface Props {
  readonly week: DeepWeekData | undefined
  readonly weekStart: string
  readonly today: string
  readonly busy: boolean
  readonly onPaint: (rects: readonly DeepRect[], level: DeepLevel | null) => void
}

/** One rectangle of the week grid: weekday 1..7 and hour 0..23, both inclusive. */
export interface DeepRect {
  readonly startWeekday: number
  readonly startHour: number
  readonly endWeekday: number
  readonly endHour: number
}

const LEVELS: { id: DeepLevel; name: string; color: string }[] = [
  { id: 'high', name: '高', color: 'var(--tb-deep-high, #5aa86a)' },
  { id: 'medium', name: '中', color: 'var(--tb-deep-medium, #b99530)' },
  { id: 'low', name: '低', color: 'var(--tb-deep-low, #79808c)' },
]

function levelOf(cells: readonly DeepCellLevel[] | undefined, weekday: number, hour: number): DeepCellLevel {
  if (cells === undefined) return 'unset'
  return cells[(weekday - 1) * 24 + hour] ?? 'unset'
}

/** Fold a cell selection into rectangles: one per weekday, contiguous hours merged. */
function rectsOf(selection: ReadonlySet<string>): DeepRect[] {
  const byDay = new Map<number, number[]>()
  for (const key of selection) {
    const [weekday, hour] = key.split('-').map(Number)
    const hours = byDay.get(weekday) ?? []
    hours.push(hour)
    byDay.set(weekday, hours)
  }
  const rects: DeepRect[] = []
  for (const [weekday, hours] of byDay) {
    hours.sort((left, right) => left - right)
    let start = hours[0]
    let previous = hours[0]
    for (const hour of hours.slice(1)) {
      if (hour === previous + 1) {
        previous = hour
        continue
      }
      rects.push({ startWeekday: weekday, startHour: start, endWeekday: weekday, endHour: previous })
      start = hour
      previous = hour
    }
    rects.push({ startWeekday: weekday, startHour: start, endWeekday: weekday, endHour: previous })
  }
  return rects
}

/** The 深度时间 week grid: seven days by twenty-four hours, painted by level. */
export function DeepWeekView({ week, weekStart, today, busy, onPaint }: Props) {
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{ key: string; moved: boolean; wasSelected: boolean } | null>(null)
  const selectionRef = useRef<Set<string>>(new Set())
  const [rowH, setRowH] = useState(32)
  const [selection, setSelection] = useState<Set<string>>(() => new Set())
  const [level, setLevel] = useState<DeepLevel>('high')

  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart])
  const cells = week?.cells.map(cell => cell.level)

  useEffect(() => {
    const element = bodyRef.current
    if (element === null) return
    const fit = () => {
      const height = element.clientHeight
      if (height === 0) return
      setRowH(Math.max(16, Math.min(44, height / 24)))
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(element)
    return () => { observer.disconnect() }
  }, [])

  const writeSelection = useCallback((next: Set<string>) => {
    selectionRef.current = next
    setSelection(next)
  }, [])

  const onCellDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    const key = target.dataset.k
    if (key === undefined) return
    event.preventDefault()
    const wasSelected = selectionRef.current.has(key)
    dragRef.current = { key, moved: false, wasSelected }
    if (!wasSelected) writeSelection(new Set([...selectionRef.current, key]))
  }, [writeSelection])

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const drag = dragRef.current
      if (drag === null) return
      const key = (event.target as HTMLElement | null)?.dataset?.k
      if (key === undefined) return
      const [startDay, startHour] = drag.key.split('-').map(Number)
      const [endDay, endHour] = key.split('-').map(Number)
      if (!drag.moved && startDay === endDay && startHour === endHour) return
      drag.moved = true
      const next = new Set<string>()
      for (let day = Math.min(startDay, endDay); day <= Math.max(startDay, endDay); day += 1) {
        for (let hour = Math.min(startHour, endHour); hour <= Math.max(startHour, endHour); hour += 1) next.add(`${day}-${hour}`)
      }
      writeSelection(next)
    }
    const up = () => {
      const drag = dragRef.current
      if (drag === null) return
      dragRef.current = null
      if (drag.moved || !drag.wasSelected) return
      writeSelection(new Set([...selectionRef.current].filter(key => key !== drag.key)))
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [writeSelection])

  const clearSelection = useCallback(() => writeSelection(new Set()), [writeSelection])
  const rects = useMemo(() => rectsOf(selection), [selection])

  const paint = (next: DeepLevel | null) => {
    if (rects.length === 0) return
    if (next !== null) setLevel(next)
    onPaint(rects, next)
    clearSelection()
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target !== null && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      if (event.key === 'Escape') {
        clearSelection()
        return
      }
      if (event.key !== 'Delete' && event.key !== 'Backspace') return
      const list = rectsOf(selectionRef.current)
      if (list.length === 0) return
      event.preventDefault()
      onPaint(list, null)
      clearSelection()
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey) }
  }, [clearSelection, onPaint])

  const rangeLabel = `${new Date(`${weekStart}T12:00:00`).getMonth() + 1}月${new Date(`${weekStart}T12:00:00`).getDate()}日 – `
    + `${new Date(`${addDays(weekStart, 6)}T12:00:00`).getMonth() + 1}月${new Date(`${addDays(weekStart, 6)}T12:00:00`).getDate()}日`

  return (
    <>
      <div className="tb-deep">
        <div className="tb-deep-main">
          <div className="tb-deep-head">
            {days.map(day => (
              <span key={day} className={`d${day === today ? ' today' : ''}`}>
                {new Date(`${day}T12:00:00`).getMonth() + 1}/{new Date(`${day}T12:00:00`).getDate()} {WEEKDAY_LABELS[(new Date(`${day}T12:00:00`).getDay() + 6) % 7]}
              </span>
            ))}
          </div>
          <div className="tb-deep-body" ref={bodyRef}>
            <div className="tb-deep-hours" style={{ height: 24 * rowH }}>
              {Array.from({ length: 24 }, (_, hour) => (
                <span key={hour} style={{ top: hour * rowH + 3 }}>{hour % 2 === 0 ? hour : ''}</span>
              ))}
            </div>
            <div className="tb-deep-cols" onPointerDown={onCellDown}>
              <CanvasGradient />
              {days.map((day, index) => {
                const weekday = index + 1
                return (
                  <div key={day} className="tb-deep-col" style={{ height: 24 * rowH }}>
                    {Array.from({ length: 24 }, (_, hour) => {
                      const cell = levelOf(cells, weekday, hour)
                      const left = weekday > 1 ? levelOf(cells, weekday - 1, hour) : 'unset'
                      const isFirstOfRun = cell !== 'unset' && cell !== left
                      const label = cell === 'high' ? '高' : cell === 'medium' ? '中' : cell === 'low' ? '低' : ''
                      return (
                        <div
                          key={hour}
                          className={`tb-hc${cell === 'unset' ? '' : ` ${cell === 'high' ? 'H' : cell === 'medium' ? 'M' : 'L'}`}`}
                          data-k={`${weekday}-${hour}`}
                          data-level={cell}
                          style={{ top: hour * rowH + 0.5, height: rowH - 1 }}
                        >
                          {isFirstOfRun && <span style={{ fontSize: 10, fontWeight: 600, paddingLeft: 4, color: '#fff', overflow: 'hidden', whiteSpace: 'nowrap' }}>{label}</span>}
                        </div>
                      )
                    })}
                    {[...selection].filter(key => key.startsWith(`${weekday}-`)).map(key => {
                      const hour = Number(key.split('-')[1])
                      return (
                        <div key={key} className="tb-selbox" style={{ left: 0.5, right: 0.5, top: hour * rowH + 0.5, height: rowH - 1 }}>
                          <i style={{ left: 0, width: '100%' }}>
                            <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M2.5 6.4l2.3 2.3L9.5 3.7" /></svg>
                          </i>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
        <aside className="tb-shelf">
          {LEVELS.map(item => (
            <button
              key={item.id}
              className="tb-cat"
              type="button"
              style={{ background: item.color, opacity: level === item.id ? 1 : 0.62, margin: '2px 7px 5px' }}
              onClick={() => paint(item.id)}
            >
              <span>{item.name}</span>
            </button>
          ))}
          {week !== undefined && week.source !== 'own' && (
            <div style={{ marginTop: 'auto', padding: '0 10px 10px', fontSize: 'var(--tb-font-caption, 10px)', color: 'var(--tb-text-tertiary, #727a88)', lineHeight: 1.6 }}>
              {week.source === 'inherited' ? '继承自更早一周，改这一周只影响这一周' : '还没有画过，改这一周从空白开始'}
            </div>
          )}
        </aside>
      </div>
      {selection.size > 0 && (
        <div className="tb-sel-badge" role="status">
          {durationLabel(selection.size * 60)}
        </div>
      )}
    </>
  )
}
