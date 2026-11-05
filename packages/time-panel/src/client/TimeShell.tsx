import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { Tag } from 'dsh-secretary-tag/contract'
import type { DeepLevel } from 'dsh-secretary-time-block/contract'
import type { TimeWindowProjection } from '../types.ts'
import { DatePicker } from './DatePicker.tsx'
import { DeepWeekView, type DeepRect } from './DeepWeekView.tsx'
import {
  CELL, addDays, atMinute, clock, durationLabel, localDate, recordsOfDay, weekStartOf,
  type DayRecord, type Run,
} from './model.ts'
import { productStyles } from './productStyles.ts'
import { TimeCanvas } from './TimeCanvas.tsx'

type Module = 'time' | 'deep'
type TimeView = 'actual' | 'plan'

interface UndoEntry {
  readonly layer: TimeView
  readonly dates: readonly { date: string; records: readonly DayRecord[] }[]
}

interface SheetTarget {
  readonly layer: TimeView
  readonly date: string
  readonly record: DayRecord
}

const MODULES: { id: Module; name: string; icon: React.ReactNode }[] = [
  { id: 'time', name: '时间块', icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><rect x="2" y="2" width="12" height="12" rx="3" /><path d="M2 6h12M6 6v8" /></svg> },
  { id: 'deep', name: '深度时间', icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M2 12l3.5-5 3 3.5L12 4" /><path d="M2 14h12" /></svg> },
]

function dayLabel(date: string): string {
  const value = new Date(`${date}T12:00:00`)
  return `${value.getMonth() + 1}月${value.getDate()}日 ${['周日', '周一', '周二', '周三', '周四', '周五', '周六'][value.getDay()]}`
}

function weekLabel(weekStart: string): string {
  const start = new Date(`${weekStart}T12:00:00`)
  const end = new Date(`${addDays(weekStart, 6)}T12:00:00`)
  return `${start.getMonth() + 1}月${start.getDate()}日 – ${end.getMonth() + 1}月${end.getDate()}日`
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
  const [module, setModule] = useState<Module>('time')
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
  const titleRef = useRef<HTMLButtonElement | null>(null)
  const [picker, setPicker] = useState<'time' | 'deep' | null>(null)
  const shellRef = useRef<HTMLDivElement | null>(null)

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

  const recordsOf = useCallback((layer: TimeView, date: string) => (
    state === undefined ? [] : recordsOfDay(layerBlocks(layer), date, timeZone, state.nowMs)
  ), [layerBlocks, state, timeZone])

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
      className="sec-shell" ref={shellRef} data-time-remote
      data-remote-state={state === undefined ? (error === '' ? 'loading' : 'error') : 'ready'}
    >
      <style>{productStyles}</style>
      <header className="sec-head">
        <button className="sec-hbtn" type="button" aria-label="一级模块" onClick={() => setDrawer(value => !value)}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2.5 4h11M2.5 8h11M2.5 12h11" /></svg>
        </button>
        <button ref={titleRef} className="sec-title" type="button" aria-expanded={subMenu} onClick={() => (subMenu ? setSubMenu(false) : openSubMenu())}>
          <span>{MODULES.find(item => item.id === module)?.name ?? ''}</span>
          <span className="tsub">{titleSub}</span>
          <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M2.5 4.5L6 8l3.5-3.5" /></svg>
        </button>
        <span className="grow" />
        <button className="sec-hbtn" type="button" aria-label={module === 'deep' ? '上一周' : '上一天'} onClick={() => step(module === 'deep' ? -7 : -1)}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M9.5 4L5.5 8l4 4" /></svg>
        </button>
        <button
          className="sec-daylabel" type="button" aria-label={module === 'deep' ? '选择一周' : '选择日期'}
          aria-expanded={picker !== null} onClick={() => setPicker(picker === null ? module : null)}
        >
          {module === 'deep' ? weekLabel(weekStart) : dayLabel(topDate)}
        </button>
        <button className="sec-hbtn" type="button" aria-label={module === 'deep' ? '下一周' : '下一天'} onClick={() => step(module === 'deep' ? 7 : 1)}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M6.5 4l4 4-4 4" /></svg>
        </button>
        <button className="sec-now" type="button" onClick={() => step(0)}>{module === 'deep' ? '本周' : '今天'}</button>
        <button className="sec-hbtn" type="button" title="撤销" disabled={undoStack.length === 0 || busy} onClick={() => void undo()}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M3 7h6.5a3.5 3.5 0 010 7H6" /><path d="M5.5 4L2.5 7l3 3" /></svg>
        </button>
      </header>

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

      <div className={`sec-scrim${drawer ? ' on' : ''}`} onClick={() => setDrawer(false)} />
      <nav className={`sec-drawer${drawer ? ' on' : ''}`}>
        <div className="cap">小秘书</div>
        {MODULES.map(item => (
          <button
            key={item.id} className={`sec-mrow${module === item.id ? ' on' : ''}`} type="button"
            onClick={() => { setModule(item.id); setDrawer(false); setPicker(null) }}
          >
            {item.icon}
            {item.name}
          </button>
        ))}
      </nav>

      {sheet !== undefined && (
        <RecordSheet
          target={sheet} tags={state?.tags ?? []} busy={busy} onClose={() => setSheet(undefined)}
          onSave={patch => void saveSheet(sheet, patch)} onDelete={() => void deleteRecord(sheet)}
        />
      )}
      <div className={`sec-toast${toast === '' ? '' : ' on'}`}>{toast}</div>
    </div>
  )
}

interface SheetProps {
  readonly target: SheetTarget
  readonly tags: readonly Tag[]
  readonly busy: boolean
  readonly onClose: () => void
  readonly onSave: (patch: { start: number; end: number; timeTagId: number; note?: string }) => void
  readonly onDelete: () => void
}

function RecordSheet({ target, tags, busy, onClose, onSave, onDelete }: SheetProps) {
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
    <div className="sec-sheet on" role="dialog" aria-label="编辑记录">
      <div className="grab" />
      <div className="row">
        <span className="time">{clock(start)} – {clock(end)}</span>
        <span className="dur">{durationLabel(end - start)}</span>
        <span className="grow" />
        <button className="sec-step" type="button" disabled={end - start <= CELL} onClick={() => setStart(Math.max(0, start - CELL))}>−</button>
        <button className="sec-step" type="button" disabled={end >= 1440} onClick={() => setEnd(Math.min(1440, end + CELL))}>＋</button>
      </div>
      <div className="sec-picks">
        {timeTags.map(tag => (
          <button key={tag.id} type="button" className={tag.id === tagId ? 'on' : ''} style={{ background: tag.color ?? '#477bc7' }} onClick={() => setTagId(tag.id)}>{tag.name}</button>
        ))}
      </div>
      <input className="sec-note" placeholder="备注（可空）" value={note} onChange={event => setNote(event.target.value)} />
      <div className="sec-acts">
        <button className="sec-btn danger" type="button" disabled={busy} onClick={onDelete}>删除</button>
        <button className="sec-btn primary" type="button" disabled={busy} onClick={() => onSave({ start, end, timeTagId: tagId, note: note === '' ? undefined : note })}>完成</button>
      </div>
    </div>
  )
}
