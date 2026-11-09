import type {
  DeepCellLevel, DeepLevel, DeepRect, DeepWeekData, DeleteBlockCommand, PaintCommand,
  PaintDeepCommand, TimeAdapter, TimeBlockView, TimeLayer, TimeQuery, TimeTagView,
  TimeView, UpdateBlockCommand,
} from 'dsh-secretary-ui-time/ui'
import { timeMath } from 'dsh-secretary-ui-time/ui'
import {
  FIXTURE_FROM, FIXTURE_NOW_MINUTE, FIXTURE_TODAY, FIXTURE_TO, FIXTURE_WEEK_START,
  createFixtureBlocks, createFixtureDeep, fixtureTags,
} from './fixtures.ts'

const DEEP_CELLS = 7 * 24
const HISTORY_LIMIT = 50

interface UndoDay {
  readonly date: string
  readonly before: readonly TimeBlockView[]
}

/** One canvas Undo entry: the affected local days as they were before the paint. */
interface UndoEntry {
  readonly days: readonly UndoDay[]
}

function defaultQuery(): TimeQuery {
  return {
    anchor: FIXTURE_TODAY,
    from: FIXTURE_FROM,
    to: FIXTURE_TO,
    weekStart: FIXTURE_WEEK_START,
  }
}

/** Inclusive ISO-day list between `from` and `to`. */
function dayRange(from: string, to: string): string[] {
  const days: string[] = []
  for (let date = from; date <= to && days.length < 63; date = timeMath.addDays(date, 1)) days.push(date)
  return days
}

function sortBlocks(blocks: readonly TimeBlockView[]): TimeBlockView[] {
  return [...blocks].sort((left, right) => (
    left.date.localeCompare(right.date) || left.start - right.start || left.id.localeCompare(right.id)
  ))
}

/**
 * The OpenDesign `TimeAdapter`: pure in-memory data over the fixed fixture day.
 * It never touches the network, SQLite or the production DSH client; every
 * method returns the fresh `TimeView` exactly like the production adapter.
 */
export class FixtureTimeAdapter implements TimeAdapter {
  private blocks: Record<TimeLayer, TimeBlockView[]> = createFixtureBlocks()
  private readonly deepWeeks = new Map<string, DeepCellLevel[]>([[FIXTURE_WEEK_START, createFixtureDeep()]])
  private history: Record<TimeLayer, UndoEntry[]> = { plan: [], actual: [] }
  private query: TimeQuery | undefined
  private nextId = 1

  async load(query: TimeQuery): Promise<TimeView> {
    this.query = query
    return this.view()
  }

  /** A fixture already answers from its live objects, so refresh equals load. */
  async refresh(query: TimeQuery): Promise<TimeView> {
    return this.load(query)
  }

  async paint(command: PaintCommand): Promise<TimeView> {
    if (command.mode === 'parallel' && command.tagId !== null) {
      this.writeParallel(command.layer, command.runs, command.tagId)
    } else {
      this.write(command.layer, command.runs, command.tagId)
    }
    return this.view()
  }

  async undo(layer: TimeLayer): Promise<TimeView | undefined> {
    const entry = this.history[layer][0]
    if (entry === undefined) return undefined
    this.history[layer] = this.history[layer].slice(1)
    const dates = new Set(entry.days.map(day => day.date))
    const untouched = this.blocks[layer].filter(block => !dates.has(block.date))
    const restored = entry.days.flatMap(day => day.before)
    this.blocks[layer] = sortBlocks([...untouched, ...restored])
    return this.view()
  }

  async paintDeep(command: PaintDeepCommand): Promise<TimeView> {
    const cells = [...(this.deepWeeks.get(command.weekStart) ?? blankDeep())]
    for (const rect of command.rects) this.paintRect(cells, rect, command.level)
    this.deepWeeks.set(command.weekStart, cells)
    if (this.query !== undefined) this.query = { ...this.query, weekStart: command.weekStart }
    return this.view()
  }

  async updateBlock(command: UpdateBlockCommand): Promise<TimeView> {
    this.blocks[command.layer] = sortBlocks(this.blocks[command.layer].map(block => (
      block.id === command.id
        ? {
          ...block,
          date: command.date,
          start: command.start,
          end: command.end,
          tagId: command.tagId,
          note: command.note,
        }
        : block
    )))
    return this.view()
  }

  async deleteBlock(command: DeleteBlockCommand): Promise<TimeView> {
    this.blocks[command.layer] = this.blocks[command.layer].filter(block => block.id !== command.id)
    return this.view()
  }

  private view(): TimeView {
    const query = this.query ?? defaultQuery()
    return {
      today: FIXTURE_TODAY,
      nowMinute: FIXTURE_NOW_MINUTE,
      from: query.from,
      to: query.to,
      days: dayRange(query.from, query.to),
      weekStart: query.weekStart,
      tags: fixtureTags as readonly TimeTagView[],
      blocks: {
        plan: [...this.blocks.plan],
        actual: [...this.blocks.actual],
      },
      deep: this.deepOf(query.weekStart),
      canUndo: {
        plan: this.history.plan.length > 0,
        actual: this.history.actual.length > 0,
      },
    }
  }

  private deepOf(weekStart: string): DeepWeekData {
    const painted = this.deepWeeks.get(weekStart)
    if (painted !== undefined) return { source: 'own', levels: [...painted] }
    return { source: 'seed', levels: blankDeep() }
  }

  private paintRect(cells: DeepCellLevel[], rect: DeepRect, level: DeepLevel | null): void {
    for (let weekday = rect.startWeekday; weekday <= rect.endWeekday; weekday += 1) {
      for (let hour = rect.startHour; hour <= rect.endHour; hour += 1) {
        const index = (weekday - 1) * 24 + hour
        if (index >= 0 && index < DEEP_CELLS) cells[index] = level ?? 'unset'
      }
    }
  }

  /** Paint or erase runs on one layer, keeping the pre-write days for Undo. */
  private write(
    layer: TimeLayer,
    runs: PaintCommand['runs'],
    tagId: string | null,
  ): void {
    if (runs.length === 0) return
    const dates = new Set(runs.map(run => run.date))
    const current = this.blocks[layer]
    const entry: UndoEntry = {
      days: [...dates].map(date => ({
        date,
        before: current.filter(block => block.date === date).map(block => ({ ...block })),
      })),
    }
    const next = current.filter(block => !dates.has(block.date))

    for (const date of dates) {
      let day = current.filter(block => block.date === date).map(block => ({ ...block }))
      const dayRuns = runs.filter(run => run.date === date).sort((left, right) => left.start - right.start)
      for (const run of dayRuns) day = overwrite(day, run, tagId, () => this.createId())
      next.push(...mergeAdjacent(day))
    }

    this.blocks[layer] = sortBlocks(next)
    this.history[layer] = [entry, ...this.history[layer]].slice(0, HISTORY_LIMIT)
  }

  /** Keep every existing record and append one new record per run. */
  private writeParallel(
    layer: TimeLayer,
    runs: PaintCommand['runs'],
    tagId: string,
  ): void {
    if (runs.length === 0) return
    const dates = new Set(runs.map(run => run.date))
    const current = this.blocks[layer]
    const entry: UndoEntry = {
      days: [...dates].map(date => ({
        date,
        before: current.filter(block => block.date === date).map(block => ({ ...block })),
      })),
    }
    const added = runs.map(run => ({
      id: this.createId(),
      date: run.date,
      start: run.start,
      end: run.end,
      tagId,
    }))
    this.blocks[layer] = sortBlocks([...current, ...added])
    this.history[layer] = [entry, ...this.history[layer]].slice(0, HISTORY_LIMIT)
  }

  private createId(): string {
    const id = `fixture-${this.nextId}`
    this.nextId += 1
    return id
  }
}

function blankDeep(): DeepCellLevel[] {
  return Array.from({ length: DEEP_CELLS }, () => 'unset')
}

/** 上色与擦除共用覆盖语义：保留既有块未选中的左右片段。 */
function overwrite(
  blocks: readonly TimeBlockView[],
  run: PaintCommand['runs'][number],
  tagId: string | null,
  createId: () => string,
): TimeBlockView[] {
  const next: TimeBlockView[] = []
  for (const block of blocks) {
    if (block.end <= run.start || block.start >= run.end) {
      next.push(block)
      continue
    }
    if (block.start < run.start) next.push({ ...block, id: createId(), end: run.start })
    if (block.end > run.end) next.push({ ...block, id: createId(), start: run.end })
  }
  if (tagId !== null) next.push({ id: createId(), date: run.date, start: run.start, end: run.end, tagId })
  return next
}

function mergeAdjacent(blocks: readonly TimeBlockView[]): TimeBlockView[] {
  const sorted = [...blocks].sort((left, right) => left.start - right.start || left.id.localeCompare(right.id))
  const result: TimeBlockView[] = []
  for (const block of sorted) {
    const previous = result[result.length - 1]
    if (
      previous !== undefined && previous.end === block.start
      && previous.tagId === block.tagId && (previous.note ?? '') === (block.note ?? '')
    ) {
      result[result.length - 1] = { ...previous, end: block.end }
    } else {
      result.push(block)
    }
  }
  return result
}
