import type { Context } from '@deepseek-ai/cordis'
import { objectOf, optionalString, parseInstant, withoutUndefined } from 'dsh-secretary-core/validation'
import type { TagReferenceRegistry, TagService } from 'dsh-secretary-tag/contract'
import {
  TimeService,
  isFocusLevel,
  type ActualBlock,
  type ActualSource,
  type CreateActualInput,
  type FocusLevel,
  type ListActualQuery,
  type StartActualInput,
  type UpdateActualInput,
} from 'dsh-secretary-time-block/contract'

interface Table<Record> {
  get(key: string): Record | undefined
  entries(): IterableIterator<[string, Record]>
  put(key: string, value: Record): Promise<void>
  delete(key: string): Promise<boolean>
}

interface StorageDomain {
  readonly global: { get(): number; set(value: number): Promise<void> }
  table(name: 'actual_blocks'): Table<ActualBlock>
  close(): Promise<void>
}

export interface Config { domain?: string }
export const Config = {
  '~standard': {
    version: 1,
    vendor: 'dsh-secretary-time-block',
    validate(raw: unknown) {
      const value = raw === undefined ? {} : objectOf(raw, 'time config')
      const domain = value.domain ?? 'secretary_time'
      if (typeof domain !== 'string' || !/^[a-z][a-z0-9_]*$/.test(domain)) {
        return { issues: [{ message: 'secretary: time domain must be a lowercase identifier' }] }
      }
      for (const key of Object.keys(value)) {
        if (key !== 'domain') return { issues: [{ message: `secretary: unknown time config field ${key}` }] }
      }
      return { value: { domain } }
    },
  },
}

const ACTUAL_SOURCES: readonly ActualSource[] = ['user_reported', 'agent_observed', 'imported']

function parseActualSource(raw: unknown): ActualSource {
  if (typeof raw !== 'string' || !ACTUAL_SOURCES.includes(raw as ActualSource)) {
    throw new Error('secretary: invalid actualSource')
  }
  return raw as ActualSource
}

function parseFocus(raw: unknown): FocusLevel | undefined {
  if (raw === undefined) return undefined
  if (!isFocusLevel(raw)) throw new Error('secretary: invalid focus level')
  return raw
}

function parseActual(raw: unknown): ActualBlock {
  const block = objectOf(raw, 'actual block') as unknown as ActualBlock
  if (!Number.isSafeInteger(block.id) || block.id <= 0 || !Number.isSafeInteger(block.timeTagId) || block.timeTagId <= 0) {
    throw new Error('secretary: invalid stored actual block identity')
  }
  parseInstant(block.startAt, 'startAt')
  if (block.endAt !== undefined) validateInterval(block.startAt, block.endAt)
  parseActualSource(block.actualSource)
  parseFocus(block.focus)
  optionalString(block.note, 'note')
  return block
}

function validateInterval(startAt: string, endAt: string): void {
  parseInstant(startAt, 'startAt')
  parseInstant(endAt, 'endAt')
  if (Date.parse(endAt) <= Date.parse(startAt)) throw new Error('secretary: endAt must be after startAt')
}

function validateTimeZone(raw: unknown): string {
  if (typeof raw !== 'string') throw new Error('secretary: timeZone must be a string')
  try { new Intl.DateTimeFormat('en-US', { timeZone: raw }).format() } catch { throw new Error('secretary: invalid timeZone') }
  return raw
}

function zoneOffsetMs(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(instant))
  const field = (type: string) => Number(parts.find(part => part.type === type)?.value)
  return Date.UTC(field('year'), field('month') - 1, field('day'), field('hour'), field('minute'), field('second'))
    - Math.floor(instant / 1000) * 1000
}

function startOfZonedDate(date: string, timeZone: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('secretary: date must be YYYY-MM-DD')
  const calendar = new Date(`${date}T00:00:00Z`)
  if (!Number.isFinite(calendar.getTime()) || calendar.toISOString().slice(0, 10) !== date) {
    throw new Error('secretary: invalid date')
  }
  const local = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)))
  if (!Number.isFinite(local)) throw new Error('secretary: invalid date')
  let instant = local
  for (let iteration = 0; iteration < 2; iteration += 1) instant = local - zoneOffsetMs(instant, timeZone)
  return instant
}

function nextDate(date: string): string {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + 1)
  return value.toISOString().slice(0, 10)
}

export class SQLiteTimeService extends TimeService {
  static inject = ['secretaryStorageDomain', 'tags', 'tagReferences']
  private readonly ready: Promise<StorageDomain>
  private readonly context: Context
  private queue: Promise<unknown> = Promise.resolve()

  constructor(ctx: Context, config: Config = {}) {
    super(ctx)
    this.context = ctx
    this.ready = (ctx as Context & { secretaryStorageDomain: { open(spec: unknown): Promise<StorageDomain> } }).secretaryStorageDomain.open({
      name: config.domain ?? 'secretary_time',
      version: 1,
      tables: { actual_blocks: { valueSchema: { parse: parseActual } } },
      global: { initial: 1, schema: { parse(value: unknown) {
        if (!Number.isSafeInteger(value) || (value as number) <= 0) throw new Error('secretary: invalid stored actual sequence')
        return value
      } } },
    })
    ctx.effect(async () => {
      const domain = await this.ready
      return async () => { await this.queue; await domain.close() }
    })
    ctx.effect(() => (ctx as Context & { tagReferences: TagReferenceRegistry }).tagReferences.register({
      hasReferences: async tagId => (await this.listActual()).some(block => block.timeTagId === tagId),
    }), 'secretary: ActualBlock tag reference inspector')
  }

  private mutate<Outcome>(operation: () => Promise<Outcome>): Promise<Outcome> {
    const result = this.queue.then(operation)
    this.queue = result.then(() => undefined, () => undefined)
    return result
  }

  private async requireTimeTag(id: number): Promise<void> {
    const tag = await (this.context as Context & { tags: TagService }).tags.getTag(id)
    if (tag.kind !== 'time') throw new Error('secretary: ActualBlock requires a time tag')
  }

  async createActual(input: CreateActualInput): Promise<ActualBlock> {
    const tags = (this.context as Context & { tags: TagService }).tags
    return tags.withReferenceConsistency(() => this.mutate(async () => {
      await this.requireTimeTag(input.timeTagId)
      if (input.endAt !== undefined) validateInterval(input.startAt, input.endAt)
      else parseInstant(input.startAt, 'startAt')
      const domain = await this.ready
      const id = domain.global.get()
      const block: ActualBlock = withoutUndefined({
        id,
        timeTagId: input.timeTagId,
        note: optionalString(input.note, 'note'),
        startAt: input.startAt,
        endAt: input.endAt,
        actualSource: parseActualSource(input.actualSource),
        focus: parseFocus(input.focus),
      })
      await domain.global.set(id + 1)
      await domain.table('actual_blocks').put(String(id), block)
      return block
    }))
  }

  async getActual(id: number): Promise<ActualBlock> {
    const domain = await this.ready
    const block = domain.table('actual_blocks').get(String(id))
    if (block === undefined) throw new Error(`secretary: no actual block "${id}"`)
    return block
  }

  async listActual(query: ListActualQuery = {}): Promise<ActualBlock[]> {
    let from = query.from === undefined ? undefined : Date.parse(parseInstant(query.from, 'from'))
    let to = query.to === undefined ? undefined : Date.parse(parseInstant(query.to, 'to'))
    if ((from === undefined) !== (to === undefined) || (from !== undefined && to !== undefined && from >= to)) {
      throw new Error('secretary: actual list range requires from < to')
    }
    if (query.date !== undefined) {
      if (from !== undefined) throw new Error('secretary: actual list accepts date or range, not both')
      const timeZone = validateTimeZone(query.timeZone ?? 'Asia/Shanghai')
      from = startOfZonedDate(query.date, timeZone)
      to = startOfZonedDate(nextDate(query.date), timeZone)
    }
    const domain = await this.ready
    let tagIds: Set<number> | undefined
    if (query.timeTagId !== undefined) {
      const tags = (this.context as Context & { tags: TagService }).tags
      const root = await tags.getTag(query.timeTagId)
      if (root.kind !== 'time') throw new Error('secretary: ActualBlock query requires a time tag')
      const all = await tags.listTags('time')
      tagIds = new Set([root.id])
      let changed = true
      while (changed) {
        changed = false
        for (const tag of all) {
          if (tag.parentId !== undefined && tagIds.has(tag.parentId) && !tagIds.has(tag.id)) {
            tagIds.add(tag.id)
            changed = true
          }
        }
      }
    }
    return [...domain.table('actual_blocks').entries()].map(([, block]) => block)
      .filter(block => tagIds === undefined || tagIds.has(block.timeTagId))
      .filter(block => {
        if (from === undefined || to === undefined) return true
        const start = Date.parse(block.startAt)
        if (block.endAt === undefined) return start >= from && start < to
        return start < to && Date.parse(block.endAt) > from
      })
      .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt) || a.id - b.id)
  }

  async updateActual(id: number, input: UpdateActualInput): Promise<ActualBlock> {
    const tags = (this.context as Context & { tags: TagService }).tags
    return tags.withReferenceConsistency(() => this.mutate(async () => {
      const domain = await this.ready
      const current = domain.table('actual_blocks').get(String(id))
      if (current === undefined) throw new Error(`secretary: no actual block "${id}"`)
      if (input.timeTagId !== undefined) await this.requireTimeTag(input.timeTagId)
      const block: ActualBlock = withoutUndefined({
        ...current,
        timeTagId: input.timeTagId ?? current.timeTagId,
        note: input.note === null ? undefined : input.note === undefined ? current.note : optionalString(input.note, 'note'),
        startAt: input.startAt === undefined ? current.startAt : parseInstant(input.startAt, 'startAt'),
        endAt: input.endAt === null ? undefined : input.endAt === undefined ? current.endAt : parseInstant(input.endAt, 'endAt'),
        actualSource: input.actualSource === undefined ? current.actualSource : parseActualSource(input.actualSource),
        focus: input.focus === null ? undefined : input.focus === undefined ? current.focus : parseFocus(input.focus),
      })
      if (block.endAt !== undefined) validateInterval(block.startAt, block.endAt)
      await domain.table('actual_blocks').put(String(id), block)
      return block
    }))
  }

  async deleteActual(id: number): Promise<ActualBlock> {
    return this.mutate(async () => {
      const domain = await this.ready
      const block = domain.table('actual_blocks').get(String(id))
      if (block === undefined) throw new Error(`secretary: no actual block "${id}"`)
      await domain.table('actual_blocks').delete(String(id))
      return block
    })
  }

  async startActual(input: StartActualInput): Promise<ActualBlock> {
    return this.createActual({ ...input, startAt: input.startAt ?? new Date().toISOString() })
  }

  async stopActual(id: number, endAt = new Date().toISOString()): Promise<ActualBlock> {
    return this.mutate(async () => {
      const domain = await this.ready
      const current = domain.table('actual_blocks').get(String(id))
      if (current === undefined) throw new Error(`secretary: no actual block "${id}"`)
      if (current.endAt !== undefined) throw new Error(`secretary: actual block "${id}" is not running`)
      validateInterval(current.startAt, endAt)
      const block: ActualBlock = { ...current, endAt }
      await domain.table('actual_blocks').put(String(id), block)
      return block
    })
  }
}

export const name = 'dsh-secretary-time-block'
export const inject = ['secretaryStorageDomain', 'tags', 'tagReferences']
export function apply(ctx: Context, config: Config = {}): void {
  ctx.plugin(SQLiteTimeService, config)
}
