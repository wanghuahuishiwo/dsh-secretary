import { useEffect, useMemo, useRef, useState } from 'react'
import type { Tag, TagKind } from 'dsh-secretary-tag/contract'
import type { ActualBlock, ActualSource, FocusLevel } from 'dsh-secretary-time-block/contract'
import { fetchState, sendCommand, type PanelCommand } from './api.ts'

const DEFAULT_COLOR = '#477bc7'
const SOURCES: ActualSource[] = ['user_reported', 'agent_observed', 'imported']

function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function shiftDate(date: string, amount: number): string {
  const value = new Date(`${date}T12:00:00`)
  value.setDate(value.getDate() + amount)
  return localDate(value)
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

export function ActualPanel() {
  const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai', [])
  const [date, setDate] = useState(localDate)
  const [tags, setTags] = useState<Tag[]>([])
  const [blocks, setBlocks] = useState<ActualBlock[]>([])
  const [selectedTagId, setSelectedTagId] = useState<number>()
  const [eraseMode, setEraseMode] = useState(false)
  const [manager, setManager] = useState(false)
  const [managerKind, setManagerKind] = useState<TagKind>('time')
  const [tagName, setTagName] = useState('')
  const [tagParentId, setTagParentId] = useState('')
  const [tagColor, setTagColor] = useState(DEFAULT_COLOR)
  const [editingTagId, setEditingTagId] = useState<number>()
  const [editing, setEditing] = useState<ActualBlock>()
  const [editNote, setEditNote] = useState('')
  const [editTagId, setEditTagId] = useState('')
  const [editStart, setEditStart] = useState('')
  const [editEnd, setEditEnd] = useState('')
  const [editSource, setEditSource] = useState<ActualSource>('user_reported')
  const [editFocus, setEditFocus] = useState<FocusLevel | ''>('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const request = useRef(0)

  const refresh = async () => {
    const id = ++request.current
    try {
      const state = await fetchState(date, timeZone)
      if (id !== request.current) return
      setTags(state.tags)
      setBlocks(state.blocks)
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

  const run = async (command: PanelCommand) => {
    setBusy(true)
    try {
      await sendCommand(command)
      await refresh()
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const tagById = (id: number) => tags.find(tag => tag.id === id)
  const openEditor = (block: ActualBlock) => {
    setEditing(block)
    setEditNote(block.note ?? '')
    setEditTagId(String(block.timeTagId))
    setEditStart(block.startAt)
    setEditEnd(block.endAt ?? '')
    setEditSource(block.actualSource)
    setEditFocus(block.focus ?? '')
  }

  const createAt = async (minute: number) => {
    if (selectedTagId === undefined) { setError('请先在右侧选择时间标签'); return }
    await run({
      domain: 'time', op: 'actual.create', timeTagId: selectedTagId,
      startAt: atMinute(date, minute), endAt: atMinute(date, minute + 10), actualSource: 'user_reported',
    })
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

  return (
    <div className="secretary-time-panel">
      <style>{styles}</style>
      <header className="time-header">
        <strong>{manager ? '标签管理' : '时间实录'}</strong>
        {manager ? (
          <button type="button" onClick={() => { setManager(false); setEditingTagId(undefined); setTagName('') }}>返回实录</button>
        ) : (
          <>
            <button type="button" aria-label="前一天" onClick={() => setDate(shiftDate(date, -1))}>‹</button>
            <input aria-label="实录日期" type="date" value={date} onChange={event => setDate(event.target.value)} />
            <button type="button" aria-label="后一天" onClick={() => setDate(shiftDate(date, 1))}>›</button>
            <button type="button" onClick={() => setDate(localDate())}>今天</button>
            <button type="button" onClick={() => setManager(true)}>管理标签</button>
          </>
        )}
      </header>
      {error && <div role="alert" className="time-error">{error}</div>}

      {manager ? (
        <section className="tag-manager" aria-label="统一标签管理">
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
      ) : (
        <div className="actual-layout">
          <main className="actual-main">
            <div className="actual-status">
              <span>{eraseMode ? '消除态：点击记录删除' : '点击格子记录 10 分钟 · Shift 点击编辑'}</span>
              <button type="button" disabled={busy || selectedTagId === undefined} onClick={() => void run({
                domain: 'time', op: 'actual.start', timeTagId: selectedTagId, actualSource: 'user_reported',
              })}>开始实录</button>
            </div>
            {blocks.some(block => block.endAt === undefined) && <div className="running-list">
              {blocks.filter(block => block.endAt === undefined).map(block => (
                <span key={block.id}>正在记录 {tagById(block.timeTagId)?.name ?? block.timeTagId}
                  <button type="button" onClick={() => void run({ domain: 'time', op: 'actual.stop', id: block.id })}>停止 {tagById(block.timeTagId)?.name ?? block.id}</button>
                </span>
              ))}
            </div>}
            <div className="day-canvas" aria-label="实录画布">
              {Array.from({ length: 24 }, (_, hour) => (
                <div className="hour-row" key={hour}>
                  <span className="hour-label">{String(hour).padStart(2, '0')}:00</span>
                  <div className="hour-slots">
                    {Array.from({ length: 6 }, (_, slotIndex) => {
                      const minute = hour * 60 + slotIndex * 10
                      const start = Date.parse(atMinute(date, minute))
                      const end = Date.parse(atMinute(date, minute + 10))
                      const covering = blocks.filter(block => {
                        const blockEnd = block.endAt === undefined ? Date.now() : Date.parse(block.endAt)
                        return Date.parse(block.startAt) < end && blockEnd > start
                      })
                      const label = `${String(hour).padStart(2, '0')}:${String(slotIndex * 10).padStart(2, '0')}`
                      return <div className="time-slot" data-slot={label} key={slotIndex}>
                        <button type="button" className="slot-hit" aria-label={`${date} ${label} 时间格`} onClick={() => void createAt(minute)} />
                        <div className="fragment-layer">
                          {covering.map(block => {
                            const tag = tagById(block.timeTagId)
                            const first = Date.parse(block.startAt) >= start && Date.parse(block.startAt) < end
                            return <button
                              type="button" key={block.id} className="actual-fragment" data-block-id={block.id}
                              aria-label={`实录 ${tag?.name ?? block.timeTagId} ${timeLabel(block.startAt, timeZone)}`}
                              style={{ background: tag?.color ?? DEFAULT_COLOR }}
                              onClick={event => {
                                event.stopPropagation()
                                if (event.shiftKey) { openEditor(block); return }
                                if (eraseMode || block.timeTagId === selectedTagId) {
                                  void run({ domain: 'time', op: 'actual.delete', id: block.id })
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
          <aside className="tag-shelf" aria-label="时间标签架">
            <div className="shelf-title">时间标签</div>
            {timeTags.map(({ tag, depth }) => (
              <button
                type="button" key={tag.id} className={selectedTagId === tag.id ? 'selected' : ''}
                style={{ '--depth': depth } as React.CSSProperties}
                onClick={() => { setSelectedTagId(tag.id); setEraseMode(false) }}
                onDoubleClick={() => { if (selectedTagId === tag.id) setEraseMode(true) }}
              ><span className="tag-dot" style={{ background: tag.color ?? DEFAULT_COLOR }} />{tag.name}</button>
            ))}
          </aside>
        </div>
      )}

      {editing && <div className="editor-backdrop" role="dialog" aria-label="编辑实录">
        <label>实录标签<select value={editTagId} onChange={event => setEditTagId(event.target.value)}>
          {timeTags.map(({ tag }) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
        </select></label>
        <label>实录备注<textarea value={editNote} onChange={event => setEditNote(event.target.value)} /></label>
        <label>开始时刻<input value={editStart} onChange={event => setEditStart(event.target.value)} /></label>
        <label>结束时刻<input value={editEnd} placeholder="留空表示正在记录" onChange={event => setEditEnd(event.target.value)} /></label>
        <label>实际来源<select value={editSource} onChange={event => setEditSource(event.target.value as ActualSource)}>
          {SOURCES.map(source => <option key={source} value={source}>{source}</option>)}
        </select></label>
        <label>专注档位<select value={editFocus} onChange={event => setEditFocus(event.target.value as FocusLevel | '')}>
          <option value="">未标注</option><option value="deep">deep</option><option value="shallow">shallow</option>
        </select></label>
        <div className="editor-actions">
          <button type="button" onClick={() => setEditing(undefined)}>取消</button>
          <button type="button" onClick={() => { void run({ domain: 'time', op: 'actual.delete', id: editing.id }); setEditing(undefined) }}>删除实录</button>
          <button type="button" disabled={busy} onClick={async () => {
            await run({
              domain: 'time', op: 'actual.update', id: editing.id, timeTagId: Number(editTagId), note: editNote,
              startAt: editStart, endAt: editEnd === '' ? null : editEnd, actualSource: editSource, focus: editFocus === '' ? null : editFocus,
            })
            setEditing(undefined)
          }}>保存实录</button>
        </div>
      </div>}
    </div>
  )
}

const styles = `
.secretary-time-panel { height: 100%; min-width: 0; display: flex; flex-direction: column; overflow: hidden; background: var(--dsw-alias-bg, #f5f5f7); color: var(--dsw-alias-text, #1d1d1f); font-family: var(--dsw-alias-font, sans-serif); }
.secretary-time-panel button, .secretary-time-panel input, .secretary-time-panel select, .secretary-time-panel textarea { font: inherit; }
.time-header { flex: none; min-height: 48px; padding: calc(var(--dsh-frame-top-clearance, 0px) + 7px) 12px 7px; display: flex; align-items: center; gap: 6px; border-bottom: 1px solid var(--dsw-alias-border, #ddd); background: var(--dsw-alias-surface, #fff); }
.time-header strong { margin-right: auto; }
.time-header button, .actual-status button, .tag-form button, .editor-actions button, .running-list button { border: 1px solid var(--dsw-alias-border, #ddd); border-radius: 6px; background: var(--dsw-alias-surface, #fff); color: inherit; padding: 5px 8px; cursor: pointer; }
.time-error { flex: none; padding: 8px 12px; color: var(--dsw-alias-danger, #bd443d); }
.actual-layout { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) 240px; }
.actual-main { min-width: 0; min-height: 0; display: flex; flex-direction: column; }
.actual-status { flex: none; min-height: 38px; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 5px 12px; color: var(--dsw-alias-muted, #777); font-size: 11px; }
.running-list { padding: 5px 12px; font-size: 11px; }
.day-canvas { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; }
.hour-row { height: 48px; display: grid; grid-template-columns: 50px minmax(0, 1fr); border-bottom: 1px solid var(--dsw-alias-border-soft, #eee); }
.hour-label { padding: 6px 7px 0 0; text-align: right; color: var(--dsw-alias-muted, #777); font: 10px ui-monospace, monospace; }
.hour-slots { min-width: 0; display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); }
.time-slot { min-width: 0; position: relative; border-left: 1px solid var(--dsw-alias-border-soft, #eee); }
.slot-hit { position: absolute; inset: 0; width: 100%; border: 0; background: transparent; padding: 0; }
.slot-hit:hover { background: var(--dsw-alias-accent-soft, #e8efff); }
.fragment-layer { position: absolute; inset: 2px 1px; display: flex; gap: 1px; pointer-events: none; }
.actual-fragment { flex: 1; min-width: 0; pointer-events: auto; overflow: hidden; border: 0; border-radius: 4px; color: var(--dsw-alias-on-tag, #fff); padding: 3px; font-size: 9px; text-align: left; }
.actual-fragment span { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.tag-shelf { min-height: 0; overflow-y: auto; padding: 10px 7px; border-left: 1px solid var(--dsw-alias-border, #ddd); background: var(--dsw-alias-surface, #fff); }
.shelf-title { padding: 0 6px 8px; font-size: 12px; font-weight: 650; }
.tag-shelf button { width: 100%; min-height: 30px; display: flex; align-items: center; gap: 7px; padding: 4px 6px 4px calc(6px + var(--depth, 0) * 14px); border: 1px solid transparent; border-radius: 6px; background: transparent; color: inherit; text-align: left; }
.tag-shelf button.selected { background: var(--dsw-alias-accent-soft, #e8efff); color: var(--dsw-alias-accent, #3972d8); }
.tag-dot { width: 9px; height: 9px; flex: none; border-radius: 3px; }
.tag-manager { flex: 1; min-height: 0; overflow-y: auto; padding: 14px; }
.kind-switch { display: flex; gap: 5px; margin-bottom: 12px; }
.kind-switch button { padding: 6px 10px; border: 1px solid var(--dsw-alias-border, #ddd); border-radius: 6px; background: transparent; color: inherit; }
.kind-switch button[aria-pressed="true"] { background: var(--dsw-alias-accent-soft, #e8efff); }
.tag-form { display: grid; grid-template-columns: minmax(120px, 2fr) minmax(80px, 1fr) minmax(120px, 2fr) 60px auto; align-items: end; gap: 8px; }
.tag-form label, .editor-backdrop label { display: flex; flex-direction: column; gap: 4px; color: var(--dsw-alias-muted, #777); font-size: 11px; }
.tag-form input, .tag-form select, .editor-backdrop input, .editor-backdrop select, .editor-backdrop textarea { width: 100%; min-width: 0; border: 1px solid var(--dsw-alias-border, #ddd); border-radius: 6px; background: var(--dsw-alias-surface, #fff); color: inherit; padding: 6px; }
.tag-form input[type="color"] { height: 31px; padding: 2px; }
.managed-tag { min-height: 38px; display: flex; align-items: center; gap: 8px; margin-left: calc(var(--depth, 0) * 18px); border-bottom: 1px solid var(--dsw-alias-border-soft, #eee); }
.managed-tag small { color: var(--dsw-alias-muted, #777); }
.managed-tag button { margin-left: auto; border: 0; background: transparent; color: inherit; }
.managed-tag button + button { margin-left: 0; }
.editor-backdrop { position: fixed; z-index: 100; top: 50%; left: 50%; transform: translate(-50%, -50%); width: min(420px, calc(100vw - 24px)); max-height: 85vh; overflow-y: auto; display: flex; flex-direction: column; gap: 9px; padding: 14px; border: 1px solid var(--dsw-alias-border, #ddd); border-radius: 12px; background: var(--dsw-alias-surface-raised, #fff); box-shadow: 0 12px 36px #0004; }
.editor-actions { display: flex; justify-content: flex-end; gap: 7px; }
@media (max-width: 640px) {
  .time-header { flex-wrap: wrap; padding-inline: 7px; }
  .time-header strong { width: 100%; }
  .actual-layout { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) 190px; }
  .tag-shelf { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-content: start; border-left: 0; border-top: 1px solid var(--dsw-alias-border, #ddd); }
  .shelf-title { grid-column: 1 / -1; }
  .hour-row { grid-template-columns: 42px minmax(0, 1fr); }
  .actual-status { padding-inline: 7px; }
  .tag-form { grid-template-columns: 1fr 1fr; }
}
`
