import { useEffect, useLayoutEffect, useRef, useState, type UIEvent } from 'react'
import type { DispatchConsoleAdapter, StreamEvent } from './contract.ts'

/** Page size of the event list: the newest 200, then 200 further back each time the list is scrolled to its end. */
export const PAGE_SIZE = 200
/** Start reading the next page this many pixels before the end of the list. */
const OLDER_TRIGGER_PX = 80

interface ListState {
  readonly events: readonly StreamEvent[]
  readonly firstSeq: number
  /** Reading the page before the oldest event shown. */
  readonly loadingOlder: boolean
}

const EMPTY: ListState = { events: [], firstSeq: 0, loadingOlder: false }
const json = (value: unknown): string => JSON.stringify(value, null, 2) ?? String(value)

/**
 * The 事件 section: the stream as it lies, newest first. While following, every mark re-reads the newest page; once
 * the list is scrolled away from the top the list pauses and counts the marks until the user returns to the top.
 * A clicked event replaces the list with its full-page JSON.
 */
export function EventsSection({ adapter }: { readonly adapter: DispatchConsoleAdapter }) {
  const [list, setList] = useState<ListState>(EMPTY)
  const [following, setFollowing] = useState(true)
  const [pending, setPending] = useState(0)
  const [error, setError] = useState<string | undefined>()
  const [detail, setDetail] = useState<StreamEvent | undefined>()
  const scroll = useRef<HTMLDivElement>(null)
  /** Set for the whole older-page read: scroll events of one render must not start a second one. */
  const readingOlder = useRef(false)
  const keepScroll = useRef<{ top: number; height: number } | undefined>(undefined)
  /** `following` inside the mark callback without re-opening the watch stream on every change. */
  const isFollowing = useRef(following)
  isFollowing.current = following

  const report = (cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause))
  const readNewest = async () => {
    try {
      const page = await adapter.listEvents({ limit: PAGE_SIZE })
      setList({ events: page.events, firstSeq: page.firstSeq, loadingOlder: false })
      setError(undefined)
    } catch (cause) { report(cause) }
  }
  const readOlder = async () => {
    const oldest = list.events[list.events.length - 1]
    if (oldest === undefined || readingOlder.current || oldest.seq <= list.firstSeq) return
    readingOlder.current = true
    const element = scroll.current
    if (element) keepScroll.current = { top: element.scrollTop, height: element.scrollHeight }
    setList({ ...list, loadingOlder: true })
    try {
      const page = await adapter.listEvents({ before: oldest.seq, limit: PAGE_SIZE })
      // A newer page may have arrived meanwhile: keep each sequence once, newest first.
      setList(current => {
        const known = new Set(current.events.map(item => item.seq))
        const events = [...page.events.filter(item => !known.has(item.seq)), ...current.events].sort((a, b) => b.seq - a.seq)
        return { events, firstSeq: page.firstSeq, loadingOlder: false }
      })
      setError(undefined)
    } catch (cause) {
      setList(current => ({ ...current, loadingOlder: false }))
      report(cause)
    } finally {
      readingOlder.current = false
    }
  }
  const resume = () => {
    setFollowing(true)
    setPending(0)
    if (scroll.current) scroll.current.scrollTop = 0
    void readNewest()
  }

  useEffect(() => {
    void readNewest()
    const stop = adapter.watchEvents?.(() => {
      if (isFollowing.current) void readNewest()
      else setPending(count => count + 1)
    })
    // One stream per mount: the callbacks read the latest state through refs and functional updates.
    return stop
  }, [adapter])

  // Prepending the older page must not move what the user is looking at.
  useLayoutEffect(() => {
    const element = scroll.current
    const before = keepScroll.current
    if (element && before) element.scrollTop = before.top + (element.scrollHeight - before.height)
    keepScroll.current = undefined
  })

  const onScroll = (event: UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget
    if (element.scrollTop <= 0) {
      if (!isFollowing.current) resume()
      return
    }
    if (isFollowing.current) setFollowing(false)
    if (element.scrollHeight - element.scrollTop - element.clientHeight < OLDER_TRIGGER_PX) void readOlder()
  }

  /** The list remounts at its top, so returning from the detail follows the newest events again. */
  const backToList = () => { setDetail(undefined); resume() }

  if (detail !== undefined) return <EventDetail event={detail} onBack={backToList} />
  const oldest = list.events[list.events.length - 1]
  return (
    <section aria-label="事件" className="dc-events">
      {error === undefined ? null : <p role="alert" className="dc-tone-error">{error}</p>}
      {pending > 0 ? <button type="button" className="dc-new" data-dc-new-events={pending} onClick={resume}>{pending} 条新事件</button> : null}
      <div ref={scroll} className="dc-events-scroll" data-dc-following={following ? 'true' : 'false'} onScroll={onScroll}>
        {list.events.length === 0 ? (
          <p className="dc-muted">{list === EMPTY ? '读取中…' : error === undefined ? 'stream 里没有事件。' : ''}</p>
        ) : (
          <EventList events={list.events} onOpen={setDetail} />
        )}
        {oldest === undefined || oldest.seq <= list.firstSeq ? null : (
          <p className="dc-muted" data-dc-older={list.loadingOlder ? 'loading' : 'idle'}>
            {list.loadingOlder ? '读取更早的事件…' : `已显示到第 ${oldest.seq} 条，滚到底部读取更早的事件。`}
          </p>
        )}
      </div>
    </section>
  )
}

/** Envelope attribute columns: what the events carry, in a fixed order first, then whatever else appeared; `data` and the history last. */
export function eventColumns(events: readonly StreamEvent[]): string[] {
  const lead = ['seq', 'specversion', 'id', 'source', 'type', 'time']
  const rest = new Set<string>()
  for (const item of events) {
    if (typeof item.event !== 'object' || item.event === null || Array.isArray(item.event)) continue
    for (const key of Object.keys(item.event)) if (key !== 'data' && !lead.includes(key)) rest.add(key)
  }
  return [...lead, ...[...rest].sort(), 'data', 'history']
}

function cell(item: StreamEvent, column: string): string {
  if (column === 'seq') return String(item.seq)
  if (column === 'history') return item.history.length === 0 ? '' : json(item.history)
  if (typeof item.event !== 'object' || item.event === null || Array.isArray(item.event)) return column === 'specversion' ? String(item.event) : ''
  const record = item.event as Record<string, unknown>
  return column in record ? json(record[column]) : ''
}

/** The table: one row per event, one column per envelope attribute, `data` and the history as complete JSON. */
export function EventList({ events, onOpen }: { readonly events: readonly StreamEvent[]; readonly onOpen: (event: StreamEvent) => void }) {
  const columns = eventColumns(events)
  return (
    <table className="dc-grid dc-events-table" data-dc-events={events.length}>
      <thead><tr>{columns.map(column => <th key={column}>{column}</th>)}</tr></thead>
      <tbody>
        {events.map(item => (
          <tr key={item.seq} data-dc-event={item.seq} onClick={() => onOpen(item)}>
            {columns.map(column => (
              <td key={column} className={column === 'data' || column === 'history' || column === 'id' || column === 'source' || column === 'seq' ? 'dc-mono dc-cell-json' : undefined}>
                {column === 'data' || column === 'history' ? <pre className="dc-json">{cell(item, column)}</pre> : cell(item, column)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** The full-page detail: the complete envelope JSON and the complete consumption records JSON, nothing else. */
export function EventDetail({ event, onBack }: { readonly event: StreamEvent; readonly onBack: () => void }) {
  return (
    <section aria-label="事件详情" className="dc-event-detail" data-dc-detail={event.seq}>
      <p><button type="button" onClick={onBack}>返回事件列表</button></p>
      <pre className="dc-json" data-dc-envelope>{json(event.event)}</pre>
      <pre className="dc-json" data-dc-history>{json(event.history)}</pre>
    </section>
  )
}
