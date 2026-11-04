import type { Context } from '@deepseek-ai/cordis'
import type { TagService } from 'dsh-secretary-tag/contract'
import type { GtdService } from 'dsh-secretary-gtd/contract'
import type {
  ActualBlock, ActualSource, DeepLevel, DeepWeek, FocusLevel, PlanBlock, TimeService,
} from 'dsh-secretary-time-block/contract'

export const STATE_PATH = '/api/secretary.state'
export const COMMAND_PATH = '/api/secretary.command'

/** Days the 时间块 canvas draws before and after its anchor day. */
const WINDOW_BEFORE = 2
const WINDOW_AFTER = 4
const MINUTE_MS = 60_000
const DAY_MS = 24 * 60 * MINUTE_MS

interface Route {
  path: string
  methods: string[]
  requestBody: 'buffered'
  fetch(request: Request): Promise<Response>
}

interface PanelContext extends Context {
  connection: { fetch: { register(route: Route): () => void } }
  tags: TagService
  gtd: GtdService
  time: TimeService
}

type Layer = 'actual' | 'plan'

/** One block of either layer, normalised for range math. */
interface BlockLike {
  readonly id: number
  readonly startAt: string
  readonly endAt?: string
  readonly timeTagId: number
  readonly note?: string
  readonly actualSource?: ActualSource
  readonly focus?: FocusLevel
}

/** A half-open interval of one local day, in minutes from that day's midnight. */
interface Run {
  readonly date: string
  readonly start: number
  readonly end: number
}

/** One rectangle on the 深度时间 week grid: weekday 1..7 and hour 0..23, both inclusive. */
interface DeepRect {
  readonly startWeekday: number
  readonly startHour: number
  readonly endWeekday: number
  readonly endHour: number
}

/** A block to write, in absolute time. */
interface Interval {
  readonly startMs: number
  readonly endMs: number
  readonly timeTagId: number
  readonly note?: string
  readonly actualSource?: ActualSource
  readonly focus?: FocusLevel
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

interface Warning { domain: 'gtd'; message: string }

/**
 * Read one domain without letting its failure take down the whole panel state.
 * Time and Tag are the panel's own facts and stay strict; GTD is optional context.
 */
async function settle<T>(read: () => Promise<T>, fallback: T): Promise<{ value: T; warning?: string }> {
  try {
    return { value: await read() }
  } catch (error) {
    return { value: fallback, warning: errorMessage(error) }
  }
}

const DATE = /^\d{4}-\d{2}-\d{2}$/

function validDate(value: unknown, field: string): string {
  if (typeof value !== 'string' || !DATE.test(value)) throw new Error(`secretary: ${field} must be YYYY-MM-DD`)
  return value
}

function parseDate(date: string): [number, number, number] {
  const [year, month, day] = date.split('-').map(Number)
  return [year, month, day]
}

/** Milliseconds the zone is ahead of UTC at one instant. */
function zoneOffset(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs))
  const field = (type: string) => Number(parts.find(part => part.type === type)?.value ?? 0)
  const asUtc = Date.UTC(field('year'), field('month') - 1, field('day'), field('hour'), field('minute'), field('second'))
  return asUtc - utcMs
}

/** The instant of one local day's midnight in `timeZone`. */
function zonedStart(date: string, timeZone: string): number {
  const [year, month, day] = parseDate(date)
  const guess = Date.UTC(year, month - 1, day)
  return guess - zoneOffset(guess, timeZone)
}

/** The local date an instant falls on in `timeZone`. */
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

/** Monday of the week containing `date`. */
function weekStartOf(date: string): string {
  const [year, month, day] = parseDate(date)
  const weekday = (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7
  return addDays(date, -weekday)
}

function windowDays(anchor: string): string[] {
  return Array.from({ length: WINDOW_BEFORE + WINDOW_AFTER + 1 }, (_, index) => addDays(anchor, index - WINDOW_BEFORE))
}

function endOf(block: BlockLike, nowMs: number): number {
  return block.endAt === undefined ? Math.max(Date.parse(block.startAt), nowMs) : Date.parse(block.endAt)
}

async function blocksOfLayer(
  ctx: PanelContext, layer: Layer, fromMs: number, toMs: number, timeZone: string,
): Promise<BlockLike[]> {
  if (layer === 'actual') {
    const blocks = await ctx.time.listActual({ from: new Date(fromMs).toISOString(), to: new Date(toMs).toISOString() })
    return blocks as readonly BlockLike[]
  }
  const days: string[] = []
  for (let cursor = localDateOf(fromMs, timeZone); zonedStart(cursor, timeZone) < toMs; cursor = addDays(cursor, 1)) days.push(cursor)
  const lists = await Promise.all(days.map(date => ctx.time.listPlan({ date, timeZone })))
  return lists.flat() as readonly BlockLike[]
}

async function deleteBlock(ctx: PanelContext, layer: Layer, id: number): Promise<void> {
  if (layer === 'actual') await ctx.time.deleteActual(id)
  else await ctx.time.deletePlan(id)
}

async function writeBlock(ctx: PanelContext, layer: Layer, interval: Interval, timeZone: string): Promise<void> {
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

/** Join neighbouring blocks that already look like a single block. */
async function mergeLayer(
  ctx: PanelContext, layer: Layer, fromMs: number, toMs: number, timeZone: string, nowMs: number,
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
    const right = sorted[index + 1]
    await deleteBlock(ctx, layer, pair.id)
    await deleteBlock(ctx, layer, right.id)
    await writeBlock(ctx, layer, {
      startMs: Date.parse(pair.startAt), endMs: endOf(right, nowMs), timeTagId: pair.timeTagId,
      note: pair.note, actualSource: pair.actualSource, focus: pair.focus,
    }, timeZone)
  }
}

/**
 * Paint one layer: cut the runs out of every block they overlap, place the new
 * blocks, then join the pieces that now look alike. Minutes outside the runs are
 * never rewritten, so painting one day cannot disturb another.
 */
async function paint(
  ctx: PanelContext, layer: Layer, tagId: number | null, runs: readonly Run[], timeZone: string,
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
    if (endMs <= startMs) continue
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

/** Replace one day's blocks with an explicit list: the shape Undo restores. */
async function replaceDay(
  ctx: PanelContext, layer: Layer, date: string,
  intervals: readonly { start: number; end: number; timeTagId: number; note?: string }[], timeZone: string,
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

async function readState(ctx: PanelContext, anchor: string, timeZone: string, requestedWeek: string): Promise<Response> {
  const days = windowDays(anchor)
  const weekStart = weekStartOf(requestedWeek)
  const nowMs = Date.now()
  const fromMs = zonedStart(days[0], timeZone)
  const toMs = zonedStart(addDays(days[days.length - 1], 1), timeZone)
  const [tags, actual, plan, deep] = await Promise.all([
    ctx.tags.listTags(),
    ctx.time.listActual({ from: new Date(fromMs).toISOString(), to: new Date(toMs).toISOString() }),
    Promise.all(days.map(date => ctx.time.listPlan({ date, timeZone }))).then(lists => lists.flat()),
    ctx.time.getDeepWeek({ weekStart }),
  ])
  const [inbox, projects, actions, nextActions, forecast] = await Promise.all([
    settle(() => ctx.gtd.listInbox(), []),
    settle(() => ctx.gtd.listProjects(), []),
    settle(() => ctx.gtd.listActions(), []),
    settle(() => ctx.gtd.listNextActions(), []),
    settle(() => ctx.gtd.listForecast({ date: anchor, timeZone }), []),
  ])
  const gtd = [inbox, projects, actions, nextActions, forecast]
  const warnings: Warning[] = []
  const message = gtd.map(result => result.warning).find((value): value is string => value !== undefined)
  if (message !== undefined) warnings.push({ domain: 'gtd', message })
  return json({
    anchor, timeZone, today: localDateOf(nowMs, timeZone), nowMs, days, weekStart, tags, actual, plan, deep,
    inbox: inbox.value, projects: projects.value, actions: actions.value,
    nextActions: nextActions.value, forecast: forecast.value, warnings,
  })
}

async function command(ctx: PanelContext, raw: unknown): Promise<unknown> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('secretary: panel command must be an object')
  const input = raw as Record<string, any>
  const timeZone = typeof input.timeZone === 'string' ? input.timeZone : 'Asia/Shanghai'
  if (input.domain === 'tag') {
    switch (input.op) {
      case 'create': return { tag: await ctx.tags.createTag(input) }
      case 'update': return { tag: await ctx.tags.updateTag(input.id, input) }
      case 'move': return { tag: await ctx.tags.moveTag(input.id, input.parentId) }
      case 'delete': return { tag: await ctx.tags.deleteTag(input.id) }
      default: throw new Error(`secretary: unsupported panel tag operation ${JSON.stringify(input.op)}`)
    }
  }
  if (input.domain === 'gtd') {
    switch (input.op) {
      case 'inbox.capture': return { item: await ctx.gtd.captureInbox(input) }
      case 'inbox.clarify': return ctx.gtd.clarifyInbox(input)
      case 'inbox.delete': return { item: await ctx.gtd.deleteInbox(input.id) }
      case 'project.create': return { project: await ctx.gtd.createProject(input) }
      case 'project.update': return { project: await ctx.gtd.updateProject(input.id, input) }
      case 'project.delete': return { project: await ctx.gtd.deleteProject(input.id) }
      case 'action.create': return { action: await ctx.gtd.createAction(input) }
      case 'action.update': return { action: await ctx.gtd.updateAction(input.id, input) }
      case 'action.delete': return { action: await ctx.gtd.deleteAction(input.id) }
      case 'action.complete': return { action: await ctx.gtd.completeAction(input.id, input.completedAt) }
      case 'action.drop': return { action: await ctx.gtd.dropAction(input.id, input.droppedAt) }
      default: throw new Error(`secretary: unsupported panel gtd operation ${JSON.stringify(input.op)}`)
    }
  }
  if (input.domain === 'time') {
    const layer: Layer = input.layer === 'plan' ? 'plan' : 'actual'
    switch (input.op) {
      case 'paint': {
        const runs = (input.runs as Run[] | undefined) ?? []
        for (const run of runs) {
          validDate(run.date, 'runs[].date')
          if (!Number.isSafeInteger(run.start) || !Number.isSafeInteger(run.end)
            || run.start < 0 || run.end > 1440 || run.end <= run.start) {
            throw new Error('secretary: paint runs require 0 <= start < end <= 1440')
          }
        }
        const tagId = input.tagId === null || input.tagId === undefined ? null : Number(input.tagId)
        if (tagId !== null && (!Number.isSafeInteger(tagId) || tagId <= 0)) {
          throw new Error('secretary: paint tagId must be a positive integer or null')
        }
        if (runs.length > 0) await paint(ctx, layer, tagId, runs, timeZone)
        return { ok: true }
      }
      case 'replace': {
        const date = validDate(input.date, 'date')
        const intervals = (input.intervals as { start: number; end: number; timeTagId: number; note?: string }[] | undefined) ?? []
        await replaceDay(ctx, layer, date, intervals, timeZone)
        return { ok: true }
      }
      case 'update': {
        const patch = { timeTagId: input.timeTagId, note: input.note, startAt: input.startAt, endAt: input.endAt }
        return layer === 'actual'
          ? { block: await ctx.time.updateActual(input.id, patch) }
          : { block: await ctx.time.updatePlan(input.id, patch) }
      }
      case 'delete': {
        const block = layer === 'actual' ? await ctx.time.deleteActual(input.id) : await ctx.time.deletePlan(input.id)
        return { ok: true, block }
      }
      default: throw new Error(`secretary: unsupported panel time operation ${JSON.stringify(input.op)}`)
    }
  }
  if (input.domain === 'deep') {
    const weekStart = weekStartOf(validDate(input.weekStart, 'weekStart'))
    const rects = (input.rects as DeepRect[] | undefined) ?? []
    const level = input.level === null || input.level === undefined ? null : input.level as DeepLevel
    if (level !== null && level !== 'high' && level !== 'medium' && level !== 'low') {
      throw new Error('secretary: deep level must be high, medium, low, or null')
    }
    let week: DeepWeek
    if (rects.length === 0) {
      week = await ctx.time.getDeepWeek({ weekStart })
    } else {
      week = await ctx.time.getDeepWeek({ weekStart })
      for (const rect of rects) {
        const input = {
          weekStart, startWeekday: rect.startWeekday, startHour: rect.startHour,
          endWeekday: rect.endWeekday, endHour: rect.endHour,
        }
        week = level === null
          ? await ctx.time.clearDeepRange(input)
          : await ctx.time.setDeepRange({ ...input, level })
      }
    }
    return { week }
  }
  throw new Error('secretary: panel command domain must be gtd, tag, time, or deep')
}

export const name = 'dsh-secretary-panel'
export const inject = ['connection', 'tags', 'gtd', 'time']

export function apply(context: Context): void {
  const ctx = context as PanelContext
  ctx.effect(() => ctx.connection.fetch.register({
    path: STATE_PATH,
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: async request => {
      try {
        const url = new URL(request.url)
        const anchor = url.searchParams.get('anchor') ?? undefined
        const timeZone = url.searchParams.get('timeZone') ?? undefined
        if (anchor === undefined || timeZone === undefined) throw new Error('secretary: panel state requires anchor and timeZone')
        validDate(anchor, 'anchor')
        return await readState(ctx, anchor, timeZone, url.searchParams.get('weekStart') ?? anchor)
      } catch (error) {
        return json({ error: errorMessage(error) }, 400)
      }
    },
  }), 'secretary: panel state route')

  ctx.effect(() => ctx.connection.fetch.register({
    path: COMMAND_PATH,
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: async request => {
      try {
        return json(await command(ctx, await request.json()))
      } catch (error) {
        return json({ error: errorMessage(error) }, 400)
      }
    },
  }), 'secretary: panel command route')
}
