import { useEffect, useMemo, useRef, useState } from 'react'
import type { Tag, TagKind } from 'dsh-secretary-tag/contract'
import type { ActionView, InboxItem, Project } from 'dsh-secretary-gtd/contract'
import type {
  ActualBlock, ActualSource, DeepCell, DeepLevel, DeepWeek, FocusLevel, PlanBlock, PlanTemplateBlock,
} from 'dsh-secretary-time-block/contract'
import { fetchState, sendCommand, type PanelCommand, type PanelWarning } from './api.ts'
import { GtdWorkspace } from './GtdWorkspace.tsx'
import { Icon, IconSprite } from './Icons.tsx'
import { panelStyles } from './panelStyles.ts'

const DEFAULT_COLOR = '#477bc7'
const TAG_PALETTE = ['#477bc7', '#4c91b8', '#4b8b6a', '#4c9688', '#b17c32', '#b96f45', '#876cae', '#aa667e', '#6f7b86', '#8a715c']
const TAG_DRAG_MIME = 'application/x-secretary-tag-id'
const SOURCES: ActualSource[] = ['user_reported', 'agent_observed', 'imported']
const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
const MONTH_DAYS = ['一', '二', '三', '四', '五', '六', '日']

type TimeView = 'plan' | 'actual' | 'deep'
type ProductView = 'time' | 'tags' | 'gtd' | 'goal'
type CanvasKind = 'actual' | 'plan' | 'template'
type EditableBlock = ActualBlock | PlanBlock
type UndoCommand = PanelCommand & { readonly restoreOf?: number }

/** One drawable row on the canvas: a dated Actual/Plan block or a weekday PlanTemplate block. */
interface CanvasItem {
  readonly key: string
  readonly kind: CanvasKind
  readonly id: number
  readonly startMinute: number
  readonly endMinute: number
  readonly timeTagId: number
  readonly note?: string
  readonly startLabel: string
  readonly endLabel: string
  readonly running: boolean
  readonly block: EditableBlock | PlanTemplateBlock
}

interface DeepGesture {
  readonly brush: DeepLevel
  readonly operation: 'set' | 'clear'
  readonly cells: Map<string, { weekday: number; hour: number }>
}

interface EraseGesture {
  readonly timeTagId: number
  readonly candidates: Map<string, CanvasItem>
  selected: Map<string, CanvasItem>
}

interface Placement { readonly left: number; readonly top: number }

function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function shiftDate(date: string, amount: number): string {
  const value = new Date(`${date}T12:00:00`)
  value.setDate(value.getDate() + amount)
  return localDate(value)
}

function shiftMonth(month: string, amount: number): string {
  const [year, monthNumber] = month.split('-').map(Number)
  return localDate(new Date(year, monthNumber - 1 + amount, 1, 12)).slice(0, 7)
}

function weekdayOf(date: string): number {
  return (new Date(`${date}T12:00:00`).getDay() + 6) % 7 + 1
}

function dateLabel(date: string): string {
  const value = new Date(`${date}T12:00:00`)
  return `${value.getFullYear()} 年 ${value.getMonth() + 1} 月 ${value.getDate()} 日 · ${WEEKDAYS[(value.getDay() + 6) % 7]}`
}

function clock(minute: number): string {
  const value = ((minute % 1440) + 1440) % 1440
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`
}

function parseClock(value: string): number {
  const [hour, minute] = value.split(':').map(Number)
  return (Number.isFinite(hour) ? hour : 0) * 60 + (Number.isFinite(minute) ? minute : 0)
}

function atMinute(date: string, minute: number): string {
  const value = new Date(`${date}T00:00:00`)
  value.setMinutes(minute)
  return value.toISOString()
}

function timeLabel(instant: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(instant))
}

function dateAtInstant(instant: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(instant))
  const field = (type: string) => parts.find(part => part.type === type)?.value
  return `${field('year')}-${field('month')}-${field('day')}`
}

function flatten(tags: Tag[], kind: TagKind): { tag: Tag; depth: number }[] {
  const result: { tag: Tag; depth: number }[] = []
  const walk = (parentId: number | undefined, depth: number) => {
    for (const tag of tags.filter(item => item.kind === kind && item.parentId === parentId)) {
      result.push({ tag, depth })
      walk(tag.id, depth + 1)
    }
  }
  walk(undefined, 0)
  return result
}

function emptyDeepWeek(): DeepWeek {
  return {
    scope: 'base',
    cells: Array.from({ length: 168 }, (_, index) => ({
      weekday: Math.floor(index / 24) + 1, hour: index % 24, level: 'unset',
    })),
  }
}

/** Anchor a floating panel next to its trigger, clamped inside the viewport like the prototype. */
function place(anchor: DOMRect | undefined, height = 420): Placement {
  if (typeof window === 'undefined') return { left: 8, top: 8 }
  const width = 326
  const margin = 8
  let left = anchor ? anchor.right + margin : window.innerWidth - width - 16
  if (left + width > window.innerWidth - margin) left = anchor ? anchor.left - width - margin : margin
  left = Math.max(margin, Math.min(left, window.innerWidth - width - margin))
  const top = Math.max(margin, Math.min(anchor ? anchor.top : 80, window.innerHeight - height))
  return { left, top }
}

function laneOf(items: CanvasItem[]): Map<string, number> {
  const ends: number[] = []
  const lanes = new Map<string, number>()
  items.slice()
    .sort((left, right) => left.startMinute - right.startMinute || left.endMinute - right.endMinute || left.id - right.id)
    .forEach(item => {
      let lane = ends.findIndex(end => end <= item.startMinute)
      if (lane < 0) lane = ends.length
      ends[lane] = item.endMinute
      lanes.set(item.key, lane)
    })
  return lanes
}

export function ActualPanel() {
  const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai', [])
  const [product, setProduct] = useState<ProductView>('time')
  const [timeView, setTimeView] = useState<TimeView>('actual')
  const [date, setDate] = useState(localDate)
  const [forecastDate, setForecastDate] = useState(localDate)
  const [calendar, setCalendar] = useState<Placement>()
  const [calendarMonth, setCalendarMonth] = useState(localDate().slice(0, 7))
  const [granularity, setGranularity] = useState(10)
  const [templateMode, setTemplateMode] = useState(false)
  const [weekday, setWeekday] = useState(1)
  const [tags, setTags] = useState<Tag[]>([])
  const [blocks, setBlocks] = useState<ActualBlock[]>([])
  const [plans, setPlans] = useState<PlanBlock[]>([])
  const [templates, setTemplates] = useState<PlanTemplateBlock[]>([])
  const [templateUndo, setTemplateUndo] = useState(false)
  const [deepWeek, setDeepWeek] = useState<DeepWeek>(emptyDeepWeek)
  const [inbox, setInbox] = useState<InboxItem[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [actions, setActions] = useState<ActionView[]>([])
  const [nextActions, setNextActions] = useState<ActionView[]>([])
  const [forecast, setForecast] = useState<ActionView[]>([])
  const [warnings, setWarnings] = useState<PanelWarning[]>([])
  const [dismissedWarning, setDismissedWarning] = useState('')
  const [deepBrush, setDeepBrush] = useState<DeepLevel>('high')
  const [selectedTagId, setSelectedTagId] = useState<number>()
  const [eraseMode, setEraseMode] = useState(false)
  const [tagSearch, setTagSearch] = useState('')
  const [managerKind, setManagerKind] = useState<TagKind>('time')
  const [tagDraft, setTagDraft] = useState<{ parentId: number | null }>()
  const [draftName, setDraftName] = useState('')
  const [renameId, setRenameId] = useState<number>()
  const [renameValue, setRenameValue] = useState('')
  const [dropTarget, setDropTarget] = useState<number | 'root' | null>()
  const [editing, setEditing] = useState<{ kind: CanvasKind; id: number }>()
  const [editorPlacement, setEditorPlacement] = useState<Placement>()
  const [editNote, setEditNote] = useState('')
  const [editTagId, setEditTagId] = useState<number>()
  const [editStart, setEditStart] = useState('')
  const [editEnd, setEditEnd] = useState('')
  const [editSource, setEditSource] = useState<ActualSource>('user_reported')
  const [editFocus, setEditFocus] = useState<FocusLevel | ''>('')
  const [showDetails, setShowDetails] = useState(false)
  const [undoStack, setUndoStack] = useState<{ label: '添加' | '消除' | '编辑'; commands: UndoCommand[] }[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [tick, setTick] = useState(0)
  const request = useRef(0)
  const deepGesture = useRef<DeepGesture | null>(null)
  const eraseGesture = useRef<EraseGesture | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const editorRef = useRef<HTMLDivElement>(null)
  const scrolled = useRef(false)

  const refresh = async () => {
    const id = ++request.current
    try {
      const state = await fetchState(date, timeZone, forecastDate)
      if (id !== request.current) return
      setTags(state.tags)
      setBlocks(state.blocks)
      setPlans(state.plans)
      setTemplates(state.templates)
      setTemplateUndo(state.templateUndo)
      setDeepWeek(state.deepWeek)
      setInbox(state.inbox)
      setProjects(state.projects)
      setActions(state.actions)
      setNextActions(state.nextActions)
      setForecast(state.forecast)
      setWarnings(state.warnings ?? [])
      setError('')
    } catch (cause) {
      if (id === request.current) setError(cause instanceof Error ? cause.message : String(cause))
    }
  }
  useEffect(() => { void refresh() }, [date, forecastDate, timeZone])

  const timeTags = useMemo(() => flatten(tags, 'time'), [tags])
  useEffect(() => {
    if (selectedTagId !== undefined && tags.some(tag => tag.id === selectedTagId && tag.kind === 'time')) return
    setSelectedTagId(timeTags[0]?.tag.id)
  }, [tags, timeTags, selectedTagId])

  const running = blocks.filter(block => block.endAt === undefined)
  useEffect(() => {
    if (running.length === 0) return
    const timer = window.setInterval(() => setTick(value => value + 1), 30_000)
    return () => window.clearInterval(timer)
  }, [running.length])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setCalendar(undefined); setEditing(undefined) }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z' && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLTextAreaElement)) {
        event.preventDefault()
        void undoLast()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })

  useEffect(() => {
    if (scrolled.current) return
    const scroller = document.querySelector('.secretary-time-panel .canvas-scroll')
    if (!scroller) return
    scrolled.current = true
    scroller.scrollTop = 48 * 6
  }, [product, timeView])

  // Keep the floating editor inside the viewport once its real height is known.
  useEffect(() => {
    if (editing === undefined) return
    const element = editorRef.current
    if (!element) return
    const rect = element.getBoundingClientRect()
    const top = Math.max(8, Math.min(rect.top, window.innerHeight - rect.height - 8))
    if (Math.abs(top - rect.top) < 1) return
    setEditorPlacement(current => current === undefined ? current : { ...current, top })
  }, [editing, showDetails])

  const tagById = (id: number) => tags.find(tag => tag.id === id)
  const tagColor = (id: number) => tagById(id)?.color ?? DEFAULT_COLOR
  const tagName = (id: number) => tagById(id)?.name ?? String(id)

  const runBatch = async (
    commands: UndoCommand[],
    onResult?: (command: UndoCommand, result: any) => void,
  ): Promise<any[] | undefined> => {
    setBusy(true)
    const results: any[] = []
    try {
      for (const command of commands) {
        const { restoreOf: _restoreOf, ...payload } = command
        const result = await sendCommand(payload)
        results.push(result)
        onResult?.(command, result)
      }
      await refresh()
      setError('')
      return results
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      await refresh()
      setError(message)
      return results
    } finally {
      setBusy(false)
    }
  }

  const run = async (command: PanelCommand): Promise<any> => {
    const results = await runBatch([command])
    return results?.[0]
  }

  /* ---------- canvas items ---------- */

  const dayStart = useMemo(() => new Date(`${date}T00:00:00`).getTime(), [date])
  const minuteOf = (instant: string) => Math.round((Date.parse(instant) - dayStart) / 60_000)
  const clamp = (value: number) => Math.max(0, Math.min(1440, value))

  const items: CanvasItem[] = useMemo(() => {
    if (templateMode && timeView === 'plan') {
      return templates
        .filter(block => block.weekday === weekday)
        .map(block => {
          const startMinute = parseClock(block.startTime)
          const endMinute = parseClock(block.endTime)
          return {
            key: `template-${block.id}`, kind: 'template' as const, id: block.id,
            startMinute: clamp(startMinute), endMinute: clamp(endMinute),
            timeTagId: block.timeTagId, note: block.note,
            startLabel: block.startTime, endLabel: block.endTime, running: false, block,
          }
        })
        .filter(item => item.endMinute > item.startMinute)
        .sort((left, right) => left.startMinute - right.startMinute)
    }
    const source = timeView === 'plan' ? plans : blocks
    return source
      .map(block => {
        const endAt = (block as ActualBlock).endAt
        const rawEnd = endAt === undefined ? minuteOf(new Date().toISOString()) : minuteOf(endAt)
        const kind = 'actualSource' in block ? 'actual' as const : 'plan' as const
        return {
          key: `${kind}-${block.id}`, kind, id: block.id,
          startMinute: clamp(minuteOf(block.startAt)), endMinute: clamp(rawEnd),
          timeTagId: block.timeTagId, note: block.note,
          startLabel: timeLabel(block.startAt, timeZone),
          endLabel: endAt === undefined ? timeLabel(new Date().toISOString(), timeZone) : timeLabel(endAt, timeZone),
          running: endAt === undefined, block,
        }
      })
      .filter(item => item.endMinute > item.startMinute)
      .sort((left, right) => left.startMinute - right.startMinute)
  }, [blocks, plans, templates, templateMode, timeView, weekday, date, timeZone, tick])

  const lanes = useMemo(() => laneOf(items), [items])
  const editingItem = editing === undefined
    ? undefined
    : items.find(item => item.kind === editing.kind && item.id === editing.id)

  /* ---------- deep time ---------- */

  const paintDeepCell = (gesture: DeepGesture, weekdayValue: number, hour: number) => {
    const key = `${weekdayValue}-${hour}`
    if (gesture.cells.has(key)) return
    gesture.cells.set(key, { weekday: weekdayValue, hour })
    const level = gesture.operation === 'set' ? gesture.brush : 'unset'
    setDeepWeek(current => ({
      ...current,
      cells: current.cells.map(cell => cell.weekday === weekdayValue && cell.hour === hour ? { ...cell, level } : cell),
    }))
  }

  const commitDeepGesture = async (gesture: DeepGesture) => {
    setBusy(true)
    try {
      for (const { weekday: day, hour } of gesture.cells.values()) {
        await sendCommand({
          domain: 'time', op: gesture.operation === 'set' ? 'deep.setCell' : 'deep.clearCell',
          weekday: day, hour, ...(gesture.operation === 'set' ? { level: gesture.brush } : {}),
        })
      }
      await refresh()
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  const startDeepGesture = (event: React.PointerEvent<HTMLButtonElement>, cell: DeepCell) => {
    if (event.button !== 0 || busy) return
    event.preventDefault()
    const gesture: DeepGesture = { brush: deepBrush, operation: cell.level === deepBrush ? 'clear' : 'set', cells: new Map() }
    deepGesture.current = gesture
    paintDeepCell(gesture, cell.weekday, cell.hour)
    const finish = () => {
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
      if (deepGesture.current !== gesture) return
      deepGesture.current = null
      void commitDeepGesture(gesture)
    }
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
  }

  const moveDeepGesture = (event: React.PointerEvent<HTMLDivElement>) => {
    const gesture = deepGesture.current
    if (!gesture || event.buttons === 0) return
    const element = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-deep-cell]')
    if (!element || !event.currentTarget.contains(element)) return
    paintDeepCell(gesture, Number(element.dataset.weekday), Number(element.dataset.hour))
  }

  const clickDeepCellWithKeyboard = (event: React.MouseEvent<HTMLButtonElement>, cell: DeepCell) => {
    if (event.detail !== 0 || busy) return
    const gesture: DeepGesture = { brush: deepBrush, operation: cell.level === deepBrush ? 'clear' : 'set', cells: new Map() }
    paintDeepCell(gesture, cell.weekday, cell.hour)
    void commitDeepGesture(gesture)
  }

  /* ---------- write paths ---------- */

  const createAt = async (minute: number) => {
    if (selectedTagId === undefined) { setError('请先在右侧选择时间标签'); return }
    if (templateMode && timeView === 'plan') {
      const result = await run({
        domain: 'time', op: 'template.create', weekday,
        startTime: clock(minute), endTime: clock(minute + granularity), timeTagId: selectedTagId, note: '',
      })
      if (result?.block) {
        setUndoStack(current => [...current, {
          label: '添加',
          commands: [{ domain: 'time', op: 'template.delete', id: result.block.id }],
        }].slice(-40))
      }
      return
    }
    const input = { timeTagId: selectedTagId, startAt: atMinute(date, minute), endAt: atMinute(date, minute + granularity) }
    const result = timeView === 'plan'
      ? await run({ domain: 'time', op: 'plan.create', date, timeZone, ...input })
      : await run({ domain: 'time', op: 'actual.create', actualSource: 'user_reported', ...input })
    if (result?.block) {
      const id = result.block.id
      setUndoStack(current => [...current, {
        label: '添加',
        commands: [{ domain: 'time', op: timeView === 'plan' ? 'plan.delete' : 'actual.delete', id }],
      }].slice(-40))
    }
  }

  const restoreCommand = (item: CanvasItem): UndoCommand => {
    if (item.kind === 'template') {
      const block = item.block as PlanTemplateBlock
      return {
        domain: 'time', op: 'template.create', restoreOf: block.id, weekday: block.weekday,
        startTime: block.startTime, endTime: block.endTime, timeTagId: block.timeTagId, note: block.note,
      }
    }
    const block = item.block as EditableBlock
    if (item.kind === 'actual') {
      const actual = block as ActualBlock
      return {
        domain: 'time', op: 'actual.create', restoreOf: actual.id, timeTagId: actual.timeTagId, note: actual.note,
        startAt: actual.startAt, endAt: actual.endAt, actualSource: actual.actualSource, focus: actual.focus,
      }
    }
    return {
      domain: 'time', op: 'plan.create', restoreOf: block.id, date: dateAtInstant(block.startAt, timeZone), timeZone,
      timeTagId: block.timeTagId, note: block.note, startAt: block.startAt, endAt: block.endAt,
    }
  }

  const deleteCommand = (item: CanvasItem): PanelCommand => ({
    domain: 'time',
    op: item.kind === 'actual' ? 'actual.delete' : item.kind === 'plan' ? 'plan.delete' : 'template.delete',
    id: item.id,
  })

  const removeItems = async (targets: CanvasItem[]) => {
    if (targets.length === 0) return
    const results = await runBatch(targets.map(deleteCommand))
    if (results && results.length > 0) {
      setUndoStack(current => [...current, {
        label: '消除', commands: targets.slice(0, results.length).map(restoreCommand),
      }].slice(-40))
    }
  }

  const activateCell = (minute: number, covering: CanvasItem[], clicked?: CanvasItem) => {
    if (eraseMode) return
    const target = clicked && clicked.timeTagId === selectedTagId
      ? clicked
      : covering.find(item => item.timeTagId === selectedTagId)
    if (target) void removeItems([target])
    else void createAt(minute)
  }

  const undoLast = async () => {
    const entry = undoStack[undoStack.length - 1]
    if (!entry || busy) return
    let completed = 0
    const recreated = new Map<number, number>()
    await runBatch(entry.commands, (command, output) => {
      completed += 1
      const newId = output?.block?.id
      if (command.restoreOf !== undefined && Number.isSafeInteger(newId)) recreated.set(command.restoreOf, newId)
    })
    setUndoStack(current => {
      const remapped = current.map(item => ({
        ...item,
        commands: item.commands.map(command => {
          const id = typeof command.id === 'number' ? recreated.get(command.id) : undefined
          const restoreOf = command.restoreOf === undefined ? undefined : recreated.get(command.restoreOf)
          return id === undefined && restoreOf === undefined ? command : {
            ...command,
            ...(id === undefined ? {} : { id }),
            ...(restoreOf === undefined ? {} : { restoreOf }),
          }
        }),
      }))
      const index = current.indexOf(entry)
      if (index < 0) return remapped
      if (completed === entry.commands.length) return remapped.filter((_, itemIndex) => itemIndex !== index)
      return remapped.map((item, itemIndex) => itemIndex === index
        ? { ...item, commands: item.commands.slice(completed) }
        : item)
    })
  }

  const startRunning = () => {
    if (selectedTagId === undefined) { setError('请先在右侧选择时间标签'); return }
    void run({ domain: 'time', op: 'actual.start', timeTagId: selectedTagId, actualSource: 'user_reported' })
  }
  const stopRunning = (block: ActualBlock) => void run({ domain: 'time', op: 'actual.stop', id: block.id })

  /* ---------- editor ---------- */

  const openEditor = (item: CanvasItem, anchor?: HTMLElement) => {
    setEditing({ kind: item.kind, id: item.id })
    setEditorPlacement(place(anchor?.getBoundingClientRect()))
    setEditNote(item.note ?? '')
    setEditTagId(item.timeTagId)
    setShowDetails(false)
    if (item.kind === 'template') {
      const block = item.block as PlanTemplateBlock
      setEditStart(block.startTime)
      setEditEnd(block.endTime)
    } else {
      const block = item.block as EditableBlock
      setEditStart(block.startAt)
      setEditEnd(block.endAt ?? '')
      if (item.kind === 'actual') {
        const actual = block as ActualBlock
        setEditSource(actual.actualSource)
        setEditFocus(actual.focus ?? '')
      }
    }
  }

  const itemValues = (item: CanvasItem) => {
    if (item.kind === 'template') {
      const block = item.block as PlanTemplateBlock
      return {
        timeTagId: block.timeTagId, note: block.note ?? '', start: block.startTime, end: block.endTime,
        actualSource: 'user_reported' as ActualSource, focus: '' as FocusLevel | '',
      }
    }
    const block = item.block as EditableBlock
    const actual = item.kind === 'actual' ? block as ActualBlock : undefined
    return {
      timeTagId: block.timeTagId, note: block.note ?? '', start: block.startAt, end: block.endAt ?? '',
      actualSource: actual?.actualSource ?? ('user_reported' as ActualSource),
      focus: (actual?.focus ?? '') as FocusLevel | '',
    }
  }

  type EditorValues = ReturnType<typeof itemValues>

  const blockCommand = (item: CanvasItem, values: EditorValues): PanelCommand => {
    if (item.kind === 'template') {
      const block = item.block as PlanTemplateBlock
      return {
        domain: 'time', op: 'template.update', id: block.id, weekday: block.weekday,
        startTime: values.start, endTime: values.end, timeTagId: values.timeTagId, note: values.note,
      }
    }
    if (item.kind === 'actual') {
      return {
        domain: 'time', op: 'actual.update', id: item.id, timeTagId: values.timeTagId, note: values.note,
        startAt: values.start, endAt: values.end === '' ? null : values.end,
        actualSource: values.actualSource, focus: values.focus === '' ? null : values.focus,
      }
    }
    return {
      domain: 'time', op: 'plan.update', id: item.id, timeTagId: values.timeTagId, note: values.note,
      startAt: values.start, endAt: values.end,
    }
  }

  const applyEditor = async (item: CanvasItem, patch: Partial<EditorValues>) => {
    const current = itemValues(item)
    const next = { ...current, ...patch }
    if ((Object.keys(next) as (keyof EditorValues)[]).every(key => next[key] === current[key])) return { block: item.block }
    const result = await run(blockCommand(item, next))
    if (result) setUndoStack(stack => [...stack, { label: '编辑', commands: [blockCommand(item, current)] }].slice(-40))
    return result
  }

  const commitEditor = async (item: CanvasItem) => {
    const saved = await applyEditor(item, {
      timeTagId: editTagId ?? item.timeTagId, note: editNote, start: editStart, end: editEnd,
      actualSource: editSource, focus: editFocus,
    })
    if (saved) setEditing(undefined)
  }

  /* ---------- tags ---------- */

  const allowTagDrop = (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }

  const dropTag = async (event: React.DragEvent<HTMLElement>, parentId: number | null) => {
    event.preventDefault()
    setDropTarget(null)
    const id = Number(event.dataTransfer.getData(TAG_DRAG_MIME) || event.dataTransfer.getData('text/plain'))
    if (!Number.isSafeInteger(id) || id <= 0 || id === parentId || busy) return
    await run({ domain: 'tag', op: 'move', id, parentId })
  }

  const saveDraft = async () => {
    const name = draftName.trim()
    if (!name) return
    const parentId = tagDraft?.parentId ?? undefined
    const parent = parentId === undefined ? undefined : tagById(parentId)
    const color = parent?.color ?? TAG_PALETTE[(tags.length + 1) % TAG_PALETTE.length]
    await run({ domain: 'tag', op: 'create', kind: managerKind, name, color, parentId })
    setTagDraft(undefined)
    setDraftName('')
  }

  const saveRename = async () => {
    if (renameId === undefined) return
    const name = renameValue.trim()
    if (name) await run({ domain: 'tag', op: 'update', id: renameId, name })
    setRenameId(undefined)
    setRenameValue('')
  }

  const cycleColor = (tag: Tag) => {
    const current = tag.color ?? DEFAULT_COLOR
    const index = TAG_PALETTE.indexOf(current)
    const color = TAG_PALETTE[(index + 1) % TAG_PALETTE.length]
    void run({ domain: 'tag', op: 'update', id: tag.id, color })
  }

  /* ---------- template / navigation ---------- */

  const applyTemplate = async () => {
    const ok = await run({ domain: 'time', op: 'template.apply', weekday, targetDate: date, timeZone })
    if (ok) {
      setTemplateMode(false)
      setTimeView('plan')
    }
  }

  const openCalendar = (anchor?: HTMLElement) => {
    setCalendarMonth(date.slice(0, 7))
    setCalendar(place(anchor?.getBoundingClientRect(), 380))
  }

  const chooseDate = (value: string) => {
    setDate(value)
    setCalendar(undefined)
    setTemplateMode(false)
  }

  const goToday = () => {
    const today = localDate()
    setDate(today)
    setCalendarMonth(today.slice(0, 7))
    setCalendar(undefined)
    setTemplateMode(false)
  }

  const calendarDays = () => {
    const [year, month] = calendarMonth.split('-').map(Number)
    const firstOffset = (new Date(year, month - 1, 1, 12).getDay() + 6) % 7
    const total = new Date(year, month, 0, 12).getDate()
    return {
      firstOffset,
      days: Array.from({ length: total }, (_, index) => `${year}-${String(month).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`),
    }
  }
  const calendarGrid = calendarDays()

  /* ---------- erase gesture ---------- */

  const startEraseGesture = (event: React.PointerEvent<HTMLButtonElement>, item: CanvasItem) => {
    if (!eraseMode || event.shiftKey || event.button !== 0 || busy) return
    event.preventDefault()
    const gesture: EraseGesture = {
      timeTagId: item.timeTagId,
      candidates: new Map(items.map(entry => [entry.key, entry] as const)),
      selected: new Map([[item.key, item]]),
    }
    eraseGesture.current = gesture
    const finish = () => {
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
      if (eraseGesture.current !== gesture) return
      eraseGesture.current = null
      void removeItems([...gesture.selected.values()])
    }
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
  }

  const moveEraseGesture = (event: React.PointerEvent<HTMLElement>) => {
    const gesture = eraseGesture.current
    if (!gesture || event.buttons === 0) return
    const element = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-record-key]')
    if (!element || !event.currentTarget.contains(element)) return
    const item = gesture.candidates.get(element.dataset.recordKey ?? '')
    if (item?.timeTagId === gesture.timeTagId) gesture.selected.set(item.key, item)
  }

  /* ---------- derived render data ---------- */

  const visibleTagIds = useMemo(() => {
    const normalized = tagSearch.trim().toLowerCase()
    if (!normalized) return new Set(tags.filter(tag => tag.kind === 'time').map(tag => tag.id))
    const ids = new Set<number>()
    for (const tag of tags) {
      if (tag.kind !== 'time' || !tag.name.toLowerCase().includes(normalized)) continue
      let current: Tag | undefined = tag
      while (current) {
        ids.add(current.id)
        const parentId: number | undefined = current.parentId
        current = parentId === undefined ? undefined : tags.find(entry => entry.id === parentId)
      }
    }
    return ids
  }, [tags, tagSearch])

  const brushName = selectedTagId === undefined ? '未选择' : tagName(selectedTagId)
  const selectionText = editingItem !== undefined
    ? `${tagName(editingItem.timeTagId)} · ${editingItem.startLabel}–${editingItem.endLabel}`
    : eraseMode
      ? '消除状态：点击任意记录消除'
      : `当前画笔：${brushName}`

  const renderTagTree = (kind: TagKind, query: string, activeId: number | undefined, onPick: (tag: Tag) => void) => {
    const normalized = query.trim().toLowerCase()
    const allowed = new Set<number>()
    if (normalized) {
      for (const tag of tags) {
        if (tag.kind !== kind || !tag.name.toLowerCase().includes(normalized)) continue
        let current: Tag | undefined = tag
        while (current) {
          allowed.add(current.id)
          const parentId: number | undefined = current.parentId
          current = parentId === undefined ? undefined : tags.find(entry => entry.id === parentId)
        }
      }
    }
    const build = (parentId: number | undefined, depth: number): React.ReactNode[] => tags
      .filter(tag => tag.kind === kind && tag.parentId === parentId && (normalized === '' || allowed.has(tag.id)))
      .flatMap(tag => {
        const hasChildren = tags.some(child => child.kind === kind && child.parentId === tag.id)
        const isActive = activeId === tag.id
        return [
          <button
            type="button" key={tag.id}
            className={`tag-choice${isActive ? ' is-brush' : ''}${kind === 'time' && eraseMode && isActive ? ' is-erase' : ''}`}
            aria-pressed={isActive} data-tag-id={tag.id}
            style={{ '--depth': depth, '--tag-color': tag.color ?? DEFAULT_COLOR } as React.CSSProperties}
            onClick={() => onPick(tag)}
            onDoubleClick={() => { if (activeId === tag.id && kind === 'time') setEraseMode(true) }}
          >
            <span className="tag-dot" />
            <span className="tag-choice-name">{tag.name}</span>
            {hasChildren && <span className="tag-parent-mark" aria-hidden="true">父级可选</span>}
          </button>,
          ...build(tag.id, depth + 1),
        ]
      })
    const nodes = build(undefined, 0)
    return nodes.length === 0 ? <div className="empty-note">没有匹配的{kind === 'time' ? '时间' : '情境'}标签</div> : nodes
  }

  /* ---------- render pieces ---------- */

  const slotsPerHour = 60 / granularity

  const canvasRows = Array.from({ length: 24 }, (_, hour) => {
    const hourStart = hour * 60
    return <div className="hour-row" key={hour}>
      <div className="hour-label">{String(hour).padStart(2, '0')}:00</div>
      <div className="hour-track" onPointerMove={moveEraseGesture}>
        <div className="slot-grid" style={{ gridTemplateColumns: `repeat(${slotsPerHour}, minmax(0, 1fr))` }}>
          {Array.from({ length: slotsPerHour }, (_, index) => {
            const minute = hourStart + index * granularity
            const covering = items.filter(item => item.startMinute < minute + granularity && item.endMinute > minute)
            return <button
              type="button" className="slot" key={minute} disabled={busy}
              aria-label={`${date} ${clock(minute)} 时间格`}
              onClick={() => activateCell(minute, covering)}
            />
          })}
        </div>
        <div className="record-layer">
          {Array.from({ length: slotsPerHour }, (_, index) => {
            const slotStart = hourStart + index * granularity
            const overlapping = items
              .filter(item => item.startMinute < slotStart + granularity && item.endMinute > slotStart)
              .sort((left, right) => (lanes.get(left.key) ?? 0) - (lanes.get(right.key) ?? 0) || left.startMinute - right.startMinute)
            const count = Math.max(1, overlapping.length)
            return overlapping.map((item, lane) => {
              const firstCell = item.startMinute >= slotStart && item.startMinute < slotStart + granularity
              const selected = editing !== undefined && editing.kind === item.kind && editing.id === item.id
              const kindLabel = item.kind === 'actual' ? '实录' : item.kind === 'plan' ? '计划' : '模板'
              return <button
                type="button" key={`${item.key}-${slotStart}`}
                className={`record-fragment time-fragment ${item.kind}-fragment${firstCell ? '' : ' is-continuation'}${count > 1 ? ' is-compact' : ''}${count > 2 ? ' is-micro' : ''}${selected ? ' is-selected' : ''}${item.running ? ' is-running' : ''}`}
                style={{
                  '--record-color': tagColor(item.timeTagId),
                  left: `${((slotStart - hourStart) / 60) * 100}%`,
                  width: `${(granularity / 60) * 100}%`,
                  top: `${(lane / count) * 100}%`,
                  height: `${100 / count}%`,
                } as React.CSSProperties}
                data-record-key={item.key} data-record-kind={item.kind} data-block-id={item.id} data-slot={clock(slotStart)}
                data-tag-id={item.timeTagId} data-start={item.startMinute} data-end={item.endMinute}
                data-parallel-count={count} data-lane={lane}
                title={`${item.note || tagName(item.timeTagId)} · ${item.startLabel}–${item.endLabel}`}
                aria-label={`${kindLabel} ${tagName(item.timeTagId)} ${item.startLabel}`}
                onPointerDown={event => startEraseGesture(event, item)}
                onClick={event => {
                  event.stopPropagation()
                  if (event.shiftKey) { openEditor(item, event.currentTarget); return }
                  if (eraseMode) { if (event.detail === 0) void removeItems([item]); return }
                  activateCell(slotStart, overlapping, item)
                }}
              >
                <span className="record-name">{item.note || tagName(item.timeTagId)}</span>
                <span className="record-time">{item.startLabel}–{item.endLabel}</span>
              </button>
            })
          })}
        </div>
      </div>
    </div>
  })

  const shelf = <aside className="tag-shelf" aria-label="时间标签架">
    <div className="shelf-head">
      <div className="shelf-title-row">
        <span className="shelf-title">时间标签</span>
        <button className="quiet-button" type="button" onClick={() => { setManagerKind('time'); setProduct('tags') }}>管理</button>
      </div>
      <input
        className="search-input" type="search" ref={searchRef} value={tagSearch}
        placeholder="搜索时间标签" aria-label="搜索时间标签"
        onChange={event => setTagSearch(event.target.value)}
      />
    </div>
    <div className="shelf-body">{renderTagTree('time', tagSearch, selectedTagId, tag => { setSelectedTagId(tag.id); setEraseMode(false) })}</div>
    <div className={`shelf-foot${eraseMode ? ' is-erase' : ''}`}>{selectionText}</div>
  </aside>

  const dateStrip = <div className="date-strip">
    <div className="date-nav">
      <button className="icon-button" type="button" aria-label="前一天" onClick={() => { setDate(shiftDate(date, -1)); setTemplateMode(false) }}><Icon name="chevron-left" /></button>
      <button className="date-label" type="button" aria-label="打开日历选择日期" onClick={event => openCalendar(event.currentTarget)}>{dateLabel(date)}</button>
      <button className="icon-button" type="button" aria-label="后一天" onClick={() => { setDate(shiftDate(date, 1)); setTemplateMode(false) }}><Icon name="chevron-right" /></button>
      <button className="quiet-button" type="button" onClick={goToday}>今天</button>
    </div>
    {timeView === 'plan' && <button className="quiet-button" type="button" onClick={() => { setWeekday(weekdayOf(date)); setTemplateMode(true) }}>计划模板</button>}
    <span className="strip-tail">
      {timeView === 'plan' && templateUndo && <button type="button" className="quiet-button" disabled={busy} onClick={() => void run({ domain: 'time', op: 'template.undo', targetDate: date, timeZone })}>撤销模板应用</button>}
    </span>
  </div>

  const templateStrip = <div className="date-strip">
    <div className="week-strip" role="group" aria-label="模板星期">
      {WEEKDAYS.map((label, index) => <button
        type="button" className="week-day" key={label}
        aria-current={weekday === index + 1 ? 'date' : 'false'}
        onClick={() => setWeekday(index + 1)}
      >{label}</button>)}
    </div>
    <div className="template-actions">
      <span className="repeat-note">计划模板</span>
      <button type="button" className="primary-button" disabled={busy} onClick={() => void applyTemplate()}>应用到 {date}</button>
      <button type="button" className="quiet-button" onClick={() => setTemplateMode(false)}>返回日期</button>
    </div>
  </div>

  const canvasLayout = <div className="canvas-layout">
    <section className="canvas-panel" aria-label="时间画布">
      <div className="canvas-status">
        <button type="button" className="brush-current" aria-label="选择当前时间画笔" onClick={() => searchRef.current?.focus()}>
          {eraseMode ? '消除状态：点击记录消除' : `当前画笔：${brushName}`}
        </button>
        <span className="canvas-hint">双击已选标签进入消除 · Shift 点击编辑</span>
        {timeView === 'actual' && running.length > 0
          ? <button type="button" className="quiet-button record-toggle" disabled={busy} onClick={() => stopRunning(running[0])}>
            <Icon name="stop" />停止 {tagName(running[0].timeTagId)}
          </button>
          : timeView === 'actual'
            ? <button type="button" className="quiet-button record-toggle" disabled={busy || selectedTagId === undefined} onClick={startRunning}>
              <Icon name="play" />开始实录
            </button>
            : null}
      </div>
      <div className="canvas-scroll"><div className="day-grid">{canvasRows}</div></div>
    </section>
    {shelf}
  </div>

  const energyModule = <section className="energy-module" aria-label="深度时间周模板">
    <div className="energy-head">
      <div>
        <div className="energy-title">深度时间</div>
        <div className="energy-subtitle">7×24 基础周模板 · 每周重复 · 未设置不等于 low</div>
      </div>
      <div className="segmented brush-picker" role="group" aria-label="当前深度时间画笔">
        {(['high', 'medium', 'low'] as DeepLevel[]).map(level => <button
          type="button" className="brush-button" key={level} data-level={level} aria-pressed={deepBrush === level}
          onClick={() => setDeepBrush(level)}
        ><span className="brush-dot" />{level}</button>)}
      </div>
    </div>
    <div className="energy-grid" onPointerMove={moveDeepGesture}>
      <span aria-hidden="true" />
      {WEEKDAYS.map(day => <div className="energy-day" key={day}>{day}</div>)}
      {Array.from({ length: 24 }, (_, hour) => [
        <div className="energy-hour" key={`hour-${hour}`}>{String(hour).padStart(2, '0')}</div>,
        ...WEEKDAYS.map((day, index) => {
          const weekdayValue = index + 1
          const cell = deepWeek.cells[(weekdayValue - 1) * 24 + hour] ?? { weekday: weekdayValue, hour, level: 'unset' as const }
          const levelLabel = cell.level === 'unset' ? '未设置' : cell.level
          return <button
            type="button" className="energy-cell" key={`${day}-${hour}`}
            data-deep-cell="" data-weekday={weekdayValue} data-hour={hour} data-level={cell.level}
            aria-label={`${day} ${String(hour).padStart(2, '0')}:00 ${levelLabel}`} disabled={busy}
            onPointerDown={event => startDeepGesture(event, cell)}
            onClick={event => clickDeepCellWithKeyboard(event, cell)}
          />
        }),
      ])}
    </div>
    <div className="energy-legend" aria-label="深度时间图例">
      {(['high', 'medium', 'low'] as DeepLevel[]).map(level => <span className="legend-item" key={level}><span className={`legend-swatch ${level}`} />{level}</span>)}
      <span className="legend-item"><span className="legend-swatch" />未设置</span>
    </div>
    <p className="energy-hint">点按或连续拖刷 · 同档起手清除，其他情况写入当前画笔 · 一次拖刷只执行一种操作</p>
  </section>

  const timeModule = <section className="time-module">
    <div className="time-toolbar">
      <div className="segmented" role="tablist" aria-label="Time 子模块">
        {(['plan', 'actual', 'deep'] as TimeView[]).map(view => <button
          type="button" role="tab" key={view} aria-selected={timeView === view}
          onClick={() => { setTimeView(view); setTemplateMode(false); setCalendar(undefined); setEditing(undefined) }}
        >{view === 'plan' ? '计划' : view === 'actual' ? '实录' : '深度时间'}</button>)}
      </div>
      {timeView === 'deep'
        ? <span className="repeat-note">每周重复 · 自动沿用</span>
        : <div className="granularity">
          <span>时间格</span>
          <div className="segmented" aria-label="时间格粒度">
            {[10, 15, 30].map(value => <button
              type="button" key={value} aria-pressed={granularity === value}
              onClick={() => setGranularity(value)}
            >{value} 分钟</button>)}
          </div>
        </div>}
    </div>
    {timeView === 'deep' ? energyModule : <>
      {templateMode && timeView === 'plan' ? templateStrip : dateStrip}
      {canvasLayout}
    </>}
  </section>

  const managedTree = (parentId: number | undefined, depth: number): React.ReactNode[] => tags
    .filter(tag => tag.kind === managerKind && tag.parentId === parentId)
    .flatMap(tag => {
      const editingName = renameId === tag.id
      return [
        <div
          className={`manage-row${dropTarget === tag.id ? ' is-drop-target' : ''}`}
          key={tag.id} draggable={!busy} data-tag-id={tag.id} data-parent-id={tag.parentId ?? ''}
          style={{ '--depth': depth, '--tag-color': tag.color ?? DEFAULT_COLOR } as React.CSSProperties}
          onDragStart={event => {
            event.dataTransfer.effectAllowed = 'move'
            event.dataTransfer.setData(TAG_DRAG_MIME, String(tag.id))
            event.dataTransfer.setData('text/plain', String(tag.id))
          }}
          onDragOver={event => { allowTagDrop(event); setDropTarget(tag.id) }}
          onDragLeave={() => setDropTarget(current => current === tag.id ? null : current)}
          onDrop={event => void dropTag(event, tag.id)}
        >
          <span className="drag-handle" title="拖拽调整层级"><Icon name="drag" /></span>
          <button type="button" className="manage-color" aria-label={`更换 ${tag.name} 的颜色`} title="更换颜色" onClick={() => cycleColor(tag)} />
          {editingName
            ? <>
              <input
                className="field-input manage-edit" aria-label={`重命名 ${tag.name}`} value={renameValue} autoFocus
                onChange={event => setRenameValue(event.target.value)}
                onKeyDown={event => { if (event.key === 'Enter') void saveRename() }}
              />
              <button type="button" className="quiet-button" onClick={() => void saveRename()}>保存</button>
            </>
            : <>
              <span className="manage-name">{tag.name}</span>
              <span className="manage-id">tag:{tag.id}</span>
            </>}
          <div className="manage-actions">
            <button type="button" className="icon-button" aria-label={`新增子标签 ${tag.name}`} title="新增子标签" onClick={() => { setTagDraft({ parentId: tag.id }); setDraftName('') }}><Icon name="plus" /></button>
            {editingName ? null : <button type="button" className="icon-button" aria-label={`重命名 ${tag.name}`} title="重命名" onClick={() => { setRenameId(tag.id); setRenameValue(tag.name) }}><Icon name="pencil" /></button>}
            <button type="button" className="icon-button" aria-label={`删除 ${tag.name}`} title="删除" disabled={busy} onClick={() => void run({ domain: 'tag', op: 'delete', id: tag.id })}><Icon name="trash" /></button>
          </div>
        </div>,
        ...managedTree(tag.id, depth + 1),
      ]
    })

  const tagManager = <section className="tag-manager" aria-label="统一标签管理">
    <div className="tag-manager-toolbar">
      <div className="segmented" role="group" aria-label="标签类型">
        <button type="button" aria-label="时间标签" aria-selected={managerKind === 'time'} onClick={() => { setManagerKind('time'); setTagDraft(undefined); setRenameId(undefined) }}>时间</button>
        <button type="button" aria-label="情境标签" aria-selected={managerKind === 'context'} onClick={() => { setManagerKind('context'); setTagDraft(undefined); setRenameId(undefined) }}>情境</button>
      </div>
      <button type="button" className="primary-button" onClick={() => { setTagDraft({ parentId: null }); setDraftName('') }}><Icon name="plus" />新增根标签</button>
    </div>
    <div className="tag-manager-body"><div className="tag-manager-inner">
      <div className="manager-hint">同一套字段与管理交互 · 拖拽到标签上设为子级，拖到下方区域设为根级 · 防止循环</div>
      {tagDraft !== undefined && <div className="draft-box">
        <span className="draft-label">{tagDraft.parentId === null ? '新增根标签' : `在「${tagName(tagDraft.parentId)}」下新增`}</span>
        <input
          className="field-input" aria-label="标签名称" placeholder="标签名称" autoFocus value={draftName}
          onChange={event => setDraftName(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter') void saveDraft() }}
        />
        <button type="button" className="primary-button" disabled={busy || !draftName.trim()} onClick={() => void saveDraft()}>添加</button>
        <button type="button" className="quiet-button" onClick={() => { setTagDraft(undefined); setDraftName('') }}>取消</button>
      </div>}
      <div>{managedTree(undefined, 0)}</div>
      <div
        className={`root-drop${dropTarget === 'root' ? ' is-drop-target' : ''}`}
        role="region" aria-label="根标签放置区"
        onDragOver={event => { allowTagDrop(event); setDropTarget('root') }}
        onDragLeave={() => setDropTarget(current => current === 'root' ? null : current)}
        onDrop={event => void dropTag(event, null)}
      >拖到这里设为根标签</div>
    </div></div>
  </section>

  const calendarPanel = calendar === undefined ? null : <div className="floating" role="dialog" aria-label="选择日期" style={calendar}>
    <div className="calendar-head">
      <button type="button" className="icon-button" aria-label="上一月" onClick={() => setCalendarMonth(shiftMonth(calendarMonth, -1))}><Icon name="chevron-left" /></button>
      <strong>{Number(calendarMonth.slice(0, 4))} 年 {Number(calendarMonth.slice(5, 7))} 月</strong>
      <button type="button" className="icon-button" aria-label="下一月" onClick={() => setCalendarMonth(shiftMonth(calendarMonth, 1))}><Icon name="chevron-right" /></button>
    </div>
    <div className="calendar-weekdays">{MONTH_DAYS.map(day => <span key={day}>{day}</span>)}</div>
    <div className="calendar-grid">
      {Array.from({ length: calendarGrid.firstOffset }, (_, index) => <span key={`blank-${index}`} />)}
      {calendarGrid.days.map(value => <button
        type="button" key={value}
        className={`calendar-day${value === localDate() ? ' is-today' : ''}`}
        aria-label={value} aria-current={value === date ? 'date' : 'false'}
        onClick={() => chooseDate(value)}
      >{Number(value.slice(8, 10))}</button>)}
    </div>
    <div className="calendar-footer"><button type="button" className="quiet-button" onClick={goToday}>回到今天</button></div>
  </div>

  const editorKindLabel = editingItem === undefined ? '' : editingItem.kind === 'actual' ? '实录' : editingItem.kind === 'plan' ? '计划' : '模板'
  const editorPanel = editingItem === undefined ? null : <div className="floating" role="dialog" aria-label={`编辑${editorKindLabel}`} style={editorPlacement} ref={editorRef}>
    <div className="floating-head">
      <div>
        <div className="floating-title">{tagName(editingItem.timeTagId)}</div>
        <div className="floating-subtitle">{editingItem.startLabel}–{editingItem.endLabel} · 保存后生效</div>
      </div>
      <button type="button" className="icon-button" aria-label="关闭" onClick={() => setEditing(undefined)}><Icon name="x" /></button>
    </div>
    <div className="floating-body">
      <div className="floating-section">
        <span className="field-label">时间标签</span>
        <div className="editor-tags">{renderTagTree('time', '', editTagId, tag => setEditTagId(tag.id))}</div>
      </div>
      <div className="floating-section">
        <label className="field-label" htmlFor="recordNote">备注，可提及 GTD</label>
        <textarea
          className="field-textarea" id="recordNote" aria-label="备注" value={editNote}
          onChange={event => setEditNote(event.target.value)}
        />
      </div>
      <div className="editor-details">
        <button type="button" className="details-toggle" aria-expanded={showDetails} onClick={() => setShowDetails(value => !value)}>时间与来源</button>
        {showDetails && <div className="editor-fields">
          <label>开始时刻<input aria-label="开始时刻" value={editStart} onChange={event => setEditStart(event.target.value)} /></label>
          <label>结束时刻<input aria-label="结束时刻" placeholder={editingItem.kind === 'actual' ? '留空表示正在记录' : ''} value={editEnd} onChange={event => setEditEnd(event.target.value)} /></label>
          {editingItem.kind === 'actual' && <>
            <label>实际来源<select aria-label="实际来源" value={editSource} onChange={event => setEditSource(event.target.value as ActualSource)}>
              {SOURCES.map(source => <option key={source} value={source}>{source}</option>)}
            </select></label>
            <label>专注档位<select aria-label="专注档位" value={editFocus} onChange={event => setEditFocus(event.target.value as FocusLevel | '')}>
              <option value="">未标注</option><option value="deep">deep</option><option value="shallow">shallow</option>
            </select></label>
          </>}
        </div>}
      </div>
      <div className="floating-actions">
        <button type="button" className="danger-button" disabled={busy} onClick={() => { void removeItems([editingItem]); setEditing(undefined) }}><Icon name="trash" />删除{editorKindLabel}</button>
        <span className="editor-actions-tail">
          <button type="button" className="primary-button" onClick={() => void commitEditor(editingItem)}>{`保存${editorKindLabel}`}</button>
          <button type="button" className="quiet-button" onClick={() => void commitEditor(editingItem)}>完成</button>
        </span>
      </div>
    </div>
  </div>

  const warning = warnings.find(item => item.message !== dismissedWarning)
  const banner = error !== ''
    ? { tone: 'is-error', message: error, dismiss: () => setError('') }
    : warning === undefined ? undefined : { tone: '', message: warning.message, dismiss: () => setDismissedWarning(warning.message) }

  return <div className="secretary-time-panel">
    <IconSprite />
    <style>{panelStyles}</style>
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark"><Icon name="grid" /></span>
        <span className="brand-name">小秘书</span>
      </div>
      <nav className="module-nav" aria-label="一级模块">
        {(['gtd', 'time', 'tags', 'goal'] as ProductView[]).map(item => <button
          type="button" className="nav-button" key={item}
          aria-current={product === item && item !== 'gtd' && item !== 'goal' ? 'page' : undefined}
          onClick={() => {
            if (item === 'tags' && (product === 'time' || product === 'gtd')) setManagerKind(product === 'gtd' ? 'context' : 'time')
            setProduct(item)
            setCalendar(undefined)
            setEditing(undefined)
          }}
        >{item === 'gtd' ? 'GTD' : item === 'time' ? 'Time' : item === 'tags' ? 'Tags' : <>Goal <span className="phase-badge">二期</span></>}</button>)}
      </nav>
      <div className="top-actions">
        <button
          type="button" className="icon-button" aria-label="撤销" title="撤销 Cmd/Ctrl+Z"
          disabled={undoStack.length === 0 || busy} onClick={() => void undoLast()}
        ><Icon name="undo" /></button>
      </div>
    </header>
    {banner !== undefined && <div className={`warning-strip ${banner.tone}`} role="alert">
      <span>{banner.message}</span>
      <button type="button" onClick={banner.dismiss}>知道了</button>
    </div>}

    {product === 'gtd' && <GtdWorkspace
      tags={tags} inbox={inbox} projects={projects} actions={actions} nextActions={nextActions} forecast={forecast}
      forecastDate={forecastDate} onForecastDateChange={setForecastDate} busy={busy} run={run}
    />}
    {product === 'goal' && <div className="placeholder">Goal 是保留的一级模块，本期不实现。</div>}
    {product === 'tags' && tagManager}
    {product === 'time' && timeModule}

    {calendarPanel}
    {editorPanel}
  </div>
}
