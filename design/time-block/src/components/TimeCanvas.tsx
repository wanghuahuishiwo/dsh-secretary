import { useEffect, useRef, type CSSProperties } from 'react'
import type { TimeBlock, TimeLayer, TimeTag } from '../../../shared/model/types.ts'
import {
  CELL_MINUTES, CELLS_PER_HOUR, MINUTES_PER_DAY, formatClock,
} from '../../../shared/model/time.ts'

interface TimeCanvasProps {
  readonly layer: TimeLayer
  readonly date: string
  readonly today: string
  readonly nowMinute: number
  readonly blocks: readonly TimeBlock[]
  readonly tags: readonly TimeTag[]
  readonly selected: ReadonlySet<number>
  readonly busy: boolean
  readonly onSelectionChange: (selected: Set<number>) => void
}

interface DragState {
  readonly start: number
  readonly wasSelected: boolean
  moved: boolean
}

/** 24 个小时行 × 每小时 6 格；格是原生 button，支持 pointer 与键盘。 */
export function TimeCanvas({
  layer, date, today, nowMinute, blocks, tags, selected, busy, onSelectionChange,
}: TimeCanvasProps) {
  const dragRef = useRef<DragState | null>(null)
  const selectedRef = useRef(selected)
  selectedRef.current = selected

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const drag = dragRef.current
      if (drag === null) return
      const hit = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('.tb-cell')
      const minute = Number(hit?.dataset.minute)
      if (hit?.dataset.date !== date || !Number.isFinite(minute) || minute === drag.start && !drag.moved) return
      drag.moved = true
      const next = new Set<number>()
      for (let value = Math.min(drag.start, minute); value <= Math.max(drag.start, minute); value += CELL_MINUTES) {
        next.add(value)
      }
      onSelectionChange(next)
    }
    const up = () => {
      const drag = dragRef.current
      dragRef.current = null
      if (drag === null || drag.moved) return
      const next = new Set(selectedRef.current)
      if (drag.wasSelected) next.delete(drag.start)
      else next.add(drag.start)
      onSelectionChange(next)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      dragRef.current = null
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [date, onSelectionChange])

  const toggleFromKeyboard = (minute: number) => {
    const next = new Set(selectedRef.current)
    if (next.has(minute)) next.delete(minute)
    else next.add(minute)
    onSelectionChange(next)
  }

  return (
    <section className="tb-canvas" aria-label="共享时间格画布">
      <div className="tb-minute-head" aria-hidden="true">
        <span>时刻</span>
        <div>{Array.from({ length: CELLS_PER_HOUR }, (_, index) => <span key={index}>{String(index * 10).padStart(2, '0')}</span>)}</div>
      </div>
      <div
        className="tb-canvas-scroll"
        data-testid="time-canvas"
        data-layer={layer}
        data-date={date}
        aria-busy={busy}
      >
        {Array.from({ length: 24 }, (_, hour) => (
          <div className="tb-hour-row" key={hour}>
            <span className="tb-hour-label">{String(hour).padStart(2, '0')}:00</span>
            <div className="tb-hour-cells">
              {Array.from({ length: CELLS_PER_HOUR }, (_, index) => {
                const minute = hour * 60 + index * CELL_MINUTES
                const block = blocks.find(item => item.start <= minute && minute < item.end)
                const tag = block === undefined ? undefined : tags.find(item => item.id === block.tagId)
                const label = block === undefined ? '' : block.note ?? tag?.name ?? '未命名标签'
                const showLabel = block !== undefined && (block.start === minute || index === 0)
                const isNow = date === today && nowMinute >= minute && nowMinute < minute + CELL_MINUTES
                const classes = ['tb-cell']
                if (block !== undefined) classes.push('is-filled')
                if (selected.has(minute)) classes.push('is-selected')
                if (isNow) classes.push('is-now')
                return (
                  <button
                    key={minute}
                    type="button"
                    className={classes.join(' ')}
                    style={cellStyle(tag?.color)}
                    data-testid={`cell-${minute}`}
                    data-date={date}
                    data-minute={minute}
                    data-tag-id={block?.tagId}
                    data-selected={selected.has(minute) ? 'true' : 'false'}
                    aria-label={`${formatClock(minute)}${block === undefined ? '，空白' : `，${label}`}`}
                    aria-pressed={selected.has(minute)}
                    title={block === undefined ? formatClock(minute) : `${formatClock(block.start)}–${formatClock(block.end)} · ${label}`}
                    disabled={busy}
                    onPointerDown={event => {
                      if (event.button !== 0) return
                      event.preventDefault()
                      dragRef.current = { start: minute, wasSelected: selectedRef.current.has(minute), moved: false }
                    }}
                    onClick={event => {
                      // pointerup 已处理鼠标 / 触摸；detail=0 是键盘 click。
                      if (event.detail === 0) toggleFromKeyboard(minute)
                    }}
                  >
                    {showLabel && <span className="tb-block-label">{label}</span>}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
        <div className="tb-day-end">24:00 · 一日结束</div>
      </div>
    </section>
  )
}

function cellStyle(color: string | undefined): CSSProperties {
  return color === undefined ? {} : { '--cell-color': color } as CSSProperties
}
