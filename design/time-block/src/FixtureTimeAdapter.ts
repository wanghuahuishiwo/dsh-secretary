import type {
  EraseCommand, PaintCommand, TimeBlockAdapter, UndoResult,
} from '../../shared/model/adapter.ts'
import type {
  TimeBlock, TimeBlockSnapshot, TimeLayer, TimeRun,
} from '../../shared/model/types.ts'
import { createFixtureSnapshot } from './fixtures.ts'

interface UndoEntry {
  readonly days: readonly { readonly date: string; readonly before: readonly TimeBlock[] }[]
}

/** 纯内存设计数据源；无网络、SQLite、持久化或生产 DSH 依赖。 */
export class FixtureTimeAdapter implements TimeBlockAdapter {
  private snapshot = createFixtureSnapshot()
  private history: Record<TimeLayer, UndoEntry[]> = { plan: [], actual: [] }
  private nextId = 1

  async load(): Promise<TimeBlockSnapshot> {
    return this.snapshot
  }

  async paint(command: PaintCommand): Promise<TimeBlockSnapshot> {
    return this.write(command.layer, command.runs, command.tagId)
  }

  async erase(command: EraseCommand): Promise<TimeBlockSnapshot> {
    return this.write(command.layer, command.runs, null)
  }

  async undo(layer: TimeLayer): Promise<UndoResult | undefined> {
    const entry = this.history[layer].shift()
    if (entry === undefined) return undefined
    const dates = new Set(entry.days.map(day => day.date))
    const untouched = this.snapshot.blocks[layer].filter(block => !dates.has(block.date))
    const restored = entry.days.flatMap(day => day.before)
    this.replaceLayer(layer, [...untouched, ...restored])
    return { date: entry.days[0].date, snapshot: this.snapshot }
  }

  private write(layer: TimeLayer, runs: readonly TimeRun[], tagId: string | null): TimeBlockSnapshot {
    if (runs.length === 0) return this.snapshot
    const dates = new Set(runs.map(run => run.date))
    const current = this.snapshot.blocks[layer]
    const entry: UndoEntry = {
      days: [...dates].map(date => ({ date, before: current.filter(block => block.date === date) })),
    }
    const next = current.filter(block => !dates.has(block.date))

    for (const date of dates) {
      let day = current.filter(block => block.date === date)
      const dayRuns = runs.filter(run => run.date === date).sort((left, right) => left.start - right.start)
      for (const run of dayRuns) day = overwrite(day, run, tagId, () => this.createId())
      next.push(...mergeAdjacent(day))
    }

    this.history[layer] = [entry, ...this.history[layer]].slice(0, 50)
    this.replaceLayer(layer, next)
    return this.snapshot
  }

  private replaceLayer(layer: TimeLayer, blocks: readonly TimeBlock[]): void {
    this.snapshot = {
      ...this.snapshot,
      blocks: { ...this.snapshot.blocks, [layer]: blocks },
      canUndo: { ...this.snapshot.canUndo, [layer]: this.history[layer].length > 0 },
    }
  }

  private createId(): string {
    const id = `fixture-${this.nextId}`
    this.nextId += 1
    return id
  }
}

/** 上色与擦除共用覆盖语义：保留既有块未选中的左右片段。 */
function overwrite(
  blocks: readonly TimeBlock[], run: TimeRun, tagId: string | null, createId: () => string,
): TimeBlock[] {
  const next: TimeBlock[] = []
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

function mergeAdjacent(blocks: readonly TimeBlock[]): TimeBlock[] {
  const sorted = [...blocks].sort((left, right) => left.start - right.start || left.id.localeCompare(right.id))
  const result: TimeBlock[] = []
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
