import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import type { Tag, TagKind } from 'dsh-secretary-tag/contract'
import type {
  ActualBlock, ActualSource, DeepCell, DeepCellLevel, DeepLevel, DeepWeek, FocusLevel, PlanBlock, PlanTemplateBlock,
} from 'dsh-secretary-time-block/contract'
import { fetchState, sendCommand, type PanelCommand } from './api.ts'

const DEFAULT_COLOR = '#477bc7'
const SOURCES: ActualSource[] = ['user_reported', 'agent_observed', 'imported']
const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

type TimeView = 'plan' | 'actual' | 'deep'
type ProductView = 'time' | 'tags' | 'gtd' | 'goal'
type EditableBlock = ActualBlock | PlanBlock

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

function dateLabel(date: string): string {
  const value = new Date(`${date}T12:00:00`)
  return `${value.getFullYear()} 年 ${value.getMonth() + 1} 月 ${value.getDate()} 日 · ${WEEKDAYS[(value.getDay() + 6) % 7]}`
}

function atMinute(date: string, minute: number): string {
  const value = new Date(`${date}T00:00:00`)
  value.setMinutes(minute)
  return value.toISOString()
}

function timeLabel(instant: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(instant))
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

interface DeepGesture {
  readonly brush: DeepLevel
  readonly operation: 'set' | 'clear'
  readonly cells: Map<string, { weekday: number; hour: number }>
}

export function ActualPanel() {
  const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai', [])
  const [product, setProduct] = useState<ProductView>('time')
  const [timeView, setTimeView] = useState<TimeView>('actual')
  const [date, setDate] = useState(localDate)
  const [calendarOpen, setCalendarOpen] = useState(false)
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
  const [deepBrush, setDeepBrush] = useState<DeepLevel>('high')
  const [selectedTagId, setSelectedTagId] = useState<number>()
  const [eraseMode, setEraseMode] = useState(false)
  const [managerKind, setManagerKind] = useState<TagKind>('time')
  const [tagName, setTagName] = useState('')
  const [tagParentId, setTagParentId] = useState('')
  const [tagColor, setTagColor] = useState(DEFAULT_COLOR)
  const [editingTagId, setEditingTagId] = useState<number>()
  const [editing, setEditing] = useState<EditableBlock>()
  const [editNote, setEditNote] = useState('')
  const [editTagId, setEditTagId] = useState('')
  const [editStart, setEditStart] = useState('')
  const [editEnd, setEditEnd] = useState('')
  const [editSource, setEditSource] = useState<ActualSource>('user_reported')
  const [editFocus, setEditFocus] = useState<FocusLevel | ''>('')
  const [editingTemplateId, setEditingTemplateId] = useState<number>()
  const [templateStart, setTemplateStart] = useState('09:00')
  const [templateEnd, setTemplateEnd] = useState('10:00')
  const [templateNote, setTemplateNote] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const request = useRef(0)
  const deepGesture = useRef<DeepGesture | null>(null)

  const refresh = async () => {
    const id = ++request.current
    try {
      const state = await fetchState(date, timeZone)
      if (id !== request.current) return
      setTags(state.tags)
      setBlocks(state.blocks)
      setPlans(state.plans)
      setTemplates(state.templates)
      setTemplateUndo(state.templateUndo)
      setDeepWeek(state.deepWeek)
      setError('')
    } catch (cause) {
      if (id === request.current) setError(cause instanceof Error ? cause.message : String(cause))
    }
  }
  useEffect(() => { void refresh() }, [date, timeZone])

  const timeTags = useMemo(() => flatten(tags, 'time'), [tags])
  useEffect(() => {
    if (selectedTagId !== undefined && tags.some(tag => tag.id === selectedTagId && tag.kind === 'time')) return
    setSelectedTagId(timeTags[0]?.tag.id)
  }, [tags, timeTags, selectedTagId])

  const run = async (command: PanelCommand): Promise<boolean> => {
    setBusy(true)
    try {
      await sendCommand(command)
      await refresh()
      setError('')
      return true
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      return false
    } finally {
      setBusy(false)
    }
  }

  const paintDeepCell = (gesture: DeepGesture, weekday: number, hour: number) => {
    const key = `${weekday}-${hour}`
    if (gesture.cells.has(key)) return
    gesture.cells.set(key, { weekday, hour })
    const level: DeepCellLevel = gesture.operation === 'set' ? gesture.brush : 'unset'
    setDeepWeek(current => ({
      ...current,
      cells: current.cells.map(cell => cell.weekday === weekday && cell.hour === hour ? { ...cell, level } : cell),
    }))
  }

  const commitDeepGesture = async (gesture: DeepGesture) => {
    setBusy(true)
    try {
      for (const { weekday, hour } of gesture.cells.values()) {
        await sendCommand({
          domain: 'time', op: gesture.operation === 'set' ? 'deep.setCell' : 'deep.clearCell',
          weekday, hour, ...(gesture.operation === 'set' ? { level: gesture.brush } : {}),
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
    const gesture: DeepGesture = {
      brush: deepBrush,
      operation: cell.level === deepBrush ? 'clear' : 'set',
      cells: new Map(),
    }
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
    const gesture: DeepGesture = {
      brush: deepBrush, operation: cell.level === deepBrush ? 'clear' : 'set', cells: new Map(),
    }
    paintDeepCell(gesture, cell.weekday, cell.hour)
    void commitDeepGesture(gesture)
  }

  const tagById = (id: number) => tags.find(tag => tag.id === id)
  const openEditor = (block: EditableBlock) => {
    setEditing(block)
    setEditNote(block.note ?? '')
    setEditTagId(String(block.timeTagId))
    setEditStart(block.startAt)
    setEditEnd(block.endAt ?? '')
    if ('actualSource' in block) {
      setEditSource(block.actualSource)
      setEditFocus(block.focus ?? '')
    }
  }

  const createAt = async (minute: number) => {
    if (selectedTagId === undefined) { setError('请先在右侧选择时间标签'); return }
    const input = {
      timeTagId: selectedTagId,
      startAt: atMinute(date, minute), endAt: atMinute(date, minute + granularity),
    }
    if (timeView === 'plan') await run({ domain: 'time', op: 'plan.create', date, timeZone, ...input })
    else await run({ domain: 'time', op: 'actual.create', actualSource: 'user_reported', ...input })
  }

  const editTag = (tag: Tag) => {
    setEditingTagId(tag.id)
    setTagName(tag.name)
    setTagParentId(tag.parentId === undefined ? '' : String(tag.parentId))
    setTagColor(tag.color ?? DEFAULT_COLOR)
  }

  const submitTag = async () => {
    const input = {
      name: tagName, color: tagColor,
      parentId: tagParentId === '' ? undefined : Number(tagParentId),
    }
    if (editingTagId === undefined) {
      await run({ domain: 'tag', op: 'create', kind: managerKind, ...input })
    } else {
      await run({ domain: 'tag', op: 'update', id: editingTagId, name: tagName, color: tagColor })
      if ((tagById(editingTagId)?.parentId === undefined ? '' : String(tagById(editingTagId)?.parentId)) !== tagParentId) {
        await run({ domain: 'tag', op: 'move', id: editingTagId, parentId: tagParentId === '' ? null : Number(tagParentId) })
      }
    }
    setEditingTagId(undefined)
    setTagName('')
    setTagParentId('')
  }

  const openCalendar = () => {
    setCalendarMonth(date.slice(0, 7))
    setCalendarOpen(true)
  }
  const chooseDate = (value: string) => {
    setDate(value)
    setCalendarOpen(false)
    setTemplateMode(false)
  }
  const goToday = () => {
    const today = localDate()
    setDate(today)
    setCalendarMonth(today.slice(0, 7))
    setCalendarOpen(false)
    setTemplateMode(false)
  }

  const currentBlocks: EditableBlock[] = timeView === 'plan' ? plans : blocks
  const currentKind = timeView === 'plan' ? '计划' : '实录'
  const visibleTemplates = templates.filter(block => block.weekday === weekday)
  const editTemplate = (block: PlanTemplateBlock) => {
    setEditingTemplateId(block.id)
    setTemplateStart(block.startTime)
    setTemplateEnd(block.endTime)
    setTemplateNote(block.note ?? '')
    setSelectedTagId(block.timeTagId)
  }
  const submitTemplate = async () => {
    if (selectedTagId === undefined) { setError('请先选择时间标签'); return }
    const input = { weekday, startTime: templateStart, endTime: templateEnd, timeTagId: selectedTagId, note: templateNote }
    const ok = editingTemplateId === undefined
      ? await run({ domain: 'time', op: 'template.create', ...input })
      : await run({ domain: 'time', op: 'template.update', id: editingTemplateId, ...input })
    if (ok) {
      setEditingTemplateId(undefined)
      setTemplateNote('')
    }
  }
  const applyTemplate = async () => {
    const ok = await run({ domain: 'time', op: 'template.apply', weekday, targetDate: date, timeZone })
    if (ok) {
      setTemplateMode(false)
      setTimeView('plan')
    }
  }

  const calendarDays = () => {
    const [year, month] = calendarMonth.split('-').map(Number)
    const firstOffset = (new Date(year, month - 1, 1, 12).getDay() + 6) % 7
    const total = new Date(year, month, 0, 12).getDate()
    return { firstOffset, days: Array.from({ length: total }, (_, index) => {
      const day = index + 1
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }) }
  }
  const calendar = calendarDays()

  const tagShelf = <aside className="tag-shelf" aria-label="时间标签架">
    <div className="shelf-title"><span>时间标签</span><button type="button" onClick={() => setProduct('tags')}>管理标签</button></div>
    {timeTags.map(({ tag, depth }) => (
      <button
        type="button" key={tag.id} className={selectedTagId === tag.id ? 'selected' : ''}
        style={{ '--depth': depth } as React.CSSProperties}
        onClick={() => { setSelectedTagId(tag.id); setEraseMode(false) }}
        onDoubleClick={() => { if (selectedTagId === tag.id) setEraseMode(true) }}
      ><span className="tag-dot" style={{ background: tag.color ?? DEFAULT_COLOR }} />{tag.name}</button>
    ))}
  </aside>

  return (
    <div className="secretary-time-panel">
      <style>{styles}</style>
      <header className="product-header">
        <strong>小秘书</strong>
        <nav aria-label="一级模块">
          {(['gtd', 'time', 'tags', 'goal'] as ProductView[]).map(item => <button
            type="button" key={item} aria-current={product === item ? 'page' : undefined}
            onClick={() => { setProduct(item); setCalendarOpen(false) }}
          >{item === 'gtd' ? 'GTD' : item === 'time' ? 'Time' : item === 'tags' ? 'Tags' : 'Goal'}</button>)}
        </nav>
      </header>
      {error && <div role="alert" className="time-error">{error}</div>}

      {product === 'gtd' && <section className="module-placeholder">GTD 产品界面由后续 #5 切片接入。</section>}
      {product === 'goal' && <section className="module-placeholder">Goal 是保留的一级模块，本期不实现。</section>}
      {product === 'tags' ? (
        <section className="tag-manager" aria-label="统一标签管理">
          <div className="manager-header"><strong>标签管理</strong><button type="button" onClick={() => { setProduct('time'); setTimeView('actual'); setEditingTagId(undefined); setTagName('') }}>返回实录</button></div>
          <div className="kind-switch" role="group" aria-label="标签类型切换">
            <button type="button" aria-pressed={managerKind === 'time'} onClick={() => { setManagerKind('time'); setTagParentId(''); setEditingTagId(undefined) }}>时间标签</button>
            <button type="button" aria-pressed={managerKind === 'context'} onClick={() => { setManagerKind('context'); setTagParentId(''); setEditingTagId(undefined) }}>情境标签</button>
          </div>
          <div className="tag-form">
            <label>标签名称<input value={tagName} onChange={event => setTagName(event.target.value)} /></label>
            <label>标签类型<input aria-label="标签类型" readOnly value={managerKind} /></label>
            <label>父标签<select value={tagParentId} onChange={event => setTagParentId(event.target.value)}>
              <option value="">（根标签）</option>
              {flatten(tags, managerKind).filter(({ tag }) => tag.id !== editingTagId).map(({ tag, depth }) => (
                <option key={tag.id} value={tag.id}>{'　'.repeat(depth)}{tag.name}</option>
              ))}
            </select></label>
            <label>标签颜色<input type="color" value={tagColor} onChange={event => setTagColor(event.target.value)} /></label>
            <button type="button" disabled={busy || !tagName.trim()} onClick={() => void submitTag()}>{editingTagId === undefined ? '新建标签' : '保存标签'}</button>
          </div>
          <div className="tag-list">
            {flatten(tags, managerKind).map(({ tag, depth }) => (
              <div className="managed-tag" key={tag.id} style={{ '--depth': depth } as React.CSSProperties}>
                <span className="tag-dot" style={{ background: tag.color ?? DEFAULT_COLOR }} />
                <span>{tag.name}</span><small>tag:{tag.id}</small>
                <button type="button" onClick={() => editTag(tag)}>编辑 {tag.name}</button>
                <button type="button" disabled={busy} onClick={() => void run({ domain: 'tag', op: 'delete', id: tag.id })}>删除 {tag.name}</button>
              </div>
            ))}
          </div>
        </section>
      ) : product === 'time' && <>
        <div className="time-toolbar">
          <div className="segmented" role="tablist" aria-label="Time 子模块">
            {(['plan', 'actual', 'deep'] as TimeView[]).map(view => <button
              type="button" role="tab" key={view} aria-selected={timeView === view}
              onClick={() => { setTimeView(view); setTemplateMode(false); setCalendarOpen(false) }}
            >{view === 'plan' ? '计划' : view === 'actual' ? '实录' : '深度时间'}</button>)}
          </div>
          {timeView !== 'deep' && <div className="segmented" aria-label="时间格粒度">
            {[10, 15, 30].map(value => <button type="button" key={value} aria-pressed={granularity === value} onClick={() => setGranularity(value)}>{value} 分钟</button>)}
          </div>}
        </div>
        {timeView === 'deep' ? <section className="deep-module" aria-label="深度时间周模板" aria-busy={busy}>
          <div className="deep-head">
            <div><div className="deep-title">深度时间</div><div className="deep-subtitle">7×24 基础周模板 · 每周重复 · 未设置不等于 low</div></div>
            <div className="segmented deep-brush" role="group" aria-label="当前深度时间画笔">
              {(['high', 'medium', 'low'] as DeepLevel[]).map(level => <button
                type="button" key={level} data-level={level} aria-pressed={deepBrush === level}
                onClick={() => setDeepBrush(level)}
              ><span className="deep-brush-dot" />{level}</button>)}
            </div>
          </div>
          <div className="deep-grid-scroll">
            <div className="deep-grid" onPointerMove={moveDeepGesture}>
              <span className="deep-corner" aria-hidden="true" />
              {WEEKDAYS.map(day => <span className="deep-day" key={day}>{day}</span>)}
              {Array.from({ length: 24 }, (_, hour) => <Fragment key={hour}>
                <span className="deep-hour">{String(hour).padStart(2, '0')}:00</span>
                {WEEKDAYS.map((_, index) => {
                  const weekday = index + 1
                  const cell = deepWeek.cells[(weekday - 1) * 24 + hour] ?? { weekday, hour, level: 'unset' as const }
                  const levelLabel = cell.level === 'unset' ? '未设置' : cell.level
                  return <button
                    type="button" className="deep-cell" data-deep-cell="" data-weekday={weekday} data-hour={hour}
                    data-level={cell.level} aria-label={`${WEEKDAYS[index]} ${String(hour).padStart(2, '0')}:00 ${levelLabel}`}
                    disabled={busy} onPointerDown={event => startDeepGesture(event, cell)}
                    onClick={event => clickDeepCellWithKeyboard(event, cell)} key={weekday}
                  />
                })}
              </Fragment>)}
            </div>
          </div>
          <div className="deep-legend" aria-label="深度时间图例">
            {(['high', 'medium', 'low', 'unset'] as DeepCellLevel[]).map(level => <span key={level}>
              <i className="deep-swatch" data-level={level} />{level === 'unset' ? '未设置' : level}
            </span>)}
          </div>
          <p className="deep-hint">点按或连续拖刷 · 同档起手清除，其他情况写入当前画笔 · 一次操作不逐格切换</p>
        </section> : <>
          <div className="date-strip">
            <button type="button" aria-label="前一天" onClick={() => { setDate(shiftDate(date, -1)); setTemplateMode(false) }}>‹</button>
            <button type="button" className="date-label" aria-label="打开日历选择日期" onClick={openCalendar}>{dateLabel(date)}</button>
            <button type="button" aria-label="后一天" onClick={() => { setDate(shiftDate(date, 1)); setTemplateMode(false) }}>›</button>
            <button type="button" onClick={goToday}>今天</button>
            <span className="date-spacer" />
            {timeView === 'plan' && !templateMode && <button type="button" onClick={() => { setWeekday((new Date(`${date}T12:00:00`).getDay() + 6) % 7 + 1); setTemplateMode(true) }}>计划模板</button>}
            {timeView === 'plan' && templateUndo && !templateMode && <button type="button" disabled={busy} onClick={() => void run({ domain: 'time', op: 'template.undo', targetDate: date, timeZone })}>撤销模板应用</button>}
          </div>
          {templateMode && timeView === 'plan' ? <div className="actual-layout">
            <main className="template-main">
              <div className="template-heading"><strong>计划模板</strong><button type="button" onClick={applyTemplate} disabled={busy}>应用到 {date}</button><button type="button" onClick={() => setTemplateMode(false)}>返回日期计划</button></div>
              <div className="week-strip" role="group" aria-label="模板星期">
                {WEEKDAYS.map((label, index) => <button type="button" key={label} aria-pressed={weekday === index + 1} onClick={() => { setWeekday(index + 1); setEditingTemplateId(undefined) }}>{label}</button>)}
              </div>
              <div className="template-form">
                <label>模板开始时间<input type="time" value={templateStart} onChange={event => setTemplateStart(event.target.value)} /></label>
                <label>模板结束时间<input type="time" value={templateEnd} onChange={event => setTemplateEnd(event.target.value)} /></label>
                <label>模板备注<input value={templateNote} onChange={event => setTemplateNote(event.target.value)} /></label>
                <button type="button" disabled={busy} onClick={() => void submitTemplate()}>{editingTemplateId === undefined ? '新增模板' : '保存模板'}</button>
              </div>
              <div className="template-list">
                {visibleTemplates.map(block => <div className="template-row" key={block.id}>
                  <strong>{block.startTime}–{block.endTime}</strong><span>{tagById(block.timeTagId)?.name ?? block.timeTagId}</span><span>{block.note}</span>
                  <button type="button" onClick={() => editTemplate(block)}>编辑模板</button>
                  <button type="button" disabled={busy} onClick={() => void run({ domain: 'time', op: 'template.delete', id: block.id })}>删除模板</button>
                </div>)}
                {visibleTemplates.length === 0 && <p className="empty-note">当前星期还没有模板，可在上方新增。</p>}
              </div>
            </main>
            {tagShelf}
          </div> : <div className="actual-layout">
            <main className="actual-main">
              <div className="actual-status">
                <span>{eraseMode ? '消除态：点击记录删除' : `点击格子记录 ${granularity} 分钟 · Shift 点击编辑`}</span>
                {timeView === 'actual' && <button type="button" disabled={busy || selectedTagId === undefined} onClick={() => void run({
                  domain: 'time', op: 'actual.start', timeTagId: selectedTagId, actualSource: 'user_reported',
                })}>开始实录</button>}
              </div>
              {timeView === 'actual' && blocks.some(block => block.endAt === undefined) && <div className="running-list">
                {blocks.filter(block => block.endAt === undefined).map(block => (
                  <span key={block.id}>正在记录 {tagById(block.timeTagId)?.name ?? block.timeTagId}
                    <button type="button" onClick={() => void run({ domain: 'time', op: 'actual.stop', id: block.id })}>停止 {tagById(block.timeTagId)?.name ?? block.id}</button>
                  </span>
                ))}
              </div>}
              <div className="day-canvas" aria-label={`${currentKind}画布`}>
                {Array.from({ length: 24 }, (_, hour) => (
                  <div className="hour-row" key={hour}>
                    <span className="hour-label">{String(hour).padStart(2, '0')}:00</span>
                    <div className="hour-slots" style={{ gridTemplateColumns: `repeat(${60 / granularity}, minmax(0, 1fr))` }}>
                      {Array.from({ length: 60 / granularity }, (_, slotIndex) => {
                        const minute = hour * 60 + slotIndex * granularity
                        const start = Date.parse(atMinute(date, minute))
                        const end = Date.parse(atMinute(date, minute + granularity))
                        const covering = currentBlocks.filter(block => {
                          const blockEnd = 'actualSource' in block && block.endAt === undefined ? Date.now() : Date.parse(block.endAt as string)
                          return Date.parse(block.startAt) < end && blockEnd > start
                        })
                        const label = `${String(hour).padStart(2, '0')}:${String(slotIndex * granularity).padStart(2, '0')}`
                        return <div className="time-slot" data-slot={label} key={slotIndex}>
                          <button type="button" className="slot-hit" aria-label={`${date} ${label} 时间格`} onClick={() => void createAt(minute)} />
                          <div className="fragment-layer">
                            {covering.map(block => {
                              const tag = tagById(block.timeTagId)
                              const first = Date.parse(block.startAt) >= start && Date.parse(block.startAt) < end
                              return <button
                                type="button" key={block.id} className={`${timeView === 'actual' ? 'actual-fragment' : 'plan-fragment'} time-fragment`} data-block-id={block.id}
                                aria-label={`${currentKind} ${tag?.name ?? block.timeTagId} ${timeLabel(block.startAt, timeZone)}`}
                                style={{ background: tag?.color ?? DEFAULT_COLOR }}
                                onClick={event => {
                                  event.stopPropagation()
                                  if (event.shiftKey) { openEditor(block); return }
                                  if (eraseMode || block.timeTagId === selectedTagId) {
                                    void run({ domain: 'time', op: timeView === 'plan' ? 'plan.delete' : 'actual.delete', id: block.id })
                                  } else {
                                    void createAt(minute)
                                  }
                                }}
                              >{first && <span>{block.note ?? tag?.name ?? block.timeTagId}</span>}</button>
                            })}
                          </div>
                        </div>
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </main>
            {tagShelf}
          </div>}
        </>}
      </>}

      {calendarOpen && <div className="calendar-popover" role="dialog" aria-label="选择日期">
        <div className="calendar-head"><button type="button" aria-label="上一月" onClick={() => setCalendarMonth(shiftMonth(calendarMonth, -1))}>‹</button><strong>{Number(calendarMonth.slice(0, 4))} 年 {Number(calendarMonth.slice(5, 7))} 月</strong><button type="button" aria-label="下一月" onClick={() => setCalendarMonth(shiftMonth(calendarMonth, 1))}>›</button></div>
        <div className="calendar-grid weekdays">{WEEKDAYS.map(day => <span key={day}>{day.slice(1)}</span>)}</div>
        <div className="calendar-grid">
          {Array.from({ length: calendar.firstOffset }, (_, index) => <span key={`blank-${index}`} />)}
          {calendar.days.map(value => <button type="button" className={`calendar-day${value === localDate() ? ' is-today' : ''}`} aria-label={value} aria-current={value === date ? 'date' : undefined} key={value} onClick={() => chooseDate(value)}>{Number(value.slice(8, 10))}</button>)}
        </div>
        <button type="button" className="calendar-today" onClick={goToday}>回到今天</button>
      </div>}

      {editing && <div className="editor-backdrop" role="dialog" aria-label={`编辑${'actualSource' in editing ? '实录' : '计划'}`}>
        <label>{'actualSource' in editing ? '实录标签' : '计划标签'}<select value={editTagId} onChange={event => setEditTagId(event.target.value)}>
          {timeTags.map(({ tag }) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
        </select></label>
        <label>{'actualSource' in editing ? '实录备注' : '计划备注'}<textarea value={editNote} onChange={event => setEditNote(event.target.value)} /></label>
        <label>开始时刻<input value={editStart} onChange={event => setEditStart(event.target.value)} /></label>
        <label>结束时刻<input value={editEnd} placeholder={'actualSource' in editing ? '留空表示正在记录' : ''} onChange={event => setEditEnd(event.target.value)} /></label>
        {'actualSource' in editing && <>
          <label>实际来源<select value={editSource} onChange={event => setEditSource(event.target.value as ActualSource)}>
            {SOURCES.map(source => <option key={source} value={source}>{source}</option>)}
          </select></label>
          <label>专注档位<select value={editFocus} onChange={event => setEditFocus(event.target.value as FocusLevel | '')}>
            <option value="">未标注</option><option value="deep">deep</option><option value="shallow">shallow</option>
          </select></label>
        </>}
        <div className="editor-actions">
          <button type="button" onClick={() => setEditing(undefined)}>取消</button>
          <button type="button" onClick={() => { void run({ domain: 'time', op: 'actualSource' in editing ? 'actual.delete' : 'plan.delete', id: editing.id }); setEditing(undefined) }}>{'actualSource' in editing ? '删除实录' : '删除计划'}</button>
          <button type="button" disabled={busy} onClick={async () => {
            const input = { timeTagId: Number(editTagId), note: editNote, startAt: editStart, endAt: editEnd }
            if ('actualSource' in editing) await run({
              domain: 'time', op: 'actual.update', id: editing.id, ...input,
              endAt: editEnd === '' ? null : editEnd, actualSource: editSource, focus: editFocus === '' ? null : editFocus,
            })
            else await run({ domain: 'time', op: 'plan.update', id: editing.id, ...input })
            setEditing(undefined)
          }}>{'actualSource' in editing ? '保存实录' : '保存计划'}</button>
        </div>
      </div>}
    </div>
  )
}

const styles = `
.secretary-time-panel { position: relative; height: 100%; min-width: 0; display: flex; flex-direction: column; overflow: hidden; background: var(--dsw-alias-bg, #f5f5f7); color: var(--dsw-alias-text, #1d1d1f); font-family: var(--dsw-alias-font, sans-serif); }
.secretary-time-panel button, .secretary-time-panel input, .secretary-time-panel select, .secretary-time-panel textarea { font: inherit; }
.product-header { flex: none; min-height: 45px; padding: calc(var(--dsh-frame-top-clearance, 0px) + 6px) 12px 6px; display: flex; align-items: center; gap: 18px; border-bottom: 1px solid var(--dsw-alias-border, #ddd); background: var(--dsw-alias-surface, #fff); }
.product-header nav, .time-toolbar, .date-strip, .manager-header, .template-heading { display: flex; align-items: center; gap: 6px; }
.product-header button, .time-toolbar button, .date-strip button, .manager-header button, .template-heading button, .actual-status button, .tag-form button, .editor-actions button, .running-list button, .template-form button, .template-row button, .shelf-title button { border: 1px solid var(--dsw-alias-border, #ddd); border-radius: 6px; background: var(--dsw-alias-surface, #fff); color: inherit; padding: 5px 8px; cursor: pointer; }
.product-header button[aria-current="page"], .segmented button[aria-selected="true"], .segmented button[aria-pressed="true"], .week-strip button[aria-pressed="true"] { background: var(--dsw-alias-accent-soft, #e8efff); color: var(--dsw-alias-accent, #3972d8); }
.time-error { flex: none; padding: 8px 12px; color: var(--dsw-alias-danger, #bd443d); }
.time-toolbar { flex: none; min-height: 43px; justify-content: space-between; padding: 6px 12px; border-bottom: 1px solid var(--dsw-alias-border-soft, #eee); background: var(--dsw-alias-surface, #fff); }
.segmented { display: inline-flex; gap: 3px; padding: 2px; border-radius: 7px; background: var(--dsw-alias-surface-subtle, #eee); }
.date-strip { flex: none; min-height: 43px; padding: 5px 12px; border-bottom: 1px solid var(--dsw-alias-border-soft, #eee); background: var(--dsw-alias-surface, #fff); }
.date-strip .date-label { font-weight: 650; }
.date-spacer { flex: 1; }
.module-placeholder { flex: 1; display: grid; place-items: center; padding: 24px; color: var(--dsw-alias-muted, #777); text-align: center; }
.actual-layout { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) 240px; }
.actual-main, .template-main { min-width: 0; min-height: 0; display: flex; flex-direction: column; }
.actual-status { flex: none; min-height: 38px; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 5px 12px; color: var(--dsw-alias-muted, #777); font-size: 11px; }
.running-list { padding: 5px 12px; font-size: 11px; }
.day-canvas { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; }
.hour-row { height: 48px; display: grid; grid-template-columns: 50px minmax(0, 1fr); border-bottom: 1px solid var(--dsw-alias-border-soft, #eee); }
.hour-label { padding: 6px 7px 0 0; text-align: right; color: var(--dsw-alias-muted, #777); font: 10px ui-monospace, monospace; }
.hour-slots { min-width: 0; display: grid; }
.time-slot { min-width: 0; position: relative; border-left: 1px solid var(--dsw-alias-border-soft, #eee); }
.slot-hit { position: absolute; inset: 0; width: 100%; border: 0; background: transparent; padding: 0; }
.slot-hit:hover { background: var(--dsw-alias-accent-soft, #e8efff); }
.fragment-layer { position: absolute; inset: 2px 1px; display: flex; gap: 1px; pointer-events: none; }
.time-fragment { flex: 1; min-width: 0; pointer-events: auto; overflow: hidden; border: 0; border-radius: 4px; color: var(--dsw-alias-on-tag, #fff); padding: 3px; font-size: 9px; text-align: left; }
.time-fragment span { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.tag-shelf { min-height: 0; overflow-y: auto; padding: 10px 7px; border-left: 1px solid var(--dsw-alias-border, #ddd); background: var(--dsw-alias-surface, #fff); }
.shelf-title { display: flex; align-items: center; justify-content: space-between; gap: 4px; padding: 0 6px 8px; font-size: 12px; font-weight: 650; }
.shelf-title button { font-size: 10px; padding: 3px 5px; }
.tag-shelf > button { width: 100%; min-height: 30px; display: flex; align-items: center; gap: 7px; padding: 4px 6px 4px calc(6px + var(--depth, 0) * 14px); border: 1px solid transparent; border-radius: 6px; background: transparent; color: inherit; text-align: left; }
.tag-shelf > button.selected { background: var(--dsw-alias-accent-soft, #e8efff); color: var(--dsw-alias-accent, #3972d8); }
.tag-dot { width: 9px; height: 9px; flex: none; border-radius: 3px; }
.tag-manager { flex: 1; min-height: 0; overflow-y: auto; padding: 14px; }
.manager-header { justify-content: space-between; margin-bottom: 12px; }
.kind-switch { display: flex; gap: 5px; margin-bottom: 12px; }
.kind-switch button { padding: 6px 10px; border: 1px solid var(--dsw-alias-border, #ddd); border-radius: 6px; background: transparent; color: inherit; }
.kind-switch button[aria-pressed="true"] { background: var(--dsw-alias-accent-soft, #e8efff); }
.tag-form { display: grid; grid-template-columns: minmax(120px, 2fr) minmax(80px, 1fr) minmax(120px, 2fr) 60px auto; align-items: end; gap: 8px; }
.tag-form label, .editor-backdrop label, .template-form label { display: flex; flex-direction: column; gap: 4px; color: var(--dsw-alias-muted, #777); font-size: 11px; }
.tag-form input, .tag-form select, .editor-backdrop input, .editor-backdrop select, .editor-backdrop textarea, .template-form input { width: 100%; min-width: 0; border: 1px solid var(--dsw-alias-border, #ddd); border-radius: 6px; background: var(--dsw-alias-surface, #fff); color: inherit; padding: 6px; }
.tag-form input[type="color"] { height: 31px; padding: 2px; }
.managed-tag { min-height: 38px; display: flex; align-items: center; gap: 8px; margin-left: calc(var(--depth, 0) * 18px); border-bottom: 1px solid var(--dsw-alias-border-soft, #eee); }
.managed-tag small { color: var(--dsw-alias-muted, #777); }
.managed-tag button { margin-left: auto; border: 0; background: transparent; color: inherit; }
.managed-tag button + button { margin-left: 0; }
.template-main { overflow-y: auto; padding: 12px; }
.template-heading { flex-wrap: wrap; margin-bottom: 12px; }
.template-heading strong { margin-right: auto; }
.week-strip { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; margin-bottom: 12px; }
.week-strip button { min-width: 0; border: 1px solid var(--dsw-alias-border, #ddd); border-radius: 6px; background: transparent; color: inherit; padding: 6px 3px; }
.template-form { display: grid; grid-template-columns: 1fr 1fr minmax(140px, 2fr) auto; align-items: end; gap: 8px; margin-bottom: 12px; }
.template-list { border-top: 1px solid var(--dsw-alias-border-soft, #eee); }
.template-row { min-height: 42px; display: flex; align-items: center; flex-wrap: wrap; gap: 8px; border-bottom: 1px solid var(--dsw-alias-border-soft, #eee); }
.template-row span { color: var(--dsw-alias-muted, #777); }
.empty-note { color: var(--dsw-alias-muted, #777); font-size: 12px; }
.calendar-popover { position: absolute; z-index: 90; top: 98px; left: 50%; transform: translateX(-50%); width: min(340px, calc(100% - 20px)); max-height: calc(100% - 110px); overflow-y: auto; padding: 9px; border: 1px solid var(--dsw-alias-border, #ddd); border-radius: 12px; background: var(--dsw-alias-surface-raised, #fff); box-shadow: 0 12px 36px #0004; }
.calendar-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 7px; }
.calendar-head button, .calendar-today { border: 0; border-radius: 6px; background: transparent; color: inherit; padding: 5px 9px; }
.calendar-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 2px; }
.calendar-grid.weekdays { margin-bottom: 3px; color: var(--dsw-alias-muted, #777); font-size: 10px; text-align: center; }
.calendar-day { min-height: 34px; border: 1px solid transparent; border-radius: 6px; background: transparent; color: inherit; }
.calendar-day.is-today { border-color: var(--dsw-alias-accent, #3972d8); color: var(--dsw-alias-accent, #3972d8); }
.calendar-day[aria-current="date"] { background: var(--dsw-alias-accent, #3972d8); color: var(--dsw-alias-on-accent, #fff); }
.calendar-today { display: block; margin: 8px auto 0; }
.editor-backdrop { position: fixed; z-index: 100; top: 50%; left: 50%; transform: translate(-50%, -50%); width: min(420px, calc(100vw - 24px)); max-height: 85vh; overflow-y: auto; display: flex; flex-direction: column; gap: 9px; padding: 14px; border: 1px solid var(--dsw-alias-border, #ddd); border-radius: 12px; background: var(--dsw-alias-surface-raised, #fff); box-shadow: 0 12px 36px #0004; }
.editor-actions { display: flex; justify-content: flex-end; gap: 7px; }
.deep-module { flex: 1; min-width: 0; min-height: 0; overflow-y: auto; overflow-x: hidden; padding: 12px 16px 32px; }
.deep-head { max-width: 780px; margin: 0 auto 12px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; }
.deep-title { font-size: 13px; font-weight: 650; }
.deep-subtitle, .deep-hint { color: var(--dsw-alias-muted, #777); font-size: 10px; }
.deep-subtitle { margin-top: 2px; }
.deep-brush button { display: inline-flex; align-items: center; gap: 5px; }
.deep-brush-dot { width: 8px; height: 8px; border-radius: 2px; background: currentColor; }
.deep-brush button[data-level="high"] .deep-brush-dot { color: var(--dsw-alias-high, #317b68); }
.deep-brush button[data-level="medium"] .deep-brush-dot { color: var(--dsw-alias-medium, #ad7927); }
.deep-brush button[data-level="low"] .deep-brush-dot { color: var(--dsw-alias-low, #806a96); }
.deep-grid-scroll { width: 100%; max-width: 780px; min-width: 0; margin: 0 auto; overflow-x: auto; overflow-y: hidden; overscroll-behavior-x: contain; }
.deep-grid { min-width: 350px; display: grid; grid-template-columns: 42px repeat(7, minmax(0, 1fr)); gap: 2px; user-select: none; }
.deep-day { padding-bottom: 7px; text-align: center; color: var(--dsw-alias-muted, #777); font-size: 10px; font-weight: 600; }
.deep-hour { height: 22px; display: flex; align-items: center; justify-content: flex-end; padding-right: 7px; color: var(--dsw-alias-muted, #777); font: 9px ui-monospace, monospace; }
.deep-cell { height: 22px; min-width: 0; border: 1px solid var(--dsw-alias-border-soft, #eee); border-radius: 4px; background: var(--dsw-alias-surface, #fff); padding: 0; touch-action: pan-y; }
.deep-cell:hover { border-color: var(--dsw-alias-accent, #3972d8); }
.deep-cell[data-level="high"], .deep-swatch[data-level="high"] { background: var(--dsw-alias-high, #317b68); border-color: var(--dsw-alias-high, #317b68); }
.deep-cell[data-level="medium"], .deep-swatch[data-level="medium"] { background: var(--dsw-alias-medium, #ad7927); border-color: var(--dsw-alias-medium, #ad7927); }
.deep-cell[data-level="low"], .deep-swatch[data-level="low"] { background: var(--dsw-alias-low, #806a96); border-color: var(--dsw-alias-low, #806a96); }
.deep-legend { max-width: 780px; margin: 12px auto 0; display: flex; flex-wrap: wrap; gap: 12px; color: var(--dsw-alias-muted, #777); font-size: 10px; }
.deep-legend > span { display: inline-flex; align-items: center; gap: 5px; }
.deep-swatch { width: 11px; height: 11px; border: 1px solid var(--dsw-alias-border-soft, #eee); border-radius: 3px; background: var(--dsw-alias-surface, #fff); }
.deep-hint { max-width: 780px; margin: 9px auto 0; }
@media (max-width: 640px) {
  .product-header { flex-wrap: wrap; gap: 6px 10px; padding-inline: 7px; }
  .product-header nav { width: 100%; justify-content: space-between; }
  .time-toolbar, .date-strip { flex-wrap: wrap; padding-inline: 7px; }
  .date-spacer { display: none; }
  .actual-layout { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) 190px; }
  .tag-shelf { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-content: start; border-left: 0; border-top: 1px solid var(--dsw-alias-border, #ddd); }
  .shelf-title { grid-column: 1 / -1; }
  .hour-row { grid-template-columns: 42px minmax(0, 1fr); }
  .actual-status { padding-inline: 7px; }
  .tag-form, .template-form { grid-template-columns: 1fr 1fr; }
  .calendar-popover { top: 132px; max-height: calc(100% - 142px); }
  .deep-module { padding: 9px 8px 32px; }
  .deep-head { align-items: flex-start; }
  .deep-grid { grid-template-columns: 34px repeat(7, minmax(0, 1fr)); }
  .deep-cell, .deep-hour { height: 20px; }
}
`
