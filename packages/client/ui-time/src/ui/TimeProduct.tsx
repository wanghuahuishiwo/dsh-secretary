import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  DeepLevel, DeepRect, TimeBlockView, TimeLayer, TimeProductProps, TimeView,
} from './contract.ts'
import { DatePicker } from './DatePicker.tsx'
import { DeepWeekView } from './DeepWeekView.tsx'
import { Drawer } from './Drawer.tsx'
import { RecordsSheet, type SheetTarget } from './RecordsSheet.tsx'
import { TimeCanvas } from './TimeCanvas.tsx'
import { TimeHeader, dayLabel, weekLabel, type TimeModule } from './TimeHeader.tsx'
import { Toast } from './Toast.tsx'
import { createChangeReload, type ChangeReload } from './changeReload.ts'
import {
  addDays, anchorNow, localDate, weekStartOf,
  type DayRecord, type NowAnchor, type Run, type TimeTag,
} from './model.ts'
import { useLocalNow } from './useLocalNow.ts'
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
export function TimeProduct({ adapter, theme = 'dark', today: openingDay }: TimeProductProps) {
  const openingDate = openingDay ?? FALLBACK_TODAY
  const appRef = useRef<HTMLDivElement | null>(null)
  const [module, setModule] = useState<TimeModule>('actual')
  const [anchor] = useState(() => openingDate)
  const [range, setRange] = useState(() => ({ from: addDays(openingDate, -3), to: addDays(openingDate, 10) }))
  const [focus, setFocus] = useState(() => ({ date: openingDate, token: 1 }))
  const [topDate, setTopDate] = useState(() => openingDate)
  const [weekStart, setWeekStart] = useState(() => weekStartOf(openingDate))
  const [view, setView] = useState<TimeView>()
  // The host is authoritative at every answer; between answers the surface
  // advances “now” on its own clock. Every answer re-anchors it, including one
  // whose data turns out to be equal and therefore never reaches `view`.
  const [nowAnchor, setNowAnchor] = useState<NowAnchor>()
  const rememberAnswer = useCallback((next: TimeView) => {
    setNowAnchor(anchorNow(next.nowMinute, next.today, Date.now()))
  }, [])
  const now = useLocalNow(nowAnchor, appRef)
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
    rememberAnswer(next)
    setError('')
  }, [adapter, anchor, range, rememberAnswer, weekStart])

  useEffect(() => {
    void load().catch((reason: unknown) => { setError(messageOf(reason)) })
  }, [load])

  // A surface kept open longer than the loaded window spans loses its new
  // “today” when the local day rolls past the window edge; one read wins it back.
  const lastDay = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (now === undefined || lastDay.current === now.day) return
    lastDay.current = now.day
    if (view !== undefined && !view.days.includes(now.day)) void load()
  }, [load, now, view])

  // A local interaction owns the surface while a write is in flight or an
  // editor is open; pushed repaints hold back until it is released.
  const heldRef = useRef(false)
  const viewRef = useRef<TimeView | undefined>(undefined)
  viewRef.current = view
  const changeRef = useRef<ChangeReload | undefined>(undefined)

  // Host-pushed change marks: the watch stream says a mutation persisted, and
  // only a real data change repaints. Persistence re-reads stay on refresh.
  useEffect(() => {
    const stopWatch = adapter.watch?.(() => { changeRef.current?.notify() })
    return stopWatch
  }, [adapter])

  useEffect(() => {
    if (adapter.watch === undefined || view === undefined) return
    const ticket = revision.current
    const reload = createChangeReload({
      load: () => adapter.load({ anchor, from: range.from, to: range.to, weekStart })
        .then((next) => { rememberAnswer(next); return next }),
      current: () => viewRef.current ?? view,
      apply: (next) => {
        if (revision.current !== ticket) return
        setView(next)
        setError('')
      },
      isHeld: () => heldRef.current,
    })
    changeRef.current = reload
    return () => {
      if (changeRef.current === reload) changeRef.current = undefined
      reload.dispose()
    }
  }, [adapter, anchor, range, rememberAnswer, view === undefined, weekStart])

  useEffect(() => {
    heldRef.current = busy || sheet !== undefined || picker !== null
    if (!heldRef.current) changeRef.current?.release()
  }, [busy, picker, sheet])

  /** 重新读取持久化数据：宿主的数据层持有内存快照，刷新是一次显式重读。 */
  const refresh = useCallback(async () => {
    const ticket = revision.current + 1
    revision.current = ticket
    setBusy(true)
    try {
      const next = await adapter.refresh({ anchor, from: range.from, to: range.to, weekStart })
      if (revision.current === ticket) {
        setView(next)
        rememberAnswer(next)
        setError('')
      }
      say('已刷新')
    } catch (reason) {
      const text = messageOf(reason)
      if (revision.current === ticket) setError(text)
      say(text)
    } finally {
      setBusy(false)
    }
  }, [adapter, anchor, range, rememberAnswer, say, weekStart])

  const runWrite = useCallback(async (
    operation: () => Promise<TimeView>, message: string | undefined,
  ): Promise<boolean> => {
    const ticket = revision.current + 1
    revision.current = ticket
    setBusy(true)
    try {
      const next = await operation()
      if (revision.current === ticket) {
        setView(next)
        rememberAnswer(next)
        setError('')
      }
      // 备注自动保存不弹成功 Toast；只有失败的既有错误提示会说话。
      if (message !== undefined) say(message)
      return true
    } catch (reason) {
      const text = messageOf(reason)
      if (revision.current === ticket) setError(text)
      say(text)
      return false
    } finally {
      setBusy(false)
    }
  }, [rememberAnswer, say])

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

  // The adapter's `today` is authoritative once loaded, and the local clock keeps
  // it current after midnight, so 今天 / 本周 land on the product day even when
  // the host clock and a pinned fixture disagree.
  const productToday = now?.day ?? view?.today ?? openingDate

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

  /** 详情 sheet 的备注自动保存：沿用现有 updateBlock，不弹成功 Toast，失败由既有错误通道呈现。 */
  const saveNote = useCallback(async (target: SheetTarget, record: DayRecord, note: string | undefined) => {
    await runWrite(
      () => adapter.updateBlock({
        layer: target.layer,
        id: indexes.block.string(record.id),
        date: target.date,
        start: record.start,
        end: record.end,
        tagId: indexes.tag.string(record.timeTagId),
        note,
      }),
      undefined,
    )
  }, [adapter, indexes, runWrite])

  /** 删除记录是详情里的次级文字操作；成功后才关闭整张 sheet。 */
  const deleteRecord = useCallback(async (target: SheetTarget, record: DayRecord) => {
    const ok = await runWrite(
      () => adapter.deleteBlock({ layer: target.layer, id: indexes.block.string(record.id) }),
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
        rememberAnswer(next)
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
  }, [adapter, busy, layer, rememberAnswer, say, view])

  const tags = useMemo<TimeTag[]>(() => (view?.tags ?? []).map(tag => ({
    id: indexes.tag.number(tag.id),
    name: tag.name,
    kind: 'time',
    parentId: tag.parentId === undefined ? undefined : indexes.tag.number(tag.parentId),
    color: tag.color,
    description: tag.description,
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

  /** 画布与记录 sheet 共用的标签解析；解析失败回退「标签 {id}」。 */
  const tagNameOf = useCallback((id: number) => tags.find(tag => tag.id === id)?.name ?? `标签 ${id}`, [tags])
  const tagColorOf = useCallback((id: number) => tags.find(tag => tag.id === id)?.color ?? 'var(--tb-text-tertiary)', [tags])

  /** sheet 的列表内容：被点击的那一格此刻覆盖的全部记录。 */
  const sheetRecords = useMemo(() => {
    if (sheet === undefined) return []
    const list = records[sheet.layer].get(sheet.date) ?? []
    return list.filter(record => record.start <= sheet.minute && sheet.minute < record.end)
  }, [records, sheet])

  /** 点记录块：单条直接进详情，同格多条先拉出「N 条并行记录」列表。 */
  const openCell = useCallback((date: string, minute: number) => {
    const list = (records[layer].get(date) ?? []).filter(record => record.start <= minute && minute < record.end)
    if (list.length === 0) return
    setSheet(list.length === 1
      ? { layer, date, minute, recordId: list[0].id }
      : { layer, date, minute })
  }, [layer, records])

  /** 详情左上角返回列表：只降一层，保留列表层。 */
  const backToSheetList = useCallback(() => {
    setSheet(current => (
      current === undefined ? current : { layer: current.layer, date: current.date, minute: current.minute }
    ))
  }, [])

  const openSheetRecord = useCallback((recordId: number) => {
    setSheet(current => (current === undefined ? current : { ...current, recordId }))
  }, [])

  // 记录被 Undo 或宿主推送移走时，整张 sheet 关闭而不是留下空壳。
  useEffect(() => {
    if (sheet !== undefined && sheetRecords.length === 0) setSheet(undefined)
  }, [sheet, sheetRecords.length])

  const deepWeek = useMemo(() => view === undefined ? undefined : {
    weekStart: view.weekStart,
    source: view.deep.source,
    cells: view.deep.levels.map(level => ({ level })),
  }, [view])

  const today = productToday

  return (
    <div
      className="tb-app"
      data-tb-theme={theme}
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
        onRefresh={() => void refresh()}
      />

      <div className="tb-views">
        {module !== 'deep' && view !== undefined && (
          <section className="tb-view on">
            <TimeCanvas
              key={module}
              layer={layer} days={view.days} today={today} nowMinute={now?.minute ?? view.nowMinute}
              focus={focus} onExtend={extendRange} onTopDateChange={setTopDate} records={records[layer]} tags={tags}
              busy={busy} onAssign={(runs, tagId, mode) => void paint(layer, runs, tagId, mode)}
              onOpen={(date, minute) => openCell(date, minute)}
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
        <RecordsSheet
          target={sheet}
          records={sheetRecords}
          tagName={tagNameOf}
          tagColor={tagColorOf}
          busy={busy}
          onClose={() => setSheet(undefined)}
          onBack={backToSheetList}
          onOpenRecord={openSheetRecord}
          onNoteChange={(record, note) => void saveNote(sheet, record, note)}
          onDelete={record => void deleteRecord(sheet, record)}
        />
      )}
      <Toast message={toast} />
    </div>
  )
}
