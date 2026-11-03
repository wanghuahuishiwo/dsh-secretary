import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type { GtdService } from 'dsh-secretary-gtd/contract'
import {
  TimeBlockService,
  isFocusLevel,
  type CreateTimeBlockInput,
  type TimeBlock,
  type FocusLevel,
  type UpdateTimeBlockInput,
  type ActualSource,
} from 'dsh-secretary-time-block/contract'
import { objectOf, parseTimeRange, withoutUndefined, type TimeRange } from 'dsh-secretary-core/validation'

interface Table<Record> {
  readonly size: number
  get(key: string): Record | undefined
  entries(): IterableIterator<[string, Record]>
  put(key: string, value: Record): Promise<void>
  delete(key: string): Promise<boolean>
}

interface StorageDomain {
  table(name: 'time_blocks'): Table<TimeBlock>
  close(): Promise<void>
}

export interface Config {
  domain?: string
}

export const Config = {
  '~standard': {
    version: 1,
    vendor: 'dsh-secretary-time-block',
    validate(raw: unknown) {
      const value = raw === undefined ? {} : objectOf(raw, 'time block config')
      const domain = value.domain ?? 'secretary_time'
      if (typeof domain !== 'string' || !/^[a-z][a-z0-9_]*$/.test(domain)) {
        return { issues: [{ message: 'secretary: time block domain must be a lowercase identifier' }] }
      }
      for (const key of Object.keys(value)) {
        if (key !== 'domain') return { issues: [{ message: `secretary: unknown time block config field ${key}` }] }
      }
      return { value: { domain } }
    },
  },
}

function parseBlock(raw: unknown): TimeBlock {
  const value = objectOf(raw, 'time block')
  const block = value as unknown as TimeBlock
  if (!block.id || !block.actionId) throw new Error('secretary: invalid stored time block')
  parseTimeRange(block.planned, 'planned')
  if (block.actual !== undefined) parseTimeRange(block.actual, 'actual')
  if (block.actual !== undefined && !['user_reported', 'agent_observed', 'imported'].includes(block.actualSource ?? '')) {
    throw new Error('secretary: actual time needs a valid source')
  }
  if (block.actual === undefined && block.actualSource !== undefined) throw new Error('secretary: actualSource requires actual time')
  if (block.focus !== undefined && !isFocusLevel(block.focus)) throw new Error('secretary: invalid stored focus level')
  if (block.actual === undefined && block.focus !== undefined) throw new Error('secretary: focus requires actual time')
  return block
}

export class SQLiteTimeBlockService extends TimeBlockService {
  static inject = ['secretaryStorageDomain', 'gtd']

  private readonly ready: Promise<StorageDomain>
  private readonly context: Context
  private queue: Promise<unknown> = Promise.resolve()

  constructor(ctx: Context, config: Config = {}) {
    super(ctx)
    this.context = ctx
    const domainName = config.domain ?? 'secretary_time'
    this.ready = (ctx as Context & { secretaryStorageDomain: { open(spec: unknown): Promise<StorageDomain> } }).secretaryStorageDomain.open({
      name: domainName,
      version: 1,
      tables: {
        time_blocks: { valueSchema: { parse: parseBlock } },
      },
    })
    ctx.effect(async () => {
      const domain = await this.ready
      return async () => {
        await this.queue
        await domain.close()
      }
    })
  }

  private mutate<Outcome>(operation: () => Promise<Outcome>): Promise<Outcome> {
    const result = this.queue.then(operation)
    this.queue = result.then(() => undefined, () => undefined)
    return result
  }

  async createBlock(input: CreateTimeBlockInput): Promise<TimeBlock> {
    return this.mutate(async () => {
      const domain = await this.ready
      await (this.context as Context & { gtd: GtdService }).gtd.getAction(input.actionId)
      const now = new Date().toISOString()
      const block: TimeBlock = {
        id: randomUUID(),
        actionId: input.actionId,
        planned: parseTimeRange(input.planned, 'planned'),
        use: input.use ?? 'dedicated',
        createdAt: now,
        updatedAt: now,
      }
      await domain.table('time_blocks').put(block.id, block)
      return block
    })
  }

  async getBlock(id: string): Promise<TimeBlock> {
    const domain = await this.ready
    const block = domain.table('time_blocks').get(id)
    if (block === undefined) throw new Error(`secretary: no time block "${id}"`)
    return block
  }

  async listBlocks(): Promise<TimeBlock[]> {
    const domain = await this.ready
    return [...domain.table('time_blocks').entries()].map(([, block]) => block)
  }

  async updateBlock(id: string, input: UpdateTimeBlockInput): Promise<TimeBlock> {
    return this.mutate(async () => {
      const domain = await this.ready
      const current = domain.table('time_blocks').get(id)
      if (current === undefined) throw new Error(`secretary: no time block "${id}"`)
      const block: TimeBlock = withoutUndefined({
        ...current,
        planned: input.planned === undefined ? current.planned : parseTimeRange(input.planned, 'planned'),
        use: input.use ?? current.use,
        preparationReminderId: input.preparationReminderId === null ? undefined : input.preparationReminderId ?? current.preparationReminderId,
        updatedAt: new Date().toISOString(),
      })
      await domain.table('time_blocks').put(id, block)
      return block
    })
  }

  async recordActual(id: string, actual: TimeRange, actualSource: ActualSource, focus?: FocusLevel): Promise<TimeBlock> {
    return this.mutate(async () => {
      const domain = await this.ready
      const current = domain.table('time_blocks').get(id)
      if (current === undefined) throw new Error(`secretary: no time block "${id}"`)
      if (!['user_reported', 'agent_observed', 'imported'].includes(actualSource)) {
        throw new Error('secretary: invalid actualSource')
      }
      if (focus !== undefined && !isFocusLevel(focus)) throw new Error('secretary: invalid focus level')
      const block: TimeBlock = withoutUndefined({
        ...current,
        actual: parseTimeRange(actual, 'actual'),
        actualSource,
        focus,
        updatedAt: new Date().toISOString(),
      })
      await domain.table('time_blocks').put(id, block)
      return block
    })
  }
}

export const name = 'dsh-secretary-time-block'
export const inject = ['secretaryStorageDomain', 'gtd']

export function apply(ctx: Context, config: Config = {}): void {
  ctx.plugin(SQLiteTimeBlockService, config)
}
