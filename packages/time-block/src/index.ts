import type { Context } from '@deepseek-ai/cordis'
import { objectOf, optionalString, parseInstant, withoutUndefined } from 'dsh-secretary-core/validation'
import type { TagReferenceRegistry, TagService } from 'dsh-secretary-tag/contract'
import {
  TimeService,
  isFocusLevel,
  type ActualBlock,
  type ActualSource,
  type ApplyPlanTemplateInput,
  type CreateActualInput,
  type CreatePlanInput,
  type CreatePlanTemplateInput,
  type FocusLevel,
  type ListActualQuery,
  type ListPlanQuery,
  type ListPlanTemplateQuery,
  type PlanBlock,
  type PlanTemplateBlock,
  type StartActualInput,
  type UpdateActualInput,
  type UpdatePlanInput,
  type UpdatePlanTemplateInput,
  type UndoPlanTemplateInput,
} from 'dsh-secretary-time-block/contract'

interface Table<Record> {
  get(key: string): Record | undefined
  entries(): IterableIterator<[string, Record]>
  put(key: string, value: Record): Promise<void>
  delete(key: string): Promise<boolean>
}

interface TemplateUndo {
  readonly weekday: number
  readonly timeZone: string
  readonly before: readonly PlanBlock[]
  readonly after: readonly PlanBlock[]
}

interface PlanDay {
  readonly date: string
  readonly blocks: readonly PlanBlock[]
  readonly templateUndo?: TemplateUndo
}

interface StorageDomain {
  readonly global: { get(): number; set(value: number): Promise<void> }
  table(name: 'actual_blocks'): Table<ActualBlock>
  table(name: 'plan_days'): Table<PlanDay>
  table(name: 'plan_template_blocks'): Table<PlanTemplateBlock>
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

function parseWeekday(raw: unknown): number {
  if (!Number.isSafeInteger(raw) || (raw as number) < 1 || (raw as number) > 7) {
    throw new Error('secretary: weekday must be an integer from 1 to 7')
  }
  return raw as number
}

function parseLocalTime(raw: unknown, label: string, allowEndOfDay = false): string {
  if (typeof raw !== 'string' || !/^\d{2}:\d{2}$/.test(raw)) throw new Error(`secretary: ${label} must be HH:mm`)
  const hour = Number(raw.slice(0, 2))
  const minute = Number(raw.slice(3, 5))
  if (minute > 59 || hour > (allowEndOfDay ? 24 : 23) || (hour === 24 && minute !== 0)) {
    throw new Error(`secretary: ${label} must be a valid local time`)
  }
  return raw
}

function validateTemplateInterval(startTime: string, endTime: string): void {
  parseLocalTime(startTime, 'startTime')
  parseLocalTime(endTime, 'endTime', true)
  if (startTime === endTime) throw new Error('secretary: template endTime must differ from startTime')
}

function parsePlanTemplate(raw: unknown): PlanTemplateBlock {
  const block = objectOf(raw, 'plan template block') as unknown as PlanTemplateBlock
  if (!Number.isSafeInteger(block.id) || block.id <= 0 || !Number.isSafeInteger(block.timeTagId) || block.timeTagId <= 0) {
    throw new Error('secretary: invalid stored plan template identity')
  }
  parseWeekday(block.weekday)
  validateTemplateInterval(block.startTime, block.endTime)
  optionalString(block.note, 'note')
  return block
}

function parsePlan(raw: unknown): PlanBlock {
  const block = objectOf(raw, 'plan block') as unknown as PlanBlock
  if (!Number.isSafeInteger(block.id) || block.id <= 0 || !Number.isSafeInteger(block.timeTagId) || block.timeTagId <= 0) {
    throw new Error('secretary: invalid stored plan block identity')
  }
  validateInterval(block.startAt, block.endAt)
  optionalString(block.note, 'note')
  return block
}

function parsePlanDay(raw: unknown): PlanDay {
  const day = objectOf(raw, 'plan day') as unknown as PlanDay
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day.date) || !Array.isArray(day.blocks)) {
    throw new Error('secretary: invalid stored plan day')
  }
  day.blocks.forEach(parsePlan)
  if (day.templateUndo !== undefined) {
    const undo = objectOf(day.templateUndo, 'template undo') as unknown as TemplateUndo
    parseWeekday(undo.weekday)
    validateTimeZone(undo.timeZone)
    if (!Array.isArray(undo.before) || !Array.isArray(undo.after)) throw new Error('secretary: invalid stored template undo')
    undo.before.forEach(parsePlan)
    undo.after.forEach(parsePlan)
  }
  return day
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

function dateAtInstant(instant: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(instant))
  const field = (type: string) => parts.find(part => part.type === type)?.value
  return `${field('year')}-${field('month')}-${field('day')}`
}

function nextDate(date: string): string {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + 1)
  return value.toISOString().slice(0, 10)
}

function localTimeMinutes(time: string): number {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))
}

function templateInstant(date: string, time: string, timeZone: string, overnight = false): string {
  let localDate = overnight ? nextDate(date) : date
  let localTime = time
  if (time === '24:00') {
    localDate = nextDate(localDate)
    localTime = '00:00'
  }
  const local = Date.UTC(
    Number(localDate.slice(0, 4)), Number(localDate.slice(5, 7)) - 1, Number(localDate.slice(8, 10)),
    Number(localTime.slice(0, 2)), Number(localTime.slice(3, 5)),
  )
  let instant = local
  for (let iteration = 0; iteration < 2; iteration += 1) instant = local - zoneOffsetMs(instant, timeZone)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date(instant))
  const field = (type: string) => parts.find(part => part.type === type)?.value
  if (`${field('year')}-${field('month')}-${field('day')}` !== localDate || `${field('hour')}:${field('minute')}` !== localTime) {
    throw new Error(`secretary: template local time ${localDate} ${localTime} does not exist in ${timeZone}`)
  }
  const offset = zoneOffsetMs(instant, timeZone)
  const sign = offset < 0 ? '-' : '+'
  const absolute = Math.abs(offset)
  const offsetLabel = `${sign}${String(Math.floor(absolute / 3_600_000)).padStart(2, '0')}:${String(Math.floor(absolute / 60_000) % 60).padStart(2, '0')}`
  return `${localDate}T${localTime}:00${offsetLabel}`
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
      tables: {
        actual_blocks: { valueSchema: { parse: parseActual } },
        plan_days: { valueSchema: { parse: parsePlanDay } },
        plan_template_blocks: { valueSchema: { parse: parsePlanTemplate } },
      },
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
      hasReferences: async tagId => {
        const domain = await this.ready
        if ([...domain.table('actual_blocks').entries()].some(([, block]) => block.timeTagId === tagId)) return true
        if ([...domain.table('plan_template_blocks').entries()].some(([, block]) => block.timeTagId === tagId)) return true
        return [...domain.table('plan_days').entries()].some(([, day]) => [
          ...day.blocks, ...(day.templateUndo?.before ?? []), ...(day.templateUndo?.after ?? []),
        ].some(block => block.timeTagId === tagId))
      },
    }), 'secretary: TimeBlock tag reference inspector')
  }

  private mutate<Outcome>(operation: () => Promise<Outcome>): Promise<Outcome> {
    const result = this.queue.then(operation)
    this.queue = result.then(() => undefined, () => undefined)
    return result
  }

  private async requireTimeTag(id: number): Promise<void> {
    const tag = await (this.context as Context & { tags: TagService }).tags.getTag(id)
    if (tag.kind !== 'time') throw new Error('secretary: TimeBlock requires a time tag')
  }

  private async findPlan(id: number): Promise<{ day: PlanDay; block: PlanBlock }> {
    const domain = await this.ready
    for (const [, day] of domain.table('plan_days').entries()) {
      const block = day.blocks.find(item => item.id === id)
      if (block !== undefined) return { day, block }
    }
    throw new Error(`secretary: no plan block "${id}"`)
  }

  async createPlanTemplate(input: CreatePlanTemplateInput): Promise<PlanTemplateBlock> {
    const tags = (this.context as Context & { tags: TagService }).tags
    return tags.withReferenceConsistency(() => this.mutate(async () => {
      await this.requireTimeTag(input.timeTagId)
      validateTemplateInterval(input.startTime, input.endTime)
      const domain = await this.ready
      const id = domain.global.get()
      const block: PlanTemplateBlock = withoutUndefined({
        id, weekday: parseWeekday(input.weekday), startTime: input.startTime, endTime: input.endTime,
        timeTagId: input.timeTagId, note: optionalString(input.note, 'note'),
      })
      await domain.global.set(id + 1)
      await domain.table('plan_template_blocks').put(String(id), block)
      return block
    }))
  }

  async listPlanTemplate(query: ListPlanTemplateQuery = {}): Promise<PlanTemplateBlock[]> {
    if (query.weekday !== undefined) parseWeekday(query.weekday)
    const domain = await this.ready
    return [...domain.table('plan_template_blocks').entries()].map(([, block]) => block)
      .filter(block => query.weekday === undefined || block.weekday === query.weekday)
      .sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime) || a.id - b.id)
  }

  async updatePlanTemplate(id: number, input: UpdatePlanTemplateInput): Promise<PlanTemplateBlock> {
    const tags = (this.context as Context & { tags: TagService }).tags
    return tags.withReferenceConsistency(() => this.mutate(async () => {
      const domain = await this.ready
      const current = domain.table('plan_template_blocks').get(String(id))
      if (current === undefined) throw new Error(`secretary: no plan template block "${id}"`)
      if (input.timeTagId !== undefined) await this.requireTimeTag(input.timeTagId)
      const block: PlanTemplateBlock = withoutUndefined({
        ...current,
        weekday: input.weekday === undefined ? current.weekday : parseWeekday(input.weekday),
        startTime: input.startTime ?? current.startTime,
        endTime: input.endTime ?? current.endTime,
        timeTagId: input.timeTagId ?? current.timeTagId,
        note: input.note === null ? undefined : input.note === undefined ? current.note : optionalString(input.note, 'note'),
      })
      validateTemplateInterval(block.startTime, block.endTime)
      await domain.table('plan_template_blocks').put(String(id), block)
      return block
    }))
  }

  async deletePlanTemplate(id: number): Promise<PlanTemplateBlock> {
    return this.mutate(async () => {
      const domain = await this.ready
      const block = domain.table('plan_template_blocks').get(String(id))
      if (block === undefined) throw new Error(`secretary: no plan template block "${id}"`)
      await domain.table('plan_template_blocks').delete(String(id))
      return block
    })
  }

  async applyPlanTemplate(input: ApplyPlanTemplateInput): Promise<PlanBlock[]> {
    const tags = (this.context as Context & { tags: TagService }).tags
    return tags.withReferenceConsistency(() => this.mutate(async () => {
      const weekday = parseWeekday(input.weekday)
      const timeZone = validateTimeZone(input.timeZone)
      startOfZonedDate(input.targetDate, timeZone)
      const domain = await this.ready
      const templates = [...domain.table('plan_template_blocks').entries()].map(([, block]) => block)
        .filter(block => block.weekday === weekday)
        .sort((a, b) => a.startTime.localeCompare(b.startTime) || a.id - b.id)
      for (const template of templates) await this.requireTimeTag(template.timeTagId)
      let nextId = domain.global.get()
      const blocks = templates.map(template => {
        const overnight = localTimeMinutes(template.endTime) <= localTimeMinutes(template.startTime)
        return withoutUndefined({
          id: nextId++, timeTagId: template.timeTagId, note: template.note,
          startAt: templateInstant(input.targetDate, template.startTime, timeZone),
          endAt: templateInstant(input.targetDate, template.endTime, timeZone, overnight),
        })
      })
      const current = domain.table('plan_days').get(input.targetDate)
      const day: PlanDay = {
        date: input.targetDate,
        blocks,
        templateUndo: { weekday, timeZone, before: current?.blocks ?? [], after: blocks },
      }
      if (blocks.length > 0) await domain.global.set(nextId)
      await domain.table('plan_days').put(input.targetDate, day)
      return blocks
    }))
  }

  async undoPlanTemplate(input: UndoPlanTemplateInput): Promise<PlanBlock[]> {
    return this.mutate(async () => {
      const timeZone = validateTimeZone(input.timeZone)
      startOfZonedDate(input.targetDate, timeZone)
      const domain = await this.ready
      const day = domain.table('plan_days').get(input.targetDate)
      const undo = day?.templateUndo
      if (day === undefined || undo === undefined) throw new Error('secretary: no template apply to undo for targetDate')
      if (undo.timeZone !== timeZone) throw new Error('secretary: template undo timeZone does not match apply')
      if (JSON.stringify(day.blocks) !== JSON.stringify(undo.after)) {
        throw new Error('secretary: date plan changed after template apply; undo refused')
      }
      await domain.table('plan_days').put(input.targetDate, { date: day.date, blocks: undo.before })
      return [...undo.before]
    })
  }

  async canUndoPlanTemplate(input: UndoPlanTemplateInput): Promise<boolean> {
    const timeZone = validateTimeZone(input.timeZone)
    startOfZonedDate(input.targetDate, timeZone)
    const domain = await this.ready
    const day = domain.table('plan_days').get(input.targetDate)
    return day?.templateUndo?.timeZone === timeZone
      && JSON.stringify(day.blocks) === JSON.stringify(day.templateUndo.after)
  }

  async createPlan(input: CreatePlanInput): Promise<PlanBlock> {
    const tags = (this.context as Context & { tags: TagService }).tags
    return tags.withReferenceConsistency(() => this.mutate(async () => {
      await this.requireTimeTag(input.timeTagId)
      validateInterval(input.startAt, input.endAt)
      const timeZone = validateTimeZone(input.timeZone)
      startOfZonedDate(input.date, timeZone)
      if (dateAtInstant(input.startAt, timeZone) !== input.date) {
        throw new Error('secretary: plan startAt must fall on date in timeZone')
      }
      const domain = await this.ready
      const id = domain.global.get()
      const block: PlanBlock = withoutUndefined({
        id, timeTagId: input.timeTagId, note: optionalString(input.note, 'note'),
        startAt: input.startAt, endAt: input.endAt,
      })
      const current = domain.table('plan_days').get(input.date)
      const day: PlanDay = { ...current, date: input.date, blocks: [...(current?.blocks ?? []), block] }
      await domain.global.set(id + 1)
      await domain.table('plan_days').put(input.date, day)
      return block
    }))
  }

  async getPlan(id: number): Promise<PlanBlock> {
    return (await this.findPlan(id)).block
  }

  async listPlan(query: ListPlanQuery = {}): Promise<PlanBlock[]> {
    let from: number | undefined
    let to: number | undefined
    if (query.date !== undefined) {
      const timeZone = validateTimeZone(query.timeZone ?? 'Asia/Shanghai')
      from = startOfZonedDate(query.date, timeZone)
      to = startOfZonedDate(nextDate(query.date), timeZone)
    }
    const domain = await this.ready
    return [...domain.table('plan_days').entries()].flatMap(([, day]) => day.blocks)
      .filter(block => query.timeTagId === undefined || block.timeTagId === query.timeTagId)
      .filter(block => from === undefined || to === undefined
        || (Date.parse(block.startAt) < to && Date.parse(block.endAt) > from))
      .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt) || a.id - b.id)
  }

  async updatePlan(id: number, input: UpdatePlanInput): Promise<PlanBlock> {
    const tags = (this.context as Context & { tags: TagService }).tags
    return tags.withReferenceConsistency(() => this.mutate(async () => {
      const { day, block: current } = await this.findPlan(id)
      if (input.timeTagId !== undefined) await this.requireTimeTag(input.timeTagId)
      const block: PlanBlock = withoutUndefined({
        ...current,
        timeTagId: input.timeTagId ?? current.timeTagId,
        note: input.note === null ? undefined : input.note === undefined ? current.note : optionalString(input.note, 'note'),
        startAt: input.startAt === undefined ? current.startAt : parseInstant(input.startAt, 'startAt'),
        endAt: input.endAt === undefined ? current.endAt : parseInstant(input.endAt, 'endAt'),
      })
      validateInterval(block.startAt, block.endAt)
      const domain = await this.ready
      await domain.table('plan_days').put(day.date, {
        ...day, blocks: day.blocks.map(item => item.id === id ? block : item),
      })
      return block
    }))
  }

  async deletePlan(id: number): Promise<PlanBlock> {
    return this.mutate(async () => {
      const { day, block } = await this.findPlan(id)
      const domain = await this.ready
      await domain.table('plan_days').put(day.date, {
        ...day, blocks: day.blocks.filter(item => item.id !== id),
      })
      return block
    })
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
