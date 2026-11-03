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
    description: `Manage independent date Plans, weekday PlanTemplates, and ActualBlocks classified only by a time Tag. Use plan.list/get/create/update/delete, template.list/create/update/delete/apply/undo, and actual.list/get/create/update/delete/start/stop. template.apply requires weekday, targetDate, and timeZone; template.undo restores the persistent pre-apply day. Plans and actuals may overlap and never rewrite each other or complete GTD Actions. focus is a closed enum: ${FOCUS_LIST}.`,
    parameters: {
      type: 'object', additionalProperties: false,
      properties: {
        op: { type: 'string', enum: [
          'plan.create', 'plan.get', 'plan.list', 'plan.update', 'plan.delete',
          'template.list', 'template.create', 'template.update', 'template.delete', 'template.apply', 'template.undo',
          'actual.create', 'actual.get', 'actual.list', 'actual.update', 'actual.delete', 'actual.start', 'actual.stop',
        ] },
        id: { type: 'integer', minimum: 1 },
        timeTagId: { type: 'integer', minimum: 1 },
        note: nullable({ type: 'string' }),
        startAt: { type: 'string' },
        endAt: nullable({ type: 'string' }),
        actualSource: { type: 'string', enum: ['user_reported', 'agent_observed', 'imported'] },
        focus: nullable({ type: 'string', enum: [...FOCUS_LEVELS] }),
        date: { type: 'string' },
        targetDate: { type: 'string' },
        timeZone: { type: 'string' },
        weekday: { type: 'integer', minimum: 1, maximum: 7 },
        startTime: { type: 'string' },
        endTime: { type: 'string' },
        from: { type: 'string' },
        to: { type: 'string' },
      },
      required: ['op'],
    },
    output: OUTPUT,
    async execute(raw: unknown) {
      const args = raw as Record<string, any>
      switch (args.op) {
        case 'plan.create': return { block: await time().createPlan(args) }
        case 'plan.get': return { block: await time().getPlan(args.id) }
        case 'plan.list': return { blocks: await time().listPlan(args) }
        case 'plan.update': return { block: await time().updatePlan(args.id, args) }
        case 'plan.delete': return { block: await time().deletePlan(args.id) }
        case 'template.list': return { blocks: await time().listPlanTemplate(args) }
        case 'template.create': return { block: await time().createPlanTemplate(args) }
        case 'template.update': return { block: await time().updatePlanTemplate(args.id, args) }
        case 'template.delete': return { block: await time().deletePlanTemplate(args.id) }
        case 'template.apply': return { blocks: await time().applyPlanTemplate(args) }
        case 'template.undo': return { blocks: await time().undoPlanTemplate(args) }
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
