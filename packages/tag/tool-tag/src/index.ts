import type { Context } from '@deepseek-ai/cordis'
import { noConfig, OUTPUT, registerTool } from 'dsh-secretary-tooling'
import type { TagService } from 'dsh-secretary-tag-service/contract'

export interface Config {}
export const Config = noConfig('dsh-secretary-tool-tag')
export const name = 'dsh-secretary-tool-tag'
export const inject = ['tools', 'tags']

/** Tool inputs are schema-validated JSON; the Service contract is authoritative. */
const inputOf = <T>(value: unknown): T => value as T

export function apply(ctx: Context): void {
  const tags = () => (ctx as Context & { tags: TagService }).tags
  registerTool(ctx, {
    name: 'secretary_tag',
    description: 'Manage the independent unified time/context Tag trees. Numeric ids distinguish same-name tags of different kinds.',
    parameters: {
      type: 'object', additionalProperties: false,
      properties: {
        op: { type: 'string', enum: ['create', 'get', 'list', 'update', 'move', 'delete'] },
        id: { type: 'number' },
        name: { type: 'string' },
        kind: { type: 'string', enum: ['time', 'context'] },
        parentId: { anyOf: [{ type: 'number' }, { type: 'null' }] },
        color: { anyOf: [{ type: 'string' }, { type: 'null' }] },
      },
      required: ['op'],
    },
    output: OUTPUT,
    async execute(raw: unknown) {
      const args = raw as Record<string, any>
      switch (args.op) {
        case 'create': return { tag: await tags().createTag(inputOf(args)) }
        case 'get': return { tag: await tags().getTag(args.id) }
        case 'list': return { tags: await tags().listTags(args.kind) }
        case 'update': return { tag: await tags().updateTag(args.id, inputOf(args)) }
        case 'move': return { tag: await tags().moveTag(args.id, args.parentId) }
        case 'delete': return { tag: await tags().deleteTag(args.id) }
        default: throw new Error(`secretary: unknown tag operation ${JSON.stringify(args.op)}`)
      }
    },
  })
}
