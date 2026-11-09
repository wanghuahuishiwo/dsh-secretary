import type { TypertRemoteNamespaceMap } from '@deepseek-ai/dsh-typert-protocol'
import type {} from 'dsh-secretary-time-controller/remote'
import type {
  DeepCellLevel, PaintCommand, PaintDeepCommand, TimeAdapter, TimeBlockView, TimeLayer,
  TimeQuery, TimeTagView, TimeView, UpdateBlockCommand, DeleteBlockCommand,
} from '../ui/contract.ts'
import { atMinute, minuteOf, recordsOfDay, type BlockLike, type DayRecord } from '../ui/model.ts'
import type { TimeWindowProjection } from 'dsh-secretary-time-controller/types'

/** The generated `secretaryTime` browser client, without the plugin's own Context shape. */
export type TimeRemote = TypertRemoteNamespaceMap['secretaryTime']

interface UndoDay {
  readonly date: string
  readonly records: readonly DayRecord[]
}

/** One canvas Undo entry: the affected local days as they were before the paint. */
interface UndoEntry {
  readonly dates: readonly UndoDay[]
}

const HISTORY_LIMIT = 50
const DEEP_CELLS = 7 * 24

function numericId(id: string, field: string): number {
  const value = Number(id)
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`Time UI ${field} 不是有效的数字标识：${id}`)
  }
  return value
}

/**
 * The production `TimeAdapter`: it maps the Typert Time Remote projection into
 * the UI contract, keeps the per-layer Undo history in memory, and maps every
 * UI command back to the unchanged Remote request shape.
 */
export class RemoteTimeAdapter implements TimeAdapter {
  private readonly remote: TimeRemote
  private readonly timeZone: string
  private readonly history: Record<TimeLayer, UndoEntry[]> = { plan: [], actual: [] }
  private query: TimeQuery | undefined
  private projection: TimeWindowProjection | undefined

  constructor(remote: TimeRemote, timeZone: string) {
    this.remote = remote
    this.timeZone = timeZone
  }

  async load(query: TimeQuery): Promise<TimeView> {
    return this.read(query, 'readWindow')
  }

  /** Re-read persisted Tags and Time facts instead of the host's snapshot. */
  async refresh(query: TimeQuery): Promise<TimeView> {
    return this.read(query, 'reloadWindow')
  }

  private async read(query: TimeQuery, method: 'readWindow' | 'reloadWindow'): Promise<TimeView> {
    this.query = query
    const request = {
      anchor: query.anchor,
      timeZone: this.timeZone,
      weekStart: query.weekStart,
      from: query.from,
      to: query.to,
    }
    const result = await (method === 'readWindow' ? this.remote.readWindow(request) : this.remote.reloadWindow(request))
    if (!result.ok) throw result.error
    this.projection = result.value
    return this.viewOf(result.value)
  }

  async paint(command: PaintCommand): Promise<TimeView> {
    const projection = this.requireProjection()
    const blocks = layerBlocks(projection, command.layer)
    const dates = [...new Set(command.runs.map(run => run.date))]
    const entry: UndoEntry = {
      dates: dates.map(date => ({
        date,
        records: recordsOfDay(blocks, date, this.timeZone, projection.nowMs),
      })),
    }
    const result = await this.remote.paint({
      layer: command.layer,
      tagId: command.tagId === null ? null : numericId(command.tagId, '标签'),
      runs: command.runs,
      timeZone: this.timeZone,
      mode: command.mode ?? 'overwrite',
    })
    if (!result.ok) throw result.error
    this.history[command.layer] = [entry, ...this.history[command.layer]].slice(0, HISTORY_LIMIT)
    return this.reload()
  }

  async undo(layer: TimeLayer): Promise<TimeView | undefined> {
    const entry = this.history[layer][0]
    if (entry === undefined) return undefined
    this.history[layer] = this.history[layer].slice(1)
    try {
      for (const day of entry.dates) {
        const result = await this.remote.replaceDay({
          layer,
          date: day.date,
          timeZone: this.timeZone,
          intervals: day.records.map(record => ({
            start: record.start,
            end: record.end,
            timeTagId: record.timeTagId,
            note: record.note,
          })),
        })
        if (!result.ok) throw result.error
      }
    } catch (error) {
      this.history[layer] = [entry, ...this.history[layer]]
      throw error
    }
    return this.reload()
  }

  async paintDeep(command: PaintDeepCommand): Promise<TimeView> {
    const result = await this.remote.paintDeep({
      weekStart: command.weekStart,
      level: command.level,
      rects: command.rects,
    })
    if (!result.ok) throw result.error
    const query = this.requireQuery()
    this.query = { ...query, weekStart: command.weekStart }
    return this.reload()
  }

  async updateBlock(command: UpdateBlockCommand): Promise<TimeView> {
    const result = await this.remote.updateBlock({
      layer: command.layer,
      id: numericId(command.id, '记录'),
      timeTagId: numericId(command.tagId, '标签'),
      note: command.note ?? null,
      startAt: atMinute(command.date, command.start),
      endAt: atMinute(command.date, command.end),
    })
    if (!result.ok) throw result.error
    return this.reload()
  }

  async deleteBlock(command: DeleteBlockCommand): Promise<TimeView> {
    const result = await this.remote.deleteBlock({
      layer: command.layer,
      id: numericId(command.id, '记录'),
    })
    if (!result.ok) throw result.error
    return this.reload()
  }

  private async reload(): Promise<TimeView> {
    return this.load(this.requireQuery())
  }

  private requireQuery(): TimeQuery {
    if (this.query === undefined) throw new Error('Time UI 必须先载入窗口才能写入')
    return this.query
  }

  private requireProjection(): TimeWindowProjection {
    if (this.projection === undefined) throw new Error('Time UI 必须先载入窗口才能写入')
    return this.projection
  }

  private viewOf(projection: TimeWindowProjection): TimeView {
    const tags: TimeTagView[] = projection.tags
      .filter(tag => tag.kind === 'time')
      .map(tag => ({
        id: String(tag.id),
        name: tag.name,
        parentId: tag.parentId === undefined ? undefined : String(tag.parentId),
        color: tag.color,
      }))
    const levels: DeepCellLevel[] = Array.from({ length: DEEP_CELLS }, () => 'unset')
    for (const cell of projection.deep.cells) {
      const index = (cell.weekday - 1) * 24 + cell.hour
      if (index >= 0 && index < levels.length) levels[index] = cell.level
    }
    return {
      today: projection.today,
      nowMinute: minuteOf(projection.nowMs, this.timeZone),
      from: projection.from,
      to: projection.to,
      days: projection.days,
      weekStart: projection.weekStart,
      tags,
      blocks: {
        actual: this.blockViews(projection, 'actual'),
        plan: this.blockViews(projection, 'plan'),
      },
      deep: { source: projection.deep.source, levels },
      canUndo: { actual: this.history.actual.length > 0, plan: this.history.plan.length > 0 },
    }
  }

  /** Slice the layer's blocks onto each projected local day; ids stay strings. */
  private blockViews(projection: TimeWindowProjection, layer: TimeLayer): TimeBlockView[] {
    const blocks = layerBlocks(projection, layer)
    const views: TimeBlockView[] = []
    for (const date of projection.days) {
      for (const record of recordsOfDay(blocks, date, this.timeZone, projection.nowMs)) {
        views.push({
          id: String(record.id),
          date,
          start: record.start,
          end: record.end,
          tagId: String(record.timeTagId),
          note: record.note,
        })
      }
    }
    return views
  }
}

function layerBlocks(projection: TimeWindowProjection, layer: TimeLayer): readonly BlockLike[] {
  return layer === 'actual' ? projection.actual : projection.plan
}
