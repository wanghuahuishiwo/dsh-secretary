import { randomUUID } from 'node:crypto'
import {
  normalizeName,
  parseAction,
  parseTimeCategory,
  parseTimeRange,
  type Action,
  type ActualSource,
  type TimeCategory,
  type TimeRange,
} from './model.ts'

const SECRETARY_DOMAIN = {
  name: 'secretary',
  version: 1,
  tables: {
    actions: { valueSchema: { parse: parseAction } },
    time_categories: { valueSchema: { parse: parseTimeCategory } },
  },
}

let mutationQueue: Promise<unknown> = Promise.resolve()

function mutate<Outcome>(operation: () => Promise<Outcome>): Promise<Outcome> {
  const result = mutationQueue.then(operation)
  mutationQueue = result.then(() => undefined, () => undefined)
  return result
}

interface Table<Record> {
  readonly size: number
  get(key: string): Record | undefined
  entries(): IterableIterator<[string, Record]>
  put(key: string, value: Record): Promise<void>
  delete(key: string): Promise<boolean>
}

interface StorageHost {
  storageDomain: {
    open(spec: unknown): Promise<{
      table(name: 'actions'): Table<Action>
      table(name: 'time_categories'): Table<TimeCategory>
      close(): Promise<void>
    }>
  }
}

export interface ActionDetail {
  action: Action
  ancestors: Action[]
  category?: TimeCategory
}

export interface CreateActionInput {
  parentId?: string | null
  title: string
  note?: string
  timeCategoryId?: string
  estimatedMinutes?: number
  planned?: TimeRange
  actual?: TimeRange
  actualSource?: ActualSource
  use?: Action['use']
  preparationReminderId?: string
  preparationResultRef?: string
}

export interface UpdateActionInput {
  parentId?: string | null
  title?: string
  note?: string | null
  timeCategoryId?: string | null
  estimatedMinutes?: number | null
  planned?: TimeRange | null
  actual?: TimeRange | null
  actualSource?: ActualSource | null
  status?: Action['status']
  use?: Action['use']
  preparationReminderId?: string | null
  preparationResultRef?: string | null
}

export interface ActionListFilter {
  parentId?: string | null
  status?: Action['status']
  timeCategoryId?: string
  timeKind?: 'planned' | 'actual'
  from?: string
  to?: string
}

export interface SecretaryStore {
  listTimeCategories(): TimeCategory[]
  getTimeCategory(id: string): TimeCategory
  createTimeCategory(input: { parentId?: string | null; name: string }): Promise<TimeCategory>
  updateTimeCategory(id: string, input: { name: string }): Promise<TimeCategory>
  deleteTimeCategory(id: string): Promise<void>
  getAction(id: string): ActionDetail
  listActions(filter: ActionListFilter): Action[]
  createAction(input: CreateActionInput): Promise<Action>
  updateAction(id: string, input: UpdateActionInput): Promise<Action>
  completeAction(id: string, input: { actual?: TimeRange; actualSource?: ActualSource }): Promise<ActionDetail>
  deleteAction(id: string): Promise<void>
  close(): Promise<void>
}

export async function openSecretaryStore(ctx: StorageHost): Promise<SecretaryStore> {
  const domain = await ctx.storageDomain.open(SECRETARY_DOMAIN)
  const actions = domain.table('actions')
  const categories = domain.table('time_categories')

  const readAction = (id: string): Action => {
    const action = actions.get(id)
    if (action === undefined) throw new Error(`secretary: no action "${id}"`)
    return action
  }

  const readCategory = (id: string): TimeCategory => {
    const category = categories.get(id)
    if (category === undefined) throw new Error(`secretary: no time category "${id}"`)
    return category
  }

  const hasActionChildren = (id: string): boolean =>
    [...actions.entries()].some(([, action]) => action.parentId === id)

  const hasCategoryChildren = (id: string): boolean =>
    [...categories.entries()].some(([, category]) => category.parentId === id)

  const categoryInUse = (id: string): boolean =>
    [...actions.entries()].some(([, action]) => action.timeCategoryId === id)

  const patched = <Value,>(input: Value | null | undefined, current: Value | undefined): Value | undefined => {
    if (input === undefined) return current
    if (input === null) return undefined
    return input
  }

  const detailOf = (action: Action): ActionDetail => {
    const ancestors: Action[] = []
    const seen = new Set([action.id])
    let parentId = action.parentId
    while (parentId !== null) {
      if (seen.has(parentId)) throw new Error(`secretary: action hierarchy contains a cycle at "${parentId}"`)
      const parent = readAction(parentId)
      ancestors.unshift(parent)
      seen.add(parent.id)
      parentId = parent.parentId
    }
    const category = action.timeCategoryId === undefined ? undefined : categories.get(action.timeCategoryId)
    return category === undefined ? { action, ancestors } : { action, ancestors, category }
  }

  return {
    listTimeCategories() {
      return [...categories.entries()].map(([, category]) => category)
    },
    getTimeCategory: readCategory,
    async updateTimeCategory(id, input) {
      return mutate(async () => {
        const current = readCategory(id)
        const category = { ...current, name: normalizeName(input.name, 'time category name'), updatedAt: new Date().toISOString() }
        await categories.put(id, category)
        return category
      })
    },
    async deleteTimeCategory(id) {
      return mutate(async () => {
        readCategory(id)
        if (hasCategoryChildren(id)) throw new Error('secretary: cannot delete a time category with children')
        if (categoryInUse(id)) throw new Error('secretary: cannot delete a time category in use')
        await categories.delete(id)
      })
    },
    async createTimeCategory(input) {
      return mutate(async () => {
        const parentId = input.parentId ?? null
        if (parentId !== null) {
          const parent = categories.get(parentId)
          if (parent === undefined) throw new Error(`secretary: no time category "${parentId}"`)
          if (parent.parentId !== null) throw new Error('secretary: time categories are limited to two levels')
        }
        const now = new Date().toISOString()
        const category = parseTimeCategory({
          id: randomUUID(),
          parentId,
          name: normalizeName(input.name, 'time category name'),
          createdAt: now,
          updatedAt: now,
        })
        await categories.put(category.id, category)
        return category
      })
    },
    getAction(id) {
      return detailOf(readAction(id))
    },
    listActions(filter) {
      if ((filter.from !== undefined || filter.to !== undefined) && filter.timeKind === undefined) {
        throw new Error('secretary: timeKind is required with from or to')
      }
      const from = filter.from === undefined ? undefined : Date.parse(filter.from)
      const to = filter.to === undefined ? undefined : Date.parse(filter.to)
      if ((from !== undefined && !Number.isFinite(from)) || (to !== undefined && !Number.isFinite(to))) {
        throw new Error('secretary: range boundaries must be valid ISO times')
      }
      if (from !== undefined && to !== undefined && from >= to) throw new Error('secretary: range from must be before to')
      return [...actions.entries()].map(([, action]) => action).filter(action => {
        if (filter.parentId !== undefined && action.parentId !== filter.parentId) return false
        if (filter.status !== undefined && action.status !== filter.status) return false
        if (filter.timeCategoryId !== undefined && action.timeCategoryId !== filter.timeCategoryId) return false
        if (filter.timeKind === undefined) return true
        const range = action[filter.timeKind]
        if (range === undefined) return false
        const startAt = Date.parse(range.startAt)
        const endAt = Date.parse(range.endAt)
        return (from === undefined || endAt > from) && (to === undefined || startAt < to)
      })
    },
    async createAction(input) {
      return mutate(async () => {
        const parentId = input.parentId ?? null
        if (parentId !== null) readAction(parentId)
        if (input.timeCategoryId !== undefined) readCategory(input.timeCategoryId)
        const now = new Date().toISOString()
        const action: Action = {
        id: randomUUID(),
        parentId,
        title: normalizeName(input.title, 'action title'),
        note: input.note,
        timeCategoryId: input.timeCategoryId,
        estimatedMinutes: input.estimatedMinutes,
        planned: input.planned === undefined ? undefined : parseTimeRange(input.planned, 'planned'),
        actual: input.actual === undefined ? undefined : parseTimeRange(input.actual, 'actual'),
        actualSource: input.actualSource,
        status: 'active',
        use: input.use ?? 'dedicated',
        preparationReminderId: input.preparationReminderId,
        preparationResultRef: input.preparationResultRef,
        createdAt: now,
        updatedAt: now,
      }
        const record = parseAction(action)
        await actions.put(record.id, record)
        return record
      })
    },
    async updateAction(id, input) {
      return mutate(async () => {
        const current = readAction(id)
        const parentId = input.parentId === undefined ? current.parentId : input.parentId
        if (parentId !== null) {
          let cursor: string | null = parentId
          while (cursor !== null) {
            if (cursor === id) throw new Error('secretary: action cannot be moved beneath itself or a descendant')
            cursor = readAction(cursor).parentId
          }
        }
        const timeCategoryId = patched(input.timeCategoryId, current.timeCategoryId)
        if (timeCategoryId !== undefined) readCategory(timeCategoryId)
        const actualInput = input.actual === undefined || input.actual === null ? input.actual : parseTimeRange(input.actual, 'actual')
        const action: Action = {
        ...current,
        parentId,
        title: input.title === undefined ? current.title : normalizeName(input.title, 'action title'),
        note: patched(input.note, current.note),
        timeCategoryId,
        estimatedMinutes: patched(input.estimatedMinutes, current.estimatedMinutes),
        planned: input.planned === undefined || input.planned === null
          ? patched(input.planned, current.planned)
          : parseTimeRange(input.planned, 'planned'),
        actual: patched(actualInput, current.actual),
        actualSource: input.actual === null
          ? undefined
          : input.actual !== undefined
            ? input.actualSource ?? undefined
            : patched(input.actualSource, current.actualSource),
        status: input.status ?? current.status,
        use: input.use ?? current.use,
        preparationReminderId: patched(input.preparationReminderId, current.preparationReminderId),
        preparationResultRef: patched(input.preparationResultRef, current.preparationResultRef),
        updatedAt: new Date().toISOString(),
      }
        const record = parseAction(action)
        await actions.put(id, record)
        return record
      })
    },
    async completeAction(id, input) {
      return mutate(async () => {
        const current = readAction(id)
        if (input.actual === undefined && current.actual === undefined && input.actualSource !== undefined) {
          throw new Error('secretary: actualSource requires actual time')
        }
        const action: Action = {
        ...current,
        actual: input.actual === undefined ? current.actual : parseTimeRange(input.actual, 'actual'),
        actualSource: input.actual === undefined ? current.actualSource : input.actualSource,
        status: 'completed',
        updatedAt: new Date().toISOString(),
      }
        const record = parseAction(action)
        await actions.put(id, record)
        return detailOf(record)
      })
    },
    async deleteAction(id) {
      return mutate(async () => {
        readAction(id)
        if (hasActionChildren(id)) throw new Error('secretary: cannot delete an action with children')
        await actions.delete(id)
      })
    },
    close: async () => {
      await mutationQueue
      await domain.close()
    },
  }
}
