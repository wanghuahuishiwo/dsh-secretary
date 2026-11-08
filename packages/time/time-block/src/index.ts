import type { Context } from '@deepseek-ai/cordis'
import { objectOf, optionalString, parseInstant, withoutUndefined } from 'dsh-secretary-validation'
import type { TagReferenceRegistry, TagService } from 'dsh-secretary-tag-service/contract'
import {
  TimeService,
  isFocusLevel,
  type ActualBlock,
  type ActualSource,
  type ApplyPlanTemplateInput,
  type CreateActualInput,
  type CreatePlanInput,
  type CreatePlanTemplateInput,
  type DeepCellLevel,
  type DeepCellPosition,
  type DeepLevel,
  type DeepRange,
  type DeepWeek,
  type DeepWeekQuery,
  type DeepWeekSource,
  type FocusLevel,
  type ListActualQuery,
  type ListPlanQuery,
  type ListPlanTemplateQuery,
  type PlanBlock,
  type PlanTemplateBlock,
  type SetDeepCellInput,
  type SetDeepRangeInput,
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

interface DeepBaseTemplate {
  readonly scope: 'base'
  readonly levels: readonly DeepCellLevel[]
}

interface DeepWeekTemplate {
  readonly scope: 'week'
  readonly weekStart: string
  readonly levels: readonly DeepCellLevel[]
}

type DeepTemplate = DeepBaseTemplate | DeepWeekTemplate

interface StorageDomain {
  readonly global: { get(): number; set(value: number): Promise<void> }
  table(name: 'actual_blocks'): Table<ActualBlock>
  table(name: 'deep_templates'): Table<DeepTemplate>
  table(name: 'plan_blocks'): Table<PlanBlock>
  table(name: 'plan_template_blocks'): Table<PlanTemplateBlock>
  table(name: 'plan_template_undos'): Table<TemplateUndo>
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

function parseTemplateUndo(raw: unknown): TemplateUndo {
  const undo = objectOf(raw, 'template undo') as unknown as TemplateUndo
  parseWeekday(undo.weekday)
  validateTimeZone(undo.timeZone)
  if (!Array.isArray(undo.before) || !Array.isArray(undo.after)) throw new Error('secretary: invalid stored template undo')
  undo.before.forEach(parsePlan)
  undo.after.forEach(parsePlan)
  return undo
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

const DEEP_CELL_LEVELS: readonly DeepCellLevel[] = ['high', 'medium', 'low', 'unset']

function parseDeepLevel(raw: unknown): DeepLevel {
  if (raw !== 'high' && raw !== 'medium' && raw !== 'low') throw new Error('secretary: deep level must be high, medium, or low')
  return raw
}

function parseDeepWeekStart(raw: unknown): string {
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new Error('secretary: weekStart must be YYYY-MM-DD')
  }
  const date = new Date(`${raw}T00:00:00Z`)
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== raw) {
    throw new Error('secretary: invalid weekStart date')
  }
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7)
  return date.toISOString().slice(0, 10)
}

function shiftDeepWeek(weekStart: string, weeks: number): string {
  const date = new Date(`${weekStart}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + weeks * 7)
  return date.toISOString().slice(0, 10)
}

function parseDeepTemplate(raw: unknown): DeepTemplate {
  const template = objectOf(raw, 'deep template') as unknown as DeepTemplate
  if (!Array.isArray(template.levels) || template.levels.length !== 168
    || template.levels.some(level => !DEEP_CELL_LEVELS.includes(level))) {
    throw new Error('secretary: invalid stored deep template')
  }
  if (template.scope === 'base') return template
  if (template.scope === 'week') {
    try {
      if (parseDeepWeekStart(template.weekStart) !== template.weekStart) throw new Error('not a Monday')
    } catch {
      throw new Error('secretary: invalid stored deep week template')
    }
    return template
  }
  throw new Error('secretary: invalid stored deep template scope')
}

function parseHour(raw: unknown): number {
  if (!Number.isSafeInteger(raw) || (raw as number) < 0 || (raw as number) > 23) {
    throw new Error('secretary: hour must be an integer from 0 to 23')
  }
  return raw as number
}

function deepWeek(
  weekStart: string,
  source: DeepWeekSource,
  levels: readonly DeepCellLevel[] = Array.from({ length: 168 }, () => 'unset'),
): DeepWeek {
  return {
    weekStart,
    source,
    cells: levels.map((level, index) => ({
      weekday: Math.floor(index / 24) + 1,
      hour: index % 24,
      level,
    })),
  }
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
        deep_templates: { valueSchema: { parse: parseDeepTemplate } },
        plan_blocks: { valueSchema: { parse: parsePlan } },
        plan_template_blocks: { valueSchema: { parse: parsePlanTemplate } },
        plan_template_undos: { valueSchema: { parse: parseTemplateUndo } },
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
        if ([...domain.table('plan_blocks').entries()].some(([, block]) => block.timeTagId === tagId)) return true
        return [...domain.table('plan_template_undos').entries()].some(([targetDate, undo]) =>
          JSON.stringify(this.plansForDate(domain, targetDate, undo.timeZone)) === JSON.stringify(undo.after)
          && [...undo.before, ...undo.after].some(block => block.timeTagId === tagId))
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

  private async findPlan(id: number): Promise<PlanBlock> {
    const domain = await this.ready
    const block = domain.table('plan_blocks').get(String(id))
    if (block === undefined) throw new Error(`secretary: no plan block "${id}"`)
    return block
  }

  private plansForDate(domain: StorageDomain, date: string, timeZone: string): PlanBlock[] {
    const from = startOfZonedDate(date, timeZone)
    const to = startOfZonedDate(nextDate(date), timeZone)
    return [...domain.table('plan_blocks').entries()].map(([, block]) => block)
      .filter(block => Date.parse(block.startAt) < to && Date.parse(block.endAt) > from)
      .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt) || a.id - b.id)
  }

  private async replaceDatePlans(
    domain: StorageDomain,
    targetDate: string,
    current: readonly PlanBlock[],
    after: readonly PlanBlock[],
    undo: TemplateUndo | undefined,
  ): Promise<void> {
    const plans = domain.table('plan_blocks')
    const undos = domain.table('plan_template_undos')
    const previousUndo = undos.get(targetDate)
    const currentById = new Map(current.map(block => [block.id, block]))
    const afterIds = new Set(after.map(block => block.id))
    const touchedIds = new Set([...currentById.keys(), ...afterIds])
    try {
      for (const block of after) await plans.put(String(block.id), block)
      for (const id of currentById.keys()) if (!afterIds.has(id)) await plans.delete(String(id))
      if (undo === undefined) await undos.delete(targetDate)
      else await undos.put(targetDate, undo)
    } catch (error) {
      const rollbackErrors: unknown[] = []
      for (const id of touchedIds) {
        const original = currentById.get(id)
        try {
          if (original === undefined) await plans.delete(String(id))
          else await plans.put(String(id), original)
        } catch (rollbackError) { rollbackErrors.push(rollbackError) }
      }
      try {
        if (previousUndo === undefined) await undos.delete(targetDate)
        else await undos.put(targetDate, previousUndo)
      } catch (rollbackError) { rollbackErrors.push(rollbackError) }
      if (rollbackErrors.length > 0) {
        throw new Error(`secretary: date-plan write failed (${String(error)}); rollback failed: ${rollbackErrors.map(String).join('; ')}`, { cause: error })
      }
      throw error
    }
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
      const before = this.plansForDate(domain, input.targetDate, timeZone)
      if (blocks.length > 0) await domain.global.set(nextId)
      await this.replaceDatePlans(domain, input.targetDate, before, blocks, {
        weekday, timeZone, before, after: blocks,
      })
      return blocks
    }))
  }

  async undoPlanTemplate(input: UndoPlanTemplateInput): Promise<PlanBlock[]> {
    return this.mutate(async () => {
      const timeZone = validateTimeZone(input.timeZone)
      startOfZonedDate(input.targetDate, timeZone)
      const domain = await this.ready
      const undo = domain.table('plan_template_undos').get(input.targetDate)
      if (undo === undefined) throw new Error('secretary: no template apply to undo for targetDate')
      if (undo.timeZone !== timeZone) throw new Error('secretary: template undo timeZone does not match apply')
      const current = this.plansForDate(domain, input.targetDate, timeZone)
      if (JSON.stringify(current) !== JSON.stringify(undo.after)) {
        throw new Error('secretary: date plan changed after template apply; undo refused')
      }
      await this.replaceDatePlans(domain, input.targetDate, current, undo.before, undefined)
      return [...undo.before]
    })
  }

  async canUndoPlanTemplate(input: UndoPlanTemplateInput): Promise<boolean> {
    const timeZone = validateTimeZone(input.timeZone)
    startOfZonedDate(input.targetDate, timeZone)
    const domain = await this.ready
    const undo = domain.table('plan_template_undos').get(input.targetDate)
    return undo?.timeZone === timeZone
      && JSON.stringify(this.plansForDate(domain, input.targetDate, timeZone)) === JSON.stringify(undo.after)
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
      await domain.global.set(id + 1)
      await domain.table('plan_blocks').put(String(id), block)
      return block
    }))
  }

  async getPlan(id: number): Promise<PlanBlock> {
    return this.findPlan(id)
  }

  async listPlan(query: ListPlanQuery = {}): Promise<PlanBlock[]> {
    let from: number | undefined
    let to: number | undefined
    if (query.date !== undefined) {
      const timeZone = validateTimeZone(query.timeZone ?? 'Asia/Shanghai')
      from = startOfZonedDate(query.date, timeZone)
      to = startOfZonedDate(nextDate(query.date), timeZone)
    }
    let tagIds: Set<number> | undefined
    if (query.timeTagId !== undefined) {
      const tags = (this.context as Context & { tags: TagService }).tags
      const root = await tags.getTag(query.timeTagId)
      if (root.kind !== 'time') throw new Error('secretary: PlanBlock query requires a time tag')
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
    const domain = await this.ready
    return [...domain.table('plan_blocks').entries()].map(([, block]) => block)
      .filter(block => tagIds === undefined || tagIds.has(block.timeTagId))
      .filter(block => from === undefined || to === undefined
        || (Date.parse(block.startAt) < to && Date.parse(block.endAt) > from))
      .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt) || a.id - b.id)
  }

  async updatePlan(id: number, input: UpdatePlanInput): Promise<PlanBlock> {
    const tags = (this.context as Context & { tags: TagService }).tags
    return tags.withReferenceConsistency(() => this.mutate(async () => {
      const current = await this.findPlan(id)
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
      await domain.table('plan_blocks').put(String(id), block)
      return block
    }))
  }

  async deletePlan(id: number): Promise<PlanBlock> {
    return this.mutate(async () => {
      const block = await this.findPlan(id)
      const domain = await this.ready
      await domain.table('plan_blocks').delete(String(id))
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

  private resolveDeepWeek(domain: StorageDomain, weekStart: string): DeepWeek {
    const templates = domain.table('deep_templates')
    const own = templates.get(`week:${weekStart}`)
    if (own !== undefined) return deepWeek(weekStart, 'own', own.levels)
    let earlier = weekStart
    for (let count = 0; count < 52; count += 1) {
      earlier = shiftDeepWeek(earlier, -1)
      const inherited = templates.get(`week:${earlier}`)
      if (inherited !== undefined) return deepWeek(weekStart, 'inherited', inherited.levels)
    }
    return deepWeek(weekStart, 'seed', templates.get('base')?.levels)
  }

  private async writeDeepWeek(
    rawWeekStart: string,
    change: (levels: DeepCellLevel[]) => void,
  ): Promise<DeepWeek> {
    const weekStart = parseDeepWeekStart(rawWeekStart)
    return this.mutate(async () => {
      const domain = await this.ready
      const current = this.resolveDeepWeek(domain, weekStart)
      const levels = current.cells.map(cell => cell.level)
      change(levels)
      await domain.table('deep_templates').put(`week:${weekStart}`, { scope: 'week', weekStart, levels })
      return deepWeek(weekStart, 'own', levels)
    })
  }

  async getDeepWeek(query: DeepWeekQuery): Promise<DeepWeek> {
    const weekStart = parseDeepWeekStart(query.weekStart)
    const domain = await this.ready
    return this.resolveDeepWeek(domain, weekStart)
  }

  async setDeepCell(input: SetDeepCellInput): Promise<DeepWeek> {
    const weekday = parseWeekday(input.weekday)
    const hour = parseHour(input.hour)
    const level = parseDeepLevel(input.level)
    return this.writeDeepWeek(input.weekStart, levels => { levels[(weekday - 1) * 24 + hour] = level })
  }

  async clearDeepCell(input: DeepCellPosition): Promise<DeepWeek> {
    const weekday = parseWeekday(input.weekday)
    const hour = parseHour(input.hour)
    return this.writeDeepWeek(input.weekStart, levels => { levels[(weekday - 1) * 24 + hour] = 'unset' })
  }

  async setDeepRange(input: SetDeepRangeInput): Promise<DeepWeek> {
    const startWeekday = parseWeekday(input.startWeekday)
    const startHour = parseHour(input.startHour)
    const endWeekday = parseWeekday(input.endWeekday)
    const endHour = parseHour(input.endHour)
    if (startWeekday > endWeekday || startHour > endHour) throw new Error('secretary: deep range must run from start to end')
    const level = parseDeepLevel(input.level)
    return this.writeDeepWeek(input.weekStart, levels => {
      for (let weekday = startWeekday; weekday <= endWeekday; weekday += 1) {
        for (let hour = startHour; hour <= endHour; hour += 1) levels[(weekday - 1) * 24 + hour] = level
      }
    })
  }

  async clearDeepRange(input: DeepRange): Promise<DeepWeek> {
    const startWeekday = parseWeekday(input.startWeekday)
    const startHour = parseHour(input.startHour)
    const endWeekday = parseWeekday(input.endWeekday)
    const endHour = parseHour(input.endHour)
    if (startWeekday > endWeekday || startHour > endHour) throw new Error('secretary: deep range must run from start to end')
    return this.writeDeepWeek(input.weekStart, levels => {
      for (let weekday = startWeekday; weekday <= endWeekday; weekday += 1) {
        for (let hour = startHour; hour <= endHour; hour += 1) levels[(weekday - 1) * 24 + hour] = 'unset'
      }
    })
  }
}

export const name = 'dsh-secretary-time-block'
export const inject = ['secretaryStorageDomain', 'tags', 'tagReferences', 'goals']
export function apply(ctx: Context, config: Config = {}): void {
  ctx.plugin(SQLiteTimeService, config)
}
