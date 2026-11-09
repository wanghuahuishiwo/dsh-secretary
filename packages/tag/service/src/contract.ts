import { Service, type Context } from '@deepseek-ai/cordis'

export type TagKind = 'time' | 'context'

export interface TagReferenceInspector {
  hasReferences(tagId: number): Promise<boolean>
}

export interface TagReferenceRegistry {
  register(inspector: TagReferenceInspector): () => void
}

export interface Tag {
  readonly id: number
  readonly name: string
  readonly kind: TagKind
  readonly parentId?: number
  readonly color?: string
  /**
   * What this tag means and when to pick it. Tags whose name does not carry its
   * own rule (主线 / 副线) depend on this text staying with the tag.
   */
  readonly description?: string
}

export interface CreateTagInput {
  readonly name: string
  readonly kind?: TagKind
  readonly parentId?: number
  readonly color?: string
  readonly description?: string
}

export interface UpdateTagInput {
  readonly name?: string
  readonly color?: string | null
  /** `null` clears the description; `undefined` keeps it. */
  readonly description?: string | null
}

export abstract class TagService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'tags')
  }

  abstract createTag(input: CreateTagInput): Promise<Tag>
  abstract getTag(id: number): Promise<Tag>
  abstract listTags(kind?: TagKind): Promise<Tag[]>
  abstract updateTag(id: number, input: UpdateTagInput): Promise<Tag>
  abstract moveTag(id: number, parentId: number | null): Promise<Tag>
  abstract deleteTag(id: number): Promise<Tag>
  abstract withReferenceConsistency<Outcome>(operation: () => Promise<Outcome>): Promise<Outcome>
  /** Re-read persisted tags after an out-of-band change; no host restart. */
  abstract reload(): Promise<void>
}
