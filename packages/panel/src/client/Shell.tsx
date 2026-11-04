import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Tag } from 'dsh-secretary-tag/contract'
import type { DeepLevel } from 'dsh-secretary-time-block/contract'
import { fetchState, sendCommand, type PanelCommand, type PanelState, type PanelWarning } from './api.ts'
import { DeepWeekView, type DeepRect } from './DeepWeekView.tsx'
import { GtdWorkspace } from './GtdWorkspace.tsx'
import {
  CELL, addDays, atMinute, clock, durationLabel, localDate, recordsOfDay, weekStartOf,
  type DayRecord, type Run,
} from './model.ts'
import { gtdStyles } from './gtdStyles.ts'
import { productStyles } from './productStyles.ts'
import { TimeCanvas } from './TimeCanvas.tsx'

type Module = 'time' | 'deep' | 'gtd' | 'goal' | 'tags' | 'settings'
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
  { id: 'gtd', name: '事项', icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M3 4.5l1.6 1.6L7.5 3" /><path d="M3 11.5l1.6 1.6L7.5 10" /><path d="M9.5 4.8h4M9.5 11.8h4" /></svg> },
  { id: 'goal', name: '目标', icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><circle cx="8" cy="8" r="5.5" /><circle cx="8" cy="8" r="2.2" /></svg> },
  { id: 'tags', name: '标签', icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M7.5 2H13v5.5L7.8 12.7a1.4 1.4 0 01-2 0L3.3 10.2a1.4 1.4 0 010-2z" /><circle cx="10.8" cy="5.2" r=".9" /></svg> },
  { id: 'settings', name: '设置', icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><circle cx="8" cy="8" r="2.2" /><path d="M8 1.6v1.6M8 12.8v1.6M1.6 8h1.6M12.8 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M12.6 3.4l-1.1 1.1M4.5 11.5l-1.1 1.1" /></svg> },
]

const PLACEHOLDERS: Partial<Record<Module, { title: string; body: string }>> = {
  goal: { title: '目标', body: '目标树、季度进度和复盘还没做。这一块先空着。' },
  tags: { title: '标签', body: '时间标签 / 情境标签的增删改，下一步做。' },
  settings: { title: '设置', body: '这里将来放默认时区、每格时长和主题。' },
}

function timeZoneOf(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai'
}

export function SecretaryProduct() {
  const timeZone = useMemo(timeZoneOf, [])
  const [module, setModule] = useState<Module>('time')
  const [timeView, setTimeView] = useState<TimeView>('actual')
  const [today] = useState(() => localDate())
  const [forecastDate, setForecastDate] = useState(() => localDate())
  const [range, setRange] = useState(() => ({ from: addDays(localDate(), -3), to: addDays(localDate(), 10) }))
  const [focus, setFocus] = useState(() => ({ date: localDate(), token: 1 }))
  const [topDate, setTopDate] = useState(() => localDate())
  const [weekStart, setWeekStart] = useState(() => weekStartOf(localDate()))
  const [state, setState] = useState<PanelState>()
  const [drawer, setDrawer] = useState(false)
  const [subMenu, setSubMenu] = useState(false)
  const [sheet, setSheet] = useState<SheetTarget>()
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([])
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')
  const [error, setError] = useState('')
  const toastTimer = useRef<number>(0)
  const titleRef = useRef<HTMLButtonElement | null>(null)
  const shellRef = useRef<HTMLDivElement | null>(null)

  const say = useCallback((message: string) => {
    setToast(message)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(''), 1600)
  }, [])

  const load = useCallback(async (): Promise<PanelState | undefined> => {
    try {
      const next = await fetchState(today, timeZone, weekStart, range.from, range.to)
      setState(next)
      setError('')
      return next
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
      return undefined
    }
  }, [today, timeZone, weekStart, range])

  useEffect(() => { void load() }, [load])

  /** Grow the canvas window by a week at one end, trimming the other end once it is long enough. */
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

  /** Jump the canvas to one date and keep a little before it in view. */
  const jumpTo = useCallback((date: string) => {
    setRange({ from: addDays(date, -3), to: addDays(date, 10) })
    setTopDate(date)
    setFocus(previous => ({ date, token: previous.token + 1 }))
  }, [])

  const run = useCallback(async (command: PanelCommand): Promise<boolean> => {
    setBusy(true)
    try {
      await sendCommand({ ...command, timeZone } as PanelCommand)
      await load()
      return true
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason)
      setError(message)
      say(message)
      return false
    } finally {
      setBusy(false)
    }
  }, [load, say, timeZone])

  const layerBlocks = useCallback((layer: TimeView) => {
    if (state === undefined) return []
    return layer === 'plan' ? state.plan : state.actual
  }, [state])

  const recordsOf = useCallback((layer: TimeView, date: string) => (
    state === undefined ? [] : recordsOfDay(layerBlocks(layer), date, timeZone, state.nowMs)
  ), [layerBlocks, state, timeZone])

  /** Paint the selected runs; keep the pre-paint day as the Undo state. */
  const paint = useCallback(async (layer: TimeView, runs: readonly Run[], tagId: number | null) => {
    if (state === undefined || runs.length === 0) return
    const dates = [...new Set(runs.map(run => run.date))]
    const snapshot = dates.map(date => ({ date, records: recordsOf(layer, date) }))
    const ok = await run({ domain: 'time', op: 'paint', layer, tagId, runs })
    if (!ok) return
    setUndoStack(previous => [{ layer, dates: snapshot }, ...previous].slice(0, 50))
    say(tagId === null ? '已擦除' : '已上色')
  }, [recordsOf, run, say, state])

  const undo = useCallback(async () => {
    const entry = undoStack[0]
    if (entry === undefined || busy) return
    setUndoStack(previous => previous.slice(1))
    setBusy(true)
    try {
      for (const day of entry.dates) {
        await sendCommand({
          domain: 'time', op: 'replace', layer: entry.layer, date: day.date,
          intervals: day.records.map(record => ({ start: record.start, end: record.end, timeTagId: record.timeTagId, note: record.note })),
          timeZone,
        } as PanelCommand)
      }
      await load()
      say('已撤销')
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason)
      setError(message)
      say(message)
    } finally {
      setBusy(false)
    }
  }, [busy, load, say, timeZone, undoStack])

  const paintDeep = useCallback(async (rects: readonly DeepRect[], level: DeepLevel | null) => {
    const ok = await run({ domain: 'deep', op: 'paint', weekStart, level, rects })
    if (ok) say(level === null ? '已擦除' : '已记录')
  }, [run, say, weekStart])

  const saveSheet = useCallback(async (target: SheetTarget, patch: { start: number; end: number; timeTagId: number; note?: string }) => {
    const ok = await run({
      domain: 'time', op: 'update', layer: target.layer, id: target.record.id,
      timeTagId: patch.timeTagId, note: patch.note ?? null,
      startAt: atMinute(target.date, patch.start), endAt: atMinute(target.date, patch.end),
    })
    if (ok) setSheet(undefined)
  }, [run])

  const deleteRecord = useCallback(async (target: SheetTarget) => {
    const ok = await run({ domain: 'time', op: 'delete', layer: target.layer, id: target.record.id })
    if (ok) { setSheet(undefined); say('已删除') }
  }, [run, say])

  const titleSub = module === 'time' ? (timeView === 'plan' ? '计划' : '实录') : ''
  const warnings: PanelWarning[] = state?.warnings ?? []

  const subItems = module === 'time'
    ? [{ id: 'actual' as const, name: '实录' }, { id: 'plan' as const, name: '计划' }]
    : []

  const openSubMenu = () => {
    if (subItems.length === 0) { setDrawer(true); return }
    setSubMenu(true)
  }

  return (
    <div className="sec-shell" ref={shellRef}>
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
        <input
          className="sec-date"
          type="date"
          aria-label="跳到某一天"
          value={topDate}
          onChange={event => { if (event.target.value !== '') jumpTo(event.target.value) }}
        />
        <button className="sec-hbtn" type="button" title="撤销" disabled={undoStack.length === 0 || busy} onClick={() => void undo()}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M3 7h6.5a3.5 3.5 0 010 7H6" /><path d="M5.5 4L2.5 7l3 3" /></svg>
        </button>
      </header>

      <div className="sec-views">
        <section className="sec-view on" style={{ display: module === 'time' && timeView === 'actual' ? 'flex' : 'none' }}>
          {state !== undefined && module === 'time' && timeView === 'actual' && (
            <TimeCanvas
              layer="actual"
              days={state.days}
              today={state.today}
              nowMs={state.nowMs}
              timeZone={timeZone}
              focus={focus}
              onExtend={extendRange}
              onTopDateChange={setTopDate}
              blocks={state.actual}
              tags={state.tags}
              busy={busy}
              onAssign={(runs, tagId) => void paint('actual', runs, tagId)}
              onEdit={(date, record) => setSheet({ layer: 'actual', date, record })}
              onOpenTags={() => setModule('tags')}
            />
          )}
        </section>
        <section className="sec-view on" style={{ display: module === 'time' && timeView === 'plan' ? 'flex' : 'none' }}>
          {state !== undefined && module === 'time' && timeView === 'plan' && (
            <TimeCanvas
              layer="plan"
              days={state.days}
              today={state.today}
              nowMs={state.nowMs}
              timeZone={timeZone}
              focus={focus}
              onExtend={extendRange}
              onTopDateChange={setTopDate}
              blocks={state.plan}
              tags={state.tags}
              busy={busy}
              onAssign={(runs, tagId) => void paint('plan', runs, tagId)}
              onEdit={(date, record) => setSheet({ layer: 'plan', date, record })}
              onOpenTags={() => setModule('tags')}
            />
          )}
        </section>
        <section className="sec-view on" style={{ display: module === 'deep' ? 'flex' : 'none' }}>
          {module === 'deep' && <DeepWeekView
            week={state?.deep}
            weekStart={weekStart}
            today={state?.today ?? localDate()}
            busy={busy}
            onWeekChange={setWeekStart}
            onPaint={(rects, level) => void paintDeep(rects, level)}
          />}
        </section>
        <section className="sec-view on" style={{ display: module === 'gtd' ? 'flex' : 'none' }}>
          <div className="sec-gtd-host secretary-time-panel">
            <style>{gtdStyles}</style>
            {state !== undefined && module === 'gtd' && (
              <GtdWorkspace
                tags={state.tags}
                inbox={state.inbox}
                projects={state.projects}
                actions={state.actions}
                nextActions={state.nextActions}
                forecast={state.forecast}
                forecastDate={forecastDate}
                onForecastDateChange={setForecastDate}
                busy={busy}
                run={async (command) => run({ ...command, timeZone } as PanelCommand)}
              />
            )}
          </div>
        </section>
        {(Object.keys(PLACEHOLDERS) as Module[]).map(id => (
          <section key={id} className={`sec-view${module === id ? ' on' : ''}`}>
            <div className="sec-placeholder">
              <div className="ph-t">{PLACEHOLDERS[id]?.title}</div>
              <div className="ph-d">{PLACEHOLDERS[id]?.body}</div>
            </div>
          </section>
        ))}
      </div>

      {error !== '' && <div className="sec-toast on" style={{ bottom: 52 }}>{error}</div>}
      {warnings.length > 0 && module === 'gtd' && <div className="sec-toast on" style={{ bottom: 52 }}>事项读取失败：{warnings[0].message}</div>}

      {subMenu && subItems.length > 0 && (
        <div className="sec-smenu on" style={{ left: 44, top: 42 }}>
          {subItems.map(item => (
            <button
              key={item.id}
              type="button"
              className={timeView === item.id ? 'on' : ''}
              onClick={() => { setTimeView(item.id); setSubMenu(false) }}
            >
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
            key={item.id}
            className={`sec-mrow${module === item.id ? ' on' : ''}`}
            type="button"
            onClick={() => { setModule(item.id); setDrawer(false) }}
          >
            {item.icon}
            {item.name}
          </button>
        ))}
      </nav>

      {sheet !== undefined && (
        <RecordSheet
          target={sheet}
          tags={state?.tags ?? []}
          busy={busy}
          onClose={() => setSheet(undefined)}
          onSave={patch => void saveSheet(sheet, patch)}
          onDelete={() => void deleteRecord(sheet)}
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

/** Bottom sheet for one record: its span, its tag, its note, and deletion. */
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
          <button
            key={tag.id}
            type="button"
            className={tag.id === tagId ? 'on' : ''}
            style={{ background: tag.color ?? '#477bc7' }}
            onClick={() => setTagId(tag.id)}
          >{tag.name}</button>
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
