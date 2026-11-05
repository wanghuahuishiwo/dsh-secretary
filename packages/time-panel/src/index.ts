import type { Context } from '@deepseek-ai/cordis'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { TagService } from 'dsh-secretary-tag/contract'
import type { ActualSource, FocusLevel, TimeService } from 'dsh-secretary-time-block/contract'
import type {
  DeleteTimeBlockRequest, DeleteTimeBlockResult, PaintDeepRequest, PaintDeepResult,
  PaintTimeBlocksRequest, PaintResult, PaintRun, ReplaceTimeDayRequest, TimeLayer,
  TimeWindowProjection, TimeWindowRequest, UpdateTimeBlockRequest, UpdateTimeBlockResult,
} from './types.ts'

export type {
  DeleteTimeBlockRequest, DeleteTimeBlockResult, PaintDeepRequest, PaintDeepResult,
  PaintTimeBlocksRequest, PaintResult, PaintRun, ReplaceTimeDayRequest, TimeLayer,
  TimeWindowProjection, TimeWindowRequest, UpdateTimeBlockRequest, UpdateTimeBlockResult,
} from './types.ts'

const WINDOW_BEFORE = 3
const WINDOW_AFTER = 10
const WINDOW_MAX = 120
const MINUTE_MS = 60_000
const DAY_MS = 24 * 60 * MINUTE_MS
const DATE = /^\d{4}-\d{2}-\d{2}$/

interface TimeProductContext extends Context {
  readonly time: TimeService
  readonly tags: TagService
}

interface BlockLike {
  readonly id: number
  readonly startAt: string
  readonly endAt?: string
  readonly timeTagId: number
  readonly note?: string
  readonly actualSource?: ActualSource
  readonly focus?: FocusLevel
}

interface Interval {
  readonly startMs: number
  readonly endMs: number
  readonly timeTagId: number
  readonly note?: string
  readonly actualSource?: ActualSource
  readonly focus?: FocusLevel
}

function parseDate(date: string): [number, number, number] {
  return date.split('-').map(Number) as [number, number, number]
}

function validDate(value: string, field: string): string {
  if (!DATE.test(value)) throw new Error(`secretary: ${field} must be YYYY-MM-DD`)
  const [year, month, day] = parseDate(value)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    throw new Error(`secretary: ${field} must be a real date`)
  }
  return value
}

function validTimeZone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format()
  } catch {
    throw new Error('secretary: invalid timeZone')
  }
  return timeZone
}

function zoneOffset(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs))
  const field = (type: string) => Number(parts.find(part => part.type === type)?.value ?? 0)
  return Date.UTC(field('year'), field('month') - 1, field('day'), field('hour'), field('minute'), field('second')) - utcMs
}

function zonedStart(date: string, timeZone: string): number {
  const [year, month, day] = parseDate(date)
  const guess = Date.UTC(year, month - 1, day)
  return guess - zoneOffset(guess, timeZone)
}

function localDateOf(instant: string | number, timeZone: string): string {
  const ms = typeof instant === 'number' ? instant : Date.parse(instant)
  const shifted = new Date(ms + zoneOffset(ms, timeZone))
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`
}

function addDays(date: string, amount: number): string {
  const [year, month, day] = parseDate(date)
  const value = new Date(Date.UTC(year, month - 1, day + amount))
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`
}

function weekStartOf(date: string): string {
  const [year, month, day] = parseDate(date)
  const weekday = (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7
  return addDays(date, -weekday)
}

function rangeDays(from: string, to: string): string[] {
  const days: string[] = []
  for (let cursor = from; cursor <= to; cursor = addDays(cursor, 1)) days.push(cursor)
  return days
}

function endOf(block: BlockLike, nowMs: number): number {
  return block.endAt === undefined ? Math.max(Date.parse(block.startAt), nowMs) : Date.parse(block.endAt)
}

async function blocksOfLayer(
  ctx: TimeProductContext, layer: TimeLayer, fromMs: number, toMs: number, timeZone: string,
): Promise<BlockLike[]> {
  if (layer === 'actual') {
    return await ctx.time.listActual({ from: new Date(fromMs).toISOString(), to: new Date(toMs).toISOString() })
  }
  const days: string[] = []
  for (let cursor = localDateOf(fromMs, timeZone); zonedStart(cursor, timeZone) < toMs; cursor = addDays(cursor, 1)) days.push(cursor)
  const lists = await Promise.all(days.map(date => ctx.time.listPlan({ date, timeZone })))
  return lists.flat()
}

async function deleteBlock(ctx: TimeProductContext, layer: TimeLayer, id: number): Promise<void> {
  if (layer === 'actual') await ctx.time.deleteActual(id)
  else await ctx.time.deletePlan(id)
}

async function writeBlock(ctx: TimeProductContext, layer: TimeLayer, interval: Interval, timeZone: string): Promise<void> {
  const startAt = new Date(interval.startMs).toISOString()
  const endAt = new Date(interval.endMs).toISOString()
  if (layer === 'actual') {
    await ctx.time.createActual({
      startAt, endAt, timeTagId: interval.timeTagId, note: interval.note,
      actualSource: interval.actualSource ?? 'user_reported', focus: interval.focus,
    })
    return
  }
  await ctx.time.createPlan({
    date: localDateOf(interval.startMs, timeZone), timeZone, startAt, endAt,
    timeTagId: interval.timeTagId, note: interval.note,
  })
}

function sameBlockShape(left: BlockLike, right: BlockLike): boolean {
  return left.timeTagId === right.timeTagId
    && (left.note ?? '') === (right.note ?? '')
    && (left.actualSource ?? '') === (right.actualSource ?? '')
    && (left.focus ?? '') === (right.focus ?? '')
}

async function mergeLayer(
  ctx: TimeProductContext, layer: TimeLayer, fromMs: number, toMs: number, timeZone: string, nowMs: number,
): Promise<void> {
  for (let guard = 0; guard < 64; guard += 1) {
    const blocks = await blocksOfLayer(ctx, layer, fromMs, toMs, timeZone)
    const sorted = blocks.slice().sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt) || a.id - b.id)
    const pair = sorted.find((left, index) => {
      const right = sorted[index + 1]
      return right !== undefined && endOf(left, nowMs) === Date.parse(right.startAt) && sameBlockShape(left, right)
    })
    if (pair === undefined) return
    const index = sorted.indexOf(pair)
    const right = sorted[index + 1]!
    await deleteBlock(ctx, layer, pair.id)
    await deleteBlock(ctx, layer, right.id)
    await writeBlock(ctx, layer, {
      startMs: Date.parse(pair.startAt), endMs: endOf(right, nowMs), timeTagId: pair.timeTagId,
      note: pair.note, actualSource: pair.actualSource, focus: pair.focus,
    }, timeZone)
  }
}

/** Preserve the legacy panel's cut, overwrite, parallel-shape and merge semantics. */
async function paintRuns(
  ctx: TimeProductContext, layer: TimeLayer, tagId: number | null, runs: readonly PaintRun[], timeZone: string,
): Promise<void> {
  const nowMs = Date.now()
  const fromMs = Math.min(...runs.map(run => zonedStart(run.date, timeZone)))
  const toMs = Math.max(...runs.map(run => zonedStart(run.date, timeZone) + DAY_MS))
  const blocks = await blocksOfLayer(ctx, layer, fromMs, toMs, timeZone)
  const removed = new Set<number>()
  const pieces: Interval[] = []
  const created: Interval[] = []
  for (const run of runs) {
    const dayStart = zonedStart(run.date, timeZone)
    const startMs = dayStart + run.start * MINUTE_MS
    const endMs = dayStart + run.end * MINUTE_MS
    for (const block of blocks) {
      if (removed.has(block.id)) continue
      const blockStart = Date.parse(block.startAt)
      const blockEnd = endOf(block, nowMs)
      if (blockStart >= endMs || blockEnd <= startMs) continue
      removed.add(block.id)
      if (blockStart < startMs) {
        pieces.push({ startMs: blockStart, endMs: startMs, timeTagId: block.timeTagId, note: block.note, actualSource: block.actualSource, focus: block.focus })
      }
      if (blockEnd > endMs) {
        pieces.push({ startMs: endMs, endMs: blockEnd, timeTagId: block.timeTagId, note: block.note, actualSource: block.actualSource, focus: block.focus })
      }
    }
    if (tagId !== null) created.push({ startMs, endMs, timeTagId: tagId, actualSource: 'user_reported' })
  }
  for (const id of removed) await deleteBlock(ctx, layer, id)
  for (const piece of [...pieces, ...created]) await writeBlock(ctx, layer, piece, timeZone)
  await mergeLayer(ctx, layer, fromMs, toMs, timeZone, nowMs)
}

/** Replace one local day's blocks with the snapshot held by a canvas Undo entry. */
async function replaceDaySnapshot(
  ctx: TimeProductContext, layer: TimeLayer, date: string,
  intervals: ReplaceTimeDayRequest['intervals'], timeZone: string,
): Promise<void> {
  const dayStart = zonedStart(date, timeZone)
  const blocks = await blocksOfLayer(ctx, layer, dayStart, zonedStart(addDays(date, 1), timeZone), timeZone)
  for (const block of blocks) await deleteBlock(ctx, layer, block.id)
  for (const interval of intervals) {
    await writeBlock(ctx, layer, {
      startMs: dayStart + interval.start * MINUTE_MS,
      endMs: dayStart + interval.end * MINUTE_MS,
      timeTagId: interval.timeTagId,
      note: interval.note,
      actualSource: 'user_reported',
    }, timeZone)
  }
}

type TimeOperation = 'readWindow' | 'paint' | 'replaceDay' | 'updateBlock' | 'deleteBlock' | 'paintDeep'
type TimeWriteOperation = Exclude<TimeOperation, 'readWindow'>
function invalidInput(error: unknown, operation: TimeOperation = 'readWindow'): never {
  if (error instanceof RemoteError) throw error
  if (error instanceof Error && error.message.startsWith('secretary:')) {
    throw new RemoteError('secretaryTime/invalid-input', error.message, { operation }, { cause: error })
  }
  throw error
}

function productFailure(ctx: TimeProductContext, error: unknown, operation: TimeWriteOperation): never {
  if (error instanceof RemoteError) throw error
  const message = error instanceof Error ? error.message : String(error)
  const missing = /^secretary: no (?:actual|plan) block "(\d+)"$/.exec(message)
  if (missing !== null) {
    throw new RemoteError('secretaryTime/not-found', message, { blockId: Number(missing[1]) }, { cause: error })
  }
  if (message.startsWith('secretary:') && !/invalid stored|write failed|rollback failed/.test(message)) invalidInput(error, operation)
  ctx.logger.error(`secretaryTime ${operation} failed`, error)
  throw new RemoteError('secretaryTime/write-failed', `Time ${operation} could not be persisted`, { operation }, { cause: error })
}

/** Host application Service owned by the independent Time product. */
export class TimeProductService extends TypertRemoteService {
  private readonly productCtx: TimeProductContext

  constructor(ctx: Context) {
    super(ctx, 'timeProduct', { namespace: 'secretaryTime' })
    this.productCtx = ctx as TimeProductContext
  }

  /** Read the current Actual, Plan, DeepTime and Tag projection without GTD data. */
  @Remote('readWindow')
  async readWindow(input: TimeWindowRequest): Promise<TimeWindowProjection> {
    try {
      const anchor = validDate(input.anchor, 'anchor')
      const timeZone = validTimeZone(input.timeZone)
      const from = input.from === undefined ? addDays(anchor, -WINDOW_BEFORE) : validDate(input.from, 'from')
      const to = input.to === undefined ? addDays(anchor, WINDOW_AFTER) : validDate(input.to, 'to')
      if (from > to) throw new Error('secretary: Time window requires from <= to')
      const days = rangeDays(from, to)
      if (days.length > WINDOW_MAX) throw new Error(`secretary: Time window is limited to ${WINDOW_MAX} days`)
      const weekStart = weekStartOf(validDate(input.weekStart ?? anchor, 'weekStart'))
      const nowMs = Date.now()
      const fromMs = zonedStart(days[0]!, timeZone)
      const toMs = zonedStart(addDays(days[days.length - 1]!, 1), timeZone)
      const [tags, actual, plan, deep] = await Promise.all([
        this.productCtx.tags.listTags(),
        this.productCtx.time.listActual({ from: new Date(fromMs).toISOString(), to: new Date(toMs).toISOString() }),
        Promise.all(days.map(date => this.productCtx.time.listPlan({ date, timeZone }))).then(lists => lists.flat()),
        this.productCtx.time.getDeepWeek({ weekStart }),
      ])
      return { anchor, timeZone, today: localDateOf(nowMs, timeZone), nowMs, from, to, days, weekStart, tags, actual, plan, deep }
    } catch (error) {
      invalidInput(error)
    }
  }

  /** Paint one independent Time layer with the existing canvas semantics. */
  @Remote('paint')
  async paint(input: PaintTimeBlocksRequest): Promise<PaintResult> {
    try {
      if (input.layer !== 'actual' && input.layer !== 'plan') throw new Error('secretary: paint layer must be actual or plan')
      validTimeZone(input.timeZone)
      if (input.tagId !== null && (!Number.isSafeInteger(input.tagId) || input.tagId <= 0)) {
        throw new Error('secretary: paint tagId must be a positive integer or null')
      }
      for (const run of input.runs) {
        validDate(run.date, 'runs[].date')
        if (!Number.isSafeInteger(run.start) || !Number.isSafeInteger(run.end)
          || run.start < 0 || run.end > 1440 || run.end <= run.start) {
          throw new Error('secretary: paint runs require 0 <= start < end <= 1440')
        }
      }
      if (input.runs.length > 0) await paintRuns(this.productCtx, input.layer, input.tagId, input.runs, input.timeZone)
      return { ok: true }
    } catch (error) {
      productFailure(this.productCtx, error, 'paint')
    }
  }

  /** Paint or clear inclusive weekday-by-hour rectangles in one DeepTime week. */
  @Remote('paintDeep')
  async paintDeep(input: PaintDeepRequest): Promise<PaintDeepResult> {
    try {
      const weekStart = weekStartOf(validDate(input.weekStart, 'weekStart'))
      if (input.level !== null && input.level !== 'high' && input.level !== 'medium' && input.level !== 'low') {
        throw new Error('secretary: deep level must be high, medium, low, or null')
      }
      for (const rect of input.rects) {
        if (![rect.startWeekday, rect.startHour, rect.endWeekday, rect.endHour].every(Number.isSafeInteger)
          || rect.startWeekday < 1 || rect.endWeekday > 7 || rect.startHour < 0 || rect.endHour > 23
          || rect.startWeekday > rect.endWeekday || rect.startHour > rect.endHour) {
          throw new Error('secretary: deep rectangles require inclusive weekday 1..7 and hour 0..23 bounds in order')
        }
      }
      let week = await this.productCtx.time.getDeepWeek({ weekStart })
      for (const rect of input.rects) {
        const range = { weekStart, ...rect }
        week = input.level === null
          ? await this.productCtx.time.clearDeepRange(range)
          : await this.productCtx.time.setDeepRange({ ...range, level: input.level })
      }
      return { week }
    } catch (error) {
      productFailure(this.productCtx, error, 'paintDeep')
    }
  }

  /** Edit one selected Actual or Plan block using the domain Service's patch rules. */
  @Remote('updateBlock')
  async updateBlock(input: UpdateTimeBlockRequest): Promise<UpdateTimeBlockResult> {
    try {
      if (input.layer !== 'actual' && input.layer !== 'plan') throw new Error('secretary: updateBlock layer must be actual or plan')
      if (!Number.isSafeInteger(input.id) || input.id <= 0) throw new Error('secretary: updateBlock id must be a positive integer')
      const patch = { timeTagId: input.timeTagId, note: input.note, startAt: input.startAt, endAt: input.endAt }
      const block = input.layer === 'actual'
        ? await this.productCtx.time.updateActual(input.id, patch)
        : await this.productCtx.time.updatePlan(input.id, patch)
      return { block }
    } catch (error) {
      productFailure(this.productCtx, error, 'updateBlock')
    }
  }

  /** Delete one Actual or Plan block and return the removed domain fact. */
  @Remote('deleteBlock')
  async deleteBlock(input: DeleteTimeBlockRequest): Promise<DeleteTimeBlockResult> {
    try {
      if (input.layer !== 'actual' && input.layer !== 'plan') throw new Error('secretary: deleteBlock layer must be actual or plan')
      if (!Number.isSafeInteger(input.id) || input.id <= 0) throw new Error('secretary: deleteBlock id must be a positive integer')
      const block = input.layer === 'actual'
        ? await this.productCtx.time.deleteActual(input.id)
        : await this.productCtx.time.deletePlan(input.id)
      return { ok: true, block }
    } catch (error) {
      productFailure(this.productCtx, error, 'deleteBlock')
    }
  }

  /** Restore one complete local-day snapshot for the existing canvas Undo stack. */
  @Remote('replaceDay')
  async replaceDay(input: ReplaceTimeDayRequest): Promise<PaintResult> {
    try {
      if (input.layer !== 'actual' && input.layer !== 'plan') throw new Error('secretary: replaceDay layer must be actual or plan')
      const date = validDate(input.date, 'date')
      validTimeZone(input.timeZone)
      for (const interval of input.intervals) {
        if (!Number.isSafeInteger(interval.start) || !Number.isSafeInteger(interval.end)
          || interval.start < 0 || interval.end > 1440 || interval.end <= interval.start
          || !Number.isSafeInteger(interval.timeTagId) || interval.timeTagId <= 0) {
          throw new Error('secretary: replaceDay intervals require 0 <= start < end <= 1440 and a positive timeTagId')
        }
      }
      await replaceDaySnapshot(this.productCtx, input.layer, date, input.intervals, input.timeZone)
      return { ok: true }
    } catch (error) {
      productFailure(this.productCtx, error, 'replaceDay')
    }
  }
}

export const name = 'dsh-secretary-time-panel'
export const inject = ['time', 'tags']

export function apply(ctx: Context): void {
  new TimeProductService(ctx)
}
