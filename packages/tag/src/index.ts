import type { Context } from '@deepseek-ai/cordis'
import { normalizeName, objectOf, optionalString, withoutUndefined } from 'dsh-secretary-core/validation'
import { TagService, type CreateTagInput, type Tag, type TagKind, type TagReferenceInspector, type UpdateTagInput } from 'dsh-secretary-tag/contract'

interface Table<Record> {
  readonly size: number
  get(key: string): Record | undefined
  entries(): IterableIterator<[string, Record]>
  put(key: string, value: Record): Promise<void>
  delete(key: string): Promise<boolean>
}

interface StorageDomain {
  readonly global: { get(): number; set(value: number): Promise<void> }
  table(name: 'tags'): Table<Tag>
  close(): Promise<void>
}

export interface Config { domain?: string }
export const Config = {
  '~standard': {
    version: 1,
    vendor: 'dsh-secretary-tag',
    validate(raw: unknown) {
      const value = raw === undefined ? {} : objectOf(raw, 'tag config')
      const domain = value.domain ?? 'secretary_tag'
      if (typeof domain !== 'string' || !/^[a-z][a-z0-9_]*$/.test(domain)) {
        return { issues: [{ message: 'secretary: tag domain must be a lowercase identifier' }] }
      }
      for (const key of Object.keys(value)) {
        if (key !== 'domain') return { issues: [{ message: `secretary: unknown tag config field ${key}` }] }
      }
      return { value: { domain } }
    },
  },
}

function parseKind(raw: unknown): TagKind {
  if (raw !== 'time' && raw !== 'context') throw new Error('secretary: tag kind must be time or context')
  return raw
}

function parseTag(raw: unknown): Tag {
  const tag = objectOf(raw, 'tag') as unknown as Tag
  if (!Number.isSafeInteger(tag.id) || tag.id <= 0) throw new Error('secretary: invalid stored tag id')
  normalizeName(tag.name, 'tag name')
  parseKind(tag.kind)
  if (tag.parentId !== undefined && (!Number.isSafeInteger(tag.parentId) || tag.parentId <= 0)) {
    throw new Error('secretary: invalid stored tag parentId')
  }
  optionalString(tag.color, 'tag color')
  return tag
}

export class SQLiteTagService extends TagService {
  static inject = ['secretaryStorageDomain']
  private readonly ready: Promise<StorageDomain>
  private readonly inspectors = new Set<TagReferenceInspector>()
  private queue: Promise<unknown> = Promise.resolve()

  constructor(ctx: Context, config: Config = {}) {
    super(ctx)
    ctx.provide('tagReferences', {
      register: (inspector: TagReferenceInspector) => {
        this.inspectors.add(inspector)
        return () => { this.inspectors.delete(inspector) }
      },
    })
    this.ready = (ctx as Context & { secretaryStorageDomain: { open(spec: unknown): Promise<StorageDomain> } }).secretaryStorageDomain.open({
      name: config.domain ?? 'secretary_tag',
      version: 1,
      tables: { tags: { valueSchema: { parse: parseTag } } },
      global: { initial: 1, schema: { parse(value: unknown) {
        if (!Number.isSafeInteger(value) || (value as number) <= 0) throw new Error('secretary: invalid stored tag sequence')
        return value
      } } },
    })
    ctx.effect(async () => {
      const domain = await this.ready
      return async () => { await this.queue; await domain.close() }
    })
  }

  private mutate<Outcome>(operation: () => Promise<Outcome>): Promise<Outcome> {
    const result = this.queue.then(operation)
    this.queue = result.then(() => undefined, () => undefined)
    return result
  }

  async createTag(input: CreateTagInput): Promise<Tag> {
    return this.mutate(async () => {
      const domain = await this.ready
      const parent = input.parentId === undefined ? undefined : domain.table('tags').get(String(input.parentId))
      if (input.parentId !== undefined && parent === undefined) throw new Error(`secretary: no parent tag "${input.parentId}"`)
      const kind = parent?.kind ?? parseKind(input.kind)
      if (parent !== undefined && input.kind !== undefined && parseKind(input.kind) !== parent.kind) {
        throw new Error('secretary: child tag must have the same kind as its parent')
      }
      const id = domain.global.get()
      const tag: Tag = withoutUndefined({
        id,
        name: normalizeName(input.name, 'tag name'),
        kind,
        parentId: parent?.id,
        color: optionalString(input.color, 'tag color'),
      })
      await domain.global.set(id + 1)
      await domain.table('tags').put(String(id), tag)
      return tag
    })
  }

  async getTag(id: number): Promise<Tag> {
    const domain = await this.ready
    const tag = domain.table('tags').get(String(id))
    if (tag === undefined) throw new Error(`secretary: no tag "${id}"`)
    return tag
  }

  async listTags(kind?: TagKind): Promise<Tag[]> {
    const domain = await this.ready
    if (kind !== undefined) parseKind(kind)
    return [...domain.table('tags').entries()]
      .map(([, tag]) => tag)
      .filter(tag => kind === undefined || tag.kind === kind)
      .sort((a, b) => a.id - b.id)
  }

  async updateTag(id: number, input: UpdateTagInput): Promise<Tag> {
    return this.mutate(async () => {
      const domain = await this.ready
      const current = domain.table('tags').get(String(id))
      if (current === undefined) throw new Error(`secretary: no tag "${id}"`)
      const tag: Tag = withoutUndefined({
        ...current,
        name: input.name === undefined ? current.name : normalizeName(input.name, 'tag name'),
        color: input.color === null ? undefined : input.color === undefined ? current.color : optionalString(input.color, 'tag color'),
      })
      await domain.table('tags').put(String(id), tag)
      return tag
    })
  }

  async moveTag(id: number, parentId: number | null): Promise<Tag> {
    return this.mutate(async () => {
      const domain = await this.ready
      const current = domain.table('tags').get(String(id))
      if (current === undefined) throw new Error(`secretary: no tag "${id}"`)
      const parent = parentId === null ? undefined : domain.table('tags').get(String(parentId))
      if (parentId !== null && parent === undefined) throw new Error(`secretary: no parent tag "${parentId}"`)
      if (parent !== undefined && parent.kind !== current.kind) {
        throw new Error('secretary: cannot move a tag across kinds')
      }
      for (let ancestor = parent; ancestor !== undefined;) {
        if (ancestor.id === current.id) throw new Error('secretary: moving a tag below its descendant would create a cycle')
        ancestor = ancestor.parentId === undefined ? undefined : domain.table('tags').get(String(ancestor.parentId))
      }
      const tag: Tag = withoutUndefined({ ...current, parentId: parent?.id })
      await domain.table('tags').put(String(id), tag)
      return tag
    })
  }

  async deleteTag(id: number): Promise<Tag> {
    return this.mutate(async () => {
      const domain = await this.ready
      const tag = domain.table('tags').get(String(id))
      if (tag === undefined) throw new Error(`secretary: no tag "${id}"`)
      const hasChildren = [...domain.table('tags').entries()].some(([, candidate]) => candidate.parentId === id)
      if (hasChildren) throw new Error('secretary: cannot delete a tag with children')
      for (const inspector of this.inspectors) {
        if (await inspector.hasReferences(id)) throw new Error(`secretary: cannot delete referenced tag "${id}"`)
      }
      await domain.table('tags').delete(String(id))
      return tag
    })
  }

  async withReferenceConsistency<Outcome>(operation: () => Promise<Outcome>): Promise<Outcome> {
    return this.mutate(operation)
  }
}

export const name = 'dsh-secretary-tag'
export const inject = ['secretaryStorageDomain']
export function apply(ctx: Context, config: Config = {}): void {
  ctx.plugin(SQLiteTagService, config)
}
