import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import {
  GtdService,
  type Action,
  type ActionView,
  type CaptureInboxInput,
  type ClarifyInboxInput,
  type InboxItem,
  type Project,
  type UpdateActionInput,
} from 'dsh-secretary-gtd/contract'
import { normalizeName, objectOf, optionalString, parseInstant, withoutUndefined } from 'dsh-secretary-core/validation'

interface Table<Record> {
  readonly size: number
  get(key: string): Record | undefined
  entries(): IterableIterator<[string, Record]>
  put(key: string, value: Record): Promise<void>
  delete(key: string): Promise<boolean>
}

interface StorageDomain {
  table(name: 'projects'): Table<Project>
  table(name: 'actions'): Table<Action>
  table(name: 'inbox'): Table<InboxItem>
  close(): Promise<void>
}

export interface Config {
  domain?: string
}

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

function parseProject(raw: unknown): Project {
  const value = objectOf(raw, 'project')
  const project = value as unknown as Project
  if (!project.id || !project.title || !project.outcome) throw new Error('secretary: invalid stored project')
  if (!['parallel', 'sequential', 'single_action_list'].includes(project.type)) throw new Error('secretary: invalid project type')
  if (!['active', 'on-hold', 'completed', 'dropped'].includes(project.status)) throw new Error('secretary: invalid project status')
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
  const value = objectOf(raw, 'action')
  const action = value as unknown as Action
  if (!action.id || !action.projectId || !Number.isSafeInteger(action.position) || action.position < 0) {
    throw new Error('secretary: invalid stored action identity')
  }
  normalizeName(action.title, 'action title')
  if (!['active', 'completed', 'dropped'].includes(action.status)) throw new Error('secretary: invalid action status')
  if (action.status === 'completed' && !action.completedAt) throw new Error('secretary: completed action needs completedAt')
  if (action.status === 'dropped' && !action.droppedAt) throw new Error('secretary: dropped action needs droppedAt')
  parseEstimatedMinutes(action.estimatedMinutes)
  return action
}

function parseInbox(raw: unknown): InboxItem {
  const value = objectOf(raw, 'inbox item')
  const item = value as unknown as InboxItem
  if (!item.id || !item.raw || item.status !== 'open') throw new Error('secretary: invalid stored inbox item')
  return item
}

export class SQLiteGtdService extends GtdService {
  static inject = ['secretaryStorageDomain']

  private readonly ready: Promise<StorageDomain>
  private queue: Promise<unknown> = Promise.resolve()

  constructor(ctx: Context, config: Config = {}) {
    super(ctx)
    const domainName = config.domain ?? 'secretary_gtd'
    this.ready = (ctx as Context & { secretaryStorageDomain: { open(spec: unknown): Promise<StorageDomain> } }).secretaryStorageDomain.open({
      name: domainName,
      version: 1,
      tables: {
        projects: { valueSchema: { parse: parseProject } },
        actions: { valueSchema: { parse: parseAction } },
        inbox: { valueSchema: { parse: parseInbox } },
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

  private view(action: Action, project: Project, actions: Action[]): ActionView {
    const now = Date.now()
    let availability: ActionView['availability'] = 'available'
    if (action.status !== 'active' || project.status !== 'active') availability = 'unavailable'
    else if ((action.deferAt !== undefined && Date.parse(action.deferAt) > now)
      || (project.type === 'sequential' && actions.some(other =>
        other.projectId === action.projectId && other.position < action.position && other.status === 'active'))) {
      availability = 'blocked'
    }
    return { ...action, availability }
  }

  async captureInbox(input: CaptureInboxInput): Promise<InboxItem> {
    const title = normalizeName(input.title, 'inbox title')
    if (typeof input.raw !== 'string' || input.raw.trim() === '') throw new Error('secretary: inbox raw must not be empty')
    const source = normalizeName(input.source, 'inbox source')
    return this.mutate(async () => {
      const domain = await this.ready
      const item: InboxItem = {
        id: randomUUID(), title, raw: input.raw, source, status: 'open', createdAt: new Date().toISOString(),
      }
      await domain.table('inbox').put(item.id, item)
      return item
    })
  }

  async listInbox(): Promise<InboxItem[]> {
    const domain = await this.ready
    return [...domain.table('inbox').entries()].map(([, item]) => item)
  }

  async clarifyInbox(input: ClarifyInboxInput): Promise<{ project: Project; action: ActionView }> {
    return this.mutate(async () => {
      const domain = await this.ready
      const inbox = domain.table('inbox').get(input.id)
      if (inbox === undefined) throw new Error(`secretary: no open inbox item "${input.id}"`)
      const now = new Date().toISOString()
      const project: Project = {
        id: randomUUID(),
        title: normalizeName(input.project.title, 'project title'),
        outcome: normalizeName(input.project.outcome, 'project outcome'),
        type: input.project.type,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      }
      parseProject(project)
      const action: Action = withoutUndefined({
        id: randomUUID(),
        projectId: project.id,
        position: 0,
        title: normalizeName(input.action.title, 'action title'),
        note: optionalString(input.action.note, 'action note'),
        status: 'active',
        deferAt: input.action.deferAt === undefined ? undefined : parseInstant(input.action.deferAt, 'deferAt'),
        dueAt: input.action.dueAt === undefined ? undefined : parseInstant(input.action.dueAt, 'dueAt'),
        estimatedMinutes: parseEstimatedMinutes(input.action.estimatedMinutes),
        createdAt: now,
        updatedAt: now,
      })
      try {
        await domain.table('projects').put(project.id, project)
        await domain.table('actions').put(action.id, action)
        if (!await domain.table('inbox').delete(inbox.id)) {
          throw new Error(`secretary: inbox item "${inbox.id}" disappeared during clarification`)
        }
      } catch (error) {
        const rollbackErrors: unknown[] = []
        for (const [table, id] of [['actions', action.id], ['projects', project.id]] as const) {
          try {
            await domain.table(table).delete(id)
          } catch (rollbackError) {
            rollbackErrors.push(rollbackError)
          }
        }
        if (rollbackErrors.length > 0) {
          throw new Error(`secretary: clarification failed (${String(error)}); rollback failed: ${rollbackErrors.map(String).join('; ')}`, { cause: error })
        }
        throw error
      }
      return { project, action: this.view(action, project, [action]) }
    })
  }

  async listProjects(): Promise<Project[]> {
    const domain = await this.ready
    return [...domain.table('projects').entries()].map(([, project]) => project)
  }

  async listActions(): Promise<ActionView[]> {
    const domain = await this.ready
    const projects = domain.table('projects')
    const actions = [...domain.table('actions').entries()].map(([, action]) => action)
    return actions.map(action => {
      const project = projects.get(action.projectId)
      if (project === undefined) throw new Error(`secretary: action "${action.id}" has no project`)
      return this.view(action, project, actions)
    })
  }

  async getAction(id: string): Promise<ActionView> {
    const domain = await this.ready
    const action = domain.table('actions').get(id)
    if (action === undefined) throw new Error(`secretary: no action "${id}"`)
    const project = domain.table('projects').get(action.projectId)
    if (project === undefined) throw new Error(`secretary: action "${id}" has no project`)
    const actions = [...domain.table('actions').entries()].map(([, item]) => item)
    return this.view(action, project, actions)
  }

  async updateAction(id: string, input: UpdateActionInput): Promise<ActionView> {
    return this.mutate(async () => {
      const domain = await this.ready
      const current = domain.table('actions').get(id)
      if (current === undefined) throw new Error(`secretary: no action "${id}"`)
      const action: Action = withoutUndefined({
        ...current,
        title: input.title === undefined ? current.title : normalizeName(input.title, 'action title'),
        note: input.note === null ? undefined : input.note ?? current.note,
        deferAt: input.deferAt === null ? undefined : input.deferAt === undefined ? current.deferAt : parseInstant(input.deferAt, 'deferAt'),
        dueAt: input.dueAt === null ? undefined : input.dueAt === undefined ? current.dueAt : parseInstant(input.dueAt, 'dueAt'),
        estimatedMinutes: input.estimatedMinutes === null
          ? undefined
          : input.estimatedMinutes === undefined ? current.estimatedMinutes : parseEstimatedMinutes(input.estimatedMinutes),
        preparationReminderId: input.preparationReminderId === null ? undefined : input.preparationReminderId ?? current.preparationReminderId,
        preparationResultRef: input.preparationResultRef === null ? undefined : input.preparationResultRef ?? current.preparationResultRef,
        updatedAt: new Date().toISOString(),
      })
      await domain.table('actions').put(id, action)
      const project = domain.table('projects').get(action.projectId)
      if (project === undefined) throw new Error(`secretary: action "${id}" has no project`)
      const actions = [...domain.table('actions').entries()].map(([, item]) => item)
      return this.view(action, project, actions)
    })
  }

  async completeAction(id: string, completedAt: string): Promise<ActionView> {
    return this.mutate(async () => {
      const domain = await this.ready
      const current = domain.table('actions').get(id)
      if (current === undefined) throw new Error(`secretary: no action "${id}"`)
      const action: Action = {
        ...current,
        status: 'completed',
        completedAt: parseInstant(completedAt, 'completedAt'),
        updatedAt: new Date().toISOString(),
      }
      await domain.table('actions').put(id, action)
      const project = domain.table('projects').get(action.projectId)
      if (project === undefined) throw new Error(`secretary: action "${id}" has no project`)
      return this.view(action, project, [...domain.table('actions').entries()].map(([, item]) => item))
    })
  }
}

export const name = 'dsh-secretary-gtd'
export const inject = ['secretaryStorageDomain']

export function apply(ctx: Context, config: Config = {}): void {
  ctx.plugin(SQLiteGtdService, config)
}
