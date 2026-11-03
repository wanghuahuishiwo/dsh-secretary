import type { Context } from '@deepseek-ai/cordis'
import {
  GtdService,
  type Action,
  type ActionView,
  type CaptureInboxInput,
  type ClarifyInboxInput,
  type ActionInput,
  type ForecastQuery,
  type InboxItem,
  type Project,
  type ProjectInput,
  type UpdateProjectInput,
  type UpdateActionInput,
} from 'dsh-secretary-gtd/contract'
import { normalizeName, objectOf, optionalString, parseInstant, withoutUndefined } from 'dsh-secretary-core/validation'
import type { TagReferenceRegistry, TagService } from 'dsh-secretary-tag/contract'

interface Table<Record> {
  get(key: string): Record | undefined
  entries(): IterableIterator<[string, Record]>
  put(key: string, value: Record): Promise<void>
  delete(key: string): Promise<boolean>
}

interface StorageDomain {
  readonly global: { get(): number; set(value: number): Promise<void> }
  table(name: 'projects'): Table<Project>
  table(name: 'actions'): Table<Action>
  table(name: 'inbox'): Table<InboxItem>
  close(): Promise<void>
}

export interface Config { domain?: string }

export const Config = {
  '~standard': {
    version: 1,
    vendor: 'dsh-secretary-gtd',
    validate(raw: unknown) {
      const value = raw === undefined ? {} : objectOf(raw, 'gtd config')
      const domain = value.domain ?? 'secretary_gtd'
      if (typeof domain !== 'string' || !/^[a-z][a-z0-9_]*$/.test(domain)) {
        return { issues: [{ message: 'secretary: gtd domain must be a lowercase identifier' }] }
      }
      for (const key of Object.keys(value)) {
        if (key !== 'domain') return { issues: [{ message: `secretary: unknown gtd config field ${key}` }] }
      }
      return { value: { domain } }
    },
  },
}

function parseId(raw: unknown, label: string): number {
  if (!Number.isSafeInteger(raw) || (raw as number) <= 0) throw new Error(`secretary: ${label} must be a positive integer`)
  return raw as number
}

function parseTagIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) throw new Error('secretary: tagIds must be an array of positive integers')
  const ids = raw.map(id => parseId(id, 'tag id'))
  if (new Set(ids).size !== ids.length) throw new Error('secretary: tagIds must not contain duplicates')
  return ids
}

function parseProject(raw: unknown): Project {
  const project = objectOf(raw, 'project') as unknown as Project
  parseId(project.id, 'project id')
  normalizeName(project.title, 'project title')
  if (!['parallel', 'sequential', 'single_action_list'].includes(project.type)) throw new Error('secretary: invalid project type')
  if (!['active', 'on-hold', 'completed', 'dropped'].includes(project.status)) throw new Error('secretary: invalid project status')
  if (project.type !== 'single_action_list') normalizeName(project.outcome, 'project outcome')
  else if (project.outcome !== undefined) optionalString(project.outcome, 'project outcome')
  parseTagIds(project.tagIds)
  return project
}

function parseEstimatedMinutes(raw: unknown): number | undefined {
  if (raw === undefined) return undefined
  if (!Number.isSafeInteger(raw) || (raw as number) <= 0) {
    throw new Error('secretary: estimatedMinutes must be a positive integer')
  }
  return raw as number
}

function parseAction(raw: unknown): Action {
  const action = objectOf(raw, 'action') as unknown as Action
  parseId(action.id, 'action id')
  if (action.projectId !== undefined) parseId(action.projectId, 'projectId')
  if (action.parentActionId !== undefined) parseId(action.parentActionId, 'parentActionId')
  if (!Number.isSafeInteger(action.position) || action.position < 0) throw new Error('secretary: invalid stored action position')
  normalizeName(action.title, 'action title')
  if (!['active', 'completed', 'dropped'].includes(action.status)) throw new Error('secretary: invalid action status')
  if (action.status === 'completed' && !action.completedAt) throw new Error('secretary: completed action needs completedAt')
  if (action.status === 'dropped' && !action.droppedAt) throw new Error('secretary: dropped action needs droppedAt')
  parseTagIds(action.tagIds)
  for (const field of ['deferAt', 'plannedAt', 'dueAt', 'completedAt', 'droppedAt'] as const) {
    if (action[field] !== undefined) parseInstant(action[field], field)
  }
  parseEstimatedMinutes(action.estimatedMinutes)
  return action
}

function parseInbox(raw: unknown): InboxItem {
  const item = objectOf(raw, 'inbox item') as unknown as InboxItem
  parseId(item.id, 'inbox id')
  normalizeName(item.title, 'inbox title')
  if (!item.raw || item.status !== 'open') throw new Error('secretary: invalid stored inbox item')
  return item
}

function validateDate(raw: unknown): string {
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new Error('secretary: date must be YYYY-MM-DD')
  const date = new Date(`${raw}T00:00:00Z`)
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== raw) throw new Error('secretary: invalid date')
  return raw
}

function validateTimeZone(raw: unknown): string {
  if (typeof raw !== 'string') throw new Error('secretary: timeZone must be a string')
  try { new Intl.DateTimeFormat('en-US', { timeZone: raw }).format() } catch { throw new Error('secretary: invalid timeZone') }
  return raw
}

function dateAtInstant(instant: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(instant))
  const field = (type: string) => parts.find(part => part.type === type)?.value
  return `${field('year')}-${field('month')}-${field('day')}`
}

export class SQLiteGtdService extends GtdService {
  static inject = ['secretaryStorageDomain', 'tags', 'tagReferences']

  private readonly ready: Promise<StorageDomain>
  private readonly context: Context
  private queue: Promise<unknown> = Promise.resolve()

  constructor(ctx: Context, config: Config = {}) {
    super(ctx)
    this.context = ctx
    this.ready = (ctx as Context & { secretaryStorageDomain: { open(spec: unknown): Promise<StorageDomain> } }).secretaryStorageDomain.open({
      name: config.domain ?? 'secretary_gtd',
      version: 1,
      tables: {
        projects: { valueSchema: { parse: parseProject } },
        actions: { valueSchema: { parse: parseAction } },
        inbox: { valueSchema: { parse: parseInbox } },
      },
      global: { initial: 1, schema: { parse(value: unknown) {
        if (!Number.isSafeInteger(value) || (value as number) <= 0) throw new Error('secretary: invalid stored gtd sequence')
        return value
      } } },
    })
    ctx.effect(async () => {
      const domain = await this.ready
      return async () => {
        await this.queue
        await domain.close()
      }
    })
    ctx.effect(() => (ctx as Context & { tagReferences: TagReferenceRegistry }).tagReferences.register({
      hasReferences: async tagId => {
        const domain = await this.ready
        if ([...domain.table('projects').entries()].some(([, project]) => project.tagIds.includes(tagId))) return true
        return [...domain.table('actions').entries()].some(([, action]) => action.tagIds.includes(tagId))
      },
    }), 'secretary: GTD tag reference inspector')
  }

  private get tags(): TagService {
    return (this.context as Context & { tags: TagService }).tags
  }

  private mutate<Outcome>(operation: () => Promise<Outcome>): Promise<Outcome> {
    const result = this.queue.then(operation)
    this.queue = result.then(() => undefined, () => undefined)
    return result
  }

  private mutateWithTags<Outcome>(operation: () => Promise<Outcome>): Promise<Outcome> {
    return this.tags.withReferenceConsistency(() => this.mutate(operation))
  }

  private async allocateId(domain: StorageDomain): Promise<number> {
    const id = domain.global.get()
    await domain.global.set(id + 1)
    return id
  }

  private async validateTagIds(ids: readonly number[]): Promise<number[]> {
    const parsed = parseTagIds(ids)
    for (const id of parsed) await this.tags.getTag(id)
    return parsed
  }

  private async validateProjectTagIds(ids: readonly number[]): Promise<number[]> {
    const parsed = await this.validateTagIds(ids)
    const tags = await Promise.all(parsed.map(id => this.tags.getTag(id)))
    if (tags.filter(tag => tag.kind === 'time').length !== 1) {
      throw new Error('secretary: project requires exactly one direct time tag')
    }
    return parsed
  }

  private view(action: Action, project: Project | undefined, actions: Action[]): ActionView {
    const now = Date.now()
    const byId = new Map(actions.map(item => [item.id, item]))
    const ancestors: Action[] = []
    const visited = new Set<number>([action.id])
    for (let parentId = action.parentActionId; parentId !== undefined;) {
      const parent = byId.get(parentId)
      if (parent === undefined) throw new Error(`secretary: action "${action.id}" has no parent action`)
      if (visited.has(parent.id)) throw new Error(`secretary: action "${action.id}" has a cyclic parent hierarchy`)
      visited.add(parent.id)
      ancestors.push(parent)
      parentId = parent.parentActionId
    }
    const effectiveTags = [...new Set([
      ...action.tagIds,
      ...ancestors.flatMap(parent => parent.tagIds),
      ...(project?.tagIds ?? []),
    ])]
    let availability: ActionView['availability'] = 'available'
    if (action.status !== 'active' || (project !== undefined && project.status !== 'active')
      || ancestors.some(parent => parent.status !== 'active')) availability = 'unavailable'
    else if ([action, ...ancestors].some(item => item.deferAt !== undefined && Date.parse(item.deferAt) > now)
      || (project?.type === 'sequential' && actions.some(other =>
        other.projectId === action.projectId && other.parentActionId === action.parentActionId
        && other.position < action.position && other.status === 'active'))) {
      availability = 'blocked'
    }
    return { ...action, availability, effectiveTags }
  }

  private snapshot(domain: StorageDomain, action: Action): ActionView {
    const project = action.projectId === undefined ? undefined : domain.table('projects').get(String(action.projectId))
    if (action.projectId !== undefined && project === undefined) throw new Error(`secretary: action "${action.id}" has no project`)
    return this.view(action, project, [...domain.table('actions').entries()].map(([, item]) => item))
  }

  async captureInbox(input: CaptureInboxInput): Promise<InboxItem> {
    const title = normalizeName(input.title, 'inbox title')
    if (typeof input.raw !== 'string' || input.raw.trim() === '') throw new Error('secretary: inbox raw must not be empty')
    const source = normalizeName(input.source, 'inbox source')
    return this.mutate(async () => {
      const domain = await this.ready
      const item: InboxItem = {
        id: await this.allocateId(domain), title, raw: input.raw, source, status: 'open', createdAt: new Date().toISOString(),
      }
      await domain.table('inbox').put(String(item.id), item)
      return item
    })
  }

  async listInbox(): Promise<InboxItem[]> {
    const domain = await this.ready
    return [...domain.table('inbox').entries()].map(([, item]) => item).sort((a, b) => a.id - b.id)
  }

  async deleteInbox(id: number): Promise<InboxItem> {
    return this.mutate(async () => {
      const domain = await this.ready
      const item = domain.table('inbox').get(String(id))
      if (item === undefined) throw new Error(`secretary: no open inbox item "${id}"`)
      await domain.table('inbox').delete(String(id))
      return item
    })
  }

  async clarifyInbox(input: ClarifyInboxInput): Promise<{ project?: Project; action: ActionView }> {
    return this.mutateWithTags(async () => {
      const domain = await this.ready
      const inbox = domain.table('inbox').get(String(input.id))
      if (inbox === undefined) throw new Error(`secretary: no open inbox item "${input.id}"`)
      const now = new Date().toISOString()
      let project: Project | undefined
      if (input.project !== undefined) {
        project = withoutUndefined({
          id: await this.allocateId(domain),
          title: normalizeName(input.project.title, 'project title'),
          outcome: input.project.outcome === undefined ? undefined : optionalString(input.project.outcome, 'project outcome'),
          type: input.project.type,
          status: 'active',
          tagIds: await this.validateProjectTagIds(input.project.tagIds ?? []),
          createdAt: now,
          updatedAt: now,
        })
        parseProject(project)
      } else if (input.action.projectId !== undefined || input.action.parentActionId !== undefined) {
        throw new Error('secretary: standalone clarification cannot assign a project or parent action')
      }
      const action: Action = withoutUndefined({
        id: await this.allocateId(domain),
        projectId: project?.id,
        position: 0,
        title: normalizeName(input.action.title, 'action title'),
        note: optionalString(input.action.note, 'action note'),
        status: 'active',
        tagIds: await this.validateTagIds(input.action.tagIds ?? []),
        deferAt: input.action.deferAt === undefined ? undefined : parseInstant(input.action.deferAt, 'deferAt'),
        plannedAt: input.action.plannedAt === undefined ? undefined : parseInstant(input.action.plannedAt, 'plannedAt'),
        dueAt: input.action.dueAt === undefined ? undefined : parseInstant(input.action.dueAt, 'dueAt'),
        estimatedMinutes: parseEstimatedMinutes(input.action.estimatedMinutes),
        createdAt: now,
        updatedAt: now,
      })
      if (project === undefined) {
        const tags = await Promise.all(action.tagIds.map(id => this.tags.getTag(id)))
        if (!tags.some(tag => tag.kind === 'time')) throw new Error('secretary: standalone action requires its own time tag')
      }
      try {
        if (project !== undefined) await domain.table('projects').put(String(project.id), project)
        await domain.table('actions').put(String(action.id), action)
        if (!await domain.table('inbox').delete(String(inbox.id))) {
          throw new Error(`secretary: inbox item "${inbox.id}" disappeared during clarification`)
        }
      } catch (error) {
        const rollbackErrors: unknown[] = []
        for (const [table, id] of [['actions', action.id], ['projects', project?.id]] as const) {
          if (id === undefined) continue
          try { await domain.table(table).delete(String(id)) } catch (rollbackError) { rollbackErrors.push(rollbackError) }
        }
        if (rollbackErrors.length > 0) {
          throw new Error(`secretary: clarification failed (${String(error)}); rollback failed: ${rollbackErrors.map(String).join('; ')}`, { cause: error })
        }
        throw error
      }
      return withoutUndefined({ project, action: this.snapshot(domain, action) })
    })
  }

  async listProjects(): Promise<Project[]> {
    const domain = await this.ready
    return [...domain.table('projects').entries()].map(([, project]) => project).sort((a, b) => a.id - b.id)
  }

  async getProject(id: number): Promise<Project> {
    const domain = await this.ready
    const project = domain.table('projects').get(String(id))
    if (project === undefined) throw new Error(`secretary: no project "${id}"`)
    return project
  }

  async createProject(input: ProjectInput): Promise<Project> {
    return this.mutateWithTags(async () => {
      const domain = await this.ready
      const now = new Date().toISOString()
      const project: Project = withoutUndefined({
        id: await this.allocateId(domain), title: normalizeName(input.title, 'project title'),
        outcome: input.outcome === undefined ? undefined : optionalString(input.outcome, 'project outcome'),
        type: input.type, status: 'active', tagIds: await this.validateProjectTagIds(input.tagIds ?? []),
        createdAt: now, updatedAt: now,
      })
      parseProject(project)
      await domain.table('projects').put(String(project.id), project)
      return project
    })
  }

  async updateProject(id: number, input: UpdateProjectInput): Promise<Project> {
    return this.mutateWithTags(async () => {
      const domain = await this.ready
      const current = domain.table('projects').get(String(id))
      if (current === undefined) throw new Error(`secretary: no project "${id}"`)
      const project: Project = withoutUndefined({
        ...current,
        title: input.title === undefined ? current.title : normalizeName(input.title, 'project title'),
        outcome: input.outcome === null ? undefined : input.outcome === undefined ? current.outcome : optionalString(input.outcome, 'project outcome'),
        type: input.type ?? current.type,
        status: input.status ?? current.status,
        tagIds: input.tagIds === undefined ? current.tagIds : await this.validateProjectTagIds(input.tagIds),
        updatedAt: new Date().toISOString(),
      })
      parseProject(project)
      await domain.table('projects').put(String(id), project)
      return project
    })
  }

  async deleteProject(id: number): Promise<Project> {
    return this.mutate(async () => {
      const domain = await this.ready
      const project = domain.table('projects').get(String(id))
      if (project === undefined) throw new Error(`secretary: no project "${id}"`)
      const hasActions = [...domain.table('actions').entries()].some(([, action]) => action.projectId === id)
      if (hasActions) throw new Error('secretary: cannot delete a project with actions')
      await domain.table('projects').delete(String(id))
      return project
    })
  }

  async listActions(): Promise<ActionView[]> {
    const domain = await this.ready
    return [...domain.table('actions').entries()].map(([, action]) => this.snapshot(domain, action))
      .sort((a, b) => a.id - b.id)
  }

  async listNextActions(): Promise<ActionView[]> {
    const actions = await this.listActions()
    const parents = new Set(actions.map(action => action.parentActionId).filter(id => id !== undefined))
    return actions.filter(action => action.availability === 'available' && !parents.has(action.id))
  }

  async listForecast(query: ForecastQuery): Promise<ActionView[]> {
    const date = validateDate(query.date)
    const timeZone = validateTimeZone(query.timeZone)
    return (await this.listActions()).filter(action =>
      [action.deferAt, action.plannedAt, action.dueAt].some(instant =>
        instant !== undefined && dateAtInstant(instant, timeZone) === date))
  }

  async createAction(input: ActionInput): Promise<ActionView> {
    return this.mutateWithTags(async () => {
      const domain = await this.ready
      const parent = input.parentActionId === undefined ? undefined : domain.table('actions').get(String(input.parentActionId))
      if (input.parentActionId !== undefined && parent === undefined) throw new Error(`secretary: no parent action "${input.parentActionId}"`)
      if (parent !== undefined && input.projectId !== undefined && input.projectId !== parent.projectId) {
        throw new Error('secretary: child action must belong to the same project as its parent')
      }
      const projectId = parent?.projectId ?? input.projectId
      const project = projectId === undefined ? undefined : domain.table('projects').get(String(projectId))
      if (projectId !== undefined && project === undefined) throw new Error(`secretary: no project "${projectId}"`)
      const tagIds = await this.validateTagIds(input.tagIds ?? [])
      if (project === undefined && parent === undefined) {
        const tags = await Promise.all(tagIds.map(id => this.tags.getTag(id)))
        if (!tags.some(tag => tag.kind === 'time')) throw new Error('secretary: standalone action requires its own time tag')
      }
      const siblings = [...domain.table('actions').entries()].map(([, item]) => item)
        .filter(item => item.projectId === projectId && item.parentActionId === input.parentActionId)
      const now = new Date().toISOString()
      const action: Action = withoutUndefined({
        id: await this.allocateId(domain), projectId, parentActionId: parent?.id,
        position: siblings.length === 0 ? 0 : Math.max(...siblings.map(item => item.position)) + 1,
        title: normalizeName(input.title, 'action title'), note: optionalString(input.note, 'action note'),
        status: 'active', tagIds,
        deferAt: input.deferAt === undefined ? undefined : parseInstant(input.deferAt, 'deferAt'),
        plannedAt: input.plannedAt === undefined ? undefined : parseInstant(input.plannedAt, 'plannedAt'),
        dueAt: input.dueAt === undefined ? undefined : parseInstant(input.dueAt, 'dueAt'),
        estimatedMinutes: parseEstimatedMinutes(input.estimatedMinutes), createdAt: now, updatedAt: now,
      })
      await domain.table('actions').put(String(action.id), action)
      return this.snapshot(domain, action)
    })
  }

  async getAction(id: number): Promise<ActionView> {
    const domain = await this.ready
    const action = domain.table('actions').get(String(id))
    if (action === undefined) throw new Error(`secretary: no action "${id}"`)
    return this.snapshot(domain, action)
  }

  async getEffectiveTags(id: number): Promise<number[]> {
    return [...(await this.getAction(id)).effectiveTags]
  }

  async updateAction(id: number, input: UpdateActionInput): Promise<ActionView> {
    return this.mutateWithTags(async () => {
      const domain = await this.ready
      const current = domain.table('actions').get(String(id))
      if (current === undefined) throw new Error(`secretary: no action "${id}"`)
      const action: Action = withoutUndefined({
        ...current,
        title: input.title === undefined ? current.title : normalizeName(input.title, 'action title'),
        note: input.note === null ? undefined : input.note ?? current.note,
        tagIds: input.tagIds === undefined ? current.tagIds : await this.validateTagIds(input.tagIds),
        deferAt: input.deferAt === null ? undefined : input.deferAt === undefined ? current.deferAt : parseInstant(input.deferAt, 'deferAt'),
        plannedAt: input.plannedAt === null ? undefined : input.plannedAt === undefined ? current.plannedAt : parseInstant(input.plannedAt, 'plannedAt'),
        dueAt: input.dueAt === null ? undefined : input.dueAt === undefined ? current.dueAt : parseInstant(input.dueAt, 'dueAt'),
        estimatedMinutes: input.estimatedMinutes === null
          ? undefined
          : input.estimatedMinutes === undefined ? current.estimatedMinutes : parseEstimatedMinutes(input.estimatedMinutes),
        preparationReminderId: input.preparationReminderId === null ? undefined : input.preparationReminderId ?? current.preparationReminderId,
        preparationResultRef: input.preparationResultRef === null ? undefined : input.preparationResultRef ?? current.preparationResultRef,
        updatedAt: new Date().toISOString(),
      })
      if (action.projectId === undefined && action.parentActionId === undefined) {
        const tags = await Promise.all(action.tagIds.map(tagId => this.tags.getTag(tagId)))
        if (!tags.some(tag => tag.kind === 'time')) throw new Error('secretary: standalone action requires its own time tag')
      }
      await domain.table('actions').put(String(id), action)
      return this.snapshot(domain, action)
    })
  }

  async deleteAction(id: number): Promise<Action> {
    return this.mutate(async () => {
      const domain = await this.ready
      const action = domain.table('actions').get(String(id))
      if (action === undefined) throw new Error(`secretary: no action "${id}"`)
      const hasChildren = [...domain.table('actions').entries()].some(([, item]) => item.parentActionId === id)
      if (hasChildren) throw new Error('secretary: cannot delete an action with children')
      await domain.table('actions').delete(String(id))
      return action
    })
  }

  async completeAction(id: number, completedAt: string): Promise<ActionView> {
    return this.mutate(async () => {
      const domain = await this.ready
      const current = domain.table('actions').get(String(id))
      if (current === undefined) throw new Error(`secretary: no action "${id}"`)
      if (current.status !== 'active') throw new Error(`secretary: action "${id}" is not active`)
      const action: Action = {
        ...current,
        status: 'completed',
        completedAt: parseInstant(completedAt, 'completedAt'),
        updatedAt: new Date().toISOString(),
      }
      await domain.table('actions').put(String(id), action)
      return this.snapshot(domain, action)
    })
  }

  async dropAction(id: number, droppedAt: string): Promise<ActionView> {
    return this.mutate(async () => {
      const domain = await this.ready
      const current = domain.table('actions').get(String(id))
      if (current === undefined) throw new Error(`secretary: no action "${id}"`)
      if (current.status !== 'active') throw new Error(`secretary: action "${id}" is not active`)
      const action: Action = withoutUndefined({
        ...current, status: 'dropped', completedAt: undefined,
        droppedAt: parseInstant(droppedAt, 'droppedAt'), updatedAt: new Date().toISOString(),
      })
      await domain.table('actions').put(String(id), action)
      return this.snapshot(domain, action)
    })
  }
}

export const name = 'dsh-secretary-gtd'
export const inject = ['secretaryStorageDomain', 'tags', 'tagReferences']

export function apply(ctx: Context, config: Config = {}): void {
  ctx.plugin(SQLiteGtdService, config)
}
