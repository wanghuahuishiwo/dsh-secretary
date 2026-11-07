import { useEffect, useMemo, useRef, useState } from 'react'
import { addDays, localDate, weekStartOf } from './model.ts'

interface Props {
  /** `day` picks one date; `week` highlights the whole week and returns its Monday. */
  readonly mode: 'day' | 'week'
  /** The selected day, or the Monday of the selected week. */
  readonly value: string
  readonly today: string
  readonly onPick: (date: string) => void
  readonly onClose: () => void
}

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']

/** Six weeks of Monday-first dates covering `month`. */
function monthMatrix(month: string): string[][] {
  const first = `${month}-01`
  const weekday = (new Date(`${first}T12:00:00`).getDay() + 6) % 7
  const start = addDays(first, -weekday)
  return Array.from({ length: 6 }, (_, row) => (
    Array.from({ length: 7 }, (_, column) => addDays(start, row * 7 + column))
  ))
}

/** `11月2日 – 11月8日` for one week starting on `weekStart`. */
function weekLabel(weekStart: string): string {
  const start = new Date(`${weekStart}T12:00:00`)
  const end = new Date(`${addDays(weekStart, 6)}T12:00:00`)
  return `${start.getMonth() + 1}月${start.getDate()}日 – ${end.getMonth() + 1}月${end.getDate()}日`
}

function monthLabel(month: string): string {
  const [year, value] = month.split('-').map(Number)
  return `${year}年${value}月`
}

function shiftMonth(month: string, amount: number): string {
  const [year, value] = month.split('-').map(Number)
  const shifted = new Date(Date.UTC(year, value - 1 + amount, 1))
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`
}

/**
 * The product's own calendar: a month grid that picks a day, or a whole week when
 * the caller asks for `week`. It replaces the native date input, whose popup
 * cannot follow the host theme.
 */
export function DatePicker({ mode, value, today, onPick, onClose }: Props) {
  const [month, setMonth] = useState(() => value.slice(0, 7))
  const root = useRef<HTMLDivElement | null>(null)

  useEffect(() => { setMonth(value.slice(0, 7)) }, [value])

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (root.current !== null && !(event.target instanceof Node && root.current.contains(event.target))) onClose()
    }
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const matrix = useMemo(() => monthMatrix(month), [month])
  const selectedWeek = weekStartOf(value)

  return (
    <div className="sec-picker" ref={root} role="dialog" aria-label={mode === 'week' ? '选择一周' : '选择日期'}>
      <div className="sec-picker-head">
        <button type="button" aria-label="上一月" className="sec-picker-nav" onClick={() => setMonth(previous => shiftMonth(previous, -1))}>
          <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M7.5 2.5L4 6l3.5 3.5" /></svg>
        </button>
        <span className="sec-picker-title">{monthLabel(month)}</span>
        <button type="button" aria-label="下一月" className="sec-picker-nav" onClick={() => setMonth(previous => shiftMonth(previous, 1))}>
          <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M4.5 2.5L8 6l-3.5 3.5" /></svg>
        </button>
      </div>
      <div className="sec-picker-weekdays">
        {WEEKDAYS.map(day => <span key={day}>{day}</span>)}
      </div>
      <div className="sec-picker-grid">
        {matrix.map(row => row.map(day => {
          const inMonth = day.slice(0, 7) === month
          const selected = mode === 'week' ? weekStartOf(day) === selectedWeek : day === value
          const classes = ['sec-picker-day']
          if (!inMonth) classes.push('out')
          if (selected) classes.push('on')
          if (selected && mode === 'week' && day === selectedWeek) classes.push('wstart')
          if (selected && mode === 'week' && day === addDays(selectedWeek, 6)) classes.push('wend')
          if (day === today) classes.push('today')
          return (
            <button
              key={day}
              type="button"
              className={classes.join(' ')}
              data-day={day}
              aria-label={`${Number(day.slice(5, 7))}月${Number(day.slice(8, 10))}日`}
              aria-pressed={selected}
              onClick={() => onPick(day)}
            >
              {Number(day.slice(8, 10))}
            </button>
          )
        }))}
      </div>
      <div className="sec-picker-foot">
        <span>{mode === 'week' ? weekLabel(selectedWeek) : '点一天'}</span>
        <button
          type="button"
          className="sec-picker-now"
          onClick={() => onPick(mode === 'week' ? weekStartOf(localDate()) : localDate())}
        >{mode === 'week' ? '本周' : '今天'}</button>
      </div>
    </div>
  )
}
