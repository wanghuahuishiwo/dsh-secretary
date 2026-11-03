import type { Context } from '@deepseek-ai/cordis'
import { FOCUS_LEVELS, FOCUS_LABELS, type TimeBlockService } from './contract.ts'
import { noConfig, OUTPUT, registerTool } from 'dsh-secretary-core/tooling'

export interface Config {}
export const Config = noConfig('dsh-secretary-time-block-tools')
export const name = 'dsh-secretary-time-block-tools'
export const inject = ['tools', 'timeBlocks']

const TIME_RANGE = {
  type: 'object', additionalProperties: false,
  properties: {
    startAt: { type: 'string' }, endAt: { type: 'string' }, timeZone: { type: 'string' },
  },
  required: ['startAt', 'endAt', 'timeZone'],
}
const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] })

const FOCUS_LIST = FOCUS_LEVELS.map(focus => `${focus}=${FOCUS_LABELS[focus]}`).join(' / ')

export function apply(ctx: Context): void {
  const timeBlocks = () => (ctx as Context & { timeBlocks: TimeBlockService }).timeBlocks
  registerTool(ctx, {
    name: 'secretary_time_block',
    description: `Arrange TimeBlocks linked to GTD Actions and record actual intervals. Use op=create with actionId/planned; op=update with id and changed fields; op=record_actual with id/actual/actualSource/focus. Planned changes never rewrite actual. focus is a closed enum describing the person's condition during the actual interval, never a custom category — pick one of ${FOCUS_LIST}, and never invent, rename or extend values. focus requires actual.`,
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        op: {
          type: 'string',
          enum: ['create', 'get', 'list', 'update', 'record_actual'],
        },
        id: { type: 'string' },
        actionId: { type: 'string' },
        planned: TIME_RANGE,
        actual: TIME_RANGE,
        actualSource: { type: 'string', enum: ['user_reported', 'agent_observed', 'imported'] },
        focus: { type: 'string', enum: [...FOCUS_LEVELS] },
        use: { type: 'string', enum: ['dedicated', 'parallel'] },
        preparationReminderId: nullable({ type: 'string' }),
      },
      required: ['op'],
    },
    output: OUTPUT,
    async execute(raw: unknown) {
      const args = raw as Record<string, any>
      switch (args.op) {
        case 'create': return { block: await timeBlocks().createBlock(args) }
        case 'get': return { block: await timeBlocks().getBlock(args.id) }
        case 'list': return { blocks: await timeBlocks().listBlocks() }
        case 'update': return { block: await timeBlocks().updateBlock(args.id, args) }
        case 'record_actual': return { block: await timeBlocks().recordActual(args.id, args.actual, args.actualSource, args.focus) }
        default: throw new Error(`secretary: unknown time block operation ${JSON.stringify(args.op)}`)
      }
    },
  })
}
