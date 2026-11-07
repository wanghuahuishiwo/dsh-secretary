import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { DeepLevel } from 'dsh-secretary-time-block/contract'
import type { TimeWindowProjection } from '../types.ts'
import { DatePicker } from '../ui/DatePicker.tsx'
import { DeepWeekView, type DeepRect } from '../ui/DeepWeekView.tsx'
import { Drawer } from '../ui/Drawer.tsx'
import { RecordSheet, type SheetTarget } from '../ui/RecordSheet.tsx'
import { TimeCanvas } from '../ui/TimeCanvas.tsx'
import { TimeHeader, dayLabel, weekLabel, type TimeModule } from '../ui/TimeHeader.tsx'
import { Toast } from '../ui/Toast.tsx'
import { addDays, atMinute, localDate, recordsOfDay, weekStartOf } from '../ui/model.ts'
import type { DayRecord, Run } from '../ui/model.ts'
import { timeStyles } from '../ui/styles.ts'

type TimeView = 'actual' | 'plan'

interface UndoEntry {
  readonly layer: TimeView
  readonly dates: readonly { date: string; records: readonly DayRecord[] }[]
}

function timeZoneOf(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai'
}

function messageOf(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason)
}

/** The complete Time-only product; every domain operation uses its generated Remote client. */
export function TimeShell({ ctx }: { readonly ctx: Context }) {
  const timeZone = useMemo(timeZoneOf, [])
  const [module, setModule] = useState<TimeModule>('time')
  const [timeView, setTimeView] = useState<TimeView>('actual')
  const [today] = useState(() => localDate())
  const [range, setRange] = useState(() => ({ from: addDays(localDate(), -3), to: addDays(localDate(), 10) }))
  const [focus, setFocus] = useState(() => ({ date: localDate(), token: 1 }))
  const [topDate, setTopDate] = useState(() => localDate())
  const [weekStart, setWeekStart] = useState(() => weekStartOf(localDate()))
  const [state, setState] = useState<TimeWindowProjection>()
  const [drawer, setDrawer] = useState(false)
  const [subMenu, setSubMenu] = useState(false)
  const [sheet, setSheet] = useState<SheetTarget>()
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([])
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')
  const [error, setError] = useState('')
  const toastTimer = useRef<number>(0)
  const [picker, setPicker] = useState<'time' | 'deep' | null>(null)

  const say = useCallback((message: string) => {
    setToast(message)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(''), 1600)
  }, [])

  const load = useCallback(async (): Promise<TimeWindowProjection> => {
    const result = await ctx.remote.secretaryTime.readWindow({
      anchor: today, timeZone, weekStart, from: range.from, to: range.to,
    })
    if (!result.ok) throw result.error
    setState(result.value)
    setError('')
    return result.value
  }, [ctx, today, timeZone, weekStart, range])

  useEffect(() => {
    void load().catch((reason: unknown) => { setError(messageOf(reason)) })
  }, [load])

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

  const run = useCallback(async <T,>(call: () => Promise<RemoteResult<T>>): Promise<boolean> => {
    setBusy(true)
    try {
      const result = await call()
      if (!result.ok) throw result.error
      await load()
      return true
    } catch (reason) {
      const message = messageOf(reason)
      setError(message)
      say(message)
      return false
    } finally {
      setBusy(false)
    }
  }, [load, say])

  const layerBlocks = useCallback((layer: TimeView) => {
    if (state === undefined) return []
    return layer === 'plan' ? state.plan : state.actual
  }, [state])

  const recordsOf = useCallback((layer: TimeView, date: string) => {
    if (state === undefined) return [] as DayRecord[]
    return recordsOfDay(layerBlocks(layer), date, timeZone, state.nowMs)
  }, [layerBlocks, state, timeZone])

  const paint = useCallback(async (layer: TimeView, runs: readonly Run[], tagId: number | null) => {
    if (state === undefined || runs.length === 0) return
    const dates = [...new Set(runs.map(run => run.date))]
    const snapshot = dates.map(date => ({ date, records: recordsOf(layer, date) }))
    const ok = await run(() => ctx.remote.secretaryTime.paint({ layer, tagId, runs, timeZone }))
    if (!ok) return
    setUndoStack(previous => [{ layer, dates: snapshot }, ...previous].slice(0, 50))
    say(tagId === null ? '已擦除' : '已上色')
  }, [ctx, recordsOf, run, say, state, timeZone])

  const undo = useCallback(async () => {
    const entry = undoStack[0]
    if (entry === undefined || busy) return
    setUndoStack(previous => previous.slice(1))
    setBusy(true)
    try {
      for (const day of entry.dates) {
        const result = await ctx.remote.secretaryTime.replaceDay({
          layer: entry.layer, date: day.date, timeZone,
          intervals: day.records.map(record => ({ start: record.start, end: record.end, timeTagId: record.timeTagId, note: record.note })),
        })
        if (!result.ok) throw result.error
      }
      await load()
      say('已撤销')
    } catch (reason) {
      const message = messageOf(reason)
      setError(message)
      say(message)
    } finally {
      setBusy(false)
    }
  }, [busy, ctx, load, say, timeZone, undoStack])

  const paintDeep = useCallback(async (rects: readonly DeepRect[], level: DeepLevel | null) => {
    const ok = await run(() => ctx.remote.secretaryTime.paintDeep({ weekStart, level, rects }))
    if (ok) say(level === null ? '已擦除' : '已记录')
  }, [ctx, run, say, weekStart])

  const saveSheet = useCallback(async (target: SheetTarget, patch: { start: number; end: number; timeTagId: number; note?: string }) => {
    const ok = await run(() => ctx.remote.secretaryTime.updateBlock({
      layer: target.layer, id: target.record.id,
      timeTagId: patch.timeTagId, note: patch.note ?? null,
      startAt: atMinute(target.date, patch.start), endAt: atMinute(target.date, patch.end),
    }))
    if (ok) setSheet(undefined)
  }, [ctx, run])

  const deleteRecord = useCallback(async (target: SheetTarget) => {
    const ok = await run(() => ctx.remote.secretaryTime.deleteBlock({ layer: target.layer, id: target.record.id }))
    if (ok) { setSheet(undefined); say('已删除') }
  }, [ctx, run, say])

  const switchTimeView = useCallback((next: TimeView) => {
    setTimeView(next)
    setFocus(previous => ({ date: topDate, token: previous.token + 1 }))
  }, [topDate])

  const step = useCallback((amount: number) => {
    if (module === 'deep') {
      setWeekStart(amount === 0 ? weekStartOf(localDate()) : addDays(weekStart, amount))
      return
    }
    jumpTo(amount === 0 ? localDate() : addDays(topDate, amount))
  }, [jumpTo, module, topDate, weekStart])

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

  const titleSub = module === 'time' ? (timeView === 'plan' ? '计划' : '实录') : ''
  const subItems = module === 'time'
    ? [{ id: 'actual' as const, name: '实录' }, { id: 'plan' as const, name: '计划' }]
    : []
  const openSubMenu = () => {
    if (subItems.length === 0) { setDrawer(true); return }
    setSubMenu(true)
  }

  return (
    <div
      className="sec-shell"
      data-time-remote
      data-remote-state={state === undefined ? (error === '' ? 'loading' : 'error') : 'ready'}
    >
      <style>{timeStyles}</style>
      <TimeHeader
        module={module}
        titleSub={titleSub}
        dateLabel={module === 'deep' ? weekLabel(weekStart) : dayLabel(topDate)}
        canUndo={undoStack.length > 0}
        busy={busy}
        subMenuOpen={subMenu}
        pickerOpen={picker !== null}
        onDrawer={() => setDrawer(value => !value)}
        onSubMenu={() => (subMenu ? setSubMenu(false) : openSubMenu())}
        onPicker={() => setPicker(picker === null ? module : null)}
        onStep={step}
        onUndo={() => void undo()}
      />

      <div className="sec-views">
        <section className="sec-view on" style={{ display: module === 'time' && timeView === 'actual' ? 'flex' : 'none' }}>
          {state !== undefined && module === 'time' && timeView === 'actual' && (
            <TimeCanvas
              layer="actual" days={state.days} today={state.today} nowMs={state.nowMs} timeZone={timeZone}
              focus={focus} onExtend={extendRange} onTopDateChange={setTopDate} blocks={state.actual} tags={state.tags}
              busy={busy} onAssign={(runs, tagId) => void paint('actual', runs, tagId)}
              onEdit={(date, record) => setSheet({ layer: 'actual', date, record })}
            />
          )}
        </section>
        <section className="sec-view on" style={{ display: module === 'time' && timeView === 'plan' ? 'flex' : 'none' }}>
          {state !== undefined && module === 'time' && timeView === 'plan' && (
            <TimeCanvas
              layer="plan" days={state.days} today={state.today} nowMs={state.nowMs} timeZone={timeZone}
              focus={focus} onExtend={extendRange} onTopDateChange={setTopDate} blocks={state.plan} tags={state.tags}
              busy={busy} onAssign={(runs, tagId) => void paint('plan', runs, tagId)}
              onEdit={(date, record) => setSheet({ layer: 'plan', date, record })}
            />
          )}
        </section>
        <section className="sec-view on" style={{ display: module === 'deep' ? 'flex' : 'none' }}>
          {module === 'deep' && <DeepWeekView
            week={state?.deep} weekStart={weekStart} today={state?.today ?? localDate()} busy={busy}
            onPaint={(rects, level) => void paintDeep(rects, level)}
          />}
        </section>
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

      {error !== '' && <div className="sec-toast on" style={{ bottom: 52 }}>{error}</div>}

      {subMenu && subItems.length > 0 && (
        <div className="sec-smenu on" style={{ left: 44, top: 42 }}>
          {subItems.map(item => (
            <button key={item.id} type="button" className={timeView === item.id ? 'on' : ''} onClick={() => { switchTimeView(item.id); setSubMenu(false) }}>
              <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M2.5 6.2l2.4 2.4L9.5 4" /></svg>
              {item.name}
            </button>
          ))}
        </div>
      )}

      <Drawer
        open={drawer}
        module={module}
        onModuleChange={next => { setModule(next); setDrawer(false); setPicker(null) }}
        onClose={() => setDrawer(false)}
      />

      {sheet !== undefined && (
        <RecordSheet
          target={sheet} tags={state?.tags ?? []} busy={busy} onClose={() => setSheet(undefined)}
          onSave={patch => void saveSheet(sheet, patch)} onDelete={() => void deleteRecord(sheet)}
        />
      )}
      <Toast message={toast} />
    </div>
  )
}
