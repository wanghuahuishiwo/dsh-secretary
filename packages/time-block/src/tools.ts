import type { Context } from '@deepseek-ai/cordis'
import { noConfig, OUTPUT, registerTool } from 'dsh-secretary-core/tooling'
import { FOCUS_LEVELS, FOCUS_LABELS, type TimeService } from './contract.ts'

export interface Config {}
export const Config = noConfig('dsh-secretary-time-block-tools')
export const name = 'dsh-secretary-time-block-tools'
export const inject = ['tools', 'time']

const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] })
const FOCUS_LIST = FOCUS_LEVELS.map(focus => `${focus}=${FOCUS_LABELS[focus]}`).join(' / ')

export function apply(ctx: Context): void {
  const time = () => (ctx as Context & { time: TimeService }).time
  registerTool(ctx, {
    name: 'secretary_time',
    description: `Record independent ActualBlocks classified only by a time Tag. Use actual.create/get/list/update/delete/start/stop. Actual intervals may overlap and never complete GTD Actions. focus is a closed enum: ${FOCUS_LIST}.`,
    parameters: {
      type: 'object', additionalProperties: false,
      properties: {
        op: { type: 'string', enum: ['actual.create', 'actual.get', 'actual.list', 'actual.update', 'actual.delete', 'actual.start', 'actual.stop'] },
        id: { type: 'integer', minimum: 1 },
        timeTagId: { type: 'integer', minimum: 1 },
        note: nullable({ type: 'string' }),
        startAt: { type: 'string' },
        endAt: nullable({ type: 'string' }),
        actualSource: { type: 'string', enum: ['user_reported', 'agent_observed', 'imported'] },
        focus: nullable({ type: 'string', enum: [...FOCUS_LEVELS] }),
        date: { type: 'string' },
        timeZone: { type: 'string' },
        from: { type: 'string' },
        to: { type: 'string' },
      },
      required: ['op'],
    },
    output: OUTPUT,
    async execute(raw: unknown) {
      const args = raw as Record<string, any>
      switch (args.op) {
        case 'actual.create': return { block: await time().createActual(args) }
        case 'actual.get': return { block: await time().getActual(args.id) }
        case 'actual.list': return { blocks: await time().listActual(args) }
        case 'actual.update': return { block: await time().updateActual(args.id, args) }
        case 'actual.delete': return { block: await time().deleteActual(args.id) }
        case 'actual.start': return { block: await time().startActual(args) }
        case 'actual.stop': return { block: await time().stopActual(args.id, args.endAt) }
        default: throw new Error(`secretary: unknown time operation ${JSON.stringify(args.op)}`)
      }
    },
  })
}
