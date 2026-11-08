import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  DeepLevel, DeepRect, TimeBlockView, TimeLayer, TimeProductProps, TimeView,
} from './contract.ts'
import { DatePicker } from './DatePicker.tsx'
import { DeepWeekView } from './DeepWeekView.tsx'
import { Drawer } from './Drawer.tsx'
import { RecordSheet, type SheetTarget } from './RecordSheet.tsx'
import { TimeCanvas } from './TimeCanvas.tsx'
import { TimeHeader, dayLabel, weekLabel, type TimeModule } from './TimeHeader.tsx'
import { Toast } from './Toast.tsx'
import {
  addDays, localDate, weekStartOf,
  type DayRecord, type Run, type TimeTag,
} from './model.ts'
import { timeStyles } from './styles.ts'

/**
 * A stable string↔number index for the still numeric T1 components. The UI
 * contract uses string ids; assigning a number the first time an id is seen
 * keeps the components untouched and keeps an id stable across reloads.
 */
interface IdIndex {
  readonly number: (id: string) => number
  readonly string: (id: number) => string
}

interface IdIndexes {
  readonly tag: IdIndex
  readonly block: IdIndex
}

function createIdIndex(): IdIndex {
  const toNumber = new Map<string, number>()
  const toString = new Map<number, string>()
  let next = 0
  return {
    number(id) {
      let value = toNumber.get(id)
      if (value === undefined) {
        next += 1
        value = next
        toNumber.set(id, value)
        toString.set(value, id)
      }
      return value
    },
    string(id) {
      const known = toString.get(id)
      if (known === undefined) throw new Error(`未知 UI 标识：${id}`)
      return known
    },
  }
}

function messageOf(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason)
}

const FALLBACK_TODAY = localDate()

/**
 * The complete Time product UI: it owns module/date/range/overlays/busy state
 * and talks to its host only through the `TimeAdapter` prop. Panels are
 * rendered from the `TimeView` returned by every command, so no write is
 * assumed to have succeeded before the host answered.
 */
export function TimeProduct({ adapter, today: openingDay }: TimeProductProps) {
  const openingDate = openingDay ?? FALLBACK_TODAY
  const appRef = useRef<HTMLDivElement | null>(null)
  const [module, setModule] = useState<TimeModule>('actual')
  const [anchor] = useState(() => openingDate)
  const [range, setRange] = useState(() => ({ from: addDays(openingDate, -3), to: addDays(openingDate, 10) }))
  const [focus, setFocus] = useState(() => ({ date: openingDate, token: 1 }))
  const [topDate, setTopDate] = useState(() => openingDate)
  const [weekStart, setWeekStart] = useState(() => weekStartOf(openingDate))
  const [view, setView] = useState<TimeView>()
  const [drawer, setDrawer] = useState(false)
  const [sheet, setSheet] = useState<SheetTarget>()
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')
  const [error, setError] = useState('')
  const [picker, setPicker] = useState<TimeModule | null>(null)
  const toastTimer = useRef<number>(0)
  const revision = useRef(0)

  /** The time layer this module maps to; deep has no layer. */
  const layer: TimeLayer = module === 'plan' ? 'plan' : 'actual'

  // The T1 components still use numeric ids; the maps live for the product's
  // whole lifetime so a reload never re-identifies a tag or a block.
  const indexesRef = useRef<IdIndexes | undefined>(undefined)
  if (indexesRef.current === undefined) {
    indexesRef.current = { tag: createIdIndex(), block: createIdIndex() }
  }
  const indexes = indexesRef.current

  const say = useCallback((message: string) => {
    setToast(message)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(''), 1600)
  }, [])

  const load = useCallback(async () => {
    const ticket = revision.current + 1
    revision.current = ticket
    const next = await adapter.load({ anchor, from: range.from, to: range.to, weekStart })
    if (revision.current !== ticket) return
    setView(next)
    setError('')
  }, [adapter, anchor, range, weekStart])

  useEffect(() => {
    void load().catch((reason: unknown) => { setError(messageOf(reason)) })
  }, [load])

  const runWrite = useCallback(async (
    operation: () => Promise<TimeView>, message: string,
  ): Promise<boolean> => {
    const ticket = revision.current + 1
    revision.current = ticket
    setBusy(true)
    try {
      const next = await operation()
      if (revision.current === ticket) {
        setView(next)
        setError('')
      }
      say(message)
      return true
    } catch (reason) {
      const text = messageOf(reason)
      if (revision.current === ticket) setError(text)
      say(text)
      return false
    } finally {
      setBusy(false)
    }
  }, [say])

  const extendRange = useCallback((side: 'before' | 'after') => {
    setRange(previous => {
      const next = side === 'before'
        ? { from: addDays(previous.from, -7), to: previous.to }
        : { from: previous.from, to: addDays(previous.to, 7) }
      const span = (Date.parse(`${next.to}T00:00:00`) - Date.parse(`${next.from}T00:00:00`)) / 86_400_000 + 1
      if (span <= 63) return next
      return side === 'before' ? { from: next.from, to: addDays(next.to, -7) } : { from: addDays(next.from, 7), to: next.to }
    })
  }, [])

  const jumpTo = useCallback((date: string) => {
    setRange({ from: addDays(date, -3), to: addDays(date, 10) })
    setTopDate(date)
    setFocus(previous => ({ date, token: previous.token + 1 }))
  }, [])

  // The adapter's `today` is authoritative once loaded, so 今天 / 本周 land on the
  // product day even when the host clock and a pinned fixture disagree.
  const productToday = view?.today ?? openingDate

  const step = useCallback((amount: number) => {
    if (module === 'deep') {
      setWeekStart(amount === 0 ? weekStartOf(productToday) : addDays(weekStart, amount))
      return
    }
    jumpTo(amount === 0 ? productToday : addDays(topDate, amount))
  }, [jumpTo, module, productToday, topDate, weekStart])

  // One day with the arrows, one week with PageUp / PageDown; typing wins.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target !== null && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      const unit = module === 'deep' ? 7 : 1
      const map: Record<string, number> = { ArrowLeft: -unit, ArrowRight: unit, PageUp: -7, PageDown: 7 }
      const amount = map[event.key]
      if (amount === undefined) return
      event.preventDefault()
      step(amount)
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey) }
  }, [module, step])

  const paint = useCallback(async (
    next: TimeLayer, runs: readonly Run[], tagId: number | null, mode: 'overwrite' | 'parallel' = 'overwrite',
  ) => {
    if (runs.length === 0) return
    await runWrite(
      () => adapter.paint({ layer: next, tagId: tagId === null ? null : indexes.tag.string(tagId), runs, mode }),
      tagId === null ? '已擦除' : mode === 'parallel' ? '已添加并行' : '已上色',
    )
  }, [adapter, indexes, runWrite])

  const paintDeep = useCallback(async (rects: readonly DeepRect[], level: DeepLevel | null) => {
    if (rects.length === 0) return
    await runWrite(
      () => adapter.paintDeep({ weekStart, level, rects }),
      level === null ? '已擦除' : '已记录',
    )
  }, [adapter, runWrite, weekStart])

  const saveSheet = useCallback(async (
    target: SheetTarget,
    note: string | undefined,
  ) => {
    const ok = await runWrite(
      () => adapter.updateBlock({
        layer: target.layer,
        id: indexes.block.string(target.record.id),
        date: target.date,
        start: target.record.start,
        end: target.record.end,
        tagId: indexes.tag.string(target.record.timeTagId),
        note,
      }),
      '已保存',
    )
    if (ok) setSheet(undefined)
  }, [adapter, indexes, runWrite])

  const deleteSheet = useCallback(async (target: SheetTarget) => {
    const ok = await runWrite(
      () => adapter.deleteBlock({ layer: target.layer, id: indexes.block.string(target.record.id) }),
      '已删除',
    )
    if (ok) setSheet(undefined)
  }, [adapter, indexes, runWrite])

  const undo = useCallback(async () => {
    if (busy || view === undefined || view.canUndo[layer] !== true) return
    const ticket = revision.current + 1
    revision.current = ticket
    setBusy(true)
    try {
      const next = await adapter.undo(layer)
      if (next === undefined) return
      if (revision.current === ticket) {
        setView(next)
        setError('')
      }
      say('已撤销')
    } catch (reason) {
      const message = messageOf(reason)
      if (revision.current === ticket) setError(message)
      say(message)
    } finally {
      setBusy(false)
    }
  }, [adapter, busy, layer, say, view])

  const tags = useMemo<TimeTag[]>(() => (view?.tags ?? []).map(tag => ({
    id: indexes.tag.number(tag.id),
    name: tag.name,
    kind: 'time',
    parentId: tag.parentId === undefined ? undefined : indexes.tag.number(tag.parentId),
    color: tag.color,
  })), [indexes, view])

  const records = useMemo(() => {
    const make = (list: readonly TimeBlockView[]): Map<string, DayRecord[]> => {
      const map = new Map<string, DayRecord[]>()
      for (const day of view?.days ?? []) map.set(day, [])
      for (const block of list) {
        const day = map.get(block.date)
        if (day === undefined) continue
        day.push({
          id: indexes.block.number(block.id),
          start: block.start,
          end: block.end,
          timeTagId: indexes.tag.number(block.tagId),
          note: block.note,
        })
      }
      for (const day of map.values()) day.sort((left, right) => left.start - right.start || left.id - right.id)
      return map
    }
    return {
      actual: make(view?.blocks.actual ?? []),
      plan: make(view?.blocks.plan ?? []),
    } as Readonly<Record<TimeLayer, ReadonlyMap<string, readonly DayRecord[]>>>
  }, [indexes, view])

  const deepWeek = useMemo(() => view === undefined ? undefined : {
    weekStart: view.weekStart,
    source: view.deep.source,
    cells: view.deep.levels.map(level => ({ level })),
  }, [view])

  const today = productToday

  return (
    <div
      className="tb-app"
      data-time-remote
      data-remote-state={view === undefined ? (error === '' ? 'loading' : 'error') : 'ready'}
      ref={appRef}
      tabIndex={-1}
      /** Clicking the canvas must move focus here, otherwise the host's input keeps Esc/Delete. */
      onPointerDownCapture={(event) => {
        const target = event.target as HTMLElement
        if (target.closest('input, textarea, select, [contenteditable="true"]') !== null) return
        appRef.current?.focus({ preventScroll: true })
      }}
    >
      <style>{timeStyles}</style>
      <TimeHeader
        module={module}
        dateLabel={module === 'deep' ? weekLabel(weekStart) : dayLabel(topDate)}
        canUndo={view?.canUndo[layer] === true}
        busy={busy}
        pickerOpen={picker !== null}
        drawerOpen={drawer}
        onDrawer={() => setDrawer(value => !value)}
        onPicker={() => setPicker(picker === null ? module : null)}
        onStep={step}
        onUndo={() => void undo()}
      />

      <div className="tb-views">
        {module !== 'deep' && view !== undefined && (
          <section className="tb-view on">
            <TimeCanvas
              key={module}
              layer={layer} days={view.days} today={view.today} nowMinute={view.nowMinute}
              focus={focus} onExtend={extendRange} onTopDateChange={setTopDate} records={records[layer]} tags={tags}
              busy={busy} onAssign={(runs, tagId, mode) => void paint(layer, runs, tagId, mode)}
              onEdit={(date, record) => setSheet({ layer, date, record })}
            />
          </section>
        )}
        {module === 'deep' && (
          <section className="tb-view on">
            <DeepWeekView
              week={deepWeek} weekStart={weekStart} today={today} busy={busy}
              onPaint={(rects, level) => void paintDeep(rects, level)}
            />
          </section>
        )}
      </div>

      {picker !== null && (
        <DatePicker
          mode={picker === 'deep' ? 'week' : 'day'} value={picker === 'deep' ? weekStart : topDate} today={today}
          onPick={date => {
            if (picker === 'deep') setWeekStart(weekStartOf(date))
            else jumpTo(date)
            setPicker(null)
          }}
          onClose={() => setPicker(null)}
        />
      )}

      {error !== '' && <div className="tb-toast on" style={{ bottom: 52 }}>{error}</div>}

      <Drawer
        open={drawer}
        module={module}
        onModuleChange={next => {
          setModule(next)
          setDrawer(false)
          setPicker(null)
          if (next !== 'deep') setFocus(previous => ({ date: topDate, token: previous.token + 1 }))
        }}
        onClose={() => setDrawer(false)}
      />

      {sheet !== undefined && (
        <RecordSheet
          target={sheet} busy={busy} onClose={() => setSheet(undefined)}
          onSave={note => void saveSheet(sheet, note)} onDelete={() => void deleteSheet(sheet)}
        />
      )}
      <Toast message={toast} />
    </div>
  )
}
